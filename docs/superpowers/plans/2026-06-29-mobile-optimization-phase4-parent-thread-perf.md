# 手機端優化 Phase 4（家長對話頁修復 T10 + 純前端首屏效能 T11）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好家長對話頁 `MessageThreadView` 的三重可用性破壞（版面溢出 + 不自動捲底 + 鍵盤遮輸入），並做三項純前端首屏效能優化（字型非阻塞 + unread 節流 + ChildPhotos 漸進渲染）。

**Architecture:** 抽輕量 `useKeyboardInset` composable（從 ParentBottomSheet 既有 visualViewport 邏輯）供對話頁鍵盤補償用；對話頁 route 加 `hideTabBar`、容器改 flexbox 自然填高、新訊息自動捲底。效能項各自獨立：parent.html 字型改非阻塞 + SW 快取、ParentLayout unread 加 TTL、ChildPhotos 接既有 `useIncrementalRender`。純前端、不動後端、不重構 ParentBottomSheet。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、vue-router、Pinia、Vitest 4 + @vue/test-utils（happy-dom）、visualViewport API、vite-plugin-pwa（workbox）。

## Global Constraints

- **繁體中文**：註解 / commit / UI 文案一律繁中。
- **TS-only / strict**：`<script setup lang="ts">`；禁 `: any`/`as any`（用 `: unknown` + narrow 或既有型別）；`noUnusedLocals:true`。
- **純前端**：不動後端、不碰 RWD token / dark-mode token / T7 設計系統。**不重構 ParentBottomSheet**（已運作；DRY 收斂列 follow-up）。
- **家長三測試樹**：本 Phase 大量觸及家長元件，全量回歸 `npm run test -- --run src/parent tests/unit/parent tests/parent`（sibling sweep）；全 Phase 收尾跑全量 `npm run test`。
- **共用 main 多 session 並行**：`git add` 只加本任務檔，不 `-A`（不要 `components.d.ts`/`.log`）。**不 push**。
- **Conventional Commits** + 繁中 + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 指令：`npx vitest run <path>`（單檔）/ `npm run test`（全量）/ `npm run typecheck` / `npm run build`。

---

### Task 1: `useKeyboardInset` composable

**Files:**
- Create: `src/parent/composables/useKeyboardInset.ts`
- Test: `src/parent/composables/__tests__/useKeyboardInset.spec.ts`

**Interfaces:**
- Produces: `useKeyboardInset(): { keyboardInset: Ref<number> }` — 監聽 `window.visualViewport` resize，回傳鍵盤佔用高度（px）；無鍵盤/不支援為 0。

- [ ] **Step 1: 寫失敗測試**

`src/parent/composables/__tests__/useKeyboardInset.spec.ts`：
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useKeyboardInset } from '../useKeyboardInset'

// 用一個宿主元件掛 composable（onMounted/onUnmounted 需在元件生命週期內）
function mountHost() {
  let api!: ReturnType<typeof useKeyboardInset>
  const Host = defineComponent({
    setup() { api = useKeyboardInset(); return () => null },
  })
  const wrapper = mount(Host)
  return { wrapper, get api() { return api } }
}

function stubVV(height: number) {
  const listeners: Record<string, (() => void)[]> = {}
  const vv = {
    height,
    addEventListener: (ev: string, cb: () => void) => { (listeners[ev] ||= []).push(cb) },
    removeEventListener: (ev: string, cb: () => void) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== cb)
    },
    _emit(ev: string) { (listeners[ev] || []).forEach((f) => f()) },
    _set(h: number) { vv.height = h },
  }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  return vv
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
})

