/**
 * 簡易 toast helper（純 DOM，不拉 element-plus）。
 * 用於家長 App 的成功/錯誤提示。
 *
 * a11y：
 *  - status region 設 role="status" + aria-live="polite"，screen reader 會宣告新增的訊息
 *  - error 用 role="alert" + aria-live="assertive" 立刻打斷宣告
 *  - 不偷走焦點：toast 不該 steal focus，使用者繼續操作不被打斷
 *
 * 視覺（2026-10 長輩可讀性修正）：
 *  - 停留時間依嚴重度：success/info 4 秒、warn/error 6 秒（呼叫端仍可傳第二參數覆寫）；
 *    舊版一律 2.4 秒，閱讀較慢的祖父母來不及看完
 *  - 位置移到畫面下方、底部導覽列（含隆起圓鈕）之上，落在拇指與視線常駐的區域，
 *    並吃 safe-area；舊版 top:20px 會被瀏海／LIFF 標題列蓋住
 *  - 配色統一走 M3 inverse-surface 底＋inverse-on-surface 字（light/dark 皆約 12:1），
 *    語意只用左邊條與圖示表達（非文字 3:1 以上）；舊版 warn 白字配 #f59e0b 僅 2.15:1、
 *    dark 下 info 約 1.38:1
 *  - warn/error 可點擊整張關閉；success/info 不攔截點擊，避免底部 toast 擋住下方按鈕
 */

type ToastType = 'success' | 'error' | 'warn' | 'info'

const STACK_ID = '__parent_toast_stack__'
const CONTAINER_ID = '__parent_toast_container__'
const ALERT_CONTAINER_ID = '__parent_toast_alert_container__'
const STYLE_ID = '__parent_toast_style__'
const FADE_OUT_MS = 300
/** 同一 region 同時最多保留幾則；連續觸發時先收掉最舊的，避免疊滿半個畫面 */
const MAX_VISIBLE = 3

/** 各嚴重度的預設停留毫秒數（呼叫端第二參數可覆寫） */
export const TOAST_DURATION: Readonly<Record<ToastType, number>> = {
  success: 4000,
  info: 4000,
  warn: 6000,
  error: 6000,
}

/** 需要使用者能自行關閉的嚴重度 */
const DISMISSIBLE: ReadonlySet<ToastType> = new Set<ToastType>(['warn', 'error'])

const TOAST_ICON: Readonly<Record<ToastType, string>> = {
  success: 'check_circle',
  info: 'info',
  warn: 'warning',
  error: 'error',
}

/**
 * 底部導覽列 80px＋safe-area，隆起圓鈕再高出 12px；與 M3Snackbar 同一個 16px 間距。
 * 語意色（左邊條／圖示）是 inverse-surface 上的對比色：light 底是深灰、dark 底是淺灰，
 * 所以 light 用淺色版、dark 用深色版（剛好與該主題的 --m3-error 等相反，不能直接借用）。
 */
