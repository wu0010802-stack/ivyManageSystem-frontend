# 招生流程 ↔ 學生/班級 整合 — Phase 1 設計（前端）

- 日期：2026-06-04
- 範圍：**前端 only**（後端 Phase 1「新生招生流程整合」已 merge 進 local main，本階段不動後端）
- 分支：`feat/recruit-student-integration-p1-fe`（off local main `457e2ae8`）
- 相關前作：後端 spec `ivy-backend/docs/superpowers/specs/2026-06-01-...`（新生招生流程整合）、記憶 `project_new_student_intake_phase1_2026_06_03`、`project_recruitment_funnel_phase_a_2026_05_22`

---

## 1. 背景與問題

「園務統計」選單群組底下有兩個功能：

- **招生統計**（`/recruitment`，`RecruitmentView.vue`）— 訪視記錄 CRUD + 8 個分析 tab + 招生漏斗看板（`funnel` tab → `FunnelBoard.vue`，4 階段：訪視→預繳→報到→開學）
- **官網報名**（`/recruitment-ivykids`）— 義華校官網同步的報名資料，目前完全獨立

**斷裂點**：招生（園務統計）與 學生/班級管理 是兩個世界。

- 「參觀者／準新生」**不在 `Student` 表**。一個小孩在「訪視 / 已預繳」階段只有一筆 `recruitment_visit`；**到「報到」才建立 `Student`**（`Student.recruitment_visit_id` 反向連結）。
- 後端 Phase 1 已做好「暫定編班＝保留座位」與「名額規劃」服務＋端點，**但前端完全沒接**：班級頁、學生名冊都看不到準新生，也沒有名額規劃畫面。
- 使用者看不到一個小孩「參觀→入學」的連續歷程，也無法在排班時看到「這個年級已被預約幾個座位」。

## 2. 三階段拆解（總覽）

使用者目標：①把招生兩功能跟學生/班級打通 ②看得到「參觀→入學」完整流程 ③入學前統計彙整進招生統計。範圍偏大，拆三階段，**本 spec 只詳述 Phase 1**：

| 階段 | 內容 | 後端 |
|------|------|------|
| **Phase 1（本 spec）** | 接上已建好的座位保留/名額規劃；班級頁＋名額面板呈現準新生 | 不動 |
| Phase 2（後續） | 單一小孩「參觀→入學」歷程頁（後端 `/funnel/visits/{id}/timeline` 已存在） | 可能不動 |
| Phase 3（後續） | 招生統計大彙整（官網報名 + 內部訪視 + 漏斗 + 名額規劃 整合一頁；官網報名整合在後端 Phase 1 spec §12 被刻意 defer，兩表無共用鍵） | 視整合需求 |

## 3. 鎖定的設計決策（與使用者確認）

1. **整合採「呈現層」而非「實體合併」**：招生資料維持獨立表（`recruitment_visit`），準新生用清楚分隔的區塊「呈現」到學生/班級頁，靠既有 `Student.recruitment_visit_id` FK 串成連續歷程。**不**把準新生變成 `Student` 列（不啟用 `lifecycle_status='prospect'`）。
2. **準新生「只看得到、不算進去」**：準新生不進在學人數、不進點名、不進收費、不進薪資任何計算。班級頁的呈現用獨立區塊，與正式生名冊視覺分離。
3. **名額規劃面板（年級層級）為主，班級頁準新生區塊一併做**：因下學年班級當下未建，班級頁準新生區塊主要服務「當學年期中插班」與「已建好的下學年班級」；對不到具體班級的保留，一律在名額規劃面板（年級層級）看得到。

## 4. 既有後端契約（複用，不動）

> 路徑以後端 router 宣告為準；前端 api 層的精確 OpenAPI key 以 `dump_openapi.py` + `gen:api` 產出的 `schema.d.ts` 為唯一真實來源（見 §6 風險 R1）。

### 4.1 名額規劃 / 座位保留（`api/recruitment/intake.py`，router prefix `/api/recruitment`，權限 `RECRUITMENT_READ/WRITE`）

- `POST /funnel/visits/{visit_id}/reserve-seat` — 設定/釋放暫定編班
  - body `ReserveSeatIn`：`provisional_grade_id: int|null`（null = 釋放）、`target_school_year: int|null`、`target_semester: int|null`（省略時：有 grade → 1，無 grade → null）
  - resp `ReserveSeatOut`：`visit_id`、`provisional_grade_id`、`provisional_grade_name`、`target_school_year`、`target_semester`
  - 守衛：`set_provisional_seat` 要求 visit `has_deposit=True`，否則 `IntakePlanError`→400