describe('useKeyboardInset', () => {
  it('初始無鍵盤時 keyboardInset 為 0', () => {
    stubVV(800)
    const { api } = mountHost()
    expect(api.keyboardInset.value).toBe(0)
  })

  it('visualViewport 縮小逾門檻 → keyboardInset 反映鍵盤高', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(500) // 鍵盤彈出，縮 300
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(300)
  })

  it('縮小未逾門檻（<=80）視為非鍵盤 → 維持 0', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(740) // 縮 60
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(0)
  })

  it('鍵盤收回 → keyboardInset 歸 0', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(500); vv._emit('resize')
    expect(api.keyboardInset.value).toBe(300)
    vv._set(800); vv._emit('resize')
    expect(api.keyboardInset.value).toBe(0)
  })

  it('unmount 後移除 resize listener', () => {
    const vv = stubVV(800)
    const spy = vi.spyOn(vv, 'removeEventListener')
    const { wrapper } = mountHost()
    wrapper.unmount()
    expect(spy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/parent/composables/__tests__/useKeyboardInset.spec.ts`
Expected: FAIL（`Cannot find module '../useKeyboardInset'`）

- [ ] **Step 3: 實作 `src/parent/composables/useKeyboardInset.ts`**

```ts
import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 鍵盤彈出補償：監聽 visualViewport resize，回傳鍵盤佔用高度（px）。
 *
 * 行動裝置鍵盤彈出時 layout viewport 不變但 visualViewport.height 縮小；
 * 縮小逾門檻（80px）視為鍵盤開啟，回傳縮小量；否則 0。供全頁視圖（如對話頁）
 * 讓輸入框浮在鍵盤上方。萃取自 ParentBottomSheet 的 visualViewport 邏輯。
 */
const KEYBOARD_THRESHOLD = 80

export function useKeyboardInset(): { keyboardInset: Ref<number> } {
  const keyboardInset = ref(0)
  let initialHeight = 0

  function onResize(): void {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const delta = initialHeight - window.visualViewport.height
    keyboardInset.value = delta > KEYBOARD_THRESHOLD ? delta : 0
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    initialHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onResize)
    }
  })

  return { keyboardInset }
}
```

- [ ] **Step 4: 跑測試確認 GREEN + typecheck**

Run: `npx vitest run src/parent/composables/__tests__/useKeyboardInset.spec.ts && npm run typecheck`
Expected: 5/5 PASS；型別 0 錯。

- [ ] **Step 5: Commit**

```bash
git add src/parent/composables/useKeyboardInset.ts src/parent/composables/__tests__/useKeyboardInset.spec.ts
git commit -m "feat(parent): 新增 useKeyboardInset composable（visualViewport 鍵盤補償）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MessageThreadView 對話頁三修（route + 版面 + 捲底 + 鍵盤）

**Files:**
- Modify: `src/parent/router.ts:51`（`/messages/:threadId` meta 加 `hideTabBar: true`）
- Modify: `src/parent/views/MessageThreadView.vue`（`.messages` ref + 捲底 + useKeyboardInset + `.thread-view` 樣式）
- Test: `src/parent/views/__tests__/MessageThreadView.scroll.spec.ts`（新建）；`src/parent/__tests__/router.spec.ts` 或既有 router 測試補一條（若無則併入上檔做 route meta 斷言）

**Interfaces:**
- Consumes: `useKeyboardInset()`（Task 1）。既有：`messages`（computed）、`loadingMore`、`init()`。

- [ ] **Step 1: 寫失敗測試**

`src/parent/views/__tests__/MessageThreadView.scroll.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

// route
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { threadId: '1' } }) }))

// messages store（可控 messages）
const messageItems = ref<{ id: number }[]>([])
vi.mock('../../stores/messages', () => ({
  useMessagesStore: () => ({
    get messagesByThread() { return { 1: { items: messageItems.value, hasMore: false } } },
    fetchMessages: vi.fn(() => Promise.resolve()),
    markRead: vi.fn(() => Promise.resolve()),
  }),
}))
vi.mock('../../api/messages', () => ({ getMessageThread: vi.fn(() => Promise.resolve({ data: { teacher_name: '王老師', student_name: '小明' } })) }))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({ enqueueParent: vi.fn(), flushParentQueue: vi.fn(() => Promise.resolve()) }))

const stubs = { MessageBubble: true, MessageComposer: true, ConfirmDialog: true }
import MessageThreadView from '../MessageThreadView.vue'
import router from '../../router'

describe('MessageThreadView 自動捲底 + route', () => {
  beforeEach(() => { messageItems.value = [{ id: 1 }, { id: 2 }] })

  it('route /messages/:threadId 設 hideTabBar', () => {
    const rec = router.getRoutes().find((r) => r.path.includes('/messages/:threadId'))
    expect(rec?.meta?.hideTabBar).toBe(true)
  })

  it('新訊息到達後 .messages 捲到底', async () => {
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()
    const el = wrapper.find('.messages').element as HTMLElement
    Object.defineProperty(el, 'scrollHeight', { value: 1500, configurable: true })
    // 模擬收到新訊息
    messageItems.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
    await nextTick(); await nextTick()
    expect(el.scrollTop).toBe(1500)
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/parent/views/__tests__/MessageThreadView.scroll.spec.ts`
Expected: FAIL（route 無 hideTabBar；`.messages` 無 ref/捲底邏輯，scrollTop 維持 0）

