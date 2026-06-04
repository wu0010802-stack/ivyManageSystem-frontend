# 表單草稿暫存 Phase 2 fan-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** 把 Phase 1 的 `useFormDraft` 接到請假、招生、公開才藝報名三支表單。

**Architecture:** 先小重構 composable 解兩個 fan-out 阻礙——(1) 公開端 bundle 無 Element Plus → 還原提示改可注入 + 預設提示改「動態 import('element-plus')」（admin 不受影響、公開端零 bundle 影響）；(2) `state` 支援 `MaybeRefOrGetter`（招生表單是 `ref` 且 open 時會 reassign `form.value`，需 getter 解析）。再逐表單接上。

**Tech Stack:** Vue 3.4、Element Plus（admin only, 動態載入）、Vitest、TS strict、**ESLint `no-explicit-any`/`ban-ts-comment`（CI blocking，`eslint .`）**。

**決議（本 session 與 user 確認）：**
- 公開才藝報名：用 `window.confirm` 當還原提示（注入 `confirmRestore`），不引入 Element Plus。
- 招生報名：**嚴格全排除** 聯絡 PII（child_name/birthday/phone/address/district/parent_response/notes），草稿只留 visit_date/grade/source 等工作欄位。
- 請假：保留 `reason`（核心欄位、員工自己帳號填），排除 `is_hospitalized`（醫療旗標）。

> **⚠ 公開才藝報名草稿的兒童 PII 隱私註記（2026-06-05 業主決議 own-device）**
> 公開表單 `exclude: []` → 草稿存進 localStorage（key 固定 `ivy.draft.v1.activity-public.public`）的不只 `parent_phone`，還含**幼兒姓名 + 幼兒生日**，且 onMounted 無條件跳 `window.confirm` 還原。
> **業主決議：此表單僅供家長在自己手機（LINE 連結 / 分享連結）填寫，故維持全存**以保留完整體驗。
> **若日後改在園所共用平板 / kiosk 提供此表單，必須先改掉**（否則下一位訪客會被提示還原前一位的幼兒姓名/生日/電話——兒童 PII 跨訪客外洩）。屆時兩個可行修法：① `exclude: ['name','birthday']`（只留電話）② `userScope` 改帶 sessionStorage 隨機 token（per-session 隔離，但關分頁後草稿失效）。

---

## 背景錨點（實作前必讀，全部已實測）

- composable：`src/composables/useFormDraft.ts`（Phase 1，17 測試）。目前 `import { ElMessageBox } from 'element-plus'`（靜態，**這是公開 bundle 阻礙**）、`state: T`、`maybePromptRestore` 直接用 `ElMessageBox.confirm`。
- 公開端 bundle **刻意不含 Element Plus**（`src/public/main.ts` 不 import element-plus；`vite.config.js` 把 element-plus 切獨立 chunk）。公開 view 用自訂 `ToastStack`/modal，無 `ElMessage*`。
- 請假 `src/views/LeaveView.vue`：`form = reactive({...})`（line 44，欄位 `id/employee_id/leave_type/start_date/end_date/leave_hours/reason/is_hospitalized`）；用 `useCrudDialog({resetForm, populateForm: populateFormFromRecord})`（line 124）→ `dialogVisible/isEdit/openCreate/openEdit/closeDialog`；送出 `saveLeave`（line 216），成功點 `closeDialog()`（line 303）。**未** import `getUserInfo`/`nextTick`。
- 招生 `src/views/RecruitmentView.vue`：`form = ref(emptyForm())`（line 734）；**手動** dialog（`dialogVisible` line 700 + `dialogMode` line 701 + `editingId`）；`openAddDialog`（line 1042，`form.value = emptyForm()` 後 `dialogVisible.value=true`）、`openEditDialog(row)`（line ~1050，`form.value = {...}` reassign）皆為 `async` 且先 `await fetchOptions()`；送出 `handleSave`（line 1040），成功點 `dialogVisible.value=false`（line 1053）。子元件 `RecruitmentRecordDialog` 收 `:form="form"` 並**直接 mutate `props.form`**（草稿 watch 父層 `form` 可見）。**未** import `getUserInfo`/`nextTick`。
- 公開 `src/composables/usePublicRegistrationForm.ts`：`form = reactive({ name, birthday, parent_phone, class_name, selectedCourses, selectedSupplies })`（line 39）+ `resetForm`。view `src/views/public/ActivityPublicView.vue`：送出在 ~line 791 `publicRegister(...)`，成功點 ~line 809-810（toast + `resetForm()`）；**create-only**；無 activity_id 可用（表單 activity-agnostic）。
- worktree：`/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/feat-form-draft-fanout-fe`，branch `feat/form-draft-fanout-2026-06-04-fe`（base = local main `280b923f`，含 Phase 1 + eslint enforcement）。node_modules 為絕對 symlink（勿 `git add`）。
- 驗證指令（worktree 內）：`npx vitest run src/composables/__tests__/useFormDraft.test.ts`、`npx vue-tsc --noEmit`、`npx eslint <檔>`。

