# Portal 接送通知語音播報 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教師 Portal 收到新接送通知時，除既有 beep 外，語音唸出「班級 + 學生名 + time to go home」。

**Architecture:** 在既有 module-singleton composable `usePortalDismissalAlerts.ts` 內新增 `speakAnnouncement()` / `unlockSpeech()`，用 Web Speech API（`speechSynthesis`）拆 zh-TW + en-US 兩段 utterance 排隊唸。接入 WS `dismissal_call_created` 提醒鏈：先 `playBeep()`，延遲 350ms 後唸語音。語音為 best-effort，beep（既有 AudioContext）為不支援 TTS 時的保底。共用既有 `muted` 開關。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、TypeScript strict、Vitest（jsdom）、Web Speech API。

## Global Constraints

- TS-only：`ivy-frontend/src/` 業務碼 100% TypeScript，禁 `: any` / `as any`（用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`）。
- 新 SFC 一律 `<script setup lang="ts">`（本計畫不新增 SFC）。
- 語言一律繁體中文（commit message、註解、docstring）。
- Commit：Conventional Commits，一個 commit 只做一件事。
- 測試指令：`npm run test -- <path>`（script `test` = `vitest run`）。
- 型別檢查：`npm run typecheck`（= `vue-tsc --noEmit`）。
- 分支：`feat/portal-dismissal-voice`（已建，spec 已 commit 於此）。
- 工作目錄：`/Users/yilunwu/Desktop/ivy-frontend`。
- 測試慣例（見既有 `usePortalDismissalAlerts.spec.ts`）：`vi.stubGlobal` 注入全域、`afterEach` 呼叫 `teardownPortalDismissalAlerts()` 但**不**呼叫 `vi.unstubAllGlobals()`（會破壞 setup.js 的 localStorage mock）、module-singleton 用 `await import(...)` 動態載入。

---

### Task 1: `speakAnnouncement` / `unlockSpeech` / `speechSupported`（composable 核心 + 單元測試）

**Files:**
- Modify: `src/composables/usePortalDismissalAlerts.ts`
- Test: `src/composables/__tests__/usePortalDismissalAlerts.spec.ts`

**Interfaces:**
- Produces:
  - `speakAnnouncement(call: { student_name?: string; classroom_name?: string }): void` — module-scoped，由 `usePortalDismissalAlerts()` return 匯出。尊重 `muted`；`speechSupported()` 為否時 no-op。唸兩段：`zh-TW` =「班級 名」（皆缺退化「學生」）、`en-US` =「time to go home」。
  - `unlockSpeech(): void` — 在 user gesture 內唸 0 音量空 utterance 解鎖 iOS TTS；不支援即 no-op。由 return 匯出。
  - `speechSupported(): boolean` — module-scoped 私有，feature-detect。

- [ ] **Step 1: 在測試檔頂部加入 speech mock 基礎建設**

於 `src/composables/__tests__/usePortalDismissalAlerts.spec.ts`，在 `// ── mock AudioContext ──` 區塊**之後、`beforeEach` 之前**插入：

```ts
// ── mock SpeechSynthesis ──
const speakMock = vi.fn()
const cancelMock = vi.fn()
class MockUtterance {
  text = ''
  lang = ''
  volume = 1
  constructor(t?: string) { this.text = t ?? '' }
}
```

在 `beforeEach` 內（`localStorage.clear()` 之前）加入 stub 與清理：

```ts
  speakMock.mockClear()
  cancelMock.mockClear()
  vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock })
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
```

- [ ] **Step 2: 寫失敗測試（speakAnnouncement 內容與語言、muted、不支援 no-op）**

在 `describe('usePortalDismissalAlerts', ...)` 內最後一個 `it` 後新增：

```ts
  it('speakAnnouncement 唸兩段：zh-TW「班級 名」+ en-US「time to go home」', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).toHaveBeenCalledTimes(2)
    const first = speakMock.mock.calls[0][0] as { text: string; lang: string }
    const second = speakMock.mock.calls[1][0] as { text: string; lang: string }
    expect(first.text).toBe('幼幼班 小明')
    expect(first.lang).toBe('zh-TW')
    expect(second.text).toBe('time to go home')
    expect(second.lang).toBe('en-US')
  })

  it('speakAnnouncement 班級缺只唸名字；名字也缺唸「學生」', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小華' })
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('小華')
    speakMock.mockClear()
    speakAnnouncement({})
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('學生')
  })

  it('muted 時 speakAnnouncement 不唸', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement, toggleMute } = m.usePortalDismissalAlerts()
    toggleMute() // muted = true
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).not.toHaveBeenCalled()
  })

  it('speechSynthesis 不存在時 speakAnnouncement 安全 no-op（不 throw）', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    expect(() => speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })).not.toThrow()
    expect(speakMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm run test -- src/composables/__tests__/usePortalDismissalAlerts.spec.ts`
Expected: FAIL — `speakAnnouncement is not a function`（return 物件尚未匯出）。

