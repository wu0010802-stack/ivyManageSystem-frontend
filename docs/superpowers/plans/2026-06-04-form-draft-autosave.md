# 表單草稿暫存（useFormDraft）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者填表填到一半斷開（關分頁／重整／當掉）後，重新打開表單時可選擇還原先前填的內容。

**Architecture:** 新增一個可重用的 `useFormDraft` composable，沿用既有 `useA11yPreference` 的 localStorage 慣用法（try/catch、parse 後驗形狀、損壞 fallback）。表單變動 debounce 800ms 寫入 localStorage，隱藏／關閉前立即 flush。重新打開時跳 `el-message-box` 詢問是否還原。逐表單排除敏感欄位。先把「員工」一支（新增＋編輯）接到底驗證，再 fan-out 其餘表單。

**Tech Stack:** Vue 3.4（`toValue` / `MaybeRefOrGetter` / `watch` / `onScopeDispose`）、Element Plus（`ElMessageBox`）、Vitest（jsdom）、TypeScript strict。專案無 `@vueuse/core`，debounce 與事件監聽自行實作。

---

## 背景：實作前必讀

- 沿用慣用法：`src/composables/useA11yPreference.ts`（localStorage try/catch + parse 後驗證）。
- 既有 dirty 比對：`src/composables/useEmployeeFormDirty.ts`（本 plan 不改它，但 composable 的「快照比對」概念與它一致）。
- CRUD 對話框控制：`src/composables/useCrudDialog.ts` 回 `{ dialogVisible, isEdit, openCreate, openEdit, closeDialog }`；`openCreate` 先 `resetForm` 再開，`openEdit(row)` 先 `populateForm(row)` 再開。
- 員工表單：`src/views/EmployeeView.vue` 的 `form`（`reactive<EmployeeForm>`，欄位見 spec）。新增成功在 `saveCreate`、基本資料更新在 `saveBasic`。
- **重要殘留**：`src/utils/auth.ts` 的 `clearAuth()` 登出時會 `removeItem('activity_draft')`（sessionStorage + localStorage），但全 codebase **沒有任何地方寫入或讀取 `activity_draft`** ——這是先前公開報名草稿機制的殘留。fan-out 公開報名表單時須與這個殘留 key + `clearAuth` 對齊（見 Phase 2）。本 plan 的新 key 一律 `ivy.draft.v1.*` 前綴，不與 `activity_draft` 衝突。
- `Date.now()` / `new Date()` 在 app runtime 可正常使用（Workflow script 限制不適用於本專案執行期程式碼）。

## File Structure

- **Create:** `src/composables/useFormDraft.ts` — 草稿暫存 composable（唯一核心檔，單一職責）。
- **Create:** `src/composables/__tests__/useFormDraft.test.ts` — Vitest 單元測試。
- **Modify:** `src/views/EmployeeView.vue` — 接上 `useFormDraft`（新增＋編輯）。

Phase 2（fan-out）另檔，見本 plan 末尾「Phase 2」。

---

## Task 1：scaffold composable + storage key + 欄位排除

**Files:**
- Create: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

- [ ] **Step 1：寫失敗測試（key 組合 + exclude）**

```ts
// src/composables/__tests__/useFormDraft.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, effectScope } from 'vue'
import { useFormDraft } from '../useFormDraft'

// 在 effectScope 內跑 composable，回傳 API + stop（讓 onScopeDispose 可被觸發）
function run<T>(fn: () => T): { api: T; stop: () => void } {
  const scope = effectScope()
  let api!: T
  scope.run(() => { api = fn() })
  return { api, stop: () => scope.stop() }
}

describe('useFormDraft：key 與排除', () => {
  beforeEach(() => localStorage.clear())

  it('依 formId / recordId / userScope 組 key，並排除敏感欄位', async () => {
    const form = reactive({ name: '', id_number: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'employee', state: form,
      recordId: () => form_recordId, userScope: () => 7,
      exclude: ['id_number'], debounceMs: 0,
    }))
    void api
    form.name = '王小明'
    form.id_number = 'A123456789'
    await new Promise((r) => setTimeout(r, 0))
    const raw = localStorage.getItem('ivy.draft.v1.employee.7')
    expect(raw).toBeTruthy()
    const env = JSON.parse(raw!)
    expect(env.data.name).toBe('王小明')
    expect(env.data).not.toHaveProperty('id_number') // 敏感欄位不存
    stop()
  })
})
const form_recordId: number | null = null
```