---

## File Structure
- Modify: `src/composables/useFormDraft.ts`（+ test）— P1 重構
- Modify: `src/views/LeaveView.vue` — P2
- Modify: `src/views/RecruitmentView.vue` — P3
- Modify: `src/views/public/ActivityPublicView.vue` — P4
- 無新檔；無 migration。

---

## Task P1：composable 重構（confirmRestore 注入 + element-plus 動態載入 + state 接 MaybeRefOrGetter）

**Files:** Modify `src/composables/useFormDraft.ts`、Test `src/composables/__tests__/useFormDraft.test.ts`

目標：(A) 移除靜態 `import { ElMessageBox }`，預設提示改 `await import('element-plus')`；(B) 新增 `confirmRestore` 注入點（公開端用）；(C) `state` 改 `MaybeRefOrGetter<T>`，內部一律 `toValue` 解析（支援 ref/getter，對既有 reactive 物件 caller 為 identity、零行為變化）。既有 17 測試須全綠。

- [ ] **Step 1：先寫新測試（TDD）** — 追加到 test 檔。注意：第一個測試證明「不需 element-plus 也能還原」（注入 confirmRestore），不要 `vi.mock` 也能跑：

```ts
describe('useFormDraft：confirmRestore 注入 + getter state', () => {
  beforeEach(() => localStorage.clear())

  it('注入 confirmRestore 回 restore → 套用草稿(不經 element-plus)', async () => {
    localStorage.setItem('ivy.draft.v1.pub.public', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { name: '小明' },
    }))
    const form = reactive({ name: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'pub', state: form, userScope: () => 'public',
      enabled: () => true, debounceMs: 0, confirmRestore: () => 'restore',
    }))
    expect(await api.maybePromptRestore()).toBe(true)
    expect(form.name).toBe('小明')
    stop()
  })

  it('注入 confirmRestore 回 discard → 清掉草稿', async () => {
    localStorage.setItem('ivy.draft.v1.pub.public', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { name: '小明' },
    }))
    const form = reactive({ name: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'pub', state: form, userScope: () => 'public',
      enabled: () => true, debounceMs: 0, confirmRestore: () => 'discard',
    }))
    expect(await api.maybePromptRestore()).toBe(false)
    expect(localStorage.getItem('ivy.draft.v1.pub.public')).toBeNull()
    stop()
  })

  it('state 傳 getter(讀 ref.value)：reassign 後仍追蹤新物件深層變更', async () => {
    const r = ref<{ x: string }>({ x: '' })
    const { stop } = run(() => useFormDraft({
      formId: 'rec', state: () => r.value, userScope: () => 9,
      enabled: () => true, debounceMs: 0,
    }))
    await new Promise((res) => setTimeout(res, 0))
    r.value = { x: '改' } // 模擬 openEditDialog 的 form.value = {...}
    await new Promise((res) => setTimeout(res, 0))
    r.value.x = '再改'
    await new Promise((res) => setTimeout(res, 0))
    const raw = localStorage.getItem('ivy.draft.v1.rec.9')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).data.x).toBe('再改')
    stop()
  })
})
```

