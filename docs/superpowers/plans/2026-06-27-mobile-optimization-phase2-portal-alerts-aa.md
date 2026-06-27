# 手機端優化 Phase 2（Portal 接送提醒鏈 T1 + WCAG AA T6）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復教師 Portal 接送即時提醒在 iPhone/LINE WebView 的可靠性（純前端：beep 手勢解鎖 + 全局 WS + visibilitychange 補拓 + 誠實降級），並把跨三端狀態徽章/CTA/文字色收斂到 WCAG AA。

**Architecture:** T1 抽 module-singleton composable `usePortalDismissalAlerts`（單一 WS + beep + 通知 + 生命週期），`PortalLayout` 殼層 init 一次（跨頁存活），`PortalDismissalCallsView` 改純消費者。T6 以 `main.css` 全域 el-tag `*-darker` 覆寫為主力 + 各處 token/hex 置換。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + composable、Element Plus 2.5、Vitest 4 + @vue/test-utils（happy-dom）、Web Audio / WebSocket / Notification / Vibration API。

## Global Constraints

- **繁體中文**：註解 / commit message / UI 文案一律繁中。
- **TS-only / strict**：`src/` 100% TS；新 composable `<script>`-free 純 .ts；禁 `: any`/`as any`（用 `: unknown` + narrow 或既有型別）。`noUnusedLocals: true`——抽走的程式碼若留下未使用 import 必須刪。
- **純前端**：不動後端、不新增 LINE 推播 / Web Push / Service Worker push。
- **不可**用 `maximum-scale=1`。
- **達標 token 值**（已存在，逐字用）：`--color-success-darker:#15803d` / `--color-warning-darker:#b45309` / `--color-danger-darker:#b91c1c` / `--color-info-darker:#1d4ed8`（`src/assets/design-tokens.css`）；`--m3-primary:#006d3d`（`src/parent/styles/m3-tokens.css`）。
- **el-tag 覆寫只動 light effect 預設**：不可改到 `effect="dark"` 徽章（已達標）。
- **新手機 `@media`**（若有）一律 `max-width: 767.98px`。
- **家長三測試樹**：改家長元件/全域樣式後回歸 `npm run test -- --run src/parent tests/unit/parent tests/parent`（本 Phase B2/B3/B5/B6 觸及家長）；全 Phase 收尾跑全量 `npm run test`。
- **共用 main 多 session 並行**：`git add` 只加本任務檔，不 `-A`（**不要** add `components.d.ts` 或任何 `.log`）。**不 push**。
- **Conventional Commits** + 繁中 + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 指令：`npx vitest run <path>`（單檔）/ `npm run test`（全量）/ `npm run typecheck` / `npm run build`。

---

### Task 1: 建立 `usePortalDismissalAlerts` composable（module-singleton）

**Files:**
- Create: `src/composables/usePortalDismissalAlerts.ts`
- Test: `src/composables/__tests__/usePortalDismissalAlerts.spec.ts`

**Interfaces:**
- Consumes: `getPortalDismissalCalls`（`@/api/dismissalCalls`）、`closeWebSocketSafely`（`@/utils/ws`）、`sortByOldestFirst`/`DismissalCallView`（`@/composables/useDismissalUrgency`）。
- Produces:
  - `usePortalDismissalAlerts()` → `{ activeCalls, sortedCalls, pendingCount, loading, liveAnnounce, wsConnected, connectionState, muted, audioUnlocked, notificationSupported, toggleMute, unlockAudio, fetchCalls }`
  - `initPortalDismissalAlerts(): void`（init-once：fetchCalls + connectWs + 一次性手勢解鎖 listener + visibilitychange + 請求 Notification 權限）
  - `teardownPortalDismissalAlerts(): void`

- [ ] **Step 1: 寫失敗測試**