- [ ] **Step 3: 改 `src/parent/router.ts:51`**

`/messages/:threadId` 的 meta 由 `{ title: '對話', tab: 'messages', showBack: true }` 改為：
```ts
      meta: { title: '對話', tab: 'messages', showBack: true, hideTabBar: true },
```

- [ ] **Step 4: 改 `MessageThreadView.vue` `<script setup>`**

import 區加：
```ts
import { watch, nextTick } from 'vue'
import { useKeyboardInset } from '../composables/useKeyboardInset'
```
（`computed, onMounted, ref` 已 import；補 `watch, nextTick`。）
setup 內加：
```ts
const { keyboardInset } = useKeyboardInset()
const messagesEl = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// 新訊息（變多且非「載入更早」）→ 捲到底；loadMore 時 loadingMore=true，保留閱讀位置
watch(
  () => messages.value.length,
  (newLen, oldLen) => { if (newLen > oldLen && !loadingMore.value) scrollToBottom() },
)
```
既有 `onMounted` 改為（init 後捲底一次）：
```ts
onMounted(async () => {
  await init()
  scrollToBottom()
  flushParentQueue(OP_KINDS.PARENT_MESSAGE).catch(() => {})
})
```

- [ ] **Step 5: 改 `MessageThreadView.vue` template + style**

`.messages` div 加 ref：
```html
    <div class="messages" ref="messagesEl">
```
`.thread-view` 加鍵盤補償 inline style（鍵盤開時容器底部留出鍵盤高，composer 上移）：
```html
  <div class="thread-view" :style="{ paddingBottom: keyboardInset ? keyboardInset + 'px' : undefined }">
```
`<style scoped>` 的 `.thread-view`：移除 `margin: -16px`、`height: calc(100dvh - 64px)` 改為 `flex: 1; min-height: 0`：
```css
.thread-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--m3-surface, var(--pt-surface-thread-bg));
}
```

- [ ] **Step 6: 跑測試 GREEN + 家長三樹回歸 + typecheck**

Run: `npx vitest run src/parent/views/__tests__/MessageThreadView.scroll.spec.ts && npm run typecheck && npm run test -- --run src/parent tests/unit/parent tests/parent`
Expected: 新測試 2/2 PASS；型別 0 錯；家長三樹回歸綠（改 ParentLayout 消費的 route meta + 對話頁，sibling sweep）。

- [ ] **Step 7: Commit**

