// WhatsApp Web QR codes expire when left unscanned. Treat this as a normal
// pairing timeout rather than a transient transport failure: users can request
// a fresh QR explicitly without repeatedly restarting Chromium.
export const QR_EXPIRED_MESSAGE =
  'O QR Code expirou antes de ser escaneado. Clique em Gerar novo QR Code quando estiver pronto para conectar o celular.'

export const isQrExpiredDisconnect = (reason) =>
  /max\s+qr\s*code\s+retries|max\s+qrcode\s+retries|qr[\s_-]*code[\s_-]*expired|qr\s*expired/i.test(String(reason || ''))