- [ ] **Step 2：跑新測試確認 FAIL**
Run: `cd <worktree> && npx vitest run src/composables/__tests__/useFormDraft.test.ts -t "confirmRestore 注入"`
Expected: FAIL（confirmRestore option 未支援；getter state 下 `Object.entries(getter)` 行為錯誤）

- [ ] **Step 3：重構 composable.** READ 現檔。做以下修改：

**(3a) 移除靜態 import**：刪除 `import { ElMessageBox } from 'element-plus'`。

**(3b) 型別 + option**：在 `UseFormDraftOptions` 介面內把 `state: T` 改為 `state: MaybeRefOrGetter<T>`，並新增：
```ts
  confirmRestore?: (info: DraftPromptInfo) => DraftRestoreChoice | Promise<DraftRestoreChoice>
```
在介面上方新增匯出型別：
```ts
export type DraftRestoreChoice = 'restore' | 'discard' | 'dismiss'
export interface DraftPromptInfo {
  message: string
  title: string
  relativeTime: string
  hasExcluded: boolean
}
```

**(3c) 解析 state**：在函式內加一個取現值 helper（放在解構 opts 之後）：
```ts
  const cur = (): Record<string, unknown> => toValue(opts.state) as Record<string, unknown>
```
把所有用到表單物件的地方改用 `cur()`：
- `isDirty`：`JSON.stringify(pick(cur())) !== snapshot`
- `write`：`data: pick(cur())`
- `takeSnapshot`：`snapshot = JSON.stringify(pick(cur()))`
- `clear` 結尾重拍：`snapshot = JSON.stringify(pick(cur()))`
- watch source 由 `watch(state, ...)` 改為 `watch(() => toValue(opts.state), () => { if (toValue(opts.enabled) !== false) schedule() }, { deep: true })`

**(3d) 預設提示改動態載入**：新增模組外或函式內的 default confirm（用函式內，能讀不到外部狀態也行；放函式內）：
```ts
  const defaultConfirm = async (info: DraftPromptInfo): Promise<DraftRestoreChoice> => {
    const { ElMessageBox } = await import('element-plus')
    try {
      await ElMessageBox.confirm(info.message, info.title, {
        confirmButtonText: '還原',
        cancelButtonText: '捨棄',
        type: 'info',
        distinguishCancelAndClose: true,
      })
      return 'restore'
    } catch (action) {
      return action === 'cancel' ? 'discard' : 'dismiss'
    }
  }
```

**(3e) maybePromptRestore 改用注入或預設**：
```ts
  const maybePromptRestore = async (): Promise<boolean> => {
    const env = read()
    if (!env) { hasDraft.value = false; draftSavedAt.value = null; return false }
    const rel = formatRelative(new Date(env.savedAt))
    const warn = exclude.length
      ? '\n（敏感欄位如電話、身分證、薪資、銀行帳號不會還原，請重新確認）'
      : ''
    const info: DraftPromptInfo = {
      message: `偵測到您 ${rel} 未完成的草稿，要還原嗎？${warn}`,
      title: '繼續填寫上次的草稿？',
      relativeTime: rel,
      hasExcluded: exclude.length > 0,
    }
    const choice = await (opts.confirmRestore ? opts.confirmRestore(info) : defaultConfirm(info))
    if (choice === 'restore') {
      Object.assign(cur(), env.data)
      hasDraft.value = false
      draftSavedAt.value = null
      return true
    }
    if (choice === 'discard') clear()
    return false
  }
```

注意：`MaybeRefOrGetter` 已從 vue import（型別）；`toValue` 已 import。確認沒有殘留對舊 `state` 變數的直接引用（全部走 `cur()` 或 `toValue(opts.state)`）。不可用 `any`／`@ts-ignore`（eslint 擋）。

