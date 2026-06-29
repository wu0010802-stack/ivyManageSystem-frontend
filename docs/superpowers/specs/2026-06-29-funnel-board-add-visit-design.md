# 漏斗看板直接新增訪視 — 設計

- 日期：2026-06-29
- 範圍：**僅 `ivy-frontend`**（純前端，單一 commit）
- 後端：**無變更**（無 router / 無 migration / 無 OpenAPI 契約變動）

## 1. 背景與目標

「招生入學」頁的「漏斗看板」(`AdmissionsView.vue` 第一個 tab) 目前只負責**顯示**訪視卡片與**拖卡轉階段**，不能在看板上直接建立訪視。新增訪視只能切到隔壁的「訪視明細」tab（`AdmissionsRecordsPanel.vue` → `RecruitmentRecordDialog.vue`）操作。

**目標**：在漏斗看板上加一個「新增訪視」入口，沿用既有的**完整訪視表單**填寫，存檔後新卡片直接出現在看板（落在「已訪視」欄；若表單勾「已預繳」則落在「已預繳」欄），不必切 tab。

看板每張卡片 = 一筆 `RecruitmentVisit`。階段是由 `derive_stage(visit, student)` 推導（無 student + 未預繳 → `visited`；無 student + 已預繳 → `deposited`），所以新建的訪視（尚無對應 student）必然落在 `visited` 或 `deposited`。

## 2. 既有可重用的串接（不需新增後端）

- 建立訪視：`createRecruitmentRecord(payload)` → `POST /recruitment/records`（`api/recruitment/records.py:178`，回傳含 `id`/`month` 的 `RecruitmentRecordOut`）。
- 表單元件：`RecruitmentRecordDialog.vue`（受控元件：props `visible/mode/form/saving/各建議清單`，emit `update:visible`/`save`；內部用 `month_raw` 日期選擇器同步 `month`(民國月份)/`visit_date`）。
- 建議清單來源：`useRecruitmentDashboard`（`options.sources/referrers/no_deposit_reasons`、`stats.by_district`），`AdmissionsView` 已建立此 dashboard 實例並傳給其他 panel。
- 看板資料：`useRecruitmentFunnelStore`（`loadBoard({force})` / `getCardByVisitId(id)`）。
- 看板過濾：`GET /recruitment/funnel/board` 依「訪視月份所屬學年/學期」過濾（`RecruitmentVisit.month.in_(school_term_to_roc_months(...))`）。`school_year` 未帶時預設當前學年。

## 3. 元件設計（職責單一、可獨立測試）

### 3.1 新元件 `components/recruitment/funnel/FunnelAddVisit.vue`
封裝「按鈕 + 表單 + 存檔」為一個完整單元。

- **props**：`dashboard: ReturnType<typeof useRecruitmentDashboard>`
- **emits**：`created: [record: Record<string, unknown>]`（存檔成功，帶後端回傳的新記錄）
- **畫面**：
  - `el-button`（primary，文案「新增訪視」），以 `hasPermission('RECRUITMENT_WRITE')` 控管——無權限不渲染。
  - 內嵌 `RecruitmentRecordDialog`（`mode="add"`），綁定本元件持有的 `form` 與建議清單。
- **狀態**：`dialogVisible`、`saving`、`form`（用共用的 `emptyVisitForm()` 初始化）。
- **建議清單**：`districtSuggestions` 取自 `dashboard.stats.by_district`；`source/referrer/no_deposit_reasons` 取自 `dashboard.options`（與 `AdmissionsRecordsPanel` 取法一致）。
- **行為**：
  - 開啟：`await dashboard.fetchOptions()` → 重置 `form = emptyVisitForm()` → `dialogVisible = true`。
  - `@save`：`saving=true` → 整理 payload（解構排除前端內部用的 `month_raw`，與 `AdmissionsRecordsPanel.handleSave` 一致）→ `createRecruitmentRecord(payload)` → 成功 `ElMessage.success('新增成功')`、關閉 dialog、`emit('created', res.data)`；失敗 `ElMessage.error(apiError(e, '儲存失敗'))`；`finally saving=false`。
  - **不**接 `useFormDraft`（避免與明細 tab 共用 `formId='recruitment'` 草稿互相污染）。