- [ ] **Step 4: 實作 speechSupported / unlockSpeech / speakAnnouncement**

於 `src/composables/usePortalDismissalAlerts.ts`，在 `function triggerHaptic()` 區塊**之後**插入：

```ts
// ── 語音播報（Web Speech API，best-effort；beep 為不支援時的保底）──
function speechSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
}

// iOS Safari 與 AudioContext 同樣需在首次 user gesture 內解鎖 speechSynthesis，
// 否則之後的 speak() 永不發聲。LINE in-app WebView 多半不支援，feature-detect no-op。
function unlockSpeech(): void {
  if (!speechSupported()) return
  try {
    const u = new window.SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch { /* 解鎖失敗：維持靜默，beep 仍為保底 */ }
}

// 唸「班級 名」（zh-TW）+「time to go home」(en-US)，拆兩段避免混語發音不正確。
// 班級/名皆缺退化為「學生」，與 liveAnnounce fallback 一致。
function speakAnnouncement(call: { student_name?: string; classroom_name?: string }): void {
  if (muted.value) return
  if (!speechSupported()) return
  try {
    const zhText = [call.classroom_name, call.student_name].filter(Boolean).join(' ') || '學生'
    const zh = new window.SpeechSynthesisUtterance(zhText)
    zh.lang = 'zh-TW'
    const en = new window.SpeechSynthesisUtterance('time to go home')
    en.lang = 'en-US'
    window.speechSynthesis.speak(zh)
    window.speechSynthesis.speak(en)
  } catch { /* ignore：beep 仍為保底 */ }
}
```

在 `export function usePortalDismissalAlerts()` 的 return 物件加入 `speakAnnouncement` 與 `unlockSpeech`（接在 `playBeep` 那行）：

```ts
    toggleMute, unlockAudio, unlockSpeech, playBeep, speakAnnouncement, triggerHaptic, fetchCalls,
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm run test -- src/composables/__tests__/usePortalDismissalAlerts.spec.ts`
Expected: PASS（含既有 11 案 + 新增 4 案）。

- [ ] **Step 6: 型別檢查**

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/composables/usePortalDismissalAlerts.ts src/composables/__tests__/usePortalDismissalAlerts.spec.ts
git commit -m "feat(portal): 接送通知語音播報核心 speakAnnouncement/unlockSpeech

唸「班級 名」(zh-TW)+「time to go home」(en-US),拆兩段避免混語發音怪;
尊重既有 muted;speechSynthesis 不支援(iOS LINE WebView)時 no-op,beep 為保底。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 接入 WS 提醒鏈（先 beep 再唸）+ 手勢解鎖 + teardown 清理

