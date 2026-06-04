# 招生流程 ↔ 學生/班級 整合 — Phase 1 設計（records-as-hub，無漏斗）

- 日期：2026-06-04（**已重寫**：原 funnel-based 版本作廢，見 §0）
- 範圍：**前端為主 + 一個小後端 schema 改動**
- 前端分支：`feat/recruit-student-integration-p1-fe`（off local main `457e2ae8`）
- 後端分支：待開 `feat/recruit-records-provisional-fields-be`（off ivy-backend local main）
- 相關前作：記憶 `project_new_student_intake_phase1_2026_06_03`（後端座位保留/名額規劃已 merge local main）

---

## 0. 重寫緣由（重要決策變更）

設計過程中發現並由 ground truth（`dump_openapi.py` 註冊路徑）確認：**現有「招生漏斗」後端端點 `board/transition/timeline` 註冊在 `/funnel/*`、缺 `/api` 前綴**，而前端 axios baseURL=`/api`、Vite proxy 不改寫 → `api.get('/funnel/board')` 打到 `/api/funnel/board` → 後端 404。即**現有漏斗看板在真實環境載不出來**（單元測試 mock axios、typecheck 因 OpenAPI key 存在而過，故一直未被發現）。

**使用者決策：不需要招生漏斗這個功能。** 因此本 spec 改為 **records-as-hub**：以現有「招生訪視名單（原始明細）」為「參觀→入學」流程主軸，全程走**正確路由**的 `/api/recruitment/records*` 與 `/api/recruitment/intake*` 端點，**完全不碰**壞掉的 funnel。funnel 路由 bug **不修**（功能已棄用，修它無意義）。

## 1. 鎖定的設計決策

1. **records-as-hub**：訪視名單＝準新生清單＝流程主軸。階段由現有欄位推導（`has_deposit`→已預繳、`enrolled`→已報到）。
2. **報到沿用現有轉換**：`RecruitmentDetailTab` 既有「轉為學生」動作（`@convert`）→ `RecruitmentConvertDialog` → `POST /api/recruitment/records/{id}/convert`。**已驗證端到端可用**：後端 handler 雖標 `deprecated=True`，仍實際呼叫 `convert_recruitment_to_student`（`api/recruitment/records.py:345`），路由正確。
3. **呈現層整合（不實體合併）**：準新生維持 `recruitment_visit`，不變 `Student`、不啟用 `lifecycle_status='prospect'`。
4. **準新生只看得到、不算進去**：不進在學人數/點名/收費/薪資。班級頁用獨立區塊呈現。
5. **移除招生漏斗 tab**（見 §5E），但**保留** overview 的 `funnel_snapshot` 統計卡（那是 `getRecruitmentStats` 的彙總，非看板，與 kanban 無關）。

## 2. 三階段拆解（更新）

| 階段 | 內容 | 後端 |
|------|------|------|
| **Phase 1（本 spec）** | records-as-hub：名額規劃面板 + 訪視記錄保留座位 + 班級頁準新生 + 移除漏斗 tab | RecruitmentRecordOut 補 3 欄 |
| Phase 2（**需重新設計**） | 單一小孩「參觀→入學」歷程頁。⚠ 原規劃用 `/funnel/visits/{id}/timeline`，**該端點隨 funnel 一起棄用**；歷程頁需另尋資料來源（records + StudentChangeLog 組合），非單純 defer。 | 待定 |
| Phase 3 | 招生統計大彙整（官網報名 + 訪視 + 名額規劃）。官網報名整合在後端 Phase 1 spec §12 被 defer，兩表無共用鍵。 | 視整合 |

## 3. 既有後端契約（複用，路由皆正確）

- `GET /recruitment/records?...` → `RecruitmentRecordListOut { total, page, page_size, records: RecruitmentRecordOut[] }`。`RecruitmentRecordOut` 現有 `id, child_name, grade, has_deposit, enrolled, source, ...`（**待補** §4 的 3 欄）。
- `POST /recruitment/records/{id}/convert`（deprecated 但 functional）→ 報到轉學生。
- `POST /recruitment/funnel/visits/{id}/reserve-seat`（intake.py，prefix `/api/recruitment`，**路由正確**）→ 設定/釋放暫定編班。body `{ provisional_grade_id|null, target_school_year|null, target_semester|null }`，resp `{ visit_id, provisional_grade_id, provisional_grade_name, target_school_year, target_semester }`。守衛：`has_deposit=True` 才能保留，否則 400。
- `GET /recruitment/intake-plan?school_year&semester` → `{ school_year, semester, rows: IntakePlanRow[] }`，`IntakePlanRow { grade_id, grade_name, target_seats, reserved_count, enrolled_count, remaining, over_capacity }`。
- `PUT /recruitment/intake-targets` → body `{ school_year, semester=1, targets: {grade_id, target_seats>=0}[] }`。
- `GET /grades`（`classrooms.ts:getGrades`）→ 年級清單，前端用來把 `provisional_grade_id` 對映成名稱。

