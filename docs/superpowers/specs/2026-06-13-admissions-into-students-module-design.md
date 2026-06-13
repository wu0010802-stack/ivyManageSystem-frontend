# 招生入學流程併入學生模組 — 設計文件

- 日期：2026-06-13
- 範圍：純前端（ivy-frontend）；後端零改動
- 狀態：使用者已核可設計方向（流程入口、統計去向、班級整合、改動範圍四項皆採建議案）

## 背景與目標

現行 `/recruitment`「招生統計」是 1749 行、11 個 tab 的巨頁（`src/views/RecruitmentView.vue`），統計類 tab 與作業類 tab（名額規劃、官網報名、訪視明細）混在一起，且以「統計」為主軸。使用者要求改為以「招生 → 入學成為學生」的完整流程為主、統計為輔，並把整個招生功能併入學生與班級模組。

關鍵現況（探索結論）：

- 資料模型已打通：`students.recruitment_visit_id`（partial unique，migration `recvisuq01`）連結訪視與學生；漏斗階段 `visited→deposited→enrolled→active` 由 `derive_stage()` 從 `has_deposit` + `Student.lifecycle_status` 推導，招生階段與學生生命週期已是同一條鏈。
- 漏斗看板元件已完成但從未上線：`src/components/recruitment/funnel/`（FunnelBoard / FunnelColumn / FunnelCard / FunnelSummaryBar / TimelineDrawer / TransitionConfirmDialog）+ Pinia store `stores/recruitmentFunnel.ts`，後端 `POST /recruitment/funnel/visits/{id}/transition` 完備（含 R4-1 並發防重、R4-3 teacher/parent 角色封鎖、unrestricted 權限檢查）。
- 正確性問題：前端 `RecruitmentConvertDialog` 仍打**已棄用**的 `POST /recruitment/records/{id}/convert`，正路是 funnel transition。
- 班級準新生資料層已存在：`useClassroomProspects`（intake-plan reservedCount + records client filter），目前只顯示在 `ClassroomStudentDrawer`，未上班級卡面。
- 側邊欄「招生統計」目前是「統計分析」群組（group-stats）唯一項目。
- 路由權限 `ROUTE_PERMISSION_RULES` 為 default-deny；`/students` 是精確匹配，新路由必須補規則（歷史上 `/workbench`、`/admin/offboarding` 都踩過漏規則全員鎖死的雷）。

## 設計總覽

### 1. 新頁面 `/students/admissions`「招生入學」（AdmissionsView.vue）

頂層 5 個 tab，流程優先、統計收尾：

| Tab | key | 內容 | 來源 |
|---|---|---|---|
| 漏斗看板（**預設**） | funnel | 參觀→預繳→入學→在學 四欄看板；卡片推進階段、查看旅程 timeline | 啟用既有 `FunnelBoard.vue` + `stores/recruitmentFunnel.ts`（孤兒元件首次掛載） |
| 訪視明細 | records | 訪視記錄 CRUD、Excel 匯入、暫定編班（ReserveSeatDialog）、旅程 timeline（JourneyTimeline drawer） | 搬 `RecruitmentDetailTab` |
| 名額規劃 | intake | 各年級招生目標 vs 保留座位 | 搬 `IntakePlanPanel` |
| 官網報名 | ivykids | ivykids 官網報名同步 | 搬 `RecruitmentIvykidsTab` |
| 統計分析 | stats | 原 8 個統計 tab 整組收為次級分頁：總覽／班別分析／來源分析／接待分析／區域分析／未預繳原因／童年綠地／近五年轉換；決策摘要、警示、行動佇列維持在總覽 | 新容器 `RecruitmentStatsPanel.vue`，沿用既有 tab 元件；RecruitmentView 內聯的班別/來源/接待/童年綠地四個 tab 內容抽成獨立元件 |

順手修正：`RecruitmentConvertDialog` 改打 `transitionVisit`（deposited→enrolled），不再呼叫 deprecated convert 端點。後端 deprecated 端點保留不刪（之後再清）。

`RecruitmentView.vue` 拆完即刪除；可重用內容全部抽出成元件。

### 2. 路由、權限、選單

- `/students/admissions` → `AdmissionsView.vue`。
- `/recruitment`、`/recruitment-ivykids` → redirect 至 `/students/admissions`（舊書籤不斷）。原 `/recruitment-ivykids` redirect 註解與相關測試同步調整。
- `ROUTE_PERMISSION_RULES` 新增 `{ path: '/students/admissions', permission: 'RECRUITMENT_READ' }` + 測試。權限沿用 RECRUITMENT_READ，可視性不變；不動後端 Permission。
- 側邊欄 `AdminSidebar.vue`：「招生統計」項目從統計分析群組（group-stats）移入學生管理群組（group-students，置於班級管理、學生名冊旁），改名「**招生入學**」；group-stats 清空後整組移除（`hasVisibleStatsItems` 一併清理）。

### 3. 班級模組整合

- `ClassroomView.vue` 班級卡面新增「在學 N · 保留 M / 容量 C」膠囊。
- 資料取得：在 ClassroomView 頁面層呼叫一次 `getIntakePlan`（intake-plan 一次回全年級 rows），按 `grade_id` 分發給各班級卡；**不得**每卡各打一次 API（N+1）。
- `ClassroomStudentDrawer` 既有準新生名單與保留座位顯示不動。

