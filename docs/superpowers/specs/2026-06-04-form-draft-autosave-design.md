# 表單草稿暫存（useFormDraft）設計

- 日期：2026-06-04
- 範圍：純前端（ivy-frontend）
- 分支：`feat/form-draft-autosave-2026-06-04-fe`（base = local main 762849b6；origin/main 落後缺現有程式碼，走 workspace「worktree off local main」例外條款）

## 問題

使用者填寫表單填到一半，分頁關閉 / 重整 / 瀏覽器當掉 / 不小心離開後，已填資料全部消失，必須重填。需要一套「填到一半斷開，重新打開時資料還在」的暫存機制。

## 目標與非目標

**目標**
- 提供一個可重用的 `useFormDraft` composable，任何表單接上後即自動把填寫中的內容暫存到瀏覽器，重新打開時可選擇還原。
- 先在「新增員工」一支表單接到底驗證，再 fan-out 到招生報名、公開才藝報名、請假申請。
- 同時支援「新增」與「編輯」兩種模式。

**非目標（YAGNI）**
- 不做跨裝置同步（不寫後端、不建表、不發 API）。
- 不做樂觀鎖 / 欄位級衝突合併。編輯模式的衝突只用「跳提示讓使用者決定 + 警語」處理。
- 不做多分頁即時同步（同表單在兩個分頁開 → last-write-wins，可接受）。
- 不在登出時清除草稿（使用者選擇靠 `userScope` key 做跨使用者隔離）。

## 設計決策（已與使用者確認）

| 決策 | 選擇 |
|------|------|
| 套用範圍 | 通用 composable，先接 1 支驗證再 fan-out |
| 儲存位置 | 瀏覽器 localStorage（沿用 `useA11yPreference` 慣用法） |
| 還原方式 | 跳提示詢問是否還原（不靜默自動還原） |
| 涵蓋模式 | 新增 + 編輯都做 |
| 試點表單 | 新增員工、招生報名、公開才藝報名、請假申請 |
| 敏感欄位 | 逐表單定「不存清單」排除；公開報名 `parent_phone` 破例存 |

## 架構

### 元件邊界

單一新檔 `src/composables/useFormDraft.ts`。沿用既有 localStorage 慣用法（`try/catch` 包覆、`JSON.parse` 後驗證形狀、損壞則視為無草稿）。一支表單接它約 5 行，UX（debounce、flush、還原提示、過期 GC）全由 composable 內聚，表單只負責提供 reactive state 與設定。

### 介面

```ts
interface UseFormDraftOptions<T extends object> {
  formId: string                          // 穩定識別字串，如 'employee-create'
  state: T                                // 表單的 reactive 物件（直接傳入，內部 watch）
  recordId?: MaybeRefOrGetter<string | number | null>  // 編輯模式 record id；新增傳 null/省略
  userScope?: MaybeRefOrGetter<string | number | null> // 跨使用者隔離；公開表單傳 'public'
  exclude?: string[]                      // 該表單「不存清單」（敏感欄位 key）
  baseline?: MaybeRefOrGetter<Partial<T> | null>       // 編輯模式伺服器初值快照（判 dirty 用）
  enabled?: MaybeRefOrGetter<boolean>     // 只在表單開啟時運作（如 dialog visible）
  mode?: MaybeRefOrGetter<'create' | 'edit'>           // 影響寫入門檻與還原警語
  debounceMs?: number                     // 預設 800
  ttlDays?: number                        // 預設 7
}

interface UseFormDraftReturn {
  hasDraft: Ref<boolean>                  // 偵測到未過期草稿
  draftSavedAt: Ref<Date | null>          // 草稿儲存時間（顯示「X 分鐘前」）
  maybePromptRestore: () => Promise<boolean>  // 跳提示 + 套用；回傳是否還原
  clear: () => void                       // 送出成功後呼叫，清掉草稿
  discard: () => void                     // 不還原並清掉
  flush: () => void                       // 立即寫入（取消 debounce）
}

function useFormDraft<T extends object>(opts: UseFormDraftOptions<T>): UseFormDraftReturn
```

### 儲存鍵

`ivy.draft.v1.<formId>[.<recordId>].<userScope>`

- 新增員工：`ivy.draft.v1.employee-create.42`（42 = userId）
- 編輯員工：`ivy.draft.v1.employee-edit.role-7.42`
- 公開報名（無登入）：`ivy.draft.v1.activity-public.<activityId>`（device-scoped，userScope 省略）

`userScope` 是跨使用者隔離的關鍵：因使用者選擇不在登出時清除草稿，共用電腦上靠 key 中的 userId 隔離不同帳號的草稿。

### 儲存內容

```json
{ "v": 1, "savedAt": "2026-06-04T09:12:33.000Z", "data": { /* 排除敏感欄位後的表單值 */ } }
```

`v` 為 schema 版本；未來欄位結構改變可用它判斷棄用舊草稿。

## 行為

### 儲存時機
- 表單變動（deep watch）→ debounce 800ms 寫入。
- `document` 的 `visibilitychange`→`hidden` 與 `window` 的 `beforeunload` → 立即 `flush`（取消 debounce 直接寫）。這正是「斷開」前的最後機會。
- 寫入前依 `exclude` 濾掉敏感欄位。

### 寫入門檻（新增 / 編輯不同）
- **新增模式**：表單從預設值有任何非空變動才寫（避免一打開就存空草稿）。
- **編輯模式**：表單與 `baseline`（伺服器載入的初值快照）**有差異**才寫。重用既有 `useEmployeeFormDirty` 的快照比對概念。否則會存一份與伺服器相同的草稿，並在下次打開時無謂地叫使用者還原。