`src/composables/__tests__/usePortalDismissalAlerts.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// ── mock 依賴 ──
const getCallsMock = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: () => getCallsMock(),
}))
vi.mock('@/utils/ws', () => ({ closeWebSocketSafely: vi.fn() }))

// ── mock WebSocket ──
let lastWs: MockWS | null = null
class MockWS {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) { lastWs = this }
  send(d: string) { this.sent.push(d) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

// ── mock AudioContext ──
const oscStub = () => ({ type: '', frequency: { value: 0 }, connect: () => oscStub2(), start: vi.fn(), stop: vi.fn() })
const oscStub2 = () => ({ connect: vi.fn() })
class MockAudioCtx {
  state = 'running'; currentTime = 0
  createOscillator() { return { type: '', frequency: { value: 0 }, connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn() } }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination() { return {} }
}

beforeEach(() => {
  getCallsMock.mockClear()
  lastWs = null
  vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  vi.stubGlobal('AudioContext', MockAudioCtx as unknown as typeof AudioContext)
  localStorage.clear()
})
afterEach(async () => {
  const m = await import('@/composables/usePortalDismissalAlerts')
  m.teardownPortalDismissalAlerts()
  vi.unstubAllGlobals()
})

describe('usePortalDismissalAlerts', () => {
  it('init 後 fetchCalls 並開一條 WebSocket', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    await nextTick()
    expect(getCallsMock).toHaveBeenCalled()
    expect(lastWs).not.toBeNull()
    expect(lastWs!.url).toContain('/api/ws/portal/dismissal-calls')
  })

  it('init-once：重複 init 只開一條 WebSocket', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    const first = lastWs
    m.initPortalDismissalAlerts()
    expect(lastWs).toBe(first)
  })

  it('dismissal_call_created 事件 → activeCalls 增加 + pendingCount 反映', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    lastWs!.open()
    lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 1, student_name: '小明', classroom_name: '幼幼班', status: 'pending' } })
    const { activeCalls, pendingCount } = m.usePortalDismissalAlerts()
    expect(activeCalls.value.some((c) => c.id === 1)).toBe(true)
    expect(pendingCount.value).toBe(1)
  })

  it('首次 document pointerdown 解鎖 audio（audioUnlocked=true）', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    const { audioUnlocked } = m.usePortalDismissalAlerts()
    expect(audioUnlocked.value).toBe(false)
    document.dispatchEvent(new Event('pointerdown'))
    expect(audioUnlocked.value).toBe(true)
  })

  it('visibilitychange→visible 觸發 fetchCalls 補抓', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    await nextTick()
    getCallsMock.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getCallsMock).toHaveBeenCalled()
  })

  it('toggleMute 寫入 localStorage 偏好', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { muted, toggleMute } = m.usePortalDismissalAlerts()
    expect(muted.value).toBe(false)
    toggleMute()
    expect(muted.value).toBe(true)
    expect(localStorage.getItem('portal_dismissal_sound_muted')).toBe('1')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/composables/__tests__/usePortalDismissalAlerts.spec.ts`
Expected: FAIL（`Cannot find module '@/composables/usePortalDismissalAlerts'`）

- [ ] **Step 3: 實作 `src/composables/usePortalDismissalAlerts.ts`**