- [ ] **Step 4：跑全部測試（含既有 17）**
Run: `cd <worktree> && npx vitest run src/composables/__tests__/useFormDraft.test.ts`
Expected: PASS（20 個：17 + 3）。既有 maybePromptRestore 測試（mock element-plus）在動態 import 下仍由 `vi.mock('element-plus')` 攔截，須維持綠。

- [ ] **Step 5：typecheck + lint**
Run: `cd <worktree> && npx vue-tsc --noEmit && npx eslint src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts`
Expected: 0 errors。

- [ ] **Step 6：commit**
```bash
git -C <worktree> add src/composables/useFormDraft.ts src/composables/__tests__/useFormDraft.test.ts
git -C <worktree> commit -m "refactor(useFormDraft): 還原提示可注入 + element-plus 動態載入 + state 支援 ref/getter

公開端 bundle 無 Element Plus → 預設提示改動態 import、可注入 confirmRestore；
招生表單 ref 會 reassign form.value → state 改 MaybeRefOrGetter 並以 toValue 解析。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task P2：接 LeaveView（新增 + 編輯）

**Files:** Modify `src/views/LeaveView.vue`

- [ ] **Step 1：import**。在 `<script setup>` import 區加：
```ts
import { useFormDraft } from '@/composables/useFormDraft'
import { getUserInfo } from '@/utils/auth'
```
並確認 `nextTick` 有從 vue import（若無，加到既有 `from 'vue'` 的 import）。

- [ ] **Step 2：宣告 draft（緊接 `useCrudDialog(...)` 解構之後）**：
```ts
// 表單草稿暫存：排除醫療旗標；保留 reason（核心欄位）
const LEAVE_DRAFT_EXCLUDE = ['id', 'is_hospitalized']
const leaveDraft = useFormDraft({
  formId: 'leave',
  state: form,
  recordId: () => form.id,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) || 'anon',
  exclude: LEAVE_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})
```
（`form` 是 reactive，直接傳。`dialogVisible`/`openCreate`/`openEdit`/`closeDialog` 來自 useCrudDialog 解構。）

- [ ] **Step 3：wrapper 開窗 handler**（用 useCrudDialog 解構出的 `openCreate`/`openEdit`）：
```ts
const openCreateWithDraft = async () => {
  openCreate()
  await nextTick()
  await leaveDraft.maybePromptRestore()
}
const openEditWithDraft = async (row: Record<string, unknown>) => {
  openEdit(row)
  await nextTick()
  await leaveDraft.maybePromptRestore()
}
```
（若 useCrudDialog 解構用了別名如 `openCreate: handleAdd`，沿用實際名稱呼叫。先 `grep -n "openCreate\|openEdit\|useCrudDialog" src/views/LeaveView.vue` 確認解構名。）

- [ ] **Step 4：template 改用 wrapper**。`grep -n "openCreate\|openEdit" src/views/LeaveView.vue`，把 `<template>` 內觸發新增/編輯的呼叫點改成 `openCreateWithDraft` / `openEditWithDraft(row)`（只改 template，不改 script 的解構與 wrapper 內部）。

- [ ] **Step 5：送出成功清草稿**。在 `saveLeave` 成功路徑（`closeDialog()` 附近，line ~303）加 `leaveDraft.clear()`。

- [ ] **Step 6：驗證 + commit**
```bash
cd <worktree> && npx vue-tsc --noEmit && npx eslint src/views/LeaveView.vue
git -C <worktree> add src/views/LeaveView.vue
git -C <worktree> commit -m "feat: 請假表單接上草稿暫存（保留 reason、排除醫療旗標）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: typecheck/eslint 0 errors。

---

## Task P3：接 RecruitmentView（新增 + 編輯，手動 dialog + ref form）

**Files:** Modify `src/views/RecruitmentView.vue`

注意：`form` 是 `ref`，open 時 reassign `form.value` → **必用 getter `() => form.value`**（P1 已支援）。openAddDialog/openEditDialog 是 `async` 本地函式（非 useCrudDialog），**直接在函式尾端加還原提示**，不另包 wrapper。