const TOAST_CSS = `
#${STACK_ID} {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px) + 16px);
  transform: translateX(-50%);
  z-index: var(--z-toast, 1000);
  width: max-content;
  max-width: min(560px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
#${STACK_ID} > [role] {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.parent-toast {
  --parent-toast-accent: #a2cdda;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  min-height: 48px;
  padding: 12px 16px 12px 12px;
  border-left: 4px solid var(--parent-toast-accent);
  border-radius: var(--pt-control-radius, 14px);
  background: var(--m3-inverse-surface, #2e312e);
  color: var(--m3-inverse-on-surface, #f0f1ec);
  box-shadow: 0 8px 28px -6px rgba(0, 0, 0, 0.35);
  font-size: var(--text-lg, 16px);
  font-weight: 600;
  line-height: 1.5;
  pointer-events: none;
  animation: parent-toast-in 0.2s ease-out;
  transition: opacity ${FADE_OUT_MS}ms ease;
}
.parent-toast.is-leaving { opacity: 0; }
.parent-toast--dismissible { pointer-events: auto; cursor: pointer; }
.parent-toast__icon {
  flex-shrink: 0;
  font-size: 22px;
  color: var(--parent-toast-accent);
  font-variation-settings: 'FILL' 1;
}
.parent-toast__msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.parent-toast__close { flex-shrink: 0; font-size: 20px; opacity: 0.8; }
.parent-toast--success { --parent-toast-accent: var(--m3-inverse-primary, #6ddc97); }
.parent-toast--error { --parent-toast-accent: #ffb4ab; }
.parent-toast--warn { --parent-toast-accent: #ffd36b; }
.parent-toast--info { --parent-toast-accent: #a2cdda; }
[data-theme='dark'] .parent-toast--error { --parent-toast-accent: #ba1a1a; }
[data-theme='dark'] .parent-toast--warn { --parent-toast-accent: #8a5d00; }
[data-theme='dark'] .parent-toast--info { --parent-toast-accent: #3a646f; }
@keyframes parent-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TOAST_CSS
  document.head.appendChild(style)
}

function ensureStack(): HTMLElement {
  let stack = document.getElementById(STACK_ID)
  if (!stack) {
    stack = document.createElement('div')
    stack.id = STACK_ID
    document.body.appendChild(stack)
  }
  return stack
}

function ensureContainer(isAlert: boolean): HTMLElement {
  ensureStyle()
  const id = isAlert ? ALERT_CONTAINER_ID : CONTAINER_ID
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    // status / alert 兩個 region 分離：assertive (alert) 不該打斷 polite 的宣告
    el.setAttribute('role', isAlert ? 'alert' : 'status')
    el.setAttribute('aria-live', isAlert ? 'assertive' : 'polite')
    el.setAttribute('aria-atomic', 'false')
    ensureStack().appendChild(el)
  }
  return el
}

function iconSpan(name: string, className: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = `material-symbols-rounded ${className}`
  span.setAttribute('aria-hidden', 'true')
  span.textContent = name
  return span
}

/** 每則 toast 的收合函式（清 timer＋淡出移除），供超過 MAX_VISIBLE 時收掉最舊的 */
const dismissers = new WeakMap<HTMLElement, () => void>()

function trimOverflow(container: HTMLElement): void {
  const alive = Array.from(container.querySelectorAll<HTMLElement>('.parent-toast:not(.is-leaving)'))
  for (const old of alive.slice(0, Math.max(0, alive.length - MAX_VISIBLE))) {
    dismissers.get(old)?.()
  }
}

function show(message: string, type: ToastType, duration: number = TOAST_DURATION[type]): void {
  // error 走 alert region，讓 SR 立刻打斷
  const container = ensureContainer(type === 'error')
  const dismissible = DISMISSIBLE.has(type)

  const el = document.createElement('div')
  el.className = `parent-toast parent-toast--${type}${dismissible ? ' parent-toast--dismissible' : ''}`
  el.appendChild(iconSpan(TOAST_ICON[type], 'parent-toast__icon'))
  const msg = document.createElement('span')
  msg.className = 'parent-toast__msg'
  msg.textContent = message
  el.appendChild(msg)
  // 關閉圖示只是視覺提示「點一下可關」，整張 toast 都是命中區；不做成可聚焦按鈕，
  // 以免 live region 宣告時多念一段「關閉」、也避免 toast 進入 tab 順序搶焦點。
  if (dismissible) el.appendChild(iconSpan('close', 'parent-toast__close'))

  let timer: ReturnType<typeof setTimeout> | null = null
  let leaving = false
  const dismiss = (): void => {
    if (leaving) return
    leaving = true
    if (timer !== null) clearTimeout(timer)
    el.classList.add('is-leaving')
    setTimeout(() => el.remove(), FADE_OUT_MS)
  }
  dismissers.set(el, dismiss)
  if (dismissible) el.addEventListener('click', dismiss)

  container.appendChild(el)
  trimOverflow(container)
  timer = setTimeout(dismiss, duration)
}

export const toast = {
  success: (msg: string, d?: number) => show(msg, 'success', d),
  error: (msg: string, d?: number) => show(msg, 'error', d),
  warn: (msg: string, d?: number) => show(msg, 'warn', d),
  info: (msg: string, d?: number) => show(msg, 'info', d),
}