### 還原流程
表單初始化（編輯模式須在伺服器資料載入完成）後呼叫 `await draft.maybePromptRestore()`：
1. 無未過期草稿 → 直接 return false，不打擾。
2. 有草稿 → 跳 `el-message-box`：

   > 偵測到您 **{相對時間}** 未完成的草稿，要還原嗎？
   > 【還原】【捨棄】

3. **編輯模式額外警語**：「敏感欄位（電話 / 身分證 / 薪資 / 銀行帳號）不會還原，請重新確認」。
   - 原因：被排除的欄位不在草稿內，還原時只把草稿欄位蓋回表單，被排除欄位維持伺服器初值。若使用者中斷前曾改過某個敏感欄位，還原後該修改會「靜默消失」。警語讓使用者知道要重新確認這些格子。
4. 選「還原」→ 把草稿 `data` 逐欄寫回 `state`（只覆蓋草稿內有的欄位）。
5. 選「捨棄」→ `discard()`。

### 清除與過期
- 送出成功 → 表單呼叫 `draft.clear()`。
- 過期：草稿 `savedAt` 超過 `ttlDays`（預設 7 天）視為無效，init 時略過並刪除。
- Lazy GC：init 時掃描 `localStorage` 中 `ivy.draft.` 前綴的所有 key，刪掉過期者（避免堆積）。
- localStorage 不可用（無痕模式 / quota 滿）→ `try/catch` 全程 no-op，不影響主流程送出。

### 生命週期清理
- `enabled` 轉 false 或元件 unmount → 移除 `visibilitychange` / `beforeunload` listener，flush 待寫入內容，停止 watch。

## 各表單敏感欄位清單

### 公開才藝報名（`usePublicRegistrationForm` / `ActivityPublicView`）— 待 bundle 確認後 fan-out（見「上線分階段」第 3 步）
- 存：`name`、`birthday`、`parent_phone`、`class_name`、`selectedCourses`、`selectedSupplies`
- 排除：無（`parent_phone` 已確認破例存——家長在自己手機填自己號碼，風險低，且這是最常被打斷的表單）
- 模式：create only；`userScope='public'`，key 帶 activityId

### 新增 / 編輯員工（`EmployeeView` 的 `form`）— 第一波先接到底
- 存：`name`、`gender`、`birthday`、`employee_type`、`job_title_id`、`position`、`supervisor_role`、`bonus_grade`、`hire_date`、`probation_end_date`、`classroom_id`、`work_start_time`、`work_end_time`、各特殊狀況旗標、`staff_role_category`、`teacher_cert_type`、`teacher_cert_no`
- 排除（敏感）：`id_number`、`phone`、`email`、`address`、`emergency_contact_name`、`emergency_contact_phone`、所有薪資/投保欄位（`base_salary`、`hourly_rate`、`insurance_salary_level`、`pension_self_rate`、`labor_insured_salary`、`health_insured_salary`、`pension_insured_salary`、`insurance_salary_override_reason`、`bypass_standard_base`、`dependents`、`extra_dependents_quarterly`）、銀行欄位（`bank_code`、`bank_account`、`bank_account_name`）
- 註：新增模式 UI 只露基本欄位（薪資已移至編輯模式，見既有兩段式設計），但排除清單兩種模式都套用。

### 請假申請（`LeaveView`）— 第二波 fan-out
- 假別 / 起迄 / 事由等：多半無敏感欄位 → 幾乎全存。
- 精確欄位與排除清單於 fan-out 接該表單時依其 reactive form 列出。

### 招生報名（`RecruitmentView`）— 第二波 fan-out
- 排除：身分證號、醫療、聯絡電話等。
- 精確欄位與排除清單於 fan-out 接該表單時依其 reactive form 列出。

## 上線分階段

1. **第一波**：實作 `useFormDraft` + Vitest + 接「新增員工」一支端到端驗證（含手測還原提示、敏感欄位確實沒存、送出後清除）。
2. **第二波**（第一波驗證 OK 後）：fan-out 招生報名、請假申請。
3. **公開才藝報名**：fan-out 前先確認 `src/composables/useFormDraft.ts` 能被公開 / 家長端 Vite entry 打包到（公開端為獨立 bundle）；確認後再接。

## 測試

`src/composables/__tests__/useFormDraft.test.ts`（Vitest，jsdom 提供 localStorage）：
- persist：表單變動後 debounce 寫入正確 key 與形狀。
- restore：`maybePromptRestore` 選還原後欄位寫回 state。
- exclude：排除欄位不出現在 localStorage。
- expiry：超過 ttl 的草稿被忽略並刪除。
- clear / discard：清掉對應 key。
- 新增空表單不寫；編輯未 diverge baseline 不寫。
- userScope 隔離：不同 userScope 用不同 key。
- localStorage 不可用時不丟例外。

flush-on-hide（visibilitychange/beforeunload）與 el-message-box 提示走元件層手測（mock 事件可選測）。

## 風險

- **明文 PII 在磁碟**：以逐表單排除清單緩解（高敏感欄位不存）。公開報名 `parent_phone` 為已確認的例外。
- **編輯模式靜默遺失被排除欄位的修改**：以還原提示的警語緩解。
- **localStorage quota / 無痕**：`try/catch` no-op，不影響送出。
- **前端 worktree node_modules symlink**（已知 workspace 坑）：跑 Vitest 前需重建 worktree 內 `node_modules` 絕對 symlink 指向主 checkout。
