const CAR_RADIUS = 12;
const RESTITUTION = 0.6;

function resolvePair(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distSq = dx * dx + dy * dy;
  const minDist = CAR_RADIUS * 2;

  if (distSq >= minDist * minDist) {
    return;
  }

  let dist = Math.sqrt(distSq);
  if (dist < 0.001) {
    dist = 0.001;
    dx = 1;
    dy = 0;
  }

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = minDist - dist;
  const half = overlap / 2;
  a.x -= nx * half;
  a.y -= ny * half;
  b.x += nx * half;
  b.y += ny * half;

  const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (dvn >= 0) {
    return;
  }

  const impulse = -(1 + RESTITUTION) * dvn / 2;
  a.vx += impulse * nx;
  a.vy += impulse * ny;
  b.vx -= impulse * nx;
  b.vy -= impulse * ny;
}

export function resolveCarCollisions(cars, trackMask = null) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      resolvePair(cars[i], cars[j]);
    }
  }

  if (!trackMask) {
    return;
  }

  for (const car of cars) {
    if (trackMask.hitsCar(car.x, car.y, car.angle)) {
      const free = trackMask.findFreePosition(car.x, car.y, car.angle);
      car.x = free.x;
      car.y = free.y;
    }
  }
}
