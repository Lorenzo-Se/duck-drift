const WALL_THRESHOLD = 128;

const CAR_HALF_WIDTH = 10;
const CAR_HALF_HEIGHT = 5;

const CAR_SAMPLE_POINTS = [
  [0, 0],
  [-CAR_HALF_WIDTH, -CAR_HALF_HEIGHT],
  [CAR_HALF_WIDTH, -CAR_HALF_HEIGHT],
  [-CAR_HALF_WIDTH, CAR_HALF_HEIGHT],
  [CAR_HALF_WIDTH, CAR_HALF_HEIGHT],
];

export class TrackMask {
  constructor(image) {
    this.width = image.naturalWidth;
    this.height = image.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    this.data = ctx.getImageData(0, 0, this.width, this.height).data;
  }

  isWall(px, py) {
    const ix = Math.floor(px);
    const iy = Math.floor(py);

    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return true;
    }

    const offset = (iy * this.width + ix) * 4;
    return this.data[offset] < WALL_THRESHOLD;
  }

  hitsCar(x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const [localX, localY] of CAR_SAMPLE_POINTS) {
      const worldX = x + localX * cos - localY * sin;
      const worldY = y + localX * sin + localY * cos;
      if (this.isWall(worldX, worldY)) {
        return true;
      }
    }

    return false;
  }

  findFreePosition(x, y, angle) {
    if (!this.hitsCar(x, y, angle)) {
      return { x, y };
    }

    const dirs = [];
    for (let i = 0; i < 8; i++) {
      const rad = (i / 8) * Math.PI * 2;
      dirs.push([Math.cos(rad), Math.sin(rad)]);
    }

    for (const dist of [2, 4, 6, 8, 12, 16, 24]) {
      for (const [dx, dy] of dirs) {
        const tx = x + dx * dist;
        const ty = y + dy * dist;
        if (!this.hitsCar(tx, ty, angle)) {
          return { x: tx, y: ty };
        }
      }
    }

    return { x, y };
  }
}
