const ACCEL = 300;
const BRAKE = 400;
const STEER_SPEED = 3.0;
const LATERAL_FRICTION = 0.95;
const FORWARD_FRICTION = 0.98;
const MAX_SPEED = 400;

export class Car {
  constructor(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.steering = 0;
    this.throttle = false;
    this.brake = false;
  }

  update(dt) {
    const preForwardX = Math.cos(this.angle);
    const preForwardY = Math.sin(this.angle);
    const preForwardSpeed = this.vx * preForwardX + this.vy * preForwardY;

    const steerFactor = Math.min(1, Math.abs(preForwardSpeed) / 50);
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

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(-12, -6, 24, 12);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(8, -4, 6, 8);
    ctx.restore();
  }
}
