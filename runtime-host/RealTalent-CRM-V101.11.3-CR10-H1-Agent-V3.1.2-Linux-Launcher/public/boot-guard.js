(() => {
  let booted = false
  const root = () => document.getElementById('root')
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  const showFailure = (message) => {
    if (booted) return
    const target = root()
    if (!target || target.childElementCount > 0) return
    const reference = `RT-BOOT-${Date.now().toString(36).toUpperCase()}`
    target.innerHTML = `<main style="font-family:Inter,system-ui,sans-serif;max-width:760px;margin:72px auto;padding:32px;border:1px solid #dbe3f0;border-radius:18px;background:#fff;color:#172033;box-shadow:0 20px 60px rgba(15,23,42,.08)"><div style="font-size:34px;margin-bottom:12px">⚠️</div><h1 style="font-size:24px;margin:0 0 10px">O RealTalent não conseguiu iniciar</h1><p style="line-height:1.55;color:#526078">A aplicação encontrou um erro antes de carregar a interface. Nenhum dado foi apagado. Recarregue a página; se o problema continuar, abra o Console do navegador com <strong>Ctrl + Shift + K</strong>.</p><p style="font-size:13px;color:#64748b">Referência: <strong>${reference}</strong></p><details style="margin-top:16px"><summary style="cursor:pointer">Detalhe técnico</summary><code style="display:block;margin-top:10px;padding:12px;background:#f8fafc;border-radius:10px;white-space:pre-wrap">${escapeHtml(message || 'Falha de inicialização sem mensagem disponível.')}</code></details><button type="button" onclick="window.location.reload()" style="margin-top:20px;border:0;border-radius:10px;padding:11px 16px;background:#315efb;color:#fff;font-weight:700;cursor:pointer">Recarregar aplicação</button></main>`
  }
  window.__REALTALENT_BOOT_OK__ = () => { booted = true }
  window.addEventListener('error', (event) => showFailure(event.error?.message || event.message))
  window.addEventListener('unhandledrejection', (event) => showFailure(event.reason?.message || event.reason))
  window.setTimeout(() => {
    if (!booted && (root()?.childElementCount ?? 0) === 0) showFailure('Tempo limite de inicialização excedido. Verifique dependências e o Console do navegador.')
  }, 6000)
})()
