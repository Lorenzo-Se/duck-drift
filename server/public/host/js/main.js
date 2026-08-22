import { Car } from './Car.js';
import {
  createRaceState,
  drawCheckpoints,
  drawRaceHud,
  updateRaceState,
} from './checkpoints.js';
import { resolveCarCollisions } from './CarCollisions.js';
import { TrackMask } from './TrackMask.js';
import { drawQrCode } from './qrcode.js';
import { getTrackById, TRACKS } from './tracks.js';
import {
  CAMERA_VIEW_SIZE,
  drawScene,
  drawViewportDividers,
  getFollowCameraTransform,
  getMapGreenPadding,
  getViewportRects,
} from './viewports.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const lobbyPanel = document.getElementById('lobby-panel');
const roomCodeEl = document.getElementById('room-code');
const qrCanvas = document.getElementById('qr-code');
const qrOverlay = document.getElementById('qr-overlay');
const qrCanvasLarge = document.getElementById('qr-code-large');
const playerListEl = document.getElementById('player-list');
const playerCountEl = document.getElementById('player-count');
const startBtn = document.getElementById('start-btn');
const mapSelectEl = document.getElementById('map-select');
const roundsInputEl = document.getElementById('rounds-input');
const lobbyConfigSummaryEl = document.getElementById('lobby-config-summary');
const resultsOverlay = document.getElementById('results-overlay');
const resultsWinnerEl = document.getElementById('results-winner');
const resultsTableBody = document.getElementById('results-table-body');
const resultsLobbyBtn = document.getElementById('results-lobby-btn');

const SLOT_COLORS = ['#ff3333', '#3366ff', '#33cc33', '#ffcc00'];
const SLOT_OFFSETS = [
  { dx: -30, dy: 0, angle: 0 },
  { dx: 30, dy: 0, angle: Math.PI },
  { dx: 0, dy: -30, angle: Math.PI / 2 },
  { dx: 0, dy: 30, angle: -Math.PI / 2 },
];

const trackImg = new Image();
const maskImg = new Image();

let lobbyConfig = { mapId: TRACKS[0].id, totalRounds: 3 };

let cars = [];
let trackMask;
let trackReady = false;
let gamePhase = 'lobby';
let ws = null;
let roomCode = null;
const players = new Map();
const pendingPlayers = new Map();
const raceStates = new Map();
let raceEnded = false;

function getSelectedTrack() {
  return getTrackById(lobbyConfig.mapId);
}

function updateLobbyConfigSummary() {
  const track = getSelectedTrack();
  const roundsLabel = lobbyConfig.totalRounds === 1 ? 'Runde' : 'Runden';
  lobbyConfigSummaryEl.textContent = `${track.name} · ${lobbyConfig.totalRounds} ${roundsLabel}`;
}

function setLobbySettingsEnabled(enabled) {
  mapSelectEl.disabled = !enabled;
  roundsInputEl.disabled = !enabled;
}

function updateStartButtonState() {
  startBtn.disabled = !trackReady || players.size < 2 || gamePhase !== 'lobby';
}

function populateMapSelect() {
  mapSelectEl.innerHTML = '';
  for (const track of TRACKS) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name;
    mapSelectEl.appendChild(option);
  }
  mapSelectEl.value = lobbyConfig.mapId;
}

function loadTrack(mapId) {
  const track = getTrackById(mapId);
  lobbyConfig.mapId = track.id;
  trackReady = false;
  updateStartButtonState();

  let textureLoaded = false;
  let maskLoaded = false;

  function tryFinishTrackLoad() {
    if (!textureLoaded || !maskLoaded) {
      return;
    }

    trackMask = new TrackMask(maskImg);
    trackReady = true;

    for (const playerId of players.keys()) {
      resetPlayerCar(playerId);
    }

    resizeCanvas();
    updateStartButtonState();
  }

  trackImg.onload = () => {
    textureLoaded = true;
    tryFinishTrackLoad();
  };

  maskImg.onload = () => {
    maskLoaded = true;
    tryFinishTrackLoad();
  };

  trackImg.src = track.texture;
  maskImg.src = track.mask;

  if (trackImg.complete) {
    textureLoaded = true;
  }
  if (maskImg.complete) {
    maskLoaded = true;
  }
  tryFinishTrackLoad();
}

