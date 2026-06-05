# 招生流程 ↔ 學生/班級 整合 — Phase 2 + 3 設計

- 日期：2026-06-04
- 前作：Phase 1（records-as-hub）已 merge 兩 repo local main（BE `7685472` / FE `840648da`，未 push、整合待驗證）。spec `2026-06-04-recruitment-student-integration-phase1-design.md`。
- 前端分支：`feat/recruit-journey-stats-p23-fe`（off FE local main `840648da`）
- 後端分支：待開 `feat/recruit-journey-timeline-be`（off BE local main `7685472`）

---

## Phase 2 — 單一小孩「參觀→入學」歷程頁

### 目標
一個小孩從訪視→預繳→暫定編班→報到→分班（＋報到後異動）的完整時間軸，從**招生訪視名單**與**學生檔案**兩個視角都能看到。

### 既有可複用（關鍵）
被棄用漏斗的 `get_timeline`（`api/recruitment/funnel.py:185`）已把 `RecruitmentEventLog`（招生事件）+ `StudentChangeLog`（學生異動，經 `Student.recruitment_visit_id` 反查）union 並按 `created_at` 排序——**邏輯正確，只是掛在壞掉的 `/funnel/` 路由**。Phase 2 後端＝把這段抽成 service + 正確路由重曝露，不重寫。

### 後端
- **新 service** `services/recruitment_timeline.py`：`build_visit_timeline(session, visit_id) -> list[TimelineEvent]`（搬 funnel.py 行 191-242 的邏輯；visit 不存在 raise 一個 `TimelineNotFound`）。
- **schema 搬家**：`TimelineEvent` / `TimelineOut`（現於 `schemas/recruitment_funnel.py`）移到 **`schemas/recruitment_timeline.py`**；`recruitment_funnel.py` 改 `from schemas.recruitment_timeline import TimelineEvent, TimelineOut`（re-export，保 funnel.py 仍可 import、不破壞 app 啟動；漏斗 cleanup 刪 funnel 後此檔自然留存）。
- **新端點** `GET /api/recruitment/visits/{visit_id}/timeline`（放 `api/recruitment/records.py` 或新 `api/recruitment/timeline.py`，prefix `/api/recruitment`，權限 `RECRUITMENT_READ`）→ 呼叫 service → `TimelineOut`。**路由正確**（real path `/api/recruitment/visits/{id}/timeline`，剝 /api → key `/recruitment/visits/{visit_id}/timeline`）。
- **funnel.py `get_timeline` 改呼叫同一 service**（DRY；funnel route 仍 dead 但不重複邏輯）。
- 測試：service 純函式（visit 有/無 student、事件排序）+ 端點 200/404。

### 前端
- **新 api** `getVisitTimeline(visitId)` → `GET /recruitment/visits/{visit_id}/timeline`（放 `src/api/recruitment.ts`）。
- **新元件** `src/components/recruitment/JourneyTimeline.vue`（`<script setup lang="ts">`，獨立、**不依賴**漏斗 store/api/TimelineDrawer）：props `visitId`，載入並渲染時間軸（招生事件 vs 學生異動 用 tag 顏色區分，event_type 中文化，沿用原 TimelineDrawer 的視覺風格與 `EVENT_LABELS`）。空狀態「尚無歷程事件」。
- **入口 1 — 招生訪視名單**：`RecruitmentDetailTab` 操作欄加「歷程」按鈕 → emit `journey` 帶 row → `RecruitmentView` 開抽屜（`el-drawer` 包 `JourneyTimeline :visit-id`）。
- **入口 2 — 學生檔案**：`StudentDetailPanel.vue`（班級抽屜＋學生檔案共用）加「入學前歷程」摺疊區塊：用 `student.recruitment_visit_id` 解析 visitId → `JourneyTimeline`；`recruitment_visit_id` 為 null（直接建檔非招生來）→ 顯示「無招生來源紀錄」優雅降級（不打 api）。
  - 需確認 `StudentDetailPanel` 拿得到 `recruitment_visit_id`（學生 detail 端點是否回此欄；若無→後端 student schema 補露，或前端 `getStudent` 帶出。實作時 grep 確認）。
- 測試：JourneyTimeline 渲染/空狀態（mock api）；DetailTab `journey` emit；StudentDetailPanel 區塊在有/無 visit_id 的分支。

### YAGNI
- 不重建漏斗看板；不做跨多個小孩的批次歷程；時間軸唯讀（不在此編輯事件）。

---

## Phase 3 — 招生統計大彙整（官網報名併入 + 全管道彙整卡）

