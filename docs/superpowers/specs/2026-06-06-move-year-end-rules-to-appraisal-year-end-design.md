# 設計：將「年終規則」從薪資設定搬到考核與年終

- **日期**：2026-06-06
- **範圍**：純前端（ivy-frontend）
- **基底**：`origin/main` @ `462737df`
- **分支**：`feat/move-year-end-rules-2026-06-06-fe`

## 背景與目標

「年終規則」目前是 `薪資計算 → 薪資設定`（`src/views/salary/BonusConfigPanel.vue`）裡的一個 `el-tab-pane`（`name="yearEnd"`），含三區設定：

1. **才藝鼓勵** — 才藝老師單價、課後才藝班單價（班名→單價 dict）、才藝老師年終收款人（員工多選）
2. **學期紅利** — 舊生率／才藝率門檻（0–1）＋對應紅利金額
3. **考勤扣款** — 遲到、未打卡、事假、病假的扣款費率

這些是「年終獎金 E化引擎」的規則，語意上屬於年終，放在「薪資設定」與其他經常性薪資設定（超額／節慶／底薪）混在一起不直觀。

**目標**：把「年終規則」整段搬到「考核與年終」（`src/views/AppraisalYearEndView.vue`）作為一個新的頂層分頁，並從「薪資設定」完全移除。

## 關鍵技術前提（已驗證）

後端 `PUT /api/config/bonus`（`ivy-backend/api/config/bonus.py:197`）是**部分更新**語意：

1. 取目前 active 的 `BonusConfig`，把 `_BONUS_FIELDS` 全欄位複製到新版本；
2. 再以 `data.model_dump(exclude_unset=True)` 套用「有送的、非 None」欄位（`bonus.py:247-257`）。

因此抽出的新面板**只需送年終相關欄位 + `reason`**，後端會自動保留超額／節慶／底薪等其他設定。**後端零改動，DB 零改動，年終欄位早已存在於 `BonusConfig`。**

權限現況（origin/main 已驗證）：

- 路由 `/appraisal-year-end` 的 `ROUTE_PERMISSION_RULES`（`src/constants/permissions.ts:147-150`）允許 `SETTINGS_READ` / `SALARY_READ` / `YEAR_END_READ` / `APPRAISAL_FINALIZE` 任一（`canAccessRoute` 為 `perms.some(...)`，OR 語意，`src/utils/auth.ts:336-339`）。
- 「薪資設定」分頁原本以 `SETTINGS_READ` 控制可見（`canReadSalarySettings`）。
- 儲存受後端 `SETTINGS_WRITE` + `has_finance_approve`（`ACTIVITY_PAYMENT_APPROVE`，管理員持有）+ `reason ≥10 字` 守衛。

→ 凡能在舊位置編年終規則的帳號（具 `SETTINGS_READ`）本來就能進 `/appraisal-year-end`。新分頁以 `SETTINGS_READ` 為可見閘 → **存取範圍與搬移前完全一致，無人因此獲得或失去存取，無 lockout 風險。**

## 方案

採「**抽成獨立元件**」（相對於把整個 `BonusConfigPanel` 搬過去、或強制只顯示某個 tab 的 hack）。年終規則的狀態與儲存將從 `BonusConfigPanel` 解耦，自成一個可獨立理解、獨立測試的面板元件。

### 1. 新元件 `src/views/yearEnd/YearEndRulesPanel.vue`

- **`<script setup lang="ts">`**，自外觀使用方式：無 props、無 emits，掛上即自取資料、自帶儲存。
- **狀態**（只保留年終子集）：
  - reactive 數值欄位：`art_teacher_unit_price`、`dividend_returning_threshold`、`dividend_returning_amount`、`dividend_activity_threshold`、`dividend_activity_amount`、`late_deduction_per_time`、`missing_punch_deduction_per_time`、`personal_leave_deduction_per_day`、`sick_leave_deduction_per_day`
  - `afterClassAwardRows: { className: string; price: number }[]`（對應 JSON 欄位 `after_class_award_unit_price`）
  - `artTeacherEmployeeIds: number[]`（對應 `art_teacher_employee_ids`）
  - `employeeOptions`（才藝老師下拉）
- **可見閘**：`canRead = hasPermission('SETTINGS_READ')`；無權限顯示 `el-alert`（沿用原文案「目前帳號沒有查看…設定的權限」，可改為「年終規則」字樣）。
- **資料流**：
  - `onMounted`（且 `canRead`）→ `getBonusConfig()` 讀年終欄位、JSON dict→rows、id list→multi-select；`getEmployees({ is_active: true })` 取收款人下拉。
  - 自帶「儲存年終規則」按鈕 → 沿用既有 `reason` prompt（`ElMessageBox.prompt`，validator ≥10 字）→ 組 payload `{ ...年終數值欄位, after_class_award_unit_price: dict, art_teacher_employee_ids: [...], reason }` → `updateBonusConfig(payload)`。**payload 只含年終欄位，不含超額／節慶／底薪**（後端保留）。
  - 成功 `ElMessage.success('年終規則已儲存')`；失敗沿用既有 detail 解析。
