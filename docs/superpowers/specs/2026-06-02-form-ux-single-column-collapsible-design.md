# 表單體驗升級：單欄寬鬆 + 核心先行・進階收合（試點：新增/編輯員工）

- 日期：2026-06-02
- 範圍：ivy-frontend（純前端；不動後端 schema）
- 試點：員工新增/編輯表單（`EmployeeView.vue` + `EmployeeFormBasic.vue`）
- 方向代號：**A（單欄寬鬆型）+ C（核心先行・進階收合）**

---

## 1. 問題

全站「新增/編輯」記錄的表單（約 112 個 `el-dialog`、106 個 `el-form`）共用同一套版面：
`el-row :span=12` 雙欄密排 + 左側 `label-width` label + `el-divider` 分段，欄位一次全攤開。

使用者實際點選出的痛點（依視覺伴隨工具確認，幾乎全中）：

| # | 痛點 |
|---|------|
| 1 | 一次塞 20+ 欄位、要一直往下捲，看不到全貌也不知道還剩多少 |
| 2 | 必填 / 選填沒清楚區分 |
| 3 | 左右兩欄、視線一直跳 |
| 4 | 沒有即時驗證，錯誤要按了送出才一次跳出 |
| 5 | 所有欄位視覺重量一樣，沒有主次 |
| 6 | 缺欄位說明 / 格式範例 |

## 2. 探索期的真實發現（修正「用眼睛猜」的風險）

讀過父層與後端後確認：

- **真正的表單在父層 `EmployeeView.vue`**，是 `el-form label-width="140px"` + `el-tabs`（基本資料 / 薪資投保銀行）兩分頁；`EmployeeFormBasic.vue` 只是「基本資料」分頁的欄位。
- **前端 `rules` 只有兩條必填**：`employee_id`、`name`（皆 `trigger: 'blur'`）。
- **後端 `EmployeeCreate`（`api/employees.py:149`）真正必填只有 `name: str`**；其餘皆有預設值或 `Optional`。
- **`employee_id` 不在 `EmployeeCreate` 內** —— 後端 `services/employee_numbering.py` 於建立時自動配號（`{民國到職年:03d}{流水:03d}`，如 `114001`）。**前端卻仍把 `employee_id` 標為必填**，是 2026-06-01 自動配號落地後「待前端同步」的既存缺口，本次一併修掉。
- **編輯模式有精巧的既有行為**：逐 tab dirty 計數（`basicDirty`/`salaryDirty`）、`EmployeeChangesPreviewDialog` 檢視變更、薪資敏感欄位 reason-gate、`saveBasic`/`saveSalary` 各打不同後端端點。**這些不可破壞。**

## 3. 目標 / 非目標

**目標**
- 建立一個薄、可重用的層（一個收合區段元件 + 單欄規範 + 欄位說明/即時驗證/收合錯誤機制），在「新增員工」證明成效。
- 直接修正 `employee_id` 必填與後端自動配號不一致的缺口。

**非目標（本 spec 不做）**
- 不一次改 100+ 表單；其餘表單列為 opt-in follow-up 清單。
- 不改後端 schema 或既有 PATCH 端點。
- 不新增後端未強制的硬驗證（電話/email/身分證 pattern）；僅以 helper text 提供格式範例（見 §6）。
- 不重寫編輯模式的存檔機制（dirty/preview/reason-gate 全保留）。

## 4. 設計：可重用的薄層

### 4.1 `FormSection.vue`（新元件，`src/components/common/`）
單一職責：一個帶標題、可收合的表單區段。

- Props：
  - `title: string`
  - `collapsible?: boolean`（預設 `false`）
  - `defaultOpen?: boolean`（預設 `true`）
  - `badgeCount?: number`（標題右側徽章數字；用途見下）
  - `badgeType?: 'error' | 'info'`（`error` → 紅色，用於含錯；`info` → 中性，可用於編輯模式 dirty 數）
- `v-model:open`：父層可雙向控制展開狀態 → **送出失敗時強制展開含錯區段**。
- 結構：`collapsible` 為真時，標題列可點擊（chevron + title + 徽章），內容為 default slot；為假時，僅渲染標題 + 內容（等同永遠展開的分組）。
- 不直接用 `el-collapse`，因需要父層程式化強制展開與徽章狀態；以輕量自管 `open` 狀態的元件達成（仍可在內部沿用 Element Plus 的過場樣式）。

### 4.2 單欄規範
- dialog 的 `el-form` 改 `label-position="top"`（移除 `label-width="140px"`）。
- 欄位由 `el-row :span=12` 雙欄改為單欄堆疊（每個 `el-form-item` 各佔一列）。
- 例外：語意上成對且短的欄位（如上班/下班時間）允許保留同列兩欄，但預設單欄。

### 4.3 欄位說明樣式
- 統一 `.form-hint` class（字級 12px、次要色），欄位下方就地寫格式/範例。沿用既有 inline gray hint 的呈現，集中成一個共用 class，不另造 `FormHint` 元件（YAGNI）。

## 5. 新增員工版面（套用 A+C）

新增模式改為**單捲動 + 收合區段**（新增為全有全無存檔，不需逐 tab dirty，故可脫離分頁）：

