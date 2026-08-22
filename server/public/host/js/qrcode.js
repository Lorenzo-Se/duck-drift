import qrcode from './qrcode-lib.js';

export function drawQrCode(canvas, text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();

  const dataUrl = qr.createDataURL(4, 2);
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = dataUrl;
}