```bash
git add src/parent/router.ts src/parent/views/MessageThreadView.vue src/parent/views/__tests__/MessageThreadView.scroll.spec.ts
git commit -m "fix(parent): 對話頁 hideTabBar + flex 版面 + 自動捲底 + 鍵盤補償

route 加 hideTabBar 移除底部 tab；.thread-view 去 margin:-16px（抵銷不存在內距致溢出）
改 flex:1 自然填高；新訊息自動捲底；useKeyboardInset 讓 composer 浮在鍵盤上方。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: parent.html 字型非阻塞 + SW gstatic 快取（T11-1）

**Files:**
- Modify: `parent.html:23-25`（兩條 Google Fonts 改非阻塞 + Material Symbols display=swap）
- Modify: `vite.config.js`（workbox runtimeCaching 加 google-fonts entry）
- Test: `tests/unit/mobile/parentFontPerf.spec.ts`（新建，guard）

**Interfaces:** 無程式介面。

- [ ] **Step 1: 寫失敗測試**

`tests/unit/mobile/parentFontPerf.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('家長端字型首屏效能', () => {
  it('parent.html Material Symbols 用 display=swap（非 block，消除 FOIT）', () => {
    const html = read('parent.html')
    expect(html).toContain('Material+Symbols+Rounded')
    expect(html).not.toMatch(/Material\+Symbols\+Rounded[^"]*display=block/)
    expect(html).toMatch(/Material\+Symbols\+Rounded[^"]*display=swap/)
  })
  it('parent.html 字型 link 非阻塞（media=print onload）', () => {
    const html = read('parent.html').replace(/\s+/g, ' ')
    const fontLinks = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || []
    expect(fontLinks.length).toBeGreaterThanOrEqual(2)
    fontLinks.forEach((l) => expect(l).toContain("media=\"print\""))
  })
  it('vite.config workbox 有 google-fonts runtimeCaching', () => {
    const cfg = read('vite.config.js')
    expect(cfg).toContain('fonts.gstatic.com')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/mobile/parentFontPerf.spec.ts`
Expected: FAIL（display=block、無 media=print、無 gstatic cache）

- [ ] **Step 3: 改 `parent.html:23-25`**

把：
```html
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet">
    <!-- Material Symbols Rounded icon font；display=block 確保字符載入完才顯示，避免 icon 字 → 字符 fallback 跳動 -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=block">
```
改為（非阻塞載入 + display=swap + noscript fallback）：
```html
    <!-- 字型非阻塞載入：media=print 不阻塞首屏渲染，onload 後切回 all 套用 -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" media="print" onload="this.media='all'">
    <!-- Material Symbols Rounded：display=swap 避免弱網下 icon 隱形（FOIT），改顯示 fallback -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" media="print" onload="this.media='all'">
    <noscript>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap">
    </noscript>
```

- [ ] **Step 4: 改 `vite.config.js` workbox runtimeCaching**

在既有 `runtimeCaching: [ ... ]` 陣列**開頭**加一個 entry（不動既有 entry）：
```js
                    {
                        // Google Fonts（跨 origin）：CacheFirst，opaque 回應允許快取
                        urlPattern: ({ url }) =>
                            url.origin === 'https://fonts.googleapis.com' ||
                            url.origin === 'https://fonts.gstatic.com',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts',
                            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
```

- [ ] **Step 5: 跑測試 GREEN + build（確認 SW 生成不爆）**

Run: `npx vitest run tests/unit/mobile/parentFontPerf.spec.ts && npm run build`
Expected: 3/3 PASS；build 成功；`dist` SW 含 google-fonts runtime cache 設定。

- [ ] **Step 6: Commit**

```bash
git add parent.html vite.config.js tests/unit/mobile/parentFontPerf.spec.ts
git commit -m "perf(parent): 字型非阻塞載入 + Material Symbols display=swap + SW 快取 Google Fonts

消除弱網下 icon 隱形（FOIT）與 render-blocking 字型；gstatic 納入 SW runtime cache。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ParentLayout unread TTL 節流（T11-2）

**Files:**
- Create: `src/parent/utils/unreadThrottle.ts`（純函式 TTL 判斷，可測）
- Modify: `src/parent/layouts/ParentLayout.vue:80-95`（refreshUnread 用 TTL gate）
- Test: `src/parent/utils/__tests__/unreadThrottle.spec.ts`（新建）

**Interfaces:**
- Produces: `shouldRefreshUnread(lastTs: number, now: number, ttlMs: number): boolean` — `now - lastTs >= ttlMs`（或 `lastTs === 0` 首次）時回 true。

> 把 TTL 判斷抽成純函式（避免 mount 依賴沉重的 ParentLayout 才能測 TTL 邏輯）。元件只負責記 timestamp + 呼叫 gate。

- [ ] **Step 1: 寫失敗測試**

`src/parent/utils/__tests__/unreadThrottle.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { shouldRefreshUnread } from '../unreadThrottle'

describe('shouldRefreshUnread', () => {
  const TTL = 45_000
  it('首次（lastTs=0）一律刷新', () => {
    expect(shouldRefreshUnread(0, 1_000_000, TTL)).toBe(true)
  })
  it('TTL 內不刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 30_000, TTL)).toBe(false)
  })
  it('剛好到 TTL 邊界刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 45_000, TTL)).toBe(true)
  })
  it('逾 TTL 刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 60_000, TTL)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/parent/utils/__tests__/unreadThrottle.spec.ts`
Expected: FAIL（`Cannot find module '../unreadThrottle'`）

- [ ] **Step 3: 實作 `src/parent/utils/unreadThrottle.ts`**

```ts
/**
 * unread 計數刷新 TTL 判斷（純函式，供 ParentLayout 節流用）。
 *
 * 避免每次路由切換都重打 unread API：lastTs 為上次成功刷新時間（ms epoch，
 * 0 表示尚未刷新）；距今未達 ttlMs 則跳過。
 */
export function shouldRefreshUnread(lastTs: number, now: number, ttlMs: number): boolean {
  if (lastTs === 0) return true
  return now - lastTs >= ttlMs
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run src/parent/utils/__tests__/unreadThrottle.spec.ts`
Expected: 4/4 PASS。

- [ ] **Step 5: 改 `src/parent/layouts/ParentLayout.vue`**

`<script setup>` import 區加：
```ts
import { shouldRefreshUnread } from '../utils/unreadThrottle'
```
setup 內（與其他 ref 並列）加：
```ts
const UNREAD_TTL_MS = 45_000
let lastUnreadAt = 0
```
`refreshUnread`（:80-92）改為：
```ts
async function refreshUnread(force = false) {
  if (!authStore.isAuthed()) return
  const now = Date.now()
  if (!force && !shouldRefreshUnread(lastUnreadAt, now, UNREAD_TTL_MS)) return
  try {
    const [{ data: a }, { data: m }] = await Promise.all([
      getUnreadCount(),
      getMessageUnreadCount(),
    ])
    unread.value = (a as Record<string, unknown>)?.unread_count as number || 0
    unreadMessages.value = (m as Record<string, unknown>)?.unread_count as number || 0
    lastUnreadAt = now
  } catch {
    /* ignore */
  }
}
```
`onMounted(refreshUnread)`（:94）改 `onMounted(() => refreshUnread())`；`watch(() => route.fullPath, refreshUnread)`（:95）改 `watch(() => route.fullPath, () => refreshUnread())`——避免 watch/onMounted 傳入的參數被當作 `force` truthy 誤觸發強制刷新。

- [ ] **Step 6: typecheck + 家長三樹回歸**

Run: `npm run typecheck && npm run test -- --run src/parent tests/unit/parent tests/parent`
Expected: 型別 0 錯；家長三樹回歸綠（改 ParentLayout）。

- [ ] **Step 7: Commit**

```bash
git add src/parent/utils/unreadThrottle.ts src/parent/utils/__tests__/unreadThrottle.spec.ts src/parent/layouts/ParentLayout.vue
git commit -m "perf(parent): unread 計數加 45s TTL 節流，避免每次路由切換重打 API

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ChildPhotos 漸進渲染（T11-3）

**Files:**
- Modify: `src/parent/views/ChildPhotosView.vue`（接 useIncrementalRender，grid v-for 改用 visible）
- Test: `src/parent/views/__tests__/ChildPhotosView.incremental.spec.ts`（新建）

**Interfaces:**
- Consumes: `useIncrementalRender(itemsRef, { pageSize })`（`@/parent/composables/useIncrementalRender`）→ `{ visible, hasMore, loadMore, reset }`。

- [ ] **Step 1: 寫失敗測試**

`src/parent/views/__tests__/ChildPhotosView.incremental.spec.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const photos = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, thumb_url: `t${i}.jpg`, filename: `${i}.jpg` }))
vi.mock('../../api/photos', () => ({ fetchChildPhotos: vi.fn(() => Promise.resolve({ data: photos })) }))
// 視 ChildPhotosView 實際 import 路徑/函式名對齊（mount 前讀檔）；mock student store 等依賴
// stub IntersectionObserver（happy-dom 可能無）
beforeEach(() => {
  // @ts-expect-error test stub
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
})

const stubs = { EmptyState: true }
import ChildPhotosView from '../ChildPhotosView.vue'

describe('ChildPhotosView 漸進渲染', () => {
  it('初始只渲染 pageSize 張縮圖（非全部 50）', async () => {
    const wrapper = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    const thumbs = wrapper.findAll('.thumb')
    expect(thumbs.length).toBeGreaterThan(0)
    expect(thumbs.length).toBeLessThan(50) // 漸進：未一次全渲染
  })
})
```
> 註：mount 前讀 `ChildPhotosView.vue` 確認 `fetchChildPhotos` import 路徑、student/route 依賴並 mock；pageSize 取 useIncrementalRender 預設或本頁指定值，斷言用 `< 50` 寬鬆判定漸進（不綁死確切數）。

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/parent/views/__tests__/ChildPhotosView.incremental.spec.ts`
Expected: FAIL（目前一次渲染 50 張 → `thumbs.length === 50`，不 `< 50`）

- [ ] **Step 3: 改 `src/parent/views/ChildPhotosView.vue`**

`<script setup>` import 加：
```ts
import { useIncrementalRender } from '../composables/useIncrementalRender'
```
找到 `items`（縮圖列表 ref），接 incremental：
```ts
const { visible, hasMore, loadMore } = useIncrementalRender(items, { pageSize: 30 })
```
template `:104` grid 的 `v-for="(item, idx) in items"` 改為 `v-for="(item, idx) in visible"`（`openPreview(idx)` / `:key` 不變——`visible` 是 `items` 前綴，idx 對齊；lightbox 仍以完整 `items` 導航）。grid 後加捲動哨兵讓 IntersectionObserver 自動載入：
```html
      <div v-if="hasMore" ref="loadMoreSentinel" class="load-more-sentinel" aria-hidden="true"></div>
```
> 註：useIncrementalRender 的自動載入若靠內部 IntersectionObserver + sentinel ref，依該 composable 既有用法（參考 ContactBookView/AnnouncementsView）對齊 sentinel ref 名稱與綁定方式；若它回傳 sentinel ref 則用其回傳值。

- [ ] **Step 4: 跑測試 GREEN + 家長三樹回歸 + typecheck**

Run: `npx vitest run src/parent/views/__tests__/ChildPhotosView.incremental.spec.ts && npm run typecheck && npm run test -- --run src/parent tests/unit/parent tests/parent`
Expected: 測試 PASS；型別 0 錯；家長三樹回歸綠。

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/ChildPhotosView.vue src/parent/views/__tests__/ChildPhotosView.incremental.spec.ts
git commit -m "perf(parent): 兒童照片牆接 useIncrementalRender 漸進渲染（避免一次渲染 200 縮圖）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 全 Phase 收尾驗證

**Files:** 無（驗證 only）

- [ ] **Step 1: 全量回歸 + 型別 + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 型別 0 錯；全量綠（含家長三樹）；build 成功。若有失敗先確認是否本 Phase 引入（對合併基準比對）。

- [ ] **Step 2: 裝置模擬 sanity（建議，非阻塞；列 DoD 實機核對）**

`npm run preview`，DevTools iPhone（390px）驗：① 進對話頁無底部 tab、無左右溢出、進頁停最新訊息、聚焦輸入框時 composer 浮在鍵盤上方；② 弱網（throttle）下 icon 顯示 fallback 不隱形；③ ChildPhotos 捲動漸進載入。

- [ ] **Step 3: 收尾**

純前端、後端不涉及。確認 commit 在分支上；push 與 CI 由 user 決定（push 觸發 Zeabur 前端部署）。

---

## Self-Review

**Spec 覆蓋**：T10-1 版面 → Task 2（router + .thread-view）；T10-2 捲底 → Task 2；T10-3 鍵盤 → Task 1（composable）+ Task 2（消費）；T11-1 字型 → Task 3；T11-2 unread 節流 → Task 4；T11-3 ChildPhotos → Task 5；收尾 → Task 6。✓
**非目標**：T7 設計系統、後端縮圖、不重構 ParentBottomSheet → 皆未進任務。✓
**Placeholder 掃描**：Task 1/2/3/4/5 程式碼完整、無佔位。Task 4 改抽純函式 `shouldRefreshUnread` + 確切單測（消除原佔位 `expect(true)`，不需 mount 重元件）；Task 5 測試的 import 路徑/pageSize 標「mount 前讀檔對齊」（各頁依賴不同無法窮舉，屬合理操作指示非佔位）。
**型別/命名一致**：`useKeyboardInset` → `{ keyboardInset }`（Task 1 定義、Task 2 消費一致）；`shouldRefreshUnread(lastTs, now, ttlMs)`（Task 4 定義+消費一致）；`useIncrementalRender` → `{ visible, hasMore, loadMore }`（與既有 composable 一致）；`refreshUnread(force=false)` + watch/onMounted 改無參呼叫（Task 4 內一致）。