function handleMapChange() {
  if (gamePhase !== 'lobby' || mapSelectEl.value === lobbyConfig.mapId) {
    return;
  }

  loadTrack(mapSelectEl.value);
  updateLobbyConfigSummary();
}

function handleRoundsChange() {
  if (gamePhase !== 'lobby') {
    return;
  }

  const rounds = Number.parseInt(roundsInputEl.value, 10);
  if (!Number.isFinite(rounds)) {
    roundsInputEl.value = String(lobbyConfig.totalRounds);
    return;
  }

  lobbyConfig.totalRounds = Math.min(99, Math.max(1, rounds));
  roundsInputEl.value = String(lobbyConfig.totalRounds);
  updateLobbyConfigSummary();
}

function getSpawnPosition(slot) {
  const track = getSelectedTrack();
  const checkpoints = track.checkpoints ?? [];
  const start = checkpoints[0] ?? {
    x: trackImg.naturalWidth / 2,
    y: trackImg.naturalHeight / 2,
  };

  let angle = 0;
  if (checkpoints.length > 1) {
    const next = checkpoints[1];
    angle = Math.atan2(next.y - start.y, next.x - start.x);
  }

  const offset = SLOT_OFFSETS[slot] ?? SLOT_OFFSETS[0];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: start.x + offset.dx * cos - offset.dy * sin,
    y: start.y + offset.dx * sin + offset.dy * cos,
    angle,
  };
}

function syncCarsFromPlayers() {
  cars = [...players.values()].map((p) => p.car);
}

function resetPlayerCar(playerId) {
  const player = players.get(playerId);
  if (!player) {
    return;
  }

  const spawn = getSpawnPosition(player.slot);
  const { car } = player;
  car.x = spawn.x;
  car.y = spawn.y;
  car.angle = spawn.angle;
  car.vx = 0;
  car.vy = 0;
  car.steering = 0;
  car.throttle = false;
  car.brake = false;
}

function resetAllCars() {
  for (const playerId of players.keys()) {
    resetPlayerCar(playerId);
  }
}

function initRaceStates() {
  raceStates.clear();
  raceEnded = false;
  for (const playerId of players.keys()) {
    raceStates.set(playerId, createRaceState());
  }
}

function buildResults() {
  const entries = [...players.entries()].map(([playerId, player]) => {
    const state = raceStates.get(playerId) ?? createRaceState();
    return {
      playerId,
      name: player.name,
      lap: state.lap,
      checkpointProgress: state.nextCheckpointIndex,
      finished: state.finished,
      finishTime: state.finishTime ?? Infinity,
    };
  });

  entries.sort((a, b) => {
    if (a.finished !== b.finished) {
      return a.finished ? -1 : 1;
    }
    if (a.finished) {
      return a.finishTime - b.finishTime;
    }
    if (a.lap !== b.lap) {
      return b.lap - a.lap;
    }
    return b.checkpointProgress - a.checkpointProgress;
  });

  return entries.map((entry, index) => ({
    playerId: entry.playerId,
    name: entry.name,
    lap: entry.lap,
    position: index + 1,
  }));
}