- `GET /intake-plan?school_year=<int>&semester=<int=1>` — 名額彙總
  - resp `IntakePlanOut`：`school_year`、`semester`、`rows: IntakePlanRow[]`
  - `IntakePlanRow`：`grade_id`、`grade_name`、`target_seats`、`reserved_count`、`enrolled_count`、`remaining`、`over_capacity`
  - 語意：`reserved` = 未轉換、`has_deposit=True` 且有 provisional seat 的 visit；`enrolled` = 已轉 `Student` join visit；兩集合互斥。`remaining = target − reserved − enrolled`。
- `PUT /intake-targets` — 設定每年級計畫名額
  - body `IntakeTargetsIn`：`school_year`、`semester=1`、`targets: {grade_id, target_seats>=0}[]`
  - resp `IntakeTargetsOut`：同形

### 4.2 招生漏斗看板（`api/recruitment/funnel.py`，router prefix `/funnel`）

- `GET /funnel/board?school_year=<int?>&semester=<int?>` — 4 階段看板資料。每張 `FunnelCard` 已帶 `child_name`、`student_id`、`provisional_grade_id`、`provisional_grade_name`、`target_school_year`。
- `POST /funnel/visits/{visit_id}/transition`、`GET /funnel/visits/{visit_id}/timeline` — 既有，前端 `recruitmentFunnel.ts` 已接。

## 5. Phase 1 交付物

### A. 前端 api 層 — `src/api/recruitmentIntake.ts`（新檔）

三個 typed wrapper，沿用 `src/api/recruitmentFunnel.ts` 的型別風格（`import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'`）：

- `reserveSeat(visitId: number, payload)` → `POST` reserve-seat
- `getIntakePlan(query: { school_year, semester? })` → `GET` intake-plan
- `setIntakeTargets(payload)` → `PUT` intake-targets

實作前先在後端跑 `python scripts/dump_openapi.py`，前端 `npm run gen:api` 更新 `schema.d.ts`，再用產出的精確 key 寫 wrapper（不要手寫路徑字串脫離型別）。**只 commit `schema.d.ts`，不 commit `openapi.json`**。

### B. 名額規劃面板 — `RecruitmentView.vue` 新增 tab「名額規劃」

- 新元件 `src/components/recruitment/IntakePlanPanel.vue`（`<script setup lang="ts">`），掛在 `RecruitmentView` 第 11 個 `el-tab-pane`（`name="intake"`，`lazy`）。
- UI：
  - 頂部：學年選擇（民國，預設取系統當前推導學年；學期 toggle 上/下，預設上）。
  - 主表：每列一個年級，欄位 = **計畫名額 / 已保留 / 已註冊 / 剩餘**。
    - 「計畫名額」欄 inline 可編輯（admin），失焦/Enter 收集成 `targets[]` → `setIntakeTargets` → 重載。
    - `over_capacity === true`（剩餘 < 0 或保留+註冊 > 計畫）整列標紅警示。
  - 合計列。
- 權限：`RECRUITMENT_READ` 可看，編輯計畫名額需 `RECRUITMENT_WRITE`（沿用 `hasPermission`）。
- 資料：`getIntakePlan` / `setIntakeTargets`。年級清單沿用既有 grade 來源（`classrooms.ts` 或既有 store；勿新增端點）。

### C. 座位保留操作 — 招生漏斗看板

- 在 `FunnelCard.vue`「已預繳（deposited）」階段的卡片加「保留座位」動作（按鈕或卡片選單項）。
- 點擊開 `src/components/recruitment/funnel/ReserveSeatDialog.vue`（新元件）：選**年級**（grade 下拉）+ **目標學年**（民國）+ **目標學期**（上/下）。送 `reserveSeat`。
- 卡片上以徽章顯示已保留年級（`FunnelCard` 已有 `provisional_grade_name`／`target_school_year`，直接渲染）。「釋放保留」= `reserveSeat(visitId, { provisional_grade_id: null })`。
- 守衛：未預繳卡片不顯示此動作（前端先擋；後端已 400 兜底）。
- 成功後刷新看板（沿用既有 `recruitmentFunnel` store 的 reload）。

### D. 班級頁呈現準新生／保留座位 — `ClassroomStudentDrawer.vue`

- 容量 pill 由「在學 X / 容量 Z」改為「**在學 X · 保留 Y / 容量 Z**」。
  - `Y` = 此班年級在此班學年/學期的保留數，取自 `getIntakePlan({ school_year: classroom.school_year, semester: classroom.semester })` 對應 `grade_id` 列的 `reserved_count`。
