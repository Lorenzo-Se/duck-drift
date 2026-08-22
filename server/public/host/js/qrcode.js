import qrcode from './qrcode-lib.js';

const MARGIN_MODULES = 2;

export function drawQrCode(canvas, text, displaySize) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const totalModules = moduleCount + MARGIN_MODULES * 2;
  const dpr = window.devicePixelRatio || 1;

  const cssSize = displaySize
    ?? canvas.clientWidth
    ?? parseInt(canvas.getAttribute('width'), 10)
    ?? 72;
  const targetPx = Math.round(cssSize * dpr);
  const cellPx = Math.max(1, Math.floor(targetPx / totalModules));
  const qrPx = cellPx * totalModules;

  canvas.width = qrPx;
  canvas.height = qrPx;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, qrPx, qrPx);
  ctx.fillStyle = '#000';

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          (c + MARGIN_MODULES) * cellPx,
          (r + MARGIN_MODULES) * cellPx,
          cellPx,
          cellPx,
        );
      }
    }
  }
}