```ts
/**
 * 教師 Portal 接送即時提醒（module-singleton）。
 *
 * 從 PortalDismissalCallsView 抽出 WS + beep + 通知 + 生命週期，提升到 Portal 殼層全局：
 * - 單一 WS，跨所有 Portal 頁存活（老師多工切頁仍收得到提醒）
 * - AudioContext 在首次 user gesture 解鎖（iOS/LINE WebView 否則 beep 永不響）
 * - visibilitychange 回前景補抓 + 重連（iOS 背景凍結 setTimeout）
 * - 誠實降級：vibrate 僅 Android；Notification 包 try/catch + 偵測支援度
 *
 * 純前端：不依賴後端推播。由 PortalLayout 呼叫 initPortalDismissalAlerts() 一次。
 */
import { ref, computed } from 'vue'
import { getPortalDismissalCalls } from '@/api/dismissalCalls'
import { closeWebSocketSafely } from '@/utils/ws'
import { sortByOldestFirst, type DismissalCallView } from '@/composables/useDismissalUrgency'

type DismissalCall = DismissalCallView

// ── module-singleton 共享狀態 ──
const activeCalls = ref<DismissalCall[]>([])
const loading = ref(false)
const liveAnnounce = ref('')
const wsConnected = ref(false)
const wsReconnectCount = ref(0)
const wsExhausted = ref(false)
const audioUnlocked = ref(false)
const SOUND_PREF_KEY = 'portal_dismissal_sound_muted'
const muted = ref(localStorage.getItem(SOUND_PREF_KEY) === '1')
const notificationSupported = ref(typeof window !== 'undefined' && 'Notification' in window)

const sortedCalls = computed(() => sortByOldestFirst(activeCalls.value))
const pendingCount = computed(() => activeCalls.value.length)
const connectionState = computed<'normal' | 'reconnecting' | 'exhausted'>(() =>
  wsConnected.value ? 'normal' : wsExhausted.value ? 'exhausted' : 'reconnecting',
)

// ── module-scoped 非響應式 ──
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let audioCtx: AudioContext | null = null
let initialized = false
let gestureHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null
const WS_MAX_RETRIES = 5
const WS_LIVENESS_TIMEOUT = 45000

// ── 聲音 / 震動 ──
function unlockAudio(): void {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    // 播一個 0 音量 oscillator，在 user gesture 內解鎖
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.01)
    audioUnlocked.value = true
  } catch { /* 解鎖失敗：audioUnlocked 維持 false，UI 顯示提示 */ }
}

function playBeep(): void {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.4)
  } catch { /* ignore */ }
}

// navigator.vibrate 在所有 iOS（含 iPhone 上的 LINE in-app WebView）為 no-op；
// 僅 Android 有效，不可當 iOS 可靠提醒手段（iOS 主提醒 = beep + 前景視覺）。
function triggerHaptic(): void {
  if (muted.value) return
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([180, 80, 180])
}

function toggleMute(): void {
  muted.value = !muted.value
  localStorage.setItem(SOUND_PREF_KEY, muted.value ? '1' : '')
}

// ── 瀏覽器推播（誠實降級：iOS Safari/LINE WebView 多半不送達，包 try/catch）──
function notifyBrowser(call: DismissalCall): void {
  if (!notificationSupported.value) return
  try {
    if (Notification.permission === 'granted') {
      new Notification('接送通知', {
        body: `${call.student_name}（${call.classroom_name}）等待接送`,
        icon: '/favicon.ico',
      })
    }
  } catch { /* 部分 WebView 對 new Notification 直接 throw */ }
}

function requestNotificationPermission(): void {
  if (notificationSupported.value && Notification.permission === 'default') {
    try { Notification.requestPermission() } catch { /* ignore */ }
  }
}

// ── HTTP ──
async function fetchCalls(): Promise<void> {
  loading.value = true
  try {
    const res = await getPortalDismissalCalls()
    activeCalls.value = res.data || []
  } catch { /* 靜默：UI 由 connectionState 呈現 */ } finally {
    loading.value = false
  }
}

// ── 輪詢 fallback ──
function stopPolling(): void { if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null } }
function startPolling(): void { stopPolling(); pollingTimer = setInterval(fetchCalls, 15000) }

// ── liveness / 重連 ──
function clearLiveness(): void { if (wsLivenessTimer) { clearTimeout(wsLivenessTimer); wsLivenessTimer = null } }
function bumpLiveness(): void {
  clearLiveness()
  wsLivenessTimer = setTimeout(() => {
    if (!ws) return
    const dead = ws
    dead.onclose = null; dead.onerror = null; dead.onmessage = null
    try { dead.close() } catch { /* ignore */ }
    ws = null
    wsConnected.value = false
    scheduleReconnect()
  }, WS_LIVENESS_TIMEOUT)
}
function scheduleReconnect(): void {
  if (wsReconnectCount.value < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount.value), 30000)
    wsReconnectCount.value++
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    wsExhausted.value = true
    startPolling()
  }
}
function connectWs(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/ws/portal/dismissal-calls`)
  ws.onopen = () => {
    wsConnected.value = true
    wsReconnectCount.value = 0
    wsExhausted.value = false
    stopPolling()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
    bumpLiveness()
    fetchCalls()
  }
  ws.onmessage = (e) => {
    bumpLiveness()
    try {
      const event = JSON.parse(e.data)
      if (event.type === 'ping') { ws?.send(JSON.stringify({ type: 'pong' })); return }
      handleWsEvent(event)
    } catch { /* ignore */ }
  }
  ws.onerror = () => { wsConnected.value = false }
  ws.onclose = () => { wsConnected.value = false; clearLiveness(); scheduleReconnect() }
}