- [ ] **Step 2：跑測試確認失敗**

Run: `cd <worktree> && npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: FAIL（`useFormDraft` 不存在 / 找不到模組）

- [ ] **Step 3：建立 composable 骨架（key + pick + write + debounce）**

```ts
// src/composables/useFormDraft.ts
import { watch, ref, toValue, onScopeDispose, type Ref, type MaybeRefOrGetter } from 'vue'

const PREFIX = 'ivy.draft.'
const VERSION = 1

export interface UseFormDraftOptions<T extends object> {
  formId: string
  state: T
  recordId?: MaybeRefOrGetter<string | number | null>
  userScope?: MaybeRefOrGetter<string | number | null>
  exclude?: string[]
  enabled?: MaybeRefOrGetter<boolean>
  debounceMs?: number
  ttlDays?: number
}

export interface UseFormDraftReturn {
  hasDraft: Ref<boolean>
  draftSavedAt: Ref<Date | null>
  maybePromptRestore: () => Promise<boolean>
  clear: () => void
  discard: () => void
  flush: () => void
}

interface DraftEnvelope {
  v: number
  savedAt: string
  data: Record<string, unknown>
}

export function useFormDraft<T extends object>(opts: UseFormDraftOptions<T>): UseFormDraftReturn {
  const { formId, state, exclude = [], debounceMs = 800, ttlDays = 7 } = opts
  const hasDraft = ref(false)
  const draftSavedAt = ref<Date | null>(null)
  let snapshot = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const buildKey = (): string => {
    const rid = toValue(opts.recordId)
    const scope = toValue(opts.userScope)
    let k = `${PREFIX}v${VERSION}.${formId}`
    if (rid != null && rid !== '') k += `.${rid}`
    if (scope != null && scope !== '') k += `.${scope}`
    return k
  }

  const pick = (obj: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    if (!obj) return out
    for (const [k, v] of Object.entries(obj)) {
      if (!exclude.includes(k)) out[k] = v
    }
    return out
  }

  const isDirty = (): boolean =>
    JSON.stringify(pick(state as Record<string, unknown>)) !== snapshot

  const write = (): void => {
    try {
      const env: DraftEnvelope = {
        v: VERSION,
        savedAt: new Date().toISOString(),
        data: pick(state as Record<string, unknown>),
      }
      localStorage.setItem(buildKey(), JSON.stringify(env))
    } catch {
      // 無痕模式 / quota 滿 — 不影響主流程
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (isDirty()) write()
    }, debounceMs)
  }

  const takeSnapshot = (): void => {
    snapshot = JSON.stringify(pick(state as Record<string, unknown>))
  }

  const clear = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    try { localStorage.removeItem(buildKey()) } catch { /* */ }
    hasDraft.value = false
    draftSavedAt.value = null
  }

  // 暫時佔位，後續 Task 補完
  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    if (toValue(opts.enabled) === false) return
    if (isDirty()) write()
  }
  const maybePromptRestore = async (): Promise<boolean> => false
  const discard = clear

  // 監看表單變動 → debounce 寫入
  takeSnapshot()
  const stopWatch = watch(
    () => state,
    () => { if (toValue(opts.enabled) !== false) schedule() },
    { deep: true }
  )

  onScopeDispose(() => {
    stopWatch()
    if (timer) clearTimeout(timer)
  })

  return { hasDraft, draftSavedAt, maybePromptRestore, clear, discard, flush }
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（1 passed）

- [ ] **Step 5：commit**

```bash
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat: 新增 useFormDraft 草稿暫存 composable（key + 欄位排除 + debounce 寫入）"
```

---

## Task 2：讀回草稿 + TTL 過期 + hasDraft/draftSavedAt

**Files:**
- Modify: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

- [ ] **Step 1：寫失敗測試（讀回 / 過期忽略）**