- 名冊區下方加**獨立「準新生／保留座位」摺疊區塊**（視覺與正式生名冊分離，標示「尚未報到、不計入在學人數」）：
  - 名單來源：`getFunnelBoard({ school_year: classroom.school_year, semester: classroom.semester })`，client 端 filter `card.provisional_grade_id === classroom.grade_id && !card.student_id`（**排除已報到**，使名單與 pill 的「保留 Y」= `reserved_count` 語意一致——`reserved` 與 `enrolled` 互斥）。已報到者已在正式生名冊呈現。
  - 每列：幼生姓名、目標學期、來源、已預繳標記；提供「在招生漏斗查看」連結（導到 `/recruitment` funnel tab，後續 Phase 2 可深連到歷程頁）。
  - 空狀態：「目前無保留座位的準新生」。
- **絕不**把這些準新生併進 `activeStudents`／名冊計數／任何收費點名邏輯。

### E. 明確不做（YAGNI / 後續階段）

- 單一小孩完整「參觀→入學」時間軸頁 → Phase 2。
- 官網報名彙整、招生統計大彙整 → Phase 3。
- 把準新生塞進全域學生名冊（`StudentWorkbenchView`）→ 先不做，待使用者反饋。
- 不啟用 `Student.lifecycle_status='prospect'`、不建任何 migration。

## 6. 風險與現實限制

- **R1（路徑前綴不一致，須驗證）**：`funnel.py` router prefix 為 `/funnel`，`intake.py` 為 `/api/recruitment`。`dump_openapi` 預設剝 `/api`，兩者產出的 OpenAPI key 形態不同（`/funnel/...` vs `/recruitment/...`）。intake 三端點**從未被前端呼叫過**，dev DB 也尚無對應欄位，路由未經端到端驗證。**實作時務必**：跑 codegen → 用產出的 key 寫 wrapper → dev DB upgrade 後**真打一次** reserve-seat / intake-plan 確認 200，而非僅靠型別。若發現 dev proxy / 後端實際路由與型別不符，先回後端對齊 prefix（屬後端微調，非本階段主體）。
- **R2（下學年班級未建）**：座位保留綁「年級＋目標學年」非班級 FK。下學年新生的保留在班級頁對不到具體班級（班級尚未建立），只在名額規劃面板（年級層級）可見。班級頁準新生區塊對「當學年期中插班」與「已建好的下學年班級」才有資料 → 已在 §3.3、§5D 反映，需在 D 區塊空狀態文案說明。
- **R3（funnel board 額外請求）**：D 區塊重用 `getFunnelBoard` 取名單會在開抽屜時多一個請求。可接受（抽屜本就 lazy load）；若 board payload 偏大再議快取。
- **R4（前端 worktree node_modules）**：`ivy-frontend` worktree 的 `node_modules` 是 tracked symlink，於 worktree 內解析失敗會讓 vite/vitest 炸。實作開始時先 `rm` 壞 symlink、重建絕對 symlink 指向主 checkout（見記憶 `feedback_frontend_worktree_node_modules_symlink`）。

## 7. 測試

- **Vitest 單元**：
  - `src/api/recruitmentIntake.ts` wrapper（mock axios，驗 method + path + params/body）。
  - `IntakePlanPanel.vue`：渲染列、`over_capacity` 標紅、編輯計畫名額觸發 `setIntakeTargets`、合計。
  - `ReserveSeatDialog.vue`：送出 payload 正確、釋放保留送 null。
  - `ClassroomStudentDrawer.vue`：準新生區塊 filter 正確、**準新生不計入 `activeStudents`／容量在學數**（防回歸的關鍵斷言）、空狀態。
- **手動整合**（dev DB upgrade 後）：漏斗保留座位 → 名額面板數字變動 → 班級頁 pill「保留 Y」與準新生名單一致。
- 既有測試不得回歸（跑 `npm run test` 與 `npm run typecheck`）。

## 8. 前置條件 / 部署注意

1. **dev DB 落後**：共用 dev DB 仍在 `studnum01`，**未** apply 後端 Phase 1 的 `nsintake01`+`mergeheads09`。手測前須在後端跑 `alembic upgrade heads`，否則 intake 端點因缺欄位 500。
2. **codegen**：後端 `dump_openapi.py` → 前端 `gen:api`，commit `schema.d.ts`。
3. **分支隔離**：本工作在獨立 worktree `feat/recruit-student-integration-p1-fe`（off local main），不疊在 `feat/academic-term-auto-derive-fe` 上。完成後 `--no-ff` merge 回 local main（沿用 workspace「merge local main、稍後一起 push」慣例），當天 `git worktree remove`。

## 9. 待決 / Follow-up

- D 區塊「在招生漏斗查看」連結在 Phase 2 改深連到小孩歷程頁。
- 名額規劃面板的學年預設取值：與「學期改系統自動推導」（`project_academic_term_auto_derive_2026_06_03`）對齊推導當前學年。
- R1 若揭露後端 prefix 不一致需修，另開後端微調 commit（不混入本前端分支）。