### 3.2 `FunnelBoard.vue` 調整
- 新增 prop：`dashboard: ReturnType<typeof useRecruitmentDashboard>`。
- toolbar（學年/學期/重新整理那一排）**右側**放入 `<FunnelAddVisit :dashboard="dashboard" @created="onVisitCreated" />`（用 `margin-left:auto` 推到右側）。
- `onVisitCreated(record)`：
  1. `await store.loadBoard({ force: true })`（重抓看板，新卡片出現）。
  2. 跨學年邊界處理：若 `!store.getCardByVisitId(record.id)`（該訪視月份不在目前篩選的學年/學期）→ `ElMessage.info('新增成功，但該參觀日期不在目前篩選的學年/學期，請切換篩選查看')`。
  3. `emit('created')`（無 payload，通知父層同步統計）。
- `FunnelBoard` 新增 emit：`created: []`。

### 3.3 `AdmissionsView.vue` 調整
- `<FunnelBoard :dashboard="dashboard" @created="onFunnelVisitCreated" />`。
- `onFunnelVisitCreated()`：`await dashboard.fetchStats()` + `dashboard.invalidateOptions()` + `statsPanelRef.value?.invalidateLazyTabs()`——與既有 `onRecordsChanged` 的「訪視變更後同步統計」一致，但**不**重複 `funnelStore.loadBoard()`（看板已由 `FunnelBoard.onVisitCreated` 重載）。

### 3.4 小幅去重（本次工作直接造成的重複）
- 將 `AdmissionsRecordsPanel.vue` 內嵌的 `emptyForm()` 空表單工廠抽到 `@/constants/recruitment.ts`（既有檔，放 `GRADES_ORDER` 處）成 `export function emptyVisitForm()`，型別與現有完全相同。
- `AdmissionsRecordsPanel` 改 import 共用版（取代內嵌定義）；`FunnelAddVisit` 也用同一個。範圍小、低風險，避免兩份空表單定義漂移。

## 4. 資料流

```
使用者點「新增訪視」(FunnelAddVisit)
  → fetchOptions + 重置 form → 開 RecruitmentRecordDialog
  → 填表 → 儲存 → createRecruitmentRecord(payload, 去除 month_raw)
  → POST /recruitment/records (201, 回傳新記錄含 id/month)
  → emit created(record)
FunnelBoard.onVisitCreated(record)
  → store.loadBoard({force:true})  // 看板含新卡片
  → 若 getCardByVisitId(record.id) 不存在 → 提示「不在目前篩選範圍」
  → emit created()
AdmissionsView.onFunnelVisitCreated()
  → dashboard.fetchStats() + invalidateOptions() + 統計 lazy tab 失效
```

## 5. 錯誤處理

- 表單驗證：`RecruitmentRecordDialog` 內建（`month`、`child_name` 必填，含含錯區段自動展開）。
- create 失敗：`apiError()` 顯示後端訊息；dialog 不關閉、`saving` 復位。
- 權限：按鈕以 `RECRUITMENT_WRITE` 前端控管；後端 `POST /records` 本就有 `require_staff_permission(RECRUITMENT_WRITE)` 守衛（雙層）。
- 跨學年邊界：見 3.2 步驟 2 的提示（不靜默吞掉）。

## 6. 測試（Vitest）

- **`FunnelAddVisit.spec`**：
  - 有 `RECRUITMENT_WRITE` → 渲染按鈕；無權限 → 不渲染。
  - 點按鈕 → `dashboard.fetchOptions` 被呼叫、`dialogVisible=true`。
  - `@save` → `createRecruitmentRecord` 以**不含 `month_raw`** 的 payload 被呼叫；成功後 `emit('created', record)`、dialog 關閉。
  - create 失敗 → 顯示錯誤 toast、dialog 不關、`saving` 復位。
- **`FunnelBoard.spec`**：
  - 收到子元件 `created` → `store.loadBoard({force:true})` 被呼叫且 `emit('created')`。
  - 重載後看板無該 `visit_id` → 顯示「不在篩選範圍」`ElMessage.info`。
- SFC 測試沿用既有慣例（必要時以 `wrapper.vm.$.setupState` 取 setup 狀態；mock `@/api/recruitment`、`element-plus` 的 `ElMessage`、`dashboard`）。

## 7. 不做的事（YAGNI）

- 不做精簡版快速新增表單（已選擇沿用完整表單）。
- 不在看板新增草稿暫存（`useFormDraft`）。
- 不自動切換看板學年/學期篩選（改用提示訊息）。
- 不改後端、不改卡片顯示欄位（本次只加「新增」入口）。

## 8. 收尾

- 開 worktree／feature branch（off `origin/main`），spec 與程式同分支 commit。
- 前端 gate：`npm run typecheck`、`npm run lint`、相關 Vitest 綠。
- 依 workspace「完成 = push + CI 綠 + worktree remove」紀律收尾（本次 push 與否聽從使用者）。