```ts
describe('useFormDraft：讀回與過期', () => {
  beforeEach(() => localStorage.clear())

  it('init 時讀到未過期草稿 → hasDraft=true、draftSavedAt 有值', () => {
    const key = 'ivy.draft.v1.leave.5'
    localStorage.setItem(key, JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: 'x' },
    }))
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, debounceMs: 0,
    }))
    expect(api.hasDraft.value).toBe(true)
    expect(api.draftSavedAt.value).toBeInstanceOf(Date)
    stop()
  })

  it('超過 ttlDays 的草稿視為無效 → hasDraft=false', () => {
    const old = new Date(Date.now() - 8 * 86400_000).toISOString() // 8 天前
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: old, data: { reason: 'x' },
    }))
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, ttlDays: 7, debounceMs: 0,
    }))
    expect(api.hasDraft.value).toBe(false)
    stop()
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts -t 讀回`
Expected: FAIL（hasDraft 仍為 false / 未實作讀回）

- [ ] **Step 3：實作 read + refreshHasDraft，並在 init 呼叫**

在 `clear` 之後、`flush` 之前插入：

```ts
  const read = (): DraftEnvelope | null => {
    try {
      const raw = localStorage.getItem(buildKey())
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.v !== VERSION) return null
      if (typeof parsed.savedAt !== 'string' || typeof parsed.data !== 'object' || !parsed.data) return null
      const age = Date.now() - new Date(parsed.savedAt).getTime()
      if (!(age >= 0) || age > ttlDays * 86400_000) return null
      return parsed as DraftEnvelope
    } catch {
      return null
    }
  }

  const refreshHasDraft = (): void => {
    const env = read()
    hasDraft.value = !!env
    draftSavedAt.value = env ? new Date(env.savedAt) : null
  }
```

並在 `takeSnapshot()` 那行之後加上 `refreshHasDraft()`：

```ts
  takeSnapshot()
  refreshHasDraft()
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 5：commit**

```bash
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat(useFormDraft): 讀回草稿 + TTL 過期忽略 + hasDraft/draftSavedAt"
```

---

## Task 3：新增/編輯共用「與快照有差異才寫」+ enabled 快照時機

**Files:**
- Modify: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

說明：composable 在 `enabled` 轉 true（或無 enabled 時於 init）拍一張 picked-state 快照當基準。新增模式快照＝空表單 → 一打字就 dirty；編輯模式快照＝伺服器載入後的值 → 改過才 dirty。未 dirty 不寫，避免存空草稿或存一份與伺服器相同的草稿。

- [ ] **Step 1：寫失敗測試（未 dirty 不寫 / enabled 控制）**

```ts
describe('useFormDraft：dirty 門檻與 enabled', () => {
  beforeEach(() => localStorage.clear())

  it('編輯模式：與初值快照相同 → 不寫草稿', async () => {
    const form = reactive({ reason: '原因', hours: 8 })
    const enabled = ref(true)
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    void api
    // 觸發一次 watch 但值未變
    form.reason = '原因'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull()
    stop()
  })

  it('enabled=false 時不寫草稿', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(false)
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    void api
    form.reason = '變更'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull()
    stop()
  })

  it('enabled 轉 true 後重拍快照，之後變更才寫', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(false)
    const { stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    enabled.value = true
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '填寫中'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeTruthy()
    stop()
  })
})
```

需在測試檔頂部 import `ref`：將 `import { reactive, effectScope } from 'vue'` 改為 `import { reactive, effectScope, ref } from 'vue'`。

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts -t dirty`
Expected: FAIL（enabled 轉 true 未重拍快照，或 enabled=false 仍寫）

- [ ] **Step 3：實作 enabled 監看（轉 true 拍快照 + refreshHasDraft，轉 false flush）**

把 Task 1 的 init 區段（`takeSnapshot(); refreshHasDraft()` + `stopWatch`）替換為：