function handleWsEvent(event: { type: string; payload: DismissalCall }): void {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    activeCalls.value.unshift(payload)
    notifyBrowser(payload)
    playBeep()
    triggerHaptic()
    liveAnnounce.value = `新接送通知：${payload.student_name || '學生'}${payload.classroom_name ? `（${payload.classroom_name}）` : ''} 等待接送`
  } else if (type === 'dismissal_call_updated') {
    const idx = activeCalls.value.findIndex((c) => c.id === payload.id)
    if (payload.status === 'completed' || payload.status === 'cancelled') {
      if (idx !== -1) activeCalls.value.splice(idx, 1)
    } else if (idx !== -1) activeCalls.value.splice(idx, 1, payload)
    else activeCalls.value.unshift(payload)
  } else if (type === 'dismissal_call_cancelled') {
    activeCalls.value = activeCalls.value.filter((c) => c.id !== payload.id)
  }
}

// ── visibilitychange：回前景補抓 + 必要時重連 ──
function onVisibility(): void {
  if (document.visibilityState !== 'visible') return
  fetchCalls()
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (ws) { try { ws.close() } catch { /* ignore */ } ws = null }
    wsReconnectCount.value = 0
    connectWs()
  }
}

export function initPortalDismissalAlerts(): void {
  if (initialized) return
  initialized = true
  requestNotificationPermission()
  // 首次任一手勢解鎖 AudioContext（once + capture，最早攔截）
  gestureHandler = () => { unlockAudio() }
  document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true })
  visibilityHandler = onVisibility
  document.addEventListener('visibilitychange', visibilityHandler)
  fetchCalls()
  connectWs()
}

export function teardownPortalDismissalAlerts(): void {
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  clearLiveness()
  stopPolling()
  if (gestureHandler) { document.removeEventListener('pointerdown', gestureHandler, { capture: true } as EventListenerOptions); gestureHandler = null }
  if (visibilityHandler) { document.removeEventListener('visibilitychange', visibilityHandler); visibilityHandler = null }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  audioUnlocked.value = false
  wsConnected.value = false
  wsReconnectCount.value = 0
  wsExhausted.value = false
  activeCalls.value = []
  initialized = false
}

