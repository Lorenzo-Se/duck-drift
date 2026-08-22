import { CAR_SCREEN_ANGLE } from './viewports.js';

const ACCEL = 300;
const BRAKE = 400;
const STEER_SPEED = 3.0;
const LATERAL_FRICTION = 0.95;
const FORWARD_FRICTION = 0.98;
const MAX_SPEED = 400;
const WALL_BOUNCE = 0.35;
const WALL_SPEED_LOSS = 0.5;

export class Car {
  constructor(x, y, angle = 0, color = '#ff3333') {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.color = color;
    this.vx = 0;
    this.vy = 0;
    this.steering = 0;
    this.throttle = false;
    this.brake = false;
  }

  update(dt, trackMask = null) {
    const preForwardX = Math.cos(this.angle);
    const preForwardY = Math.sin(this.angle);
    const preForwardSpeed = this.vx * preForwardX + this.vy * preForwardY;

    const speedSteer = Math.min(1, Math.abs(preForwardSpeed) / 50);
    const steerFactor = this.steering !== 0 ? Math.max(0.4, speedSteer) : speedSteer;
    this.angle += this.steering * STEER_SPEED * steerFactor * dt;

    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    let forwardSpeed = this.vx * forwardX + this.vy * forwardY;
    const lateralSpeed = this.vx * rightX + this.vy * rightY;

    if (this.throttle) {
      forwardSpeed += ACCEL * dt;
    }
    if (this.brake) {
      if (forwardSpeed > 0) {
        forwardSpeed = Math.max(0, forwardSpeed - BRAKE * dt);
      } else {
        forwardSpeed -= BRAKE * 0.5 * dt;
      }
    }

    const forwardFriction = Math.pow(FORWARD_FRICTION, dt * 60);
    forwardSpeed *= forwardFriction;

    const lateralFriction = Math.pow(LATERAL_FRICTION, dt * 60);
    const newLateral = lateralSpeed * lateralFriction;

    this.vx = forwardX * forwardSpeed + rightX * newLateral;
    this.vy = forwardY * forwardSpeed + rightY * newLateral;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    const oldX = this.x;
    const oldY = this.y;
    const newX = oldX + this.vx * dt;
    const newY = oldY + this.vy * dt;

    if (!trackMask) {
      this.x = newX;
      this.y = newY;
      return;
    }

    if (!trackMask.hitsCar(newX, newY, this.angle)) {
      this.x = newX;
      this.y = newY;
      return;
    }

    const blockedX = trackMask.hitsCar(newX, oldY, this.angle);
    const blockedY = trackMask.hitsCar(oldX, newY, this.angle);

    if (!blockedX) {
      this.x = newX;
    } else if (!blockedY) {
      this.y = newY;
    }

    const bounce = WALL_BOUNCE * WALL_SPEED_LOSS;
    const moveX = newX - oldX;
    const moveY = newY - oldY;
    const moveLen = Math.hypot(moveX, moveY);

    if (blockedX && blockedY && moveLen > 0.0001) {
      const nx = moveX / moveLen;
      const ny = moveY / moveLen;
      const velInto = this.vx * nx + this.vy * ny;
      if (velInto > 0) {
        this.vx -= nx * velInto * (1 + bounce);
        this.vy -= ny * velInto * (1 + bounce);
      }
    } else {
      if (blockedX && ((newX > oldX && this.vx > 0) || (newX < oldX && this.vx < 0))) {
        this.vx = -this.vx * bounce;
      }

      if (blockedY && ((newY > oldY && this.vy > 0) || (newY < oldY && this.vy < 0))) {
        this.vy = -this.vy * bounce;
      }
    }

    if (blockedX && blockedY) {
      const forwardIntoWall = this.vx * forwardX + this.vy * forwardY;
      if (forwardIntoWall > 0) {
        this.vx -= forwardX * forwardIntoWall;
        this.vy -= forwardY * forwardIntoWall;
      }
    }

    if (trackMask.hitsCar(this.x, this.y, this.angle)) {
      const free = trackMask.findFreePosition(this.x, this.y, this.angle);
      this.x = free.x;
      this.y = free.y;
    }
  }

  drawBody(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(-12, -6, 24, 12);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(8, -4, 6, 8);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    this.drawBody(ctx);
    ctx.restore();
  }

  drawFixed(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(CAR_SCREEN_ANGLE);
    this.drawBody(ctx);
    ctx.restore();
  }
}