```ts
  // 監看表單變動 → debounce 寫入（enabled=false 時 watch callback 直接 return）
  const stopWatch = watch(
    () => state,
    () => { if (toValue(opts.enabled) !== false) schedule() },
    { deep: true }
  )

  // enabled 轉換：轉 true 拍快照 + 偵測草稿；轉 false flush
  let stopEnabled = () => {}
  if (opts.enabled !== undefined) {
    stopEnabled = watch(
      () => toValue(opts.enabled),
      (on, was) => {
        if (on && !was) { takeSnapshot(); refreshHasDraft() }
        else if (!on && was) { flush() }
      },
      { immediate: true }
    )
  } else {
    takeSnapshot()
    refreshHasDraft()
  }
```

並更新 `onScopeDispose`：

```ts
  onScopeDispose(() => {
    flush()
    stopWatch()
    stopEnabled()
    if (timer) clearTimeout(timer)
  })
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 5：commit**

```bash
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat(useFormDraft): enabled 控制 + 與快照有差異才寫（新增/編輯共用門檻）"
```

---

## Task 4：隱藏/關閉前立即 flush

**Files:**
- Modify: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

- [ ] **Step 1：寫失敗測試（visibilitychange→hidden 立即寫）**

```ts
describe('useFormDraft：flush', () => {
  beforeEach(() => localStorage.clear())

  it('分頁隱藏時立即 flush（不等 debounce）', async () => {
    const form = reactive({ reason: '' })
    const { stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => true, debounceMs: 99999, // debounce 很久，證明是 flush 立即寫
    }))
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '來不及 debounce'
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    const raw = localStorage.getItem('ivy.draft.v1.leave.5')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).data.reason).toBe('來不及 debounce')
    stop()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts -t flush`
Expected: FAIL（未註冊 visibilitychange listener，草稿為 null）

- [ ] **Step 3：註冊 visibilitychange / beforeunload listener**

在 `onScopeDispose` 之前插入：

```ts
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush()
  }
  const onBeforeUnload = (): void => { flush() }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', onBeforeUnload)
```

並在 `onScopeDispose` 內補移除：

```ts
  onScopeDispose(() => {
    flush()
    stopWatch()
    stopEnabled()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (timer) clearTimeout(timer)
  })
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 5：commit**

```bash
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat(useFormDraft): 分頁隱藏/關閉前立即 flush 寫入"
```

---

## Task 5：maybePromptRestore（還原 / 捨棄 / 關閉）

**Files:**
- Modify: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

- [ ] **Step 1：寫失敗測試（mock ElMessageBox）**

在測試檔頂部加入 mock（放在 import 之後、describe 之前）：

```ts
import { ElMessageBox } from 'element-plus'
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
}))
```

測試：

```ts
describe('useFormDraft：maybePromptRestore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(ElMessageBox.confirm).mockReset()
  })

  it('選「還原」→ 草稿 data 寫回 state、回傳 true', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(true)
    expect(form.reason).toBe('上次填的')
    stop()
  })

  it('選「捨棄」(reject "cancel") → 清掉草稿、回傳 false', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(form.reason).toBe('')
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull() // 已清
    stop()
  })

  it('關閉 (reject "close") → 保留草稿、回傳 false', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('close')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeTruthy() // 保留
    stop()
  })

  it('無草稿 → 不跳框、回傳 false', async () => {
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(vi.mocked(ElMessageBox.confirm)).not.toHaveBeenCalled()
    stop()
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts -t maybePromptRestore`
Expected: FAIL（目前 maybePromptRestore 永遠回 false、未跳框）

- [ ] **Step 3：實作 formatRelative + maybePromptRestore**

加入相對時間純函式（檔案頂部 VERSION 常數之後）：

```ts
function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}
```

在檔案頂部 import 加上 `ElMessageBox`：

```ts
import { ElMessageBox } from 'element-plus'
```

把 Task 1 的佔位 `const maybePromptRestore = async (): Promise<boolean> => false` 替換為：

