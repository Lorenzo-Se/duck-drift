import { Car } from './Car.js';
import { resolveCarCollisions } from './CarCollisions.js';
import { TrackMask } from './TrackMask.js';
import {
  CAMERA_VIEW_SIZE,
  drawFixedCar,
  drawViewportDividers,
  drawWorldScene,
  getFollowCameraTransform,
  getViewportRects,
} from './viewports.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const roomCodeEl = document.getElementById('room-code');

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
const players = new Map();

function getTrackCenter() {
  return {
    cx: trackImg.naturalWidth / 2,
    cy: trackImg.naturalHeight / 2,
  };
}

function syncCarsFromPlayers() {
  cars = [...players.values()].map((p) => p.car);
}

function spawnPlayerCar(playerId, name, slot) {
  if (!trackReady || players.has(playerId)) {
    return;
  }

  const { cx, cy } = getTrackCenter();
  const offset = SLOT_OFFSETS[slot] ?? SLOT_OFFSETS[0];
  const color = SLOT_COLORS[slot] ?? '#ffffff';
  const car = new Car(cx + offset.dx, cy + offset.dy, offset.angle, color);

  players.set(playerId, { car, slot, name });
  syncCarsFromPlayers();
}

function removePlayer(playerId) {
  if (!players.has(playerId)) {
    return;
  }

  players.delete(playerId);
  syncCarsFromPlayers();
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'roomCreated':
      roomCodeEl.textContent = msg.roomCode;
      break;
    case 'playerJoined':
      spawnPlayerCar(msg.playerId, msg.name, msg.slot);
      break;
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
  const ws = new WebSocket(wsUrl);

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
  };
}

function drawFrame() {
  if (!trackReady) {
    return;
  }

  const cw = window.innerWidth;
  const ch = window.innerHeight;
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
    drawWorldScene(ctx, trackImg, cars, car);
    drawFixedCar(ctx, car, rect, dpr);
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
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
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

trackImg.onload = tryStartGame;
maskImg.onload = tryStartGame;

window.addEventListener('resize', resizeCanvas);
connectWebSocket();
requestAnimationFrame(loop);
