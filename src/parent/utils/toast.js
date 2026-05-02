/**
 * 簡易 toast helper（純 DOM，不拉 element-plus）。
 * 用於家長 App 的成功/錯誤提示。
 *
 * a11y：
 *  - container 設 role="status" + aria-live="polite"，screen reader 會宣告新增的訊息
 *  - error 用 role="alert" + aria-live="assertive" 立刻打斷宣告
 *  - 視覺色彩透過 CSS variable，方便主題化
 *
 * 不偷走焦點：toast 不該 steal focus，使用者繼續操作不被打斷。
 */

const CONTAINER_ID = '__parent_toast_container__'
const ALERT_CONTAINER_ID = '__parent_toast_alert_container__'
const DEFAULT_DURATION = 2400

function ensureContainer(isAlert = false) {
  const id = isAlert ? ALERT_CONTAINER_ID : CONTAINER_ID
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    // status / alert 兩個 region 分離：assertive (alert) 不該打斷 polite 的宣告
    el.setAttribute('role', isAlert ? 'alert' : 'status')
    el.setAttribute('aria-live', isAlert ? 'assertive' : 'polite')
    el.setAttribute('aria-atomic', 'false')
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      z-index: var(--z-toast, 1000); display: flex; flex-direction: column;
      gap: 8px; pointer-events: none; max-width: 92%;
    `
    document.body.appendChild(el)
  }
  return el
}

const TYPE_STYLES = {
  success: {
    bg: 'var(--brand-primary, #3f7d48)',
    color: 'var(--neutral-0, #fff)',
  },
  error: {
    bg: 'var(--color-danger, #ef4444)',
    color: 'var(--neutral-0, #fff)',
  },
  warn: {
    bg: 'var(--color-warning, #f59e0b)',
    color: 'var(--neutral-0, #fff)',
  },
  info: {
    bg: 'var(--neutral-700, #334155)',
    color: 'var(--neutral-0, #fff)',
  },
}

function show(message, type = 'info', duration = DEFAULT_DURATION) {
  // error 走 alert region，讓 SR 立刻打斷
  const container = ensureContainer(type === 'error')
  const c = TYPE_STYLES[type] || TYPE_STYLES.info
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = `
    background: ${c.bg}; color: ${c.color};
    padding: 10px 16px; border-radius: var(--radius-md, 8px);
    font-size: var(--text-base, 14px); box-shadow: var(--shadow-md, 0 2px 8px rgba(0,0,0,.15));
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

// 注入 keyframes 一次（reduced-motion 由 globals.css 統一處理）
if (typeof document !== 'undefined' && !document.getElementById('__parent_toast_keyframes__')) {
  const style = document.createElement('style')
  style.id = '__parent_toast_keyframes__'
  style.textContent = `@keyframes parent-toast-fade-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }`
  document.head.appendChild(style)
}