```ts
  const maybePromptRestore = async (): Promise<boolean> => {
    const env = read()
    if (!env) { hasDraft.value = false; draftSavedAt.value = null; return false }
    const rel = formatRelative(new Date(env.savedAt))
    const warn = exclude.length
      ? '\n（敏感欄位如電話、身分證、薪資、銀行帳號不會還原，請重新確認）'
      : ''
    try {
      await ElMessageBox.confirm(
        `偵測到您 ${rel} 未完成的草稿，要還原嗎？${warn}`,
        '繼續填寫上次的草稿？',
        {
          confirmButtonText: '還原',
          cancelButtonText: '捨棄',
          type: 'info',
          distinguishCancelAndClose: true,
        }
      )
      // 還原：只覆蓋草稿內有的（非敏感）欄位；快照維持還原前的值，使還原內容被視為 dirty 而續存
      Object.assign(state, env.data)
      hasDraft.value = false
      draftSavedAt.value = null
      return true
    } catch (action) {
      // 'cancel' = 按「捨棄」→ 清掉；'close' = 按 X → 保留
      if (action === 'cancel') clear()
      return false
    }
  }
```

注意：`maybePromptRestore` 用到 `read` / `clear`，兩者已定義於其上方，順序正確。

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 5：commit**

```bash
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat(useFormDraft): maybePromptRestore 跳框還原/捨棄/關閉 + 敏感欄位警語"
```

---

## Task 6：過期草稿 lazy GC

**Files:**
- Modify: `src/composables/useFormDraft.ts`
- Test: `src/composables/__tests__/useFormDraft.test.ts`

- [ ] **Step 1：寫失敗測試（init 時掃前綴清過期）**

```ts
describe('useFormDraft：過期 GC', () => {
  beforeEach(() => localStorage.clear())

  it('init 時刪除前綴 ivy.draft. 下所有過期草稿', () => {
    const old = new Date(Date.now() - 30 * 86400_000).toISOString()
    const fresh = new Date().toISOString()
    localStorage.setItem('ivy.draft.v1.old.1', JSON.stringify({ v: 1, savedAt: old, data: {} }))
    localStorage.setItem('ivy.draft.v1.fresh.1', JSON.stringify({ v: 1, savedAt: fresh, data: {} }))
    localStorage.setItem('unrelated.key', 'keep-me')
    const form = reactive({ x: '' })
    const { stop } = run(() => useFormDraft({ formId: 'whatever', state: form, ttlDays: 7, debounceMs: 0 }))
    expect(localStorage.getItem('ivy.draft.v1.old.1')).toBeNull()      // 過期被刪
    expect(localStorage.getItem('ivy.draft.v1.fresh.1')).toBeTruthy()  // 未過期保留
    expect(localStorage.getItem('unrelated.key')).toBe('keep-me')      // 非前綴不動
    stop()
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts -t GC`
Expected: FAIL（過期 key 仍在）

- [ ] **Step 3：實作 gcExpired，並在 init 呼叫一次**

在 `refreshHasDraft` 之後加入：

```ts
  const gcExpired = (): void => {
    try {
      const cutoff = ttlDays * 86400_000
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !k.startsWith(PREFIX)) continue
        try {
          const parsed = JSON.parse(localStorage.getItem(k) || '')
          const ageMs = Date.now() - new Date(parsed?.savedAt).getTime()
          if (!(ageMs >= 0) || ageMs > cutoff || parsed?.v !== VERSION) toRemove.push(k)
        } catch {
          toRemove.push(k) // 損壞也清掉
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k))
    } catch {
      // localStorage 不可用 — 略過
    }
  }
```

在 composable 尾端（`return` 之前）呼叫一次：

