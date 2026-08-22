const DEFAULT_CHECKPOINT_RADIUS = 55;

export function createRaceState() {
  return {
    nextCheckpointIndex: 1,
    lap: 0,
    finished: false,
    finishTime: null,
    insideCheckpoint: false,
  };
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function updateRaceState(state, car, checkpoints, radius, totalRounds) {
  if (!state || state.finished || !checkpoints?.length) {
    return false;
  }

  const checkpointRadius = radius ?? DEFAULT_CHECKPOINT_RADIUS;
  const radiusSq = checkpointRadius * checkpointRadius;
  const target = checkpoints[state.nextCheckpointIndex];
  const inside = distanceSq(car.x, car.y, target.x, target.y) <= radiusSq;

  if (inside) {
    if (!state.insideCheckpoint) {
      state.insideCheckpoint = true;

      if (state.nextCheckpointIndex === 0) {
        state.lap += 1;
        if (state.lap >= totalRounds) {
          state.finished = true;
          state.finishTime = performance.now();
          return true;
        }
      }

      state.nextCheckpointIndex = (state.nextCheckpointIndex + 1) % checkpoints.length;
    }
  } else {
    state.insideCheckpoint = false;
  }

  return false;
}

export function drawCheckpoints(ctx, checkpoints, radius, nextIndex = null) {
  if (!checkpoints?.length) {
    return;
  }

  const checkpointRadius = radius ?? DEFAULT_CHECKPOINT_RADIUS;

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const isNext = i === nextIndex;

    ctx.beginPath();
    ctx.arc(cp.x, cp.y, checkpointRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isNext ? 'rgba(46, 204, 113, 0.95)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = isNext ? 4 : 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = isNext ? 'rgba(46, 204, 113, 0.9)' : 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }
}

export function drawRaceHud(ctx, lap, totalRounds, rect, dpr) {
  const label = totalRounds === 1 ? 'Runde' : 'Runden';
  const text = `${lap} / ${totalRounds} ${label}`;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  const padding = 8;
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + padding * 2;
  const boxH = 28;
  const x = rect.x + 10;
  const y = rect.y + 10;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + padding, y + 20);
  ctx.restore();
}