> 前端 api key 以 `dump_openapi.py` + `gen:api` 產出的 `schema.d.ts` 為唯一真實來源。intake/records 端點 key 形態為 `/recruitment/...`（real path `/api/recruitment/...` 剝 `/api`），axios baseURL 補回 `/api` → 正確路由。

## 4. 後端改動（唯一一筆，小）

**`RecruitmentRecordOut`（`schemas/recruitment_records.py`）新增 3 欄**，皆為 `recruitment_visits` 既有欄位（**免 join**）：

- `provisional_grade_id: Optional[int] = None`
- `target_school_year: Optional[int] = None`
- `target_semester: Optional[int] = None`

並確認 records 查詢的序列化會帶出這 3 欄（若用 `from_attributes`/`model_validate(orm)` 則自動帶出；若手動組 dict 則補上——實作時 grep `RecruitmentRecordOut(` 確認）。年級**名稱**由前端 `getGrades()` 對映，不在後端 join。

- 測試：`tests/test_recruitment_api.py`（或新增）斷言 records 回應含這 3 欄且值正確（含已保留與未保留兩種 visit）。
- 之後 `dump_openapi.py` + 前端 `gen:api`，commit `schema.d.ts`（drift CI gate）。

## 5. Phase 1 交付物（前端）

### A. api 層 — `src/api/recruitmentIntake.ts`（新檔）

沿用 `recruitmentFunnel.ts` 型別風格（`import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'`）：

- `reserveSeat(visitId, payload)` → `POST /recruitment/funnel/visits/{visit_id}/reserve-seat`
- `getIntakePlan({ school_year, semester? })` → `GET /recruitment/intake-plan`
- `setIntakeTargets(payload)` → `PUT /recruitment/intake-targets`

實作前先跑 codegen，用產出 key 寫 wrapper。**只 commit `schema.d.ts`**。

### B. 名額規劃面板 — `RecruitmentView.vue` 新 tab「名額規劃」

- 新元件 `src/components/recruitment/IntakePlanPanel.vue`（`<script setup lang="ts">`），掛為新 `el-tab-pane`（`name="intake"`，`lazy`）。
- UI：學年選擇（民國，預設 `currentRocYear()`）+ 學期 toggle（上/下，預設上）；主表每列一年級，欄位 **計畫名額 / 已保留 / 已註冊 / 剩餘**；計畫名額 inline 可編輯（`RECRUITMENT_WRITE`）失焦/Enter → 收集成 `targets[]` → `setIntakeTargets` → 重載；`over_capacity` 整列標紅；合計列。
- 年級清單來源：`getGrades()`（與 plan rows 以 `grade_id` 對齊，補上 plan 未回傳的年級，使可為零保留年級設定計畫名額）。
- 資料：`getIntakePlan` / `setIntakeTargets`。

### C. 保留座位入口 — 訪視記錄（取代原 funnel 上的操作）

- `RecruitmentDetailTab.vue` 操作欄（`canWrite` 時）新增「保留座位」按鈕，`@click` 發 `reserve` 事件帶 row 上拋（與既有 `edit`/`convert`/`delete` emit 同模式）。
  - 僅 `row.has_deposit === true` 顯示（未預繳不能保留；後端亦 400 兜底）。
  - 已保留者按鈕文案改「變更/釋放座位」（以 `row.provisional_grade_id != null` 判斷）。
- `RecruitmentView.vue` 接 `@reserve="openReserveDialog"`，開新元件 `src/components/recruitment/ReserveSeatDialog.vue`（mirror `TransitionConfirmDialog` 風格）：選**年級**（`getGrades`）+ **目標學年**（民國）+ **目標學期**（上/下）；送 `reserveSeat`；提供「釋放保留」= `reserveSeat(visitId, { provisional_grade_id: null })`。成功後重載 records 列表。
- 列表可加一欄「暫定編班」顯示 `provisional_grade_id`→名稱 + 目標學年（用 §4 新欄位 + `getGrades` 對映）。

### D. 班級頁準新生／保留座位 — `ClassroomStudentDrawer.vue`

- `ClassroomProp` interface 補 `grade_id?: number`、`school_year?: number`、`semester?: number`（ClassroomView 傳入物件已含，僅型別待補）。
- 抽 composable `src/composables/useClassroomProspects.ts`（可獨立測試）：給 `{ grade_id, school_year, semester }`，回 `{ reservedCount, prospects, loading, reload }`。
  - `reservedCount`：`getIntakePlan({ school_year, semester })` 對應 `grade_id` 列的 `reserved_count`。
  - `prospects`：`getRecruitmentRecords({ ... })` 後 client filter `r.provisional_grade_id === grade_id && r.target_school_year === school_year && !r.enrolled`（**排除已報到**，與 `reserved_count` 互斥語意一致；走正確路由的 records 端點，**不碰 funnel**）。