```ts
  gcExpired()
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 5：typecheck + commit**

```bash
npm run typecheck
git add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git commit -m "feat(useFormDraft): init 時 lazy GC 清除過期草稿"
```
Expected typecheck：0 errors。

---

## Task 7：接上 EmployeeView（新增 + 編輯）

**Files:**
- Modify: `src/views/EmployeeView.vue`

說明：員工表單所有薪資/投保/銀行/聯絡 PII 欄位都在排除清單，故草稿實際只含「基本欄位」。新增與編輯共用同一個 `useFormDraft`，靠 `recordId`（新增為 `null` → key 不帶 id；編輯為 `form.id` → key 帶 id）區分。

- [ ] **Step 1：import composable**

在 `src/views/EmployeeView.vue` `<script setup>` 既有 import 區（`useEmployeeFormDirty` 那段附近）加入：

```ts
import { useFormDraft } from '@/composables/useFormDraft'
```

`getUserInfo` 已於檔案內 import（既有 `isSelfEdit` 使用），無需重複。

- [ ] **Step 2：宣告排除清單 + 建立 draft（緊接 `useCrudDialog` 解構那行之後，約 line 413）**

```ts
// 表單草稿暫存：薪資/投保/銀行/聯絡 PII 一律排除，草稿僅含基本欄位
const EMPLOYEE_DRAFT_EXCLUDE = [
  'id', 'id_number', 'phone', 'email', 'address',
  'emergency_contact_name', 'emergency_contact_phone',
  'base_salary', 'hourly_rate', 'insurance_salary_level', 'pension_self_rate',
  'labor_insured_salary', 'health_insured_salary', 'pension_insured_salary',
  'insurance_salary_override_reason', 'bypass_standard_base',
  'dependents', 'extra_dependents_quarterly',
  'bank_code', 'bank_account', 'bank_account_name',
]
const employeeDraft = useFormDraft({
  formId: 'employee',
  state: form,
  recordId: () => form.id,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) ?? 'anon',
  exclude: EMPLOYEE_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})
```

- [ ] **Step 3：包一層開啟 handler，開啟後跳還原提示**

在 draft 宣告之後加入 wrapper（沿用解構出來的 `handleAdd` / `handleEdit`）：

```ts
const openCreateWithDraft = async () => {
  handleAdd()
  await nextTick()
  await employeeDraft.maybePromptRestore()
}
const openEditWithDraft = async (row: Record<string, unknown>) => {
  handleEdit(row)
  await nextTick()
  await employeeDraft.maybePromptRestore()
}
```

`nextTick` 已於檔案頂部 import（line 2）。

- [ ] **Step 4：template 改用 wrapper**

找出 template 中觸發新增/編輯的點：

Run: `grep -n "handleAdd\|handleEdit" src/views/EmployeeView.vue`

把 template（`<template>` 區段內，非 `<script>`）中 `@click="handleAdd"` 改為 `@click="openCreateWithDraft"`，`@click="handleEdit(...)"` / `@command`/列操作呼叫 `handleEdit(row)` 處改為 `openEditWithDraft(row)`。**只改 template 內的呼叫點**，`useCrudDialog` 解構的別名保留不動（wrapper 內仍用 `handleAdd`/`handleEdit`）。

- [ ] **Step 5：送出成功後清除草稿**

在 `saveCreate` 成功分支（`ElMessage.success('員工已新增')` 之後、`closeDialog()` 之前或之後）加入：

```ts
      employeeDraft.clear()
```

在 `saveBasic` 成功分支（`resetDirty(form)` 之後）加入：

```ts
  employeeDraft.clear()