function showResultsOverlay(winnerName, results) {
  resultsWinnerEl.textContent = `${winnerName} gewinnt!`;
  resultsTableBody.innerHTML = '';

  for (const result of results) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${result.position}</td>
      <td>${result.name}</td>
      <td>${result.lap}</td>
    `;
    resultsTableBody.appendChild(row);
  }

  resultsOverlay.classList.add('open');
  resultsOverlay.setAttribute('aria-hidden', 'false');
}

function hideResultsOverlay() {
  resultsOverlay.classList.remove('open');
  resultsOverlay.setAttribute('aria-hidden', 'true');
}

function returnToLobby() {
  hideResultsOverlay();
  resetAllCars();
  initRaceStates();
  gamePhase = 'lobby';
  setLobbySettingsEnabled(true);
  lobbyPanel.classList.remove('hidden');
  updateStartButtonState();
  resizeCanvas();
}

async function recordWinnerHighscore(playerName) {
  try {
    const response = await fetch('/api/highscores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, won: true }),
    });
    if (!response.ok) {
      console.error('Highscore POST failed:', response.status);
    }
  } catch (err) {
    console.error('Highscore POST failed:', err);
  }
}

function endRace(winnerId) {
  if (raceEnded) {
    return;
  }
  raceEnded = true;
  gamePhase = 'finished';

  const results = buildResults();
  const winner = players.get(winnerId);
  const winnerName = winner?.name ?? 'Unbekannt';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'broadcast',
      target: 'phones',
      event: 'gameOver',
      winnerId,
      results,
    }));
  }

  recordWinnerHighscore(winnerName);
  showResultsOverlay(winnerName, results);
}

function updateRaceProgress() {
  if (gamePhase !== 'playing' || raceEnded) {
    return;
  }

  const track = getSelectedTrack();
  const checkpoints = track.checkpoints ?? [];
  const radius = track.checkpointRadius;

  for (const [playerId, player] of players) {
    const state = raceStates.get(playerId);
    if (!state || state.finished) {
      continue;
    }

    const justFinished = updateRaceState(
      state,
      player.car,
      checkpoints,
      radius,
      lobbyConfig.totalRounds,
    );

    if (justFinished) {
      endRace(playerId);
      return;
    }
  }
}

function updateLobbyUI() {
  const count = players.size + pendingPlayers.size;
  playerCountEl.textContent = `${count} / 4 Spieler`;

  if (count === 0) {
    playerListEl.textContent = 'Warte auf Spieler…';
  } else {
    const names = [
      ...[...players.values()].map((p) => ({ slot: p.slot, name: p.name })),
      ...[...pendingPlayers.values()].map((p) => ({ slot: p.slot, name: p.name })),
    ]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => p.name);
    playerListEl.textContent = names.join(' · ');
  }

  updateLobbyConfigSummary();
  updateStartButtonState();
}

function spawnPlayerCar(playerId, name, slot, color) {
  if (!trackReady || players.has(playerId)) {
    return;
  }

  const spawn = getSpawnPosition(slot);
  const carColor = color ?? SLOT_COLORS[slot] ?? '#ffffff';
  const car = new Car(spawn.x, spawn.y, spawn.angle, carColor);

  players.set(playerId, { car, slot, name });
  syncCarsFromPlayers();
  updateLobbyUI();
}

function removePlayer(playerId) {
  pendingPlayers.delete(playerId);

  if (!players.has(playerId)) {
    updateLobbyUI();
    return;
  }

  players.delete(playerId);
  syncCarsFromPlayers();
  updateLobbyUI();
}

function startGame() {
  if (players.size < 2 || gamePhase !== 'lobby' || !trackReady) {
    return;
  }

  const track = getSelectedTrack();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'broadcast',
      target: 'phones',
      event: 'gameStart',
      mapId: lobbyConfig.mapId,
      mapName: track.name,
      totalRounds: lobbyConfig.totalRounds,
    }));
  }

  resetAllCars();
  initRaceStates();
  gamePhase = 'playing';
  setLobbySettingsEnabled(false);
  lobbyPanel.classList.add('hidden');
  hideResultsOverlay();
  resizeCanvas();
}

function getJoinUrl() {
  const joinUrl = new URL('/', location.origin);
  joinUrl.searchParams.set('room', roomCode);
  return joinUrl.toString();
}

function renderQrCode() {
  if (!roomCode) {
    return;
  }
  const url = getJoinUrl();
  drawQrCode(qrCanvas, url);
}

function renderLargeQrCode() {
  if (!roomCode) {
    return;
  }
  const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
  drawQrCode(qrCanvasLarge, getJoinUrl(), size);
}

function openQrOverlay() {
  if (!roomCode) {
    return;
  }
  qrOverlay.classList.add('open');
  qrOverlay.setAttribute('aria-hidden', 'false');
  renderLargeQrCode();
}

function closeQrOverlay() {
  qrOverlay.classList.remove('open');
  qrOverlay.setAttribute('aria-hidden', 'true');
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'roomCreated':
      roomCode = msg.roomCode;
      roomCodeEl.textContent = roomCode;
      renderQrCode();
      break;
    case 'playerJoined':
      pendingPlayers.set(msg.playerId, { name: msg.name, slot: msg.slot });
      updateLobbyUI();
      break;
    case 'playerCarSelected': {
      const pending = pendingPlayers.get(msg.playerId);
      if (!pending) {
        return;
      }
      pendingPlayers.delete(msg.playerId);
      spawnPlayerCar(msg.playerId, pending.name, pending.slot, msg.color);
      break;
    }
    case 'playerInput': {
      const player = players.get(msg.playerId);
      if (!player) {
        return;
      }
      const { car } = player;
      car.steering = msg.steering ?? 0;
      car.throttle = !!msg.throttle;
      car.brake = !!msg.brake;
      break;
    }
    case 'playerLeft':
      removePlayer(msg.playerId);
      break;
    case 'error':
      console.error('Server error:', msg.message);
      roomCodeEl.textContent = 'ERR';
      break;
    default:
      break;
  }
}

function connectWebSocket() {
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'createRoom' }));
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.error('Invalid server message');
      return;
    }
    handleServerMessage(msg);
  };

  ws.onerror = () => {
    console.error('WebSocket connection failed');
    roomCodeEl.textContent = 'ERR';
  };

  ws.onclose = () => {
    roomCodeEl.textContent = '----';
    ws = null;
  };
}

function getCanvasSize() {
  const wrap = canvas.parentElement;
  return {
    cw: wrap.clientWidth,
    ch: wrap.clientHeight,
  };
}

function drawFrame() {
  if (!trackReady) {
    return;
  }

  const { cw, ch } = getCanvasSize();
  const activePlayers = [...players.entries()]
    .map(([playerId, player]) => ({ playerId, ...player }))
    .sort((a, b) => a.slot - b.slot);
  const count = activePlayers.length;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  if (count === 0) {
    return;
  }

  const rects = getViewportRects(count, cw, ch);
  const track = getSelectedTrack();
  const checkpoints = track.checkpoints ?? [];
  const checkpointRadius = track.checkpointRadius;

  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const rect = rects[i];
    const { car } = player;
    const raceState = raceStates.get(player.playerId);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.setTransform(...getFollowCameraTransform(car, rect, dpr, CAMERA_VIEW_SIZE));
    const padding = getMapGreenPadding(rect, CAMERA_VIEW_SIZE);
    drawScene(ctx, trackImg, cars, padding);
    if (gamePhase === 'playing' || gamePhase === 'finished') {
      drawCheckpoints(ctx, checkpoints, checkpointRadius, raceState?.nextCheckpointIndex ?? null);
    }
    ctx.restore();

    if (gamePhase === 'playing' && raceState) {
      drawRaceHud(ctx, raceState.lap, lobbyConfig.totalRounds, rect, dpr);
    }
  }

  if (count > 1) {
    drawViewportDividers(ctx, rects, dpr);
  }
}

let lastTime = 0;

function loop(time) {
  if (lastTime === 0) {
    lastTime = time;
    requestAnimationFrame(loop);
    return;
  }

  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (trackReady && cars.length > 0 && gamePhase === 'playing') {
    cars.forEach((car) => car.update(dt, trackMask));
    resolveCarCollisions(cars, trackMask);
    updateRaceProgress();
  }

  drawFrame();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const { cw, ch } = getCanvasSize();
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  drawFrame();
}

populateMapSelect();
updateLobbyConfigSummary();
setLobbySettingsEnabled(true);
loadTrack(lobbyConfig.mapId);
startBtn.addEventListener('click', startGame);
mapSelectEl.addEventListener('change', handleMapChange);
roundsInputEl.addEventListener('change', handleRoundsChange);
roundsInputEl.addEventListener('input', handleRoundsChange);
qrCanvas.addEventListener('click', openQrOverlay);
qrOverlay.addEventListener('click', closeQrOverlay);
resultsLobbyBtn.addEventListener('click', returnToLobby);

window.addEventListener('resize', resizeCanvas);
connectWebSocket();
updateLobbyUI();
requestAnimationFrame(loop);