export function usePortalDismissalAlerts() {
  return {
    activeCalls, sortedCalls, pendingCount, loading, liveAnnounce,
    wsConnected, connectionState, muted, audioUnlocked, notificationSupported,
    toggleMute, unlockAudio, playBeep, triggerHaptic, fetchCalls,
  }
}
```

- [ ] **Step 4: 跑測試確認 GREEN + typecheck**

Run: `npx vitest run src/composables/__tests__/usePortalDismissalAlerts.spec.ts && npm run typecheck`
Expected: 6/6 PASS；型別 0 錯。

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePortalDismissalAlerts.ts src/composables/__tests__/usePortalDismissalAlerts.spec.ts
git commit -m "feat(portal): 抽 usePortalDismissalAlerts composable（全局 WS + 手勢解鎖 + visibilitychange）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: PortalLayout init composable + PortalDismissalCallsView 改純消費者

**Files:**
- Modify: `src/layouts/PortalLayout.vue`（init/teardown composable、徽章接 live `pendingCount`，移除 `fetchDismissalPendingCount` onMounted 抓一次）
- Modify: `src/views/portal/PortalDismissalCallsView.vue`（移除 inline WS/beep/notification/lifecycle，改 `usePortalDismissalAlerts()` 消費；保留 `handleAcknowledge`/`handleComplete`/`testSound`/`reloadPage`/template）
- Test: `tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts`（新建）

**Interfaces:**
- Consumes: `usePortalDismissalAlerts()`、`initPortalDismissalAlerts()`、`teardownPortalDismissalAlerts()`（Task 1）。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts`（沿用既有 `PortalLayout.test.ts` 的 mock 套組——複製其 vi.mock 區塊，並加上）：
```ts
// 於既有 PortalLayout mock 套組（vue-router / @/utils/auth / 各 portal api / usePortalSearch / element-plus）之外，補：
const initMock = vi.fn()
const teardownMock = vi.fn()
const pendingCount = ref(0)
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  initPortalDismissalAlerts: () => initMock(),
  teardownPortalDismissalAlerts: () => teardownMock(),
  usePortalDismissalAlerts: () => ({ pendingCount }),
}))
```
測試本體：
```ts
it('mount 時 init 接送提醒 composable 一次', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })
  userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
  await flushPromises()
  expect(initMock).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  expect(teardownMock).toHaveBeenCalledTimes(1)
})

it('接送徽章顯示 composable 的 live pendingCount', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })
  pendingCount.value = 3
  userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
  await flushPromises()
  expect(wrapper.find('.announcement-badge').exists()).toBe(true)
  wrapper.unmount()
})
```
（注意：import `ref` from 'vue'；測試檔需自行貼齊既有 PortalLayout.test.ts 的完整 mock 區塊才能 mount。）

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts`
Expected: FAIL（PortalLayout 尚未 init composable，`initMock` 未被呼叫）

- [ ] **Step 3: 改 `PortalLayout.vue`**

- import 區塊加：`import { initPortalDismissalAlerts, teardownPortalDismissalAlerts, usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'`
- 移除 `import { getPortalPendingCount } from '@/api/dismissalCalls'`（:7）與 `fetchDismissalPendingCount`（:100-104）、`const dismissalPendingCount = ref(0)`（:55）。
- 改用 composable 的 live count：`const { pendingCount: dismissalPendingCount } = usePortalDismissalAlerts()`（template 的 `:value="dismissalPendingCount"` :397 不變，現在是 computed）。
- onMounted 內把原 `fetchDismissalPendingCount()`（:139）改為 `initPortalDismissalAlerts()`。
- onUnmounted 內加 `teardownPortalDismissalAlerts()`（若無 onUnmounted 則新增；保留既有 resize listener 清理等）。

- [ ] **Step 4: 改 `PortalDismissalCallsView.vue`**（純消費者）

`<script setup>` 重寫 state/WS/beep 區段：移除 `activeCalls/loading/liveAnnounce/useNowClock 以外的 WS·beep·notification·lifecycle`，改：
```ts
import { usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'
// ...
const {
  activeCalls, sortedCalls, loading, liveAnnounce, wsConnected, connectionState,
  muted, audioUnlocked, notificationSupported, toggleMute, unlockAudio, playBeep, triggerHaptic, fetchCalls,
} = usePortalDismissalAlerts()

const testSound = () => { unlockAudio(); playBeep(); triggerHaptic() }
const reloadPage = () => location.reload()
// handleAcknowledge / handleComplete 保留（呼叫 API + 變動 activeCalls.value）
// 移除：connectWs/scheduleReconnect/bumpLiveness/notifyBrowser/onMounted(connectWs)/onUnmounted(closeWS)
// onMounted 不再連 WS（殼層已連）；可保留一次 fetchCalls() 確保進頁即最新（composable 已連時可省，但保險起見呼叫一次無害）
```
- 模板：未解鎖時（`!audioUnlocked`）顯示輕提示「點一下畫面以啟用接送提醒音」；`notificationSupported===false` 或權限非 granted 時顯示「此裝置無法背景推播，請保持 App 開啟並開啟聲音」常駐提示。沿用既有 `connectionState`/`muted`/`testSound`/list 模板。
- 移除不再用到的 import（`closeWebSocketSafely`、`onUnmounted` 若不再用、`useNowClock` 若仍用於 urgency 則保留）。typecheck 會抓未使用 import。

- [ ] **Step 5: 跑測試 GREEN + 既有 dismissal/layout 測試回歸 + typecheck**

Run: `npx vitest run tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts tests/unit/layouts/PortalLayout.test.ts && npm run typecheck`
（若有既有 `PortalDismissalCallsView` 測試也一併跑）
Expected: 新測試 PASS；既有 PortalLayout 測試不回歸；型別 0 錯。

- [ ] **Step 6: Commit**

```bash
git add src/layouts/PortalLayout.vue src/views/portal/PortalDismissalCallsView.vue tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts
git commit -m "feat(portal): 接送提醒提升到殼層全局 + 降級提示，view 改純消費者

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: B1 全域 el-tag AA 覆寫 + B4 AuditLog 硬編 hex → token

**Files:**
- Modify: `src/assets/main.css`（新增 el-tag light-effect *-darker 覆寫）
- Modify: `src/views/AuditLogView.vue:679-685`（.diff-before/.diff-after hex → token）
- Test: `tests/unit/mobile/aaContrast.spec.ts`（新建，regression guard）

**Interfaces:** 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/mobile/aaContrast.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('WCAG AA 顏色收斂', () => {
  it('main.css 對 light-effect el-tag 套用 *-darker 文字色', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.el-tag--warning[^{]*\{[^}]*--color-warning-darker/)
    expect(css).toMatch(/\.el-tag--success[^{]*\{[^}]*--color-success-darker/)
    expect(css).toMatch(/\.el-tag--danger[^{]*\{[^}]*--color-danger-darker/)
    expect(css).toMatch(/\.el-tag--info[^{]*\{[^}]*--color-info-darker/)
  })
  it('AuditLogView diff 文字不再用硬編 #c0392b/#27ae60', () => {
    const css = read('src/views/AuditLogView.vue')
    expect(css).not.toContain('#c0392b')
    expect(css).not.toContain('#27ae60')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts`
Expected: FAIL（覆寫與 token 化都未做）

- [ ] **Step 3: 改 `src/assets/main.css`**（檔尾加；只動 light effect 預設，`effect="dark"` 不受影響）

```css
/* WCAG AA：Element Plus 預設 light-effect 狀態徽章文字色（*-base on *-soft）對比僅 1.9–3.1:1。
   改用 design-tokens 的 *-darker（為 text-on-light 設計），躍升至 ≥4.5:1。
   只覆寫 light effect 預設；effect="dark"（白字飽和底）已達標、不在此選擇器內。 */
.el-tag.el-tag--warning:not(.el-tag--dark) { color: var(--color-warning-darker) !important; }
.el-tag.el-tag--success:not(.el-tag--dark) { color: var(--color-success-darker) !important; }
.el-tag.el-tag--danger:not(.el-tag--dark)  { color: var(--color-danger-darker) !important; }
.el-tag.el-tag--info:not(.el-tag--dark)    { color: var(--color-info-darker) !important; }
```

- [ ] **Step 4: 改 `src/views/AuditLogView.vue:679-685`**

```css
.diff-before {
  color: var(--color-danger-darker);
  /* 其餘屬性不變 */
}
.diff-after {
  color: var(--color-success-darker);
  /* 其餘屬性不變 */
}
```
（保留 `.diff-before`/`.diff-after` 其餘宣告，只換 color 值。）

- [ ] **Step 5: 跑測試 GREEN + lint + build**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts && npm run lint:css && npm run build`
Expected: 測試 PASS；CSS lint 無新錯；build 成功。

- [ ] **Step 6: Commit**

```bash
git add src/assets/main.css src/views/AuditLogView.vue tests/unit/mobile/aaContrast.spec.ts
git commit -m "fix(a11y): el-tag light effect 狀態徽章 + AuditLog diff 改 *-darker token 過 AA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: B2+B3+B5 家長端 AA token（CTA / warning / 連結）

**Files:**
- Modify: `src/parent/styles/patterns.css`（`.pt-action-btn` 背景 → `--m3-primary`）
- Modify: `src/parent/styles/globals.css:112-113`（`--pt-warning-text`/`--pt-warning-text-mid` → `#8a5d00`）
- Modify: `src/parent/components/leaves/LeaveAttachments.vue`、`LeaveListCard.vue`、`src/parent/components/activity/RegistrationStatusList.vue`（連結色 → `--pt-info-text` + `text-decoration:underline`）
- Test: 追加斷言到 `tests/unit/mobile/aaContrast.spec.ts`

**Interfaces:** 無。

- [ ] **Step 1: 追加失敗測試**（在 Task 3 的 aaContrast.spec.ts 內 `describe` 補）

```ts
  it('家長 .pt-action-btn 背景改用 --m3-primary（非 #0d9053/--brand-primary）', () => {
    const css = read('src/parent/styles/patterns.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.pt-action-btn\s*\{[^}]*background:\s*var\(--m3-primary/)
  })
  it('家長 --pt-warning-text 調深到 #8a5d00', () => {
    const css = read('src/parent/styles/globals.css')
    expect(css).toContain('--pt-warning-text:      #8a5d00')
    expect(css).not.toContain('--pt-warning-text:      #c99500')
  })
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts`
Expected: FAIL（兩條家長斷言）

- [ ] **Step 3: 改 `src/parent/styles/patterns.css`**

`.pt-action-btn` 的 `background: var(--brand-primary, #0d9053)`（:6）→ `background: var(--m3-primary, #006d3d)`；`:active` 的 `background: var(--brand-primary-hover, #0caf76)`（:18）→ `background: var(--m3-primary, #006d3d)`（或更深 hover，保持過 AA）。

- [ ] **Step 4: 改 `src/parent/styles/globals.css:112-113`**

```css
  --pt-warning-text:      #8a5d00;       /* warning label（AA on warn-soft）*/
  --pt-warning-text-mid:  #8a5d00;       /* warning 圖示 */
```
（對齊縮排與既有格式，使 Step 1 的 `'--pt-warning-text:      #8a5d00'` 字串比對命中；實作時確認該行的空白數與檔案一致。）

- [ ] **Step 5: 改三個家長連結元件**

`LeaveAttachments.vue` 的 `.att-link`（color `--pt-info-link` → `--pt-info-text`，加 `text-decoration: underline`）；`LeaveListCard.vue`、`RegistrationStatusList.vue` 同型連結比照。

- [ ] **Step 6: 跑測試 GREEN + 家長三測試樹回歸**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts && npm run test -- --run src/parent tests/unit/parent tests/parent`
Expected: guard PASS；家長三樹回歸綠（改全域 token/樣式，sibling sweep）。

- [ ] **Step 7: Commit**

```bash
git add src/parent/styles/patterns.css src/parent/styles/globals.css src/parent/components/leaves/LeaveAttachments.vue src/parent/components/leaves/LeaveListCard.vue src/parent/components/activity/RegistrationStatusList.vue tests/unit/mobile/aaContrast.spec.ts
git commit -m "fix(a11y): 家長 CTA/warning/連結色改達標 token 過 WCAG AA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: B6+B7 底部導覽對比 + portal 高流量 view text-tertiary 收斂

**Files:**
- Modify: `src/layouts/PortalLayout.vue`（`.bottom-tab` 未選中色 `var(--text-tertiary)` → 達標中性色）
- Modify: `src/parent/layouts/ParentLayout.vue` + `src/parent/components/m3/M3NavigationBar.vue`（active indicator pill 對比 + bottom-tab 未選中色）
- Modify: `src/views/portal/PortalAnnouncementView.vue` / `PortalIncidentView.vue` / `PortalAssessmentView.vue`（`--text-tertiary` 當正文 → `--pt-text-muted`）
- Test: 追加斷言到 `tests/unit/mobile/aaContrast.spec.ts`

**Interfaces:** 無。

- [ ] **Step 1: 追加失敗測試**

```ts
  it('PortalLayout .bottom-tab 未選中不再用 --text-tertiary 當文字', () => {
    const css = read('src/layouts/PortalLayout.vue').replace(/\s+/g, ' ')
    expect(css).toMatch(/\.bottom-tab\s*\{[^}]*color:\s*var\(--pt-text-muted/)
  })
```
（B7 高流量 view 收斂以家長三樹/portal 既有測試 + 視覺回歸把關，不逐一寫 guard，避免脆弱。）

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts`
Expected: FAIL（bottom-tab 斷言）

- [ ] **Step 3: 改 `PortalLayout.vue` `.bottom-tab`（:826-838）**

`color: var(--text-tertiary)` → `color: var(--pt-text-muted, #64748b)`（未選中態；`.bottom-tab.active` 維持 `--color-primary`）。

- [ ] **Step 4: 改 parent 底部導覽**

`ParentLayout.vue` 覆寫 `--m3-secondary-container` 的 active indicator → 改用對 bar 底色有 ≥3:1 的色（brand 綠淡 tint，如 `--brand-primary-soft`）；`M3NavigationBar.vue` indicator 消費點若硬編同色一併調。bottom-tab 未選中文字維持深色即可。

- [ ] **Step 5: 改三個 portal 高流量 view**

`PortalAnnouncementView.vue` / `PortalIncidentView.vue` / `PortalAssessmentView.vue` 內把當「正文/次要敘述」用的 `var(--text-tertiary)` 改 `var(--pt-text-muted)`（disabled/裝飾性維持不動）。

- [ ] **Step 6: 跑測試 GREEN + 全量回歸（觸及 portal+parent）**

Run: `npx vitest run tests/unit/mobile/aaContrast.spec.ts && npm run test`
Expected: guard PASS；全量回歸綠（注意 pre-existing `AnnouncementView ensureReadersLoaded` 在 main 既有失敗，非本任務引入——比對基準）。

- [ ] **Step 7: Commit**

```bash
git add src/layouts/PortalLayout.vue src/parent/layouts/ParentLayout.vue src/parent/components/m3/M3NavigationBar.vue src/views/portal/PortalAnnouncementView.vue src/views/portal/PortalIncidentView.vue src/views/portal/PortalAssessmentView.vue tests/unit/mobile/aaContrast.spec.ts
git commit -m "fix(a11y): 底部導覽對比 + portal 高流量 view 次要文字色過 AA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 全 Phase 收尾驗證

**Files:** 無（驗證 only）

- [ ] **Step 1: 全量回歸 + 型別 + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 型別 0 錯；全量綠（**唯一容許**：`tests/unit/views/AnnouncementView.test.js > ensureReadersLoaded cache hit` 為 main pre-existing 失敗，須與合併基準一致、非本 Phase 引入）；build 成功。

- [ ] **Step 2: 裝置模擬 sanity（建議，非阻塞）**

`npm run preview`，DevTools iPhone 視窗驗：① 進 Portal 點一下 → 接送提醒音可解鎖（testSound 有聲）② 切到其他 Portal 頁，模擬 dismissal_call_created 仍 beep + 殼層徽章 +1 ③ 狀態徽章文字對比明顯變深可讀 ④ 家長端主 CTA 綠變深。

- [ ] **Step 3: 收尾**

純前端、後端不涉及。確認 commit 在分支上；push 與 CI 由 user 決定（push 觸發 Zeabur 前端部署）。

---

## Self-Review

**Spec 覆蓋**：T1 §2.1 composable → Task 1；§2.2 AudioContext 解鎖 → Task 1（unlockAudio + gesture listener）；§2.3 visibilitychange → Task 1（onVisibility）；§2.4 降級 → Task 1（vibrate 註解 / Notification try/catch）+ Task 2（UI 提示）；§2.5 全局 WS → Task 2（PortalLayout init + 徽章 live count）。T6 B1 → Task 3；B4 → Task 3；B2/B3/B5 → Task 4；B6/B7 → Task 5。收尾 → Task 6。✓
**非目標**：不動後端 / 不做 LINE 推播·Web Push / 不重設計按鈕 / 不碰 dark-mode token / text-tertiary sprawl 只做高流量 → 皆未進任務。✓
**Placeholder 掃描**：無 TBD；composable 完整程式碼、測試碼齊備；token 值逐字。Task 2 的 view 重寫以「保留/移除」清單 + 關鍵 import 描述（非逐行貼整檔，因該檔 290 行 script 過長），實作者依清單操作 + typecheck 把關未使用 import——可接受的粒度。
**型別/命名一致**：`usePortalDismissalAlerts` / `initPortalDismissalAlerts` / `teardownPortalDismissalAlerts` / `pendingCount` / `audioUnlocked` / `unlockAudio` 在 Task 1 定義、Task 2 消費一致；`*-darker` token 名與 design-tokens 一致；`--pt-text-muted`/`--pt-info-text`/`--m3-primary` 與 spec 一致。
**已知風險**：全局 WS 會讓每個 Portal user 連一條 dismissal WS（與既有全域 pending-count 徽章一致；若後端連線數有壓力，未來可 gate 於 dismissal 權限——本 Phase 不做）。