**Files:**
- Modify: `src/composables/usePortalDismissalAlerts.ts`
- Test: `src/composables/__tests__/usePortalDismissalAlerts.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `speakAnnouncement()`、`unlockSpeech()`。
- Produces: `dismissal_call_created` 事件 → `playBeep()` 後延遲 `SPEECH_LEAD_MS`(350ms) 呼叫 `speakAnnouncement(payload)`；首次 `pointerdown` 同時 `unlockAudio()` + `unlockSpeech()`；`teardown` 清掉待播計時器並 `speechSynthesis.cancel()`。

- [ ] **Step 1: 寫失敗測試（WS 事件 350ms 後唸；beep 先行）**

在測試檔 `describe` 內新增：

```ts
  it('dismissal_call_created → beep 後 350ms 觸發語音播報', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      m.initPortalDismissalAlerts()
      lastWs!.open()
      lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 11, student_name: '小安', classroom_name: '小班', status: 'pending' } })
      // 事件當下：beep 已同步播；語音尚未（先 beep 再唸）
      expect(speakMock).not.toHaveBeenCalled()
      // 推進 350ms → 語音播報
      vi.advanceTimersByTime(350)
      expect(speakMock).toHaveBeenCalledTimes(2)
      expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('小班 小安')
    } finally {
      vi.useRealTimers()
    }
  })

  it('首次 pointerdown 同時解鎖 speech（speak 被呼叫一次空白 utterance）', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    document.dispatchEvent(new Event('pointerdown'))
    expect(speakMock).toHaveBeenCalledTimes(1)
    expect((speakMock.mock.calls[0][0] as { text: string; volume: number }).text).toBe('')
    expect((speakMock.mock.calls[0][0] as { text: string; volume: number }).volume).toBe(0)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- src/composables/__tests__/usePortalDismissalAlerts.spec.ts`
Expected: FAIL — 推進 350ms 後 `speakMock` 仍 0 次（事件鏈尚未接語音）；pointerdown 後 speak 0 次（手勢尚未接 unlockSpeech）。

- [ ] **Step 3: 加入 module-scoped 計時常數與容器**

於 `src/composables/usePortalDismissalAlerts.ts` 的 `// ── module-scoped 非響應式 ──` 區塊，在 `const WS_LIVENESS_TIMEOUT = 45000` 後新增：

```ts
const SPEECH_LEAD_MS = 350
const speechTimers = new Set<ReturnType<typeof setTimeout>>()
```

- [ ] **Step 4: 在 dismissal_call_created 分支接入延遲語音**

於 `function handleWsEvent(...)`，把 `dismissal_call_created` 分支改為（在 `triggerHaptic()` 後、設定 `liveAnnounce` 前插入語音排程）：

```ts
  if (type === 'dismissal_call_created') {
    activeCalls.value.unshift(payload)
    notifyBrowser(payload)
    playBeep()
    triggerHaptic()
    // 先 beep 再唸：延遲讓 0.4s beep 明確先行
    const timer = setTimeout(() => { speechTimers.delete(timer); speakAnnouncement(payload) }, SPEECH_LEAD_MS)
    speechTimers.add(timer)
    liveAnnounce.value = `新接送通知：${payload.student_name || '學生'}${payload.classroom_name ? `（${payload.classroom_name}）` : ''} 等待接送`
  } else if (type === 'dismissal_call_updated') {
```

- [ ] **Step 5: 首次手勢同時解鎖 speech**

於 `export function initPortalDismissalAlerts()`，把 gesture handler 改為：

```ts
  gestureHandler = () => { unlockAudio(); unlockSpeech() }
```

- [ ] **Step 6: teardown 清理待播計時器與停止語音**

於 `export function teardownPortalDismissalAlerts()`，在 `clearLiveness()` 那行**之後**新增：

```ts
  speechTimers.forEach(clearTimeout)
  speechTimers.clear()
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npm run test -- src/composables/__tests__/usePortalDismissalAlerts.spec.ts`
Expected: PASS（全部，含 Task 1 與 Task 2 新增案）。

- [ ] **Step 8: 型別檢查**

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 9: Commit**

```bash
git add src/composables/usePortalDismissalAlerts.ts src/composables/__tests__/usePortalDismissalAlerts.spec.ts
git commit -m "feat(portal): 新接送通知先 beep 再唸語音 + iOS 手勢解鎖 speech

dismissal_call_created → playBeep 後延遲 350ms speakAnnouncement;
首次 pointerdown 同步 unlockSpeech;teardown 清待播計時器並 cancel 語音。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 「測試聲音」按鈕加唸範例（PortalDismissalCallsView）

**Files:**
- Modify: `src/views/portal/PortalDismissalCallsView.vue`

**Interfaces:**
- Consumes: Task 1/2 的 `speakAnnouncement`、`unlockSpeech`（自 `usePortalDismissalAlerts()` destructure）。
- Produces: 老師按「測試聲音」→ 解鎖 + beep + 震動 + 唸「小班 測試 time to go home」，當場確認裝置是否支援語音。

- [ ] **Step 1: destructure 加入 speakAnnouncement / unlockSpeech**

於 `src/views/portal/PortalDismissalCallsView.vue` 的 `usePortalDismissalAlerts()` destructure 區塊（約 line 20-34），把 `unlockAudio,` 那行改為加入兩個新函式：

```ts
  unlockAudio,
  unlockSpeech,
  playBeep,
  speakAnnouncement,
  triggerHaptic,
```

- [ ] **Step 2: testSound 加唸範例**

把 `testSound` 改為：

```ts
// ─── 測試聲音：user gesture 解鎖 AudioContext + speechSynthesis + 確認聽得到 ──
const testSound = () => {
  unlockAudio()
  unlockSpeech()
  playBeep()
  triggerHaptic()
  speakAnnouncement({ student_name: '測試', classroom_name: '小班' })
}
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 4: build sanity（確保 view 編得過）**

Run: `npm run build`
Expected: build 成功，無型別/編譯錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/views/portal/PortalDismissalCallsView.vue
git commit -m "feat(portal): 接送通知「測試聲音」鈕加唸範例語音

老師按一下即可當場確認自身裝置是否支援語音播報。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 整合驗證（實作完成後）

實機（或 Playwright）走一次教師 Portal 接送通知頁，建議由 user 在真實裝置驗收：
- 桌機 / Android Chrome：新通知 → 聽到 beep → 約 0.4s 後唸「班級 名 time to go home」。
- 「測試聲音」鈕：按下立即唸範例。
- iOS Safari：先點任一處（手勢解鎖）後，新通知才會發聲。
- iOS LINE WebView：可能僅有 beep（語音不支援），屬預期降級。

## Self-Review 紀錄

- **Spec coverage**：設計 §1 speakAnnouncement→Task1；§2 接入鏈+350ms→Task2；§3 iOS 解鎖→Task2(手勢)+Task1(unlockSpeech);§4 測試聲音→Task3；§5 測試→Task1/2。全覆蓋。
- **Placeholder scan**：無 TODO/TBD；每個 code step 均含完整程式碼。
- **Type consistency**：`speakAnnouncement` 全程簽名 `{ student_name?: string; classroom_name?: string }`；`unlockSpeech`/`speechSupported` 一致；`SPEECH_LEAD_MS=350` 與測試 `advanceTimersByTime(350)` 對齊；return 物件新增名稱與 view destructure 一致。
