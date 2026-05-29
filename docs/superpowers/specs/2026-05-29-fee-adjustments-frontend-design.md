# 學費折抵前端補完 — 設計

- 日期：2026-05-29
- 類型：純前端（後端 `/fees/adjustments` CRUD 已完整，不動）
- 分支：`feat/fee-adjustments-ui-2026-05-29-frontend`（base origin/main `0d493e32`）

## 背景與問題

學費折抵（同胞優惠 / 預繳 / 請假扣款 / 其他）後端 CRUD 完整（`api/fees/adjustments.py`），但前端在 main 上是**做到一半的死 stub**：

- `src/api/fees.ts:31` `getFeeAdjustments` 寫死回傳 `Promise.resolve({ items: [] })`，且**無** create/update/delete wrapper。
- `src/components/fees/AdjustmentEditDialog.vue` 是佔位元件（按下跳「折抵編輯元件尚未合併到此分支」）。
- 唯一 consumer `src/components/student/tabs/FeesTab.vue` 的 UI 框架（折抵 KPI、折抵列表、新增/編輯按鈕）都已建好，全部接到死 stub → **折抵在 main 上永遠顯示 0、無法新增/編輯/刪除**。
- stub 註解指向的 `refactor-fees-by-class` WIP 分支已停滯，未含真實實作。

本任務把這層補回，使折抵功能可用。**不改後端、不改 FeesTab、不改 feeTypes。**

## 後端契約（既有，不動）

| Method | Path | 說明 |
|---|---|---|
| GET | `/fees/adjustments?period=&student_id=&adjustment_type=` | 列出折抵 → `{ items: [...], total }`。非管理角色須帶 `student_id` |
| POST | `/fees/adjustments` | 新增 |
| PUT | `/fees/adjustments/{id}` | 修改（欄位皆 optional） |
| DELETE | `/fees/adjustments/{id}` | 刪除 → `{ deleted: id }` |

- `adjustment_type` ∈ `sibling_discount` / `prepayment` / `leave_deduction` / `other`
- `amount`：正整數 1–999999（套用時相減：`netDue = SUM(records.amount_due) - SUM(adjustments.amount)`）
- `period`：`^\d{3}-[12]$`（民國學年-學期，如 `114-2`）
- `reason`：≤200 字（選填）；`notes`：≤500 字（選填）
- 序列化欄位：`id, student_id, period, adjustment_type, amount, reason, notes, created_by, created_at, updated_at`
- 權限：讀 `FEES_READ`、寫 `FEES_WRITE`
- OpenAPI 型別已存在於 `src/api/_generated/schema.d.ts`（`/fees/adjustments` 兩條 path）

## 範圍

### 1. API wrapper（`src/api/fees.ts`）

刪除 stub 與其註解，換成真呼叫，沿用本檔慣例（`.then(res => res.data)` 內部解包；本檔屬 CLAUDE.md 列的「內部自己解包」例外之一）：

```ts
export const getFeeAdjustments = (params) => api.get('/fees/adjustments', { params }).then(r => r.data)
export const createFeeAdjustment = (payload) => api.post('/fees/adjustments', payload).then(r => r.data)
export const updateFeeAdjustment = (id, payload) => api.put(`/fees/adjustments/${id}`, payload).then(r => r.data)
export const deleteFeeAdjustment = (id) => api.delete(`/fees/adjustments/${id}`).then(r => r.data)
```

型別以 `import type { ApiBody, ApiQuery, ApiResponse } from './_generated/typed'` 接 `/fees/adjustments`（遵守 TS-only、不得 `any`）。

### 2. `AdjustmentEditDialog.vue`（整支重寫成真元件）

- **Props / Emits 契約不變**（FeesTab 已依賴）：
  - props：`modelValue: boolean`、`student: { student_id, student_name } | null`、`period: string`、`adjustmentType: string`、`existing: 折抵物件[] | null`
  - emits：`update:modelValue`、`saved`