### 目標
把「官網報名」從獨立選單項收進**招生統計**成一個 tab（與 Phase 1 名額規劃同模式），並在總覽加一張「全管道彙整」卡（內部訪視 + 官網報名 合計 pipeline）。

### 既有現況（關鍵：很省）
- `RecruitmentIvykidsView.vue`（路由 `/recruitment-ivykids`）其實只是個薄殼：page-header + `<RecruitmentIvykidsTab :bar-component="Bar" :show-charts can-write />` + 一段 chart.js async 註冊。內容**已是 tab 形狀元件** `RecruitmentIvykidsTab.vue`。
- 內部 stats `GET /recruitment/stats`（回 `funnel_snapshot`：visited/deposited/enrolled 等）；官網 stats `GET /recruitment/ivykids/stats`（總報名/預繳/報到）；名額 `GET /recruitment/intake-plan`。三者**無共用鍵**→彙整為呈現層並列，非 record 合併。

### 前端（Phase 3 純前端，不動後端）
- **官網報名併入 tab**：`RecruitmentView` 新增 `el-tab-pane name="ivykids" label="官網報名" lazy` → `<RecruitmentIvykidsTab :bar-component="Bar" :show-charts can-write />`。Bar 沿用 RecruitmentView 既有 chart async 機制（若無則加 `RecruitmentIvykidsView` 那段 ~12 行 `ensureChartReady`/`Bar`；實作時 grep RecruitmentView 是否已有可重用 chart 元件）。
- **移除獨立入口**：`AdminSidebar` 移除 `/recruitment-ivykids` 選單項；`router/index.ts` 的 `/recruitment-ivykids` 改 **redirect 到 `/recruitment`**（保留舊連結不 404；不直接刪 route）。`RecruitmentIvykidsView.vue` 暫留（dead，與漏斗 cleanup 同批刪）。
- **全管道彙整卡**：總覽（`RecruitmentOverviewTab` 或 RecruitmentView 總覽區）加一張卡：並列「內部訪視」「官網報名」兩管道的 訪視/預繳/報到 計數 + 合計 pipeline。資料 = 既有 `getRecruitmentStats`（內部）+ `getRecruitmentIvykidsStats`（官網），前端合計。抽純函式 `combineChannels(internal, ivykids)` 便於測試。
- 測試：`combineChannels` 純函式（合計正確、缺欄位防呆）；RecruitmentView 有 ivykids tab（結構性）；sidebar 無 ivykids 項 + route redirect（`vue-router` resolve 用 follow 或結構性）。

### YAGNI
- 不做官網↔內部的 record 去重/合併（無共用鍵、業主未要求）；不重畫整個招生統計，只加 tab + 卡。

---

## 跨 Phase 共通

### 風險 / 前置
- **R1（整合待驗證承襲 Phase 1）**：Phase 2 timeline 端點與 Phase 1 intake 端點皆需 dev DB `alembic upgrade heads`（仍 `studnum01`）後才測得到 runtime；所有單元測試 mock axios，**須手動點一次**才算「能用」。
- **R2（recruitment_visit_id 可得性）**：Phase 2 學生入口依賴學生 detail 帶出 `recruitment_visit_id`；實作前確認來源（student schema / getStudent）。
- **R3（chart 重複）**：官網報名 tab 的 Bar chart 設定避免與 RecruitmentView 既有 chart 重複註冊；優先重用。
- **R4（前端 worktree node_modules）**：worktree 在 `.worktrees/<branch>` 深度 2，tracked symlink `../../node_modules` 有效，**勿換絕對 symlink**（會讓 git 視為 modified 擋 rebase）。
- **R5（漏斗 dead code）**：Phase 2 把 timeline schema/邏輯搬出 funnel；funnel.py 仍 import（re-export）保 app 啟動。漏斗前端/後端整批 cleanup 仍是獨立 follow-up。

### 不在範圍
- 漏斗 dead code 整批刪除（另開 verified cleanup）。
- 把準新生塞進全域學生名冊、lifecycle='prospect'、任何 migration。
- 官網↔內部 record 級合併。

### 測試 / 驗證
- BE `pytest`（timeline service + 端點）；FE `npm run test` + `npm run typecheck`，相對 main 無新增 fail。
- 跨 repo 順序：BE timeline 端點先 merge + dev DB upgrade + FE codegen（timeline key）→ FE Phase 2 手測；Phase 3 純前端不需後端先行。
- 手測：訪視名單「歷程」開抽屜看時間軸；學生檔案「入學前歷程」；官網報名 tab 在招生統計內；全管道彙整卡數字＝內部+官網。