- **template**：搬移 `BonusConfigPanel.vue` 第 781–965 行的三張卡（才藝鼓勵／學期紅利／考勤扣款），外加頂部說明文字（原 783–786 行）與一顆儲存按鈕；搬移所需 scoped style（`.section-title`/`.box-card`/`.desc-text`/`.kv-row`/`.unit-hint`/`.label`/`.mb-6`/`.mt-2` 等）。
- **API**：沿用 `@/api/config` 的 `getBonusConfig` / `updateBonusConfig`、`@/api/employees` 的 `getEmployees`。型別沿用 `ApiBody<'/config/bonus','put'>`。

### 2. `src/views/salary/BonusConfigPanel.vue`（移除年終）

- 刪除「年終規則」`el-tab-pane`（781–965 行）。
- 從 `bonusConfig` reactive 移除 9 個年終數值欄位（37–49 行區段）。
- 刪除 `afterClassAwardRows`、`artTeacherEmployeeIds`、`addAfterClassAwardRow`、`removeAfterClassAwardRow`，以及 `fetchBonusConfig` 內 JSON 欄位轉換段（71–80 行）。
- `saveBonusConfig` 的 payload 移除 `after_class_award_unit_price` 與 `art_teacher_employee_ids`（149–153 行）。
- `fetchEmployeeOptions` 與 `employeeOptions`／`EmployeeOption` 在移除年終後若無其他使用者，一併刪除（並從 `onMounted` 拿掉呼叫）。
- 保留：超額獎金、節慶獎金、職位標準底薪、職稱等級對應，以及「儲存所有薪資設定」按鈕與 `saveAllBonusSettings`（仍含 `saveBonusConfig` + `saveGradeTargets`）。

### 3. `src/views/AppraisalYearEndView.vue`（掛入新分頁）

- `SectionKey` 加 `'year-end-rules'`。
- `ALL_SECTIONS` 末尾加：`{ key: 'year-end-rules', label: '年終規則', can: () => hasPermission('SETTINGS_READ') }`。
- 加 `const YearEndRulesPanel = defineAsyncComponent(() => import('./yearEnd/YearEndRulesPanel.vue'))`。
- template 加：`<YearEndRulesPanel v-else-if="activeSection === 'year-end-rules'" />`。
- 分頁順序：考核管理 / 年終獎金 / 考核年終 / **年終規則**（依使用者選定的預覽，新分頁置末）。
- 不需新增路由：以 `/appraisal-year-end?section=year-end-rules` 切換，既有 `onSectionChange` / `resolveSection` / watch 邏輯自動涵蓋。

### 4. 連帶清理 `src/views/yearEnd/YearEndConfigView.vue`

「獎金標準／扣款費率」導引段（393–414 行）原本整段指向「薪資管理 → 薪資設定」。年終費率（才藝／學期紅利／考勤扣款）已搬到「考核與年終 → 年終規則」，但節慶基準獎金仍在薪資設定。更新文案以反映**拆分**：

- 年終費率（才藝鼓勵／學期紅利／考勤扣款）→ 按鈕改指 `/appraisal-year-end?section=year-end-rules`，文案改為「考核與年終 → 年終規則」。
- 節慶基準獎金仍在「薪資管理 → 薪資設定」，文案保留說明。

## 測試

- **新增** `src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`：把 `BonusConfigPanel.spec.ts` 的「BonusConfigPanel 年終規則」describe（97–183 行：① load dict→rows / list→ids、② 缺 JSON 欄位 graceful、③ save dict/list 帶 reason、④ add/remove row）搬過來，改成掛載新元件並對齊新的儲存按鈕觸發。
- **更新** `src/views/salary/__tests__/BonusConfigPanel.spec.ts`：移除「年終規則」describe，確認其餘測試仍綠。
- **更新** `src/views/__tests__/AppraisalYearEndView.spec.ts`：補新 section 在 `SETTINGS_READ` 下出現於 segmented options，並能渲染 `YearEndRulesPanel`。
- 全程 `npm run typecheck`（0 error）、`npm run lint`（no-explicit-any gate）、相關 vitest 綠。

## 非目標（不做）

- 不改後端、不改 DB、不改 Pydantic schema、不改 `Permission` enum、不改路由權限規則。
- 不動超額獎金／節慶獎金／職位標準底薪／職稱等級對應等其他薪資設定。
- 不改儲存的權限守衛（仍 `SETTINGS_WRITE` + `ACTIVITY_PAYMENT_APPROVE` + reason）。
- 不為年終規則新增獨立 REST 端點（沿用 `PUT /config/bonus` 部分更新）。

## 風險與緩解

- **`BonusConfigPanel` 移除欄位後殘留引用**：移除後以 grep 確認 `bonusConfig` 不再含年終 key、payload 不再 spread 年終 JSON 欄位，並跑完整 `BonusConfigPanel.spec.ts`。
- **兩面板對同一 `/config/bonus`**：因後端為部分更新，各自只送自己的欄位、互不覆蓋；同 session 內為序列呼叫，無競態。
- **權限漂移**：新 section 與舊位置同用 `SETTINGS_READ`，路由閘已含 `SETTINGS_READ`，零存取變動（已驗證）。
