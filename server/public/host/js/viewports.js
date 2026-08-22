export const CAMERA_VIEW_SIZE = 600;

export function getViewportRects(playerCount, cw, ch) {
  if (playerCount <= 1) {
    return [{ x: 0, y: 0, w: cw, h: ch }];
  }

  if (playerCount === 2) {
    const halfW = cw / 2;
    return [
      { x: 0, y: 0, w: halfW, h: ch },
      { x: halfW, y: 0, w: halfW, h: ch },
    ];
  }

  const halfW = cw / 2;
  const halfH = ch / 2;

  if (playerCount === 3) {
    return [
      { x: 0, y: halfH, w: halfW, h: halfH },
      { x: halfW, y: halfH, w: halfW, h: halfH },
      { x: 0, y: 0, w: cw, h: halfH },
    ];
  }

  return [
    { x: 0, y: 0, w: halfW, h: halfH },
    { x: halfW, y: 0, w: halfW, h: halfH },
    { x: 0, y: halfH, w: halfW, h: halfH },
    { x: halfW, y: halfH, w: halfW, h: halfH },
  ];
}

export const MAP_GREEN_PADDING_MULTIPLIER = 2;

export function getMapOverscroll(rect, viewSize = CAMERA_VIEW_SIZE) {
  const aspect = Math.max(rect.w, rect.h) / Math.min(rect.w, rect.h);
  return (viewSize * aspect) / 2;
}

export function getMapGreenPadding(rect, viewSize = CAMERA_VIEW_SIZE) {
  return getMapOverscroll(rect, viewSize) * MAP_GREEN_PADDING_MULTIPLIER;
}

export function getFollowCameraTransform(car, rect, dpr, viewSize = CAMERA_VIEW_SIZE) {
  const scale = Math.min(rect.w, rect.h) / viewSize;
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const scaled = scale * dpr;

  return [
    scaled,
    0,
    0,
    scaled,
    dpr * centerX - car.x * scaled,
    dpr * centerY - car.y * scaled,
  ];
}

export function drawScene(ctx, trackImg, cars, padding = 0) {
  const w = trackImg.naturalWidth;
  const h = trackImg.naturalHeight;
  ctx.fillStyle = '#3A7D34';
  ctx.fillRect(-padding, -padding, w + padding * 2, h + padding * 2);
  ctx.drawImage(trackImg, 0, 0);
  for (const car of cars) {
    car.draw(ctx);
  }
}

export function drawViewportDividers(ctx, rects, dpr) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;

  const edges = new Set();

  for (const rect of rects) {
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;

    const leftKey = `${rect.x},v`;
    const rightKey = `${right},v`;
    const topKey = `${rect.y},h`;
    const bottomKey = `${bottom},h`;

    if (!edges.has(leftKey)) {
      edges.add(leftKey);
      ctx.beginPath();
      ctx.moveTo(rect.x, rect.y);
      ctx.lineTo(rect.x, bottom);
      ctx.stroke();
    }

    if (!edges.has(rightKey)) {
      edges.add(rightKey);
      ctx.beginPath();
      ctx.moveTo(right, rect.y);
      ctx.lineTo(right, bottom);
      ctx.stroke();
    }

    if (!edges.has(topKey)) {
      edges.add(topKey);
      ctx.beginPath();
      ctx.moveTo(rect.x, rect.y);
      ctx.lineTo(right, rect.y);
      ctx.stroke();
    }

    if (!edges.has(bottomKey)) {
      edges.add(bottomKey);
      ctx.beginPath();
      ctx.moveTo(rect.x, bottom);
      ctx.lineTo(right, bottom);
      ctx.stroke();
    }
  }

  ctx.restore();
}