- [ ] **Step 1：import**。加：
```ts
import { useFormDraft } from '@/composables/useFormDraft'
import { getUserInfo } from '@/utils/auth'
```
確認 `nextTick` 從 vue import（若無，加上）。

- [ ] **Step 2：宣告 draft（form/dialogVisible/dialogMode/editingId 宣告之後）**：
```ts
// 表單草稿暫存：招生表單聯絡 PII 一律排除，草稿僅留訪視/年級/來源等工作欄位
const RECRUITMENT_DRAFT_EXCLUDE = [
  'child_name', 'birthday', 'phone', 'address', 'district',
  'parent_response', 'notes', 'month_raw',
]
const recruitmentDraft = useFormDraft({
  formId: 'recruitment',
  state: () => form.value,
  recordId: () => editingId.value,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) || 'anon',
  exclude: RECRUITMENT_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})
```
（`month_raw` 是前端內部欄位也排除避免雜訊。）

- [ ] **Step 3：openAddDialog 尾端加還原提示**。在 `openAddDialog` 的 `dialogVisible.value = true` 之後加：
```ts
  await nextTick()
  await recruitmentDraft.maybePromptRestore()
```

- [ ] **Step 4：openEditDialog 尾端加還原提示**。同樣在其設定 `dialogVisible.value = true` 之後加：
```ts
  await nextTick()
  await recruitmentDraft.maybePromptRestore()
```
（READ 函式確認 `dialogVisible.value = true` 的實際位置；提示須在 form.value 已 reassign + dialogVisible=true 之後。）

- [ ] **Step 5：handleSave 成功清草稿**。在 `handleSave` 成功路徑（`dialogVisible.value = false`，line ~1053）加 `recruitmentDraft.clear()`。

- [ ] **Step 6：驗證 + commit**
```bash
cd <worktree> && npx vue-tsc --noEmit && npx eslint src/views/RecruitmentView.vue
git -C <worktree> add src/views/RecruitmentView.vue
git -C <worktree> commit -m "feat: 招生訪視記錄接上草稿暫存（聯絡 PII 全排除，僅留工作欄位）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task P4：接公開才藝報名 ActivityPublicView（create-only，window.confirm）

**Files:** Modify `src/views/public/ActivityPublicView.vue`

注意：公開端 **不可** 引入 Element Plus → 必傳 `confirmRestore` 用 `window.confirm`。`form` 來自 `usePublicRegistrationForm`（reactive，直接傳）。無 activity_id → 不帶 recordId。exclude 空（parent_phone 破例保留）。表單是整頁（非 dialog）→ 不設 enabled（預設恆開）。

- [ ] **Step 1：READ ActivityPublicView**，找出 `usePublicRegistrationForm(...)` 解構出 `form` 的位置、`onMounted`、送出成功點（`publicRegister` 後 `resetForm()` ~line 809-810）。確認有 import `onMounted`（若無則加 `import { onMounted } from 'vue'`，或併入既有 vue import）。

- [ ] **Step 2：import + 宣告 draft**（form 解構之後）：
```ts
import { useFormDraft } from '@/composables/useFormDraft'
// ...
const activityDraft = useFormDraft({
  formId: 'activity-public',
  state: form,
  userScope: () => 'public',
  // 公開端無 Element Plus：用原生 window.confirm
  confirmRestore: ({ message }) => (window.confirm(message) ? 'restore' : 'discard'),
})
```
（`message` 取自 `DraftPromptInfo`；公開表單 exclude 空 → 無警語。`window.confirm` 回 true→restore、false→discard。）

- [ ] **Step 3：掛載時提示還原**。在既有 `onMounted`（或新增一個）內，於選項載入後呼叫：
```ts
  await activityDraft.maybePromptRestore()
