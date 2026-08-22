import { Car } from './Car.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;

const trackImg = new Image();
trackImg.src = 'assets/tracks/silverstone_texture.png';

const keys = new Set();

document.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) {
    e.preventDefault();
    keys.add(e.code);
  }
});

document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

let car;

function getTrackTransform(cw, ch, img) {
  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  return { scale, dx, dy };
}

function applyKeyboardInput(car) {
  car.throttle = keys.has('ArrowUp');
  car.brake = keys.has('ArrowDown');
  car.steering = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
}

function drawFrame() {
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const { scale, dx, dy } = getTrackTransform(cw, ch, trackImg);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * dx, dpr * dy);
  ctx.drawImage(trackImg, 0, 0);
  car.draw(ctx);
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

  if (car) {
    applyKeyboardInput(car);
    car.update(dt);
    drawFrame();
  }

  requestAnimationFrame(loop);
}

function resizeCanvas() {
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  if (car) drawFrame();
}

trackImg.onload = () => {
  car = new Car(trackImg.naturalWidth / 2, trackImg.naturalHeight / 2);
  resizeCanvas();
};

window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(loop);