- **核心資料（`collapsible=false`，永遠展開）— 6 欄**
  1. `name` 姓名 ***（唯一必填）**
  2. `employee_id` 員工編號 → **唯讀提示「儲存後自動配號（如 114001）」，非輸入框**
  3. `job_title_id` 教育局系統職稱
  4. `employee_type` 員工類型（預設「正職 / regular」）
  5. `hire_date` 到職日期
  6. `classroom_id` 班級
- **▸ 職務細節（collapsed）**：`position` 職位、`supervisor_role` 主管職、`department` 部門、`bonus_grade` 獎金等級覆蓋、`probation_end_date` 試用期結束
- **▸ 薪資・投保・銀行（collapsed）**：`EmployeeFormSalary` 既有欄位；建議底薪 banner 移入此區
- **▸ 個資・聯絡・緊急聯絡（collapsed）**：`birthday`、`id_number`、`phone`、`address`、`dependents`、`emergency_contact_name`、`emergency_contact_phone`
- **▸ 工作時間（collapsed）**：`work_start_time`、`work_end_time`（預設 08:00 / 17:00）
- **▸ 教保身分・政府申報（collapsed）**：`staff_role_category`、`teacher_cert_no`、`teacher_cert_type`

> 註：上述「核心 6 欄」已由使用者確認。收合區段的細部分組為易調項，可於實作時微調，不影響整體機制。

必填呈現：僅 `name` 標 `*` + 表單頂部一行「`*` 為必填，其餘可日後補」。移除 `employee_id` 的 `required` rule。

## 6. 三個必須一起設計的機制

### 6.1 收合 × 驗證（本模式的關鍵）
- 送出（`saveCreate`）先 `formRef.validate()`。
- 失敗時：依**「欄位 prop → 區段 key」對照表**，把所有含錯欄位所屬的收合區段 `open` 設為 `true`、`badgeType='error'`、`badgeCount=該區錯誤數`，並捲動到第一個錯誤欄位。
- 對照表（常數）與區段定義放在員工表單模組內；新增欄位時須同步登記其所屬區段。
- 驗收：收合區內欄位驗證失敗 → 該區自動展開且標題顯示紅色錯誤數，使用者不會卡在看不到錯誤。

### 6.2 前後端驗證對齊（防漂移）
client rules **只鏡像後端 `EmployeeCreate` 真有的約束**，皆 `trigger: 'blur'` 即時驗證：

| 欄位 | 後端約束 | 前端 rule |
|------|----------|-----------|
| `name` | `str`（必填） | `required` |
| `supervisor_role` | `pattern ^(園長\|主任\|組長\|副組長)$` | 同 pattern |
| `bonus_grade` | `pattern ^[ABC]$` | 同 pattern |
| `base_salary` / `hourly_rate` / `insurance_salary_level` / `*_insured_salary` | `ge=0` | `min: 0` |
| `pension_self_rate` | `ge=0, le=0.06` | `0–0.06` |
| `dependents` | `ge=0` | `min: 0` |
| `extra_dependents_quarterly` | `ge=0, le=10` | `0–10` |
| `insurance_salary_override_reason` | `max_length=200` | `maxlength 200` |
| `teacher_cert_no` | `max_length=50` | `maxlength 50` |
| `staff_role_category` / `teacher_cert_type` | `max_length=20` | `maxlength 20` |

**電話 / email / 身分證**：後端目前**無** pattern，故前端**不硬擋**，僅以 `.form-hint` 提供格式範例。若要硬擋，須後端配套加 Pydantic pattern → 列 follow-up（避免前後端漂移）。

### 6.3 編輯模式
- **只套單欄視覺（`label-position="top"`）+ `.form-hint` + FormSection 視覺分組**。
- 完整保留：逐 tab dirty 計數、`EmployeeChangesPreviewDialog`、薪資 reason-gate、`saveBasic`/`saveSalary` 分端點存檔。
- 編輯模式維持 `el-tabs`（基本/薪資），不導入收合單捲動，以免動到逐 tab 存檔語意。
- （可選 follow-up）編輯模式下用 `FormSection` 的 `badgeType='info'` 顯示各區段 dirty 數，重用既有 dirty 追蹤 —— 列為加值項，不在本次必做。

## 7. 範圍與推廣

- **本次只做**：`FormSection.vue` + 單欄規範 + `.form-hint` + §6 三機制，套在**新增員工**；編輯員工沿用視覺層。
- **Follow-up（opt-in，不在本 spec）**：`StudentEditDialog.vue` 等其餘約 100 個表單，列成採用清單逐步換；硬驗證電話/email/身分證需後端配套。

## 8. 測試

- `FormSection` vitest：收合/展開、`v-model:open` 雙向、徽章（error/info）渲染。
- 新增員工 submit-fail → 含錯收合區自動展開 + 紅色徽章 + 捲動到第一錯誤的行為測試。
- rules 對齊後端的回歸測試（必填只有 name、employee_id 不再 required、pattern/數值範圍）。
- 既有員工編輯流程（dirty 計數 / preview / 薪資 reason-gate）回歸不破。
- typecheck（TS-strict）+ build 綠。

## 9. 待確認 / 風險

- 收合區段細部分組（§5）為易調項，實作時可依 HR 實際填寫習慣微調。
- `employee_id` 改唯讀提示後，須確認新增成功回應有回傳配發的工號以即時顯示（否則顯示「已配號」即可，詳號於列表呈現）。
- 純單欄在展開全部區段時較高，但 C 的收合已使預設可視高度顯著下降（僅核心 6 欄），屬可接受取捨。