- 容量 pill：`在學 {{ activeStudents.length }} · 保留 {{ reservedCount }} / 容量 {{ capacity }}`。
- 名冊下方加**獨立摺疊區塊「準新生／保留座位」**（視覺與正式生分離，標「尚未報到、不計入在學人數」）：列幼生姓名、目標學期、來源、已預繳；空狀態文案說明「下學年班級建立後才會對應顯示」（見 R2）。
- **絕不**併進 `activeStudents`／名冊計數／點名收費。

### E. 移除招生漏斗 tab — `RecruitmentView.vue`

- 移除 `el-tab-pane name="funnel"`（含 `<FunnelBoard />`）與其 `import FunnelBoard`。
- **僅移除入口**：funnel 元件/store/api/test 檔暫留（dead code），**整批刪除另開 verified cleanup**（先 grep `GlobalSearch`、`router`、其他 importer，避免 dangling import）。
- **保留** overview 的 `funnel_snapshot` 卡（非看板，屬統計彙總）。

### F. 明確不做

- 單一小孩歷程頁 → Phase 2（需重新設計，原 timeline 端點隨 funnel 棄用）。
- 官網報名彙整 → Phase 3。
- 全域學生名冊塞準新生、`lifecycle_status='prospect'`、任何 migration → 不做。
- funnel 路由 bug 修復、funnel 元件整批刪除 → 不在本階段（前者 moot、後者另開 cleanup）。

## 6. 風險與限制

- **R1（已解除）**：funnel 路由 404 → 本方案全程走 records/intake 正確路由，繞開。
- **R2（下學年班級未建）**：座位保留綁「年級＋目標學年」非班級 FK。下學年新生的保留在班級頁對不到具體班級（班級未建），只在名額規劃面板（年級層級）可見；班級頁準新生區塊對「當學年期中插班」與「已建好的下學年班級」才有資料 → D 區塊空狀態須說明。
- **R3（報到端點 deprecated 標記）**：`/convert` 仍 functional 但標 deprecated。本階段續用；若未來後端真的移除，報到鏈會斷——列為跨端注意（移除前需先提供替代轉換端點）。
- **R4（前端 worktree node_modules）**：worktree 的 `node_modules` 是 tracked symlink，解析失敗會讓 vite/vitest 炸。實作開始先 `rm` 壞 symlink、重建絕對 symlink 指向主 checkout（記憶 `feedback_frontend_worktree_node_modules_symlink`）。
- **R5（跨 repo 順序）**：後端補 3 欄須先 merge + dev DB 可見，前端 D 才測得到。codegen 在後端改完後跑。

## 7. 測試

- **後端**：`RecruitmentRecordOut` 含新 3 欄（已保留 / 未保留兩情境）。
- **Vitest**：
  - `recruitmentIntake.ts`（mock axios，驗 method/path/params/body）。
  - `IntakePlanPanel.vue`（渲染列、`over_capacity` 標紅、編輯觸發 `setIntakeTargets`、年級合併、合計）。
  - `ReserveSeatDialog.vue`（送出 payload、釋放送 null）。
  - `RecruitmentDetailTab.vue`（`reserve` 按鈕僅 `has_deposit` 顯示、emit 正確）。
  - `useClassroomProspects.ts`（filter 含 `!enrolled` 與 grade/year 比對、reservedCount 取值）。
  - `ClassroomStudentDrawer.vue`（**準新生不計入 `activeStudents`/容量在學數** 的防回歸斷言、空狀態、pill 文案）。
  - `RecruitmentView.vue`（funnel tab 已移除、`@reserve` 開 dialog；既有 convert 流程不回歸）。
- 既有測試不得回歸；跑 `npm run test`、`npm run typecheck`、後端 `pytest`。

## 8. 前置條件 / 部署注意

1. **dev DB 落後**（仍 `studnum01`）：手測前後端 `alembic upgrade heads`（套 `nsintake01`+`mergeheads09`），否則 intake/保留座位欄位缺 → 500。
2. **跨 repo 順序**：後端分支（補 3 欄）先 → dev DB 可見 → 前端 codegen → 前端實作 D 手測。
3. **分支隔離**：前端 worktree `feat/recruit-student-integration-p1-fe`（off local main）；後端另開 worktree off ivy-backend local main。完成各自 `--no-ff` merge 回各自 local main（workspace「merge local main、稍後一起 push」慣例），當天 `git worktree remove`。

## 9. 待決 / Follow-up

- Phase 2 歷程頁資料來源重新設計（records + StudentChangeLog；不依賴 funnel timeline）。
- funnel 前端 dead code 整批刪除（另開 verified cleanup，先 grep importer）。
- `/convert` deprecated 端點長期去留與替代方案（R3）。
- 名額規劃面板學年預設與「學期自動推導」（`project_academic_term_auto_derive_2026_06_03`）對齊。
