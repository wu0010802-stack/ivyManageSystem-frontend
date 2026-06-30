# 薪資批次手動調整 設計（前端迴圈版）

- 日期：2026-06-17
- 範圍：薪資月結覆核（`StepReview` 寬表）支援選取多筆 record，對**單一欄位設同一絕對值** + 共用原因，一次套用
- 性質：**純前端**（重用既有單筆 `manual-adjust` 端點，逐筆送 partial payload）；**無後端改動、無 schema 異動、無 migration**
- 來源：admin UX 盤點「批次操作」主題；批次操作主線子專案 #2
- 上游：[[2026-06-17-workbench-batch-approval-design]]、[[2026-06-17-admin-list-experience-consistency-design]]

---

## 1. 背景與問題

月結覆核時「值週津貼」「全園活動加班」「節慶扣減」常是同一金額套到多位員工，現況只能逐人開 `AdjustDrawer`（`src/views/salary/settle/AdjustDrawer.vue`）重打。

**關鍵事實**：單筆端點 `PUT /salaries/{record_id}/manual-adjust`（`api/salary/manual_adjust.py:209`）以 `data.model_dump(exclude_unset=True)` 取值，**只處理 client 有送的欄位**，沒送的欄位完全不碰（不歸零）。它已內建：薪資鎖、封存 409、自我核准守衛（403）、金流簽核門檻（大額 403）、`manual_overrides` 合併、補充保費即時重算（`festival_bonus` 等 YTD 獎金欄改動會連動）、totals 重算、版本遞增、audit、快取失效。前端 `manualAdjustSalary(recordId, payload, version)`（`src/api/salary.ts:59`）已支援帶 `If-Match` version。

因此批次只需：**對所選每筆 record 送 `{單一欄位: 值, adjustment_reason}` + 該筆 version**，逐筆呼叫既有端點即可——零後端改動、零覆寫風險、完整重用實戰過的單筆邏輯。

前端可調欄位 `EDITABLE_FIELDS`（12，`AdjustDrawer.vue:72-85`，HR 可手調的安全子集）：`festival_bonus / overtime_bonus / overtime_pay / supervisor_dividend / meeting_overtime_pay / birthday_bonus / extra_allowance / leave_deduction / late_deduction / early_leave_deduction / meeting_absence_deduction / absence_deduction`。（後端 `EDITABLE_SALARY_FIELDS` 為 19 欄超集，故這 12 欄皆為合法 partial payload。）

## 2. 目標 / 非目標

**目標**
- 在 `StepReview` 寬表選取多筆 record，選 **1 個 `EDITABLE_FIELDS` 欄位** + 輸入 **1 個絕對值** + 1 個共用原因（≥5 字）→ 一次套到所選 record。
- 逐筆呼叫既有 `manualAdjustSalary`（送單欄 partial payload + 該筆 version），以 `Promise.allSettled` 平行送出、收集**逐筆成功/失敗**回報，完成後 `settlement.refresh()`。
- 封存筆不可選（`:selectable`）；自我核准/大額未簽核/版本衝突的筆由端點各自回 4xx → 該筆計為失敗並回報。

**非目標（YAGNI）**
- 不新增任何後端端點、不改單筆 `manual-adjust`。
- 不做「加減 delta」（設絕對值）；不做「一次套多欄位」（單欄）。
- 不做 `extra_allowance_label` 文字名目的批次設定（選此欄只設數值）。
- 不追求單一交易原子性（逐筆獨立 commit；partial success 已逐筆回報，語意與後端 batch 的 `{succeeded,failed}` 等價）。

## 3. 架構（純前端）

### 3.1 抽出共用欄位常數 `EDITABLE_SALARY_FIELDS`（新 `src/constants/salaryFields.ts`）

目前 `EDITABLE_FIELDS` 只存在 `AdjustDrawer.vue` 內、未 export。抽到共用常數檔（比照既有 `src/constants/employeeFields.ts` 的 `export const ... = Object.freeze([...])` 慣例），讓 `AdjustDrawer` 與新 `BatchAdjustDialog` 共用、避免兩份漂移：
```ts
export const EDITABLE_SALARY_FIELDS = Object.freeze([
  { key: 'festival_bonus', label: '節慶獎金' },
  // …12 項，逐字搬自 AdjustDrawer.vue:72-85
] as const)
export type EditableSalaryFieldKey = (typeof EDITABLE_SALARY_FIELDS)[number]['key']
```
`AdjustDrawer.vue` 改 import 此常數（移除內嵌定義），其餘邏輯不動。

### 3.2 `BatchAdjustDialog`（新 `src/views/salary/settle/BatchAdjustDialog.vue`，presentational）

