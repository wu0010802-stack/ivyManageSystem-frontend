/**
 * 簡易 toast helper（純 DOM，不拉 element-plus）。
 * 用於家長 App 的成功/錯誤提示。
 */

const CONTAINER_ID = '__parent_toast_container__'
const DEFAULT_DURATION = 2400

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = CONTAINER_ID
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      z-index: 9999; display: flex; flex-direction: column;
      gap: 8px; pointer-events: none; max-width: 92%;
    `
    document.body.appendChild(el)
  }
  return el
}

function show(message, type = 'info', duration = DEFAULT_DURATION) {
  const container = ensureContainer()
  const colors = {
    success: { bg: '#3f7d48', color: '#fff' },
    error: { bg: '#c0392b', color: '#fff' },
    warn: { bg: '#d97706', color: '#fff' },
    info: { bg: '#333', color: '#fff' },
  }
  const c = colors[type] || colors.info
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = `
    background: ${c.bg}; color: ${c.color};
    padding: 10px 16px; border-radius: 8px;
    font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    pointer-events: auto;
    animation: parent-toast-fade-in 0.2s ease-out;
  `
  container.appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.3s ease'
    setTimeout(() => el.remove(), 300)
  }, duration)
}

export const toast = {
  success: (msg, d) => show(msg, 'success', d),
  error: (msg, d) => show(msg, 'error', d),
  warn: (msg, d) => show(msg, 'warn', d),
  info: (msg, d) => show(msg, 'info', d),
}

// 注入 keyframes 一次
if (typeof document !== 'undefined' && !document.getElementById('__parent_toast_keyframes__')) {
  const style = document.createElement('style')
  style.id = '__parent_toast_keyframes__'
  style.textContent = `@keyframes parent-toast-fade-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }`
  document.head.appendChild(style)
}