```
（若 `onMounted` 非 async，改成 `onMounted(async () => { ...既有...; await activityDraft.maybePromptRestore() })`，或在既有 async onMounted 尾端加。確保不阻擋既有載入邏輯——放在既有邏輯之後。）

- [ ] **Step 4：送出成功清草稿**。在送出成功路徑（`resetForm()` 附近，~line 810）加 `activityDraft.clear()`。

- [ ] **Step 5：驗證 + commit**
```bash
cd <worktree> && npx vue-tsc --noEmit && npx eslint src/views/public/ActivityPublicView.vue
git -C <worktree> add src/views/public/ActivityPublicView.vue
git -C <worktree> commit -m "feat: 公開才藝報名接上草稿暫存（window.confirm 還原，不引入 Element Plus）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task P5：整體驗證（含公開 bundle 不夾帶 Element Plus）

**Files:** 無（驗證）

- [ ] **Step 1：全 composable 測試 + typecheck + lint（全檔）**
```bash
cd <worktree>
npx vitest run src/composables/__tests__/useFormDraft.test.ts
npx vue-tsc --noEmit
npx eslint src/composables/useFormDraft.ts src/views/LeaveView.vue src/views/RecruitmentView.vue src/views/public/ActivityPublicView.vue
```
Expected: 20 測試綠、typecheck 0、eslint 0。

- [ ] **Step 2：build 並確認公開 chunk 不含 element-plus**
```bash
cd <worktree> && npm run build 2>&1 | tail -30
```
build 後檢查：公開入口（public.html / public-app chunk）對應的 JS 不應 import element-plus。檢查方式：
```bash
cd <worktree>
# 找出公開 app chunk 與 element-plus chunk
ls -la dist/assets/ | grep -iE "public|element" || true
# 確認 public chunk 不靜態引用 element-plus（element-plus 應為獨立 chunk 且公開 entry 不載入）
grep -rl "element-plus" dist/ | grep -i public || echo "公開 chunk 未靜態夾帶 element-plus（預期）"
```
若公開 chunk 夾帶了 element-plus → P1 的動態 import 沒生效或 ActivityPublicView 誤用了預設提示，須回 P1/P4 修。
（build 較慢；若 `npm run build` 因無關既有問題失敗，記錄並改以 `npx vite build` 或只驗 composable 不靜態 import element-plus：`grep -n "from 'element-plus'" src/composables/useFormDraft.ts` 應**無**靜態 import，只有 `import('element-plus')` 動態。）

- [ ] **Step 3：記錄結果**，通過則勾選；公開 bundle 夾帶 element-plus 為 P 級必修。

---

## 手動驗證（live，user 可日後自行跑）
- 請假：開新增請假填一半→重整→跳還原（el-message-box）；DevTools 查 `ivy.draft.v1.leave.*` 確認無 `is_hospitalized`、有 `reason`。
- 招生：開新增訪視填一半→重整→跳還原；DevTools 查 `ivy.draft.v1.recruitment.*` 確認**無** child_name/phone/birthday/address。
- 公開才藝報名：手機/瀏覽器填一半→重整→跳 `window.confirm`→確定還原；查 `ivy.draft.v1.activity-public.public` 含 parent_phone（破例）。

---

## Self-Review（撰寫者自查）
1. **Spec/決議覆蓋**：confirmRestore 注入 ✓P1；element-plus 動態 ✓P1+P5；state getter ✓P1；leave 保留 reason 排除 is_hospitalized ✓P2；招生全排除 PII ✓P3；公開 window.confirm + 不引入 EP ✓P4；bundle 驗證 ✓P5。
2. **Placeholder**：無；各表單錨點具體（檔/行/handler 名）。
3. **型別一致**：`DraftRestoreChoice`/`DraftPromptInfo`/`confirmRestore`/`cur()` 跨 task 一致；`state: MaybeRefOrGetter<T>` 與 P3 getter 用法一致；公開端 `confirmRestore` 回傳 `'restore'|'discard'` 屬 `DraftRestoreChoice` 子集 ✓。
4. **eslint**：全程禁 `any`/`@ts-ignore`，每 task 跑 `eslint <檔>`。