- Props：`modelValue: boolean`、`count: number`（選取筆數，顯示用）。
- Emits：`update:modelValue`、`confirm: { field: string; value: number; reason: string }`。
- UI：`el-dialog` → `el-select`（欄位，options = `EDITABLE_SALARY_FIELDS`）+ `el-input-number`（值，`:min="0"`）+ `el-input type="textarea"`（原因，必填）+ footer（取消 / 套用）。
- 驗證：reason `< 5` 字 → `ElMessage.warning` 擋下不 emit；未選欄位 → 擋下。confirm 時 emit `{field, value, reason}`（不自己呼叫 api，由 `StepReview` 執行迴圈）。

### 3.3 `StepReview` 加選取 + 批次套用

- 寬表（`el-table :data="visibleRecords"`，`StepReview.vue:52-61`）加 `<el-table-column type="selection" :selectable="(row) => !row.is_finalized" width="45" />`（插在 `type="expand"` 欄前，行 62 之前）+ `@selection-change="onSelectionChange"`，`const selectedAdjustRows = ref<SettlementRecord[]>([])`。
- `review-toolbar__actions`（`StepReview.vue:22-48`，已含搜尋/門檻）加「批次調整 ({{ selectedAdjustRows.length }})」按鈕：`v-if="canWriteSalary"`、`:disabled="selectedAdjustRows.length === 0"`、`@click="batchAdjustVisible = true"`。
- 掛 `<BatchAdjustDialog v-model="batchAdjustVisible" :count="selectedAdjustRows.length" @confirm="applyBatchAdjust" />`。
- `applyBatchAdjust({ field, value, reason })`（StepReview 內函式，擁有 selection + refresh）：
  ```
  rows = selectedAdjustRows.value
  results = await Promise.allSettled(rows.map(r =>
    manualAdjustSalary(r.id, { [field]: value, adjustment_reason: reason }, r.version ?? undefined)))
  succeeded = results.filter(fulfilled).length
  failed = rows.filter(rejected) → 收 {name, reason(detail)}
  ElMessage：全成功 success；有失敗 warning 列出失敗者姓名+原因
  settlement.refresh(); batchAdjustVisible = false; selectedAdjustRows = []
  ```
  失敗原因從 `e.response.data.detail` 取（封存 409 / 自我核准 403 / 大額 403 / 版本 409）。
- 與既有客端搜尋（`reviewSearch`）並存：selection 作用於目前 `visibleRecords`。

## 4. 測試策略（TDD，純前端 vitest）

- **`BatchAdjustDialog`**（新 spec，沿用 settle `__tests__` 的 stub 慣例，加 `el-select` stub）：reason `<5` 字擋下不 emit confirm；填妥 → emit `confirm` 帶 `{field, value, reason}`。
- **`StepReview`**（`StepReview.spec.ts` 既有檔內新增；`makeSettlement` 已含 `refresh: vi.fn()`，`@/api/salary` mock 補 `manualAdjustSalary` 已在）：
  - 設 `selectedAdjustRows` 後呼叫 `applyBatchAdjust({field:'festival_bonus', value:500, reason:'活動加班補發'})` → 斷言 `manualAdjustSalary` 對每筆被以 `(id, {festival_bonus:500, adjustment_reason:'活動加班補發'}, version)` 呼叫、且呼叫次數 = 選取筆數；完成後 `settlement.refresh` 被呼叫。
  - 一筆 reject（mock 對某 id `mockRejectedValueOnce`）→ 其餘成功、`ElMessage.warning` 被呼叫（partial 回報），仍 `refresh`。
- **`EDITABLE_SALARY_FIELDS` 抽常數回歸**：AdjustDrawer 既有測試（內嵌於 `StepReview.spec.ts` 的 AdjustDrawer describe）仍綠。

## 5. 落地

- 純前端、單一 repo（`ivy-frontend`）。worktree off `origin/main`（建立時先驗證觸及檔 origin==local main）。一支分支、commit 分常數抽取 / dialog / StepReview 接線。
- **無後端、無 migration、無 `schema.d.ts` 重生**（`manualAdjustSalary` 為既有 typed api，未改契約）。

## 6. 實作順序（給 plan 參考）

1. 抽 `EDITABLE_SALARY_FIELDS` 到 `src/constants/salaryFields.ts`，`AdjustDrawer` 改用（既有測試守護）。
2. `BatchAdjustDialog` 元件 + vitest。
3. `StepReview` selection + 批次按鈕 + 接 dialog + `applyBatchAdjust` 迴圈 + vitest。
