import { Car } from './Car.js';
import { resolveCarCollisions } from './CarCollisions.js';
import { TrackMask } from './TrackMask.js';
import { drawQrCode } from './qrcode.js';
import {
  CAMERA_VIEW_SIZE,
  drawScene,
  drawViewportDividers,
  getFollowCameraTransform,
  getViewportRects,
} from './viewports.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const lobbyPanel = document.getElementById('lobby-panel');
const roomCodeEl = document.getElementById('room-code');
const qrCanvas = document.getElementById('qr-code');
const playerListEl = document.getElementById('player-list');
const playerCountEl = document.getElementById('player-count');
const startBtn = document.getElementById('start-btn');

const SLOT_COLORS = ['#ff3333', '#3366ff', '#33cc33', '#ffcc00'];
const SLOT_OFFSETS = [
  { dx: -30, dy: 0, angle: 0 },
  { dx: 30, dy: 0, angle: Math.PI },
  { dx: 0, dy: -30, angle: Math.PI / 2 },
  { dx: 0, dy: 30, angle: -Math.PI / 2 },
];

const trackImg = new Image();
trackImg.src = 'assets/tracks/silverstone_texture.png';

const maskImg = new Image();
maskImg.src = 'assets/tracks/silverstone_mask.png';

let cars = [];
let trackMask;
let trackReady = false;
let gamePhase = 'lobby';
let ws = null;
let roomCode = null;
const players = new Map();
const pendingPlayers = new Map();

function getTrackCenter() {
  return {
    cx: trackImg.naturalWidth / 2,
    cy: trackImg.naturalHeight / 2,
  };
}

function getSpawnPosition(slot) {
  const { cx, cy } = getTrackCenter();
  const offset = SLOT_OFFSETS[slot] ?? SLOT_OFFSETS[0];
  return {
    x: cx + offset.dx,
    y: cy + offset.dy,
    angle: offset.angle,
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

  startBtn.disabled = players.size < 2;
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
  if (players.size < 2 || gamePhase !== 'lobby') {
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'broadcast',
      target: 'phones',
      event: 'gameStart',
    }));
  }

  resetAllCars();
  gamePhase = 'playing';
  lobbyPanel.classList.add('hidden');
  resizeCanvas();
}

function renderQrCode() {
  if (!roomCode) {
    return;
  }
  const joinUrl = new URL('/', location.origin);
  joinUrl.searchParams.set('room', roomCode);
  drawQrCode(qrCanvas, joinUrl.toString());
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
  const activePlayers = [...players.values()].sort((a, b) => a.slot - b.slot);
  const count = activePlayers.length;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  if (count === 0) {
    return;
  }

  const rects = getViewportRects(count, cw, ch);

  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const rect = rects[i];
    const { car } = player;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.setTransform(...getFollowCameraTransform(car, rect, dpr, CAMERA_VIEW_SIZE));
    drawScene(ctx, trackImg, cars);
    ctx.restore();
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

  if (trackReady && cars.length > 0) {
    cars.forEach((car) => car.update(dt, trackMask));
    resolveCarCollisions(cars, trackMask);
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

function tryStartGame() {
  if (!trackImg.complete || !maskImg.complete) {
    return;
  }

  trackMask = new TrackMask(maskImg);
  trackReady = true;
  resizeCanvas();
}

startBtn.addEventListener('click', startGame);
trackImg.onload = tryStartGame;
maskImg.onload = tryStartGame;

window.addEventListener('resize', resizeCanvas);
connectWebSocket();
updateLobbyUI();
requestAnimationFrame(loop);