### 4. 改動範圍邊界（明確不做）

- 後端零改動：不動 router、不動 Permission enum、不刪 deprecated convert 端點、無 migration。
- 不動 `src/api/` 各 recruitment 模組的函式簽名（僅前端呼叫點改用 funnel transition）。
- 不合併 `/student-enrollment` 在籍統計頁（維持獨立）。
- 不動家長端、教師 Portal。

## 元件與檔案規劃

新增：
- `src/views/students/AdmissionsView.vue` — 頂層 5 tab 容器（薄殼，邏輯下放各 tab 元件）
- `src/components/recruitment/RecruitmentStatsPanel.vue` — 統計分析次級分頁容器
- 自 RecruitmentView 內聯內容抽出：`RecruitmentClassTab.vue`、`RecruitmentSourceTab.vue`、`RecruitmentStaffTab.vue`、`RecruitmentChuannianTab.vue`（命名對齊既有 `RecruitmentOverviewTab` 等）

修改：
- `src/router/index.ts`（新路由 + 兩條 redirect）
- `src/constants/permissions.ts`（ROUTE_PERMISSION_RULES）
- `src/components/layout/AdminSidebar.vue`（選單搬移改名、群組清理）
- `src/components/recruitment/RecruitmentConvertDialog.vue`（改打 transition）
- `src/views/ClassroomView.vue`（卡面膠囊 + 頁面層 intake-plan）
- 既有 recruitment tab 元件的 import 路徑與 props 對齊

刪除：
- `src/views/RecruitmentView.vue`
- `src/views/RecruitmentIvykidsView.vue`（路由早已不指向它，一併清掉）

## 資料流

- 漏斗看板：`stores/recruitmentFunnel.ts`（Pinia）→ `GET /recruitment/funnel/board`、`POST /recruitment/funnel/visits/{id}/transition`、timeline。
- 統計分析：`getRecruitmentStats` 單一大查詢餵所有統計 tab（沿用 `useRecruitmentDashboard` / `useRecruitmentCharts`）；切到統計 tab 才載入（lazy）。
- 班級卡膠囊：ClassroomView 頁面層 `getIntakePlan({ school_year, semester })` 一次取全 rows → 按 grade_id 對應各卡。
- 各 tab 沿用既有 api 模組（`recruitment.ts` / `recruitmentFunnel.ts` / `recruitmentIntake.ts` / `recruitmentIvykids.ts`），不改簽名。

## 錯誤處理

- 漏斗 transition 失敗（403 scoped 權限、409 並發、422）：沿用 axios 攔截器 displayMessage + `TransitionConfirmDialog` 既有錯誤呈現；transition 後重抓 board。
- intake-plan 失敗時班級卡膠囊隱藏保留數（顯示「在學 N / 容量 C」），不阻塞班級頁主功能。
- 統計分析載入失敗只影響該分頁，不影響流程 tab。

## 測試計畫

Vitest（新增/調整）：
- ROUTE_PERMISSION_RULES：`/students/admissions` 需 RECRUITMENT_READ；無權限被 default-deny 擋下。
- router：`/recruitment`、`/recruitment-ivykids` redirect 至 `/students/admissions`（用 follow() helper 讀 `matched[-1].redirect` 二次 resolve，見既有慣例）。
- AdmissionsView：5 tab 渲染、預設 funnel tab、統計 lazy 載入。
- RecruitmentConvertDialog：呼叫 `transitionVisit` 而非 `convertRecruitmentRecord`（mock api 層斷言）。
- ClassroomView：卡面膠囊數字、intake-plan 只打一次、失敗時降級顯示。
- 既有 recruitment 元件測試隨檔案搬移對齊 import 路徑。
- el-drawer/el-dialog 內容測試照慣例加 `global: { stubs: { teleport: true } }`。

整合驗證（手動）：
- `start.sh` 起兩端，實機走一輪：漏斗推進一筆（含轉換成學生）、統計 8 分頁渲染、訪視 CRUD、班級卡數字與 drawer 一致、舊網址 redirect。

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| FunnelBoard 從未上線，首掛可能有未發現問題 | 實機驗證列為完成 gate；dev DB 有 QA 資料可測 |
| 路由權限 default-deny 漏規則全員鎖死（歷史踩雷兩次） | 規則 + 專屬測試一起進；redirect 路徑也驗 |
| 抽 inline tab 時 `useRecruitmentCharts` 共用狀態被拆壞 | 抽元件時 chart composable 維持由統計容器層持有、props 下發；逐 tab 對照渲染 |
| ConvertDialog 改打 transition 後行為差異（如錯誤碼不同） | 單元測試 + 實機轉換一筆驗證 |
| RecruitmentView 巨檔拆解遺漏功能 | 拆解採搬移而非重寫；完成後以 11 tab 清單逐項對照 |

## 完成定義

- 上述測試全綠 + `npm run typecheck` 0 錯誤
- 實機整合驗證走完
- 照 workspace 收尾紀律：push + CI 綠 + worktree remove