- 改用 Element Plus `el-dialog`（對齊 FeesTab 既有繳費 dialog 風格），取代佔位 overlay。
- **互動：清單式（已選定）**
  - 開啟時用 `existing` 種一份**本地 reactive 清單**（`existing` 已含該欄全部項目；因 `bucketByFeeType` 把 `other` 折進「其他/請假」欄，故此欄的 existing 可能同時含 `leave_deduction` 與 `other`）。
  - **上半（現有清單）**：每筆顯示 類型標籤 / 金額 / 原因，行內「編輯」「刪除」。
    - 編輯：切該列為可編輯（金額、原因、備註）→ 存檔呼叫 `updateFeeAdjustment(id, { amount, reason, notes })`，**保留該筆原 `adjustment_type`**。
    - 刪除：`ElMessageBox.confirm` → `deleteFeeAdjustment(id)`。
  - **下半（新增一筆）**：表單 = 金額（`el-input-number` min 1 / max 999999 / 整數）+ 原因（選填）+ 備註（選填）。
    - 類型決定（已選定「讓使用者選」）：
      - `adjustmentType === 'leave_deduction'`（「其他/請假」欄）→ 顯示二選下拉「請假扣款 / 其他」，預設請假扣款。
      - 其他欄（`sibling_discount` / `prepayment`）→ 類型固定為 `adjustmentType`，不顯示下拉。
    - 送出：`createFeeAdjustment({ student_id, period, adjustment_type, amount, reason, notes })`。
- **儲存策略：每筆即時存檔**（已選定）。每次 POST/PUT/DELETE 成功 → 更新本地清單 + `ElMessage.success` + `emit('saved')`（讓 FeesTab `fetchData()` 重抓並刷新 KPI/淨額）；失敗用 `apiError()` 顯示，僅影響該筆。
- 權限：FeesTab 已用 `canWrite` gate 開啟鈕，dialog 內預設可寫。

### 資料流

```
FeesTab 點「新增/編輯」(canWrite + 具體 period)
  → 開 AdjustmentEditDialog(student, period, adjustmentType, existing)
  → dialog 內逐筆 CRUD 打 /fees/adjustments
  → 每次成功 emit 'saved'
  → FeesTab.fetchData() 重抓 records+adjustments → 重算 totals.netDue
```

### 錯誤處理

- 所有 mutation 包 try/catch，失敗 `ElMessage.error(apiError(e, '...'))`。
- 後端 422（金額/period/type 不合法）、403（scope）、404（已被刪）皆由 `apiError` 顯示後端 detail。
- 刪除前 `ElMessageBox.confirm`；使用者取消不報錯。

### 測試（Vitest）

- `src/api/__tests__/fees.adjustments.test.ts`：4 個 wrapper 的 path / method / payload（mock `./index` 的 `api`）。
- `src/components/fees/__tests__/AdjustmentEditDialog.test.ts`（mount 時 `global.plugins: [ElementPlus]`）：
  1. 種入 `existing` → 清單正確顯示筆數與金額。
  2. 新增成功 → 呼叫 `createFeeAdjustment` 帶正確 payload + emit `saved`。
  3. `adjustmentType='leave_deduction'` → 出現「請假扣款 / 其他」下拉；`sibling_discount` → 不出現。
  4. 刪除 → `vi.mock` `ElMessageBox.confirm` resolve 後呼叫 `deleteFeeAdjustment` + emit `saved`。

## 不做（YAGNI）

- 不改 FeesTab.vue、feeTypes.ts、後端任何檔。
- 不做「全部編輯完一次批次送出」。
- 不加全校折抵列表頁 / 折抵匯出。
- 不動 `src/api/index.ts` axios wrapper。

## 驗收標準

- 學生詳情 → 學費 tab → 選具體學期 → 折抵列點「新增」可建立折抵，KPI 淨額即時下降；「編輯」可改金額/原因；「刪除」確認後移除。
- 「其他/請假」欄新增時可選 請假扣款 / 其他。
- `npm run test`（新測試綠）、`npm run typecheck`（0 error）、`npm run build`（成功）、相對 main 無新增測試 fail。