```

（`submitSalary` 只動到被排除的薪資欄位，草稿不含這些欄位，無需清除。）

- [ ] **Step 6：typecheck + 既有測試不回歸**

Run:
```bash
npm run typecheck
npx vitest run src/views/__tests__/ -t Employee
```
Expected：typecheck 0 errors；既有員工相關測試（若有）維持通過、無新增 fail。
（若 `src/views/__tests__/` 無 Employee 測試，改跑 `npx vitest run` 確認全綠、無新增 fail。）

- [ ] **Step 7：commit**

```bash
git add src/views/EmployeeView.vue
git commit -m "feat: 員工表單接上草稿暫存（新增/編輯填到一半可還原）"
```

---

## Task 8：手動整合驗證（員工表單）

**Files:** 無（驗證）

- [ ] **Step 1：起 dev server**

前端 worktree 需先修 node_modules symlink（已知 workspace 坑）：
```bash
cd <worktree>
ls -la node_modules || true   # 若指向不存在路徑
rm -f node_modules && ln -s /Users/yilunwu/Desktop/ivy-frontend/node_modules node_modules
npm run dev -- --port 3000 --strictPort   # 後端只放行 5173/3000
```
（後端另起：`cd ~/Desktop/ivyManageSystem && ./start.sh` 或單獨起後端。）

- [ ] **Step 2：新增模式驗證**
  - 開「新增員工」，填姓名、性別、到職日等基本欄位（先不送出）。
  - 重整頁面 / 關分頁再開 → 重開「新增員工」→ 應跳「偵測到您 X 前未完成的草稿，要還原嗎？」。
  - 按「還原」→ 基本欄位回填；身分證等敏感欄位**空白**（已排除）。
  - 送出成功 → 再開新增 → **不**應再跳還原（草稿已清）。

- [ ] **Step 3：編輯模式驗證**
  - 開某員工「編輯」，改基本欄位（如電話以外的姓名/職稱），不儲存。
  - 重整 → 重開同一員工編輯 → 跳還原提示（含「敏感欄位不會還原」警語）→ 按「還原」→ 基本欄位回到草稿值。
  - 儲存基本資料成功 → 再開該員工編輯 → 不應跳還原。

- [ ] **Step 4：敏感欄位確認**
  - DevTools → Application → Local Storage → 找 `ivy.draft.v1.employee.*` → 確認 `data` **不含** `id_number` / `base_salary` / `bank_account` / `phone` / `email` 等。

- [ ] **Step 5：記錄結果**
  - 通過則於本 plan 勾選；任一不符 → 回對應 Task 修正並補測試。

---

## Phase 2：fan-out（員工驗證通過後另行規劃）

> Phase 1（Task 1–8）交付「composable + 員工表單」可運作、可測。以下 fan-out 各表單於 Phase 1 手測通過後，依相同 `useFormDraft` 介面接上，各自需先列出該表單 reactive form 的完整欄位與排除清單（避免 placeholder），故另開 plan / 各為獨立 task：

- **請假申請（`LeaveView`）**：找出建立假單的 reactive form 與送出成功點；多半無敏感欄位 → `exclude` 可為空或極少；`recordId`=假單 id（編輯）/null（新增）；`userScope`=`getUserInfo()?.employee_id`。
- **招生報名（`RecruitmentView` / `RecruitmentIvykidsView`）**：列出 form 欄位；`exclude` 含身分證號、醫療、聯絡電話。
- **公開才藝報名（`usePublicRegistrationForm` / `ActivityPublicView`）**：
  - `exclude: []`（已確認破例存 `parent_phone`）；`userScope: () => 'public'`；`recordId`=活動 id。
  - **必先確認** `src/composables/useFormDraft.ts` 能被公開 / 家長端 Vite entry 打包到（公開端為獨立 bundle）。
  - **必須與既有殘留對齊**：`src/utils/auth.ts#clearAuth` 目前清 `activity_draft`；本機制改用 `ivy.draft.v1.activity-public.*`。決定是否在 `clearAuth` 一併清 `ivy.draft.v1.activity-public.*`（公開表單含 PII），並移除已無寫入者的 `activity_draft` 清除碼或保留為舊版殘留清理。

---

## Self-Review（撰寫者自查結果）

1. **Spec coverage**：composable（key/exclude/ttl/debounce/flush/restore/GC）✓ Task 1–6；新增+編輯雙模式 ✓ Task 3+7；員工試點到底 ✓ Task 7–8；敏感欄位排除 ✓ Task 7；fan-out 含 public bundle 檢查 + activity_draft 對齊 ✓ Phase 2；測試清單 8 項 ✓ Task 1–6 覆蓋（persist/restore/exclude/expiry/clear-discard/空表單不寫/未 diverge 不寫/userScope key）。
2. **Placeholder scan**：無 TBD/TODO；fan-out 為「需先列欄位」的明確 staging，非 placeholder。
3. **Type/命名一致性**：`buildKey`/`pick`/`isDirty`/`write`/`schedule`/`takeSnapshot`/`read`/`refreshHasDraft`/`gcExpired`/`flush`/`clear`/`discard`/`maybePromptRestore` 跨 Task 命名一致；回傳介面 `UseFormDraftReturn` 與 Task 1 宣告一致；`distinguishCancelAndClose` → reject 值 `'cancel'`/`'close'` 與 Task 5 測試一致。
