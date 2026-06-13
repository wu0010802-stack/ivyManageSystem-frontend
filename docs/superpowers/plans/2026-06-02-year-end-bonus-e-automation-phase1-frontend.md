# 年終獎金 E 化重構 階段 1（前端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把已 ship 的年終後端（引擎接線 + 3 API + 列印/匯出）接成可用的後台：**Excel 式年終總表頁**（一人一列、各獎金一欄、合計、黃底可手改）+ **本期設定頁**（目標人數/編制/達成率，填一次自動算）+ 兩關簽核 UI + 列印/匯出串接。

**Architecture:** Vue 3 `<script setup lang="ts">` + Element Plus + OpenAPI-typed axios（`AxiosResp`/`ApiBody`）。復用既有 `src/views/yearEnd/` 與 `src/api/yearEnd.ts`。手改沿用 SalaryView 的「按鈕開 dialog → PATCH」pattern（不用 el-table inline edit）。列印/匯出後端端點已全有，前端 `<a :href>` 直連。

**Tech Stack:** Vue 3、TypeScript（strict，禁 `: any`）、Element Plus、Vitest、openapi-typescript。

**對應**：後端 spec `ivy-backend/docs/superpowers/specs/2026-06-01-year-end-bonus-e-automation-phase1-design.md` §8；後端已 merge local main `17838e7`。mockup 見 brainstorm（grid + config 已 user 核可）。

**前置依賴**：後端 3 端點（build-settlements / grid / manual）已 merge；**class_targets write 端點 + 複製上一年（決策⑤）尚未做** → 見 Task B1-B2（後端前置）。

---

## 決策（需 user 於 plan review 確認）

1. **設定頁 class_targets 寫入**：方案 A（建議）= 補後端 POST upsert 端點（Task B1）讓前端直接設編制/班導/舊生率；方案 B = 階段 1 沿用 Excel 匯入設 class_targets，前端設定頁只做 org_settings（目標/達成率/缺會扣款）。本計畫採 A。
2. **總表頁 vs 既有 DetailView**：新建 `YearEndGridView`（Excel 式總表，cycle 主視圖），既有 `YearEndDetailView` 保留為單筆明細/簽核。grid 列「展開」連到 detail。
3. **簽核 UI**：既有 DetailView 是舊三關（主管→會計→核定）；改為兩關（會計→老闆），隱藏 supervisor 關（決策已在後端落地：sign_accounting 可從 DRAFT）。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `ivy-backend/api/year_end/__init__.py` | 改（B1）| 加 POST `/cycles/{id}/class_targets` upsert |
| `ivy-backend/api/year_end/__init__.py` | 改（B2）| cycle 建立支援「複製上一年 org_settings + class_targets」 |
| `ivy-backend/schemas/year_end.py` | 改（B1）| `ClassEnrollmentTargetUpsert` schema |
| `src/api/_generated/schema.d.ts` | regen（F1）| 納入 build/grid/manual + class_targets 新端點型別 |
| `src/api/yearEnd.ts` | 改（F2）| 加 buildSettlements / getYearEndGrid / manualPatchSettlement / upsertClassTarget（typed）|
| `src/views/yearEnd/YearEndGridView.vue` | new（F3-F4）| Excel 式總表 + 試算 + 手改 dialog + 匯出 |
| `src/views/yearEnd/YearEndConfigView.vue` | new（F5）| 本期設定（org_settings 兩學期 + class_targets 各班）|
| `src/views/yearEnd/YearEndDetailView.vue` | 改（F6）| 簽核改兩關 |
| `src/router/index.ts` | 改（F7）| 加 grid / config route |
| `src/components/layout/AdminSidebar.vue` | 改（F7）| 選單入口（已有年終，加子頁或按鈕）|
| `src/views/yearEnd/__tests__/*.spec.ts` | new | 各 view vitest |

---

## Task B1（後端）: class_targets upsert 端點

**Files:** `ivy-backend/api/year_end/__init__.py`, `ivy-backend/schemas/year_end.py`, `ivy-backend/tests/test_year_end_grid_api.py`

> 在 ivy-backend 做（worktree 或既有流程）。surgical edit 用 python3 string-replace 繞 black hook。

- [ ] **Step 1: 失敗測試**

```python
# tests/test_year_end_grid_api.py
def test_upsert_class_target(client, admin_headers, seed_cycle_114, seed_classroom):
    r = client.post(f"/api/year_end/cycles/{cycle_114}/class_targets", json={
        "semester_first": True, "classroom_id": cls_id,
        "head_teacher_employee_id": emp_id, "head_count_target": 12,
        "returning_student_rate": 0.929,
    }, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["head_count_target"] == 12

def test_upsert_class_target_idempotent(client, admin_headers, seed_cycle_114, seed_classroom):
    body = {"semester_first": True, "classroom_id": cls_id, "head_count_target": 12}
    client.post(f"/api/year_end/cycles/{cycle_114}/class_targets", json=body, headers=admin_headers)
    client.post(f"/api/year_end/cycles/{cycle_114}/class_targets", json={**body, "head_count_target": 14}, headers=admin_headers)
    # 同 (cycle, semester, classroom) → update 非新增
    rows = client.get(f"/api/year_end/cycles/{cycle_114}/class_targets", headers=admin_headers).json()
    matching = [t for t in rows if t["classroom_id"] == cls_id and t["semester_first"]]
    assert len(matching) == 1 and matching[0]["head_count_target"] == 14

def test_upsert_class_target_requires_write(client, readonly_headers, seed_cycle_114):
    r = client.post(f"/api/year_end/cycles/{cycle_114}/class_targets", json={...}, headers=readonly_headers)
    assert r.status_code == 403
```

- [ ] **Step 2: 跑測試確認失敗** — `python3 -m pytest tests/test_year_end_grid_api.py -k class_target -v` → FAIL（端點不存在）
- [ ] **Step 3: 實作** — `schemas/year_end.py` 加 `ClassEnrollmentTargetUpsert {semester_first:bool, classroom_id:int, head_teacher_employee_id:int|None, assistant_employee_id:int|None, head_count_target:int, returning_student_rate:Decimal=0}`。`api/year_end/__init__.py` 加 `POST /cycles/{cycle_id}/class_targets`（perm `YEAR_END_WRITE`，`response_model=ClassEnrollmentTargetOut`），依 UniqueConstraint (cycle, semester_first, classroom_id) upsert（select-then-update/insert）；404 if cycle 不存在；FINALIZED cycle 視需要擋（沿用既有慣例）。
- [ ] **Step 4: 跑測試確認通過** — `python3 -m pytest tests/test_year_end_grid_api.py -k class_target -v` → PASS
- [ ] **Step 5: Commit** — `feat(year-end): class_targets upsert 端點(供設定頁設編制/班導/舊生率)`

---

## Task B2（後端）: cycle 建立支援複製上一年（決策⑤）

**Files:** `ivy-backend/api/year_end/__init__.py`, `ivy-backend/schemas/year_end.py`, tests

- [ ] **Step 1: 失敗測試**

```python
def test_create_cycle_clone_previous(client, admin_headers, seed_cycle_113_with_settings):
    # 建 114 cycle 時 clone_from_academic_year=113 → 帶入 113 的 org_settings + class_targets
    r = client.post("/api/year_end/cycles", json={
        "academic_year": 114, "start_date": "2025-08-01", "end_date": "2026-07-31",
        "bonus_calc_date": "2026-01-15", "clone_from_academic_year": 113,
    }, headers=admin_headers)
    assert r.status_code == 200
    new_id = r.json()["id"]
    orgs = client.get(f"/api/year_end/cycles/{new_id}/org_settings", headers=admin_headers).json()
    assert len(orgs) == 2  # 兩學期帶入
    targets = client.get(f"/api/year_end/cycles/{new_id}/class_targets", headers=admin_headers).json()
    assert len(targets) > 0  # 班級編制帶入（達成率/在籍歸 0 待 build 重算）
```

- [ ] **Step 2: 失敗** — FAIL（create_cycle 無 clone 參數）
- [ ] **Step 3: 實作** — `YearEndCycleCreate` schema 加 optional `clone_from_academic_year:int|None`；create_cycle 若有則複製來源 cycle 的 OrgYearSettings（target/機構比率/缺會扣款，actual/rate 歸 0 待 build）+ ClassEnrollmentTarget（編制/班導/舊生率，avg/perf 歸 0）。來源不存在 → 422。
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** — `feat(year-end): 建 cycle 可複製上一年設定(決策⑤)`

---

## Task F1（前端）: OpenAPI 型別 regen

**Files:** `src/api/_generated/schema.d.ts`

- [ ] **Step 1: regen**

```bash
cd /Users/yilunwu/Desktop/ivy-backend && python3 scripts/dump_openapi.py
cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api
```

- [ ] **Step 2: 驗證新路由入型別**

```bash
grep -E "build-settlements|/grid|settlements/\{settlement_id\}/manual|class_targets" src/api/_generated/schema.d.ts | head
```
Expected: 出現 build-settlements / grid / manual / class_targets POST。

- [ ] **Step 3: typecheck + 漂移檢查**

Run: `npm run gen:api:check` （regen + porcelain，應只剩本次新增 diff）
Run: `npx vue-tsc --noEmit`（或 `npm run typecheck`）Expected: 0 error

- [ ] **Step 4: Commit** — `chore(api): regen schema.d.ts 納入年終 build/grid/manual/class_targets`（只 commit schema.d.ts；openapi.json 不入 repo）

---

## Task F2（前端）: api/yearEnd.ts 加 typed wrappers

**Files:** `src/api/yearEnd.ts`, `src/api/__tests__/yearEnd.spec.ts`（若無則略測，wrapper 極薄）

- [ ] **Step 1: 失敗測試（薄，驗 path/method）**

```ts
// 若專案對 api wrapper 有測試慣例則加；否則此 task 以 typecheck 為驗收
import { getYearEndGrid, buildSettlements, manualPatchSettlement } from '@/api/yearEnd'
// vi.mock('@/api/index') → 斷言呼叫的 url/method/params
```

- [ ] **Step 2/3: 實作**（沿用既有 appraisalPayout 的 AxiosResp 慣例）

```ts
import type { ApiBody, AxiosResp } from './_generated/typed'

export const getYearEndGrid = (cycleId: number): AxiosResp<'/year_end/cycles/{cycle_id}/grid', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/grid`)

export const buildSettlements = (
  cycleId: number, data: ApiBody<'/year_end/cycles/{cycle_id}/build-settlements', 'post'>
): AxiosResp<'/year_end/cycles/{cycle_id}/build-settlements', 'post'> =>
  api.post(`/year_end/cycles/${cycleId}/build-settlements`, data)

export const manualPatchSettlement = (
  settlementId: number, data: ApiBody<'/year_end/settlements/{settlement_id}/manual', 'patch'>
): AxiosResp<'/year_end/settlements/{settlement_id}/manual', 'patch'> =>
  api.patch(`/year_end/settlements/${settlementId}/manual`, data)

export const upsertClassTarget = (
  cycleId: number, data: ApiBody<'/year_end/cycles/{cycle_id}/class_targets', 'post'>
): AxiosResp<'/year_end/cycles/{cycle_id}/class_targets', 'post'> =>
  api.post(`/year_end/cycles/${cycleId}/class_targets`, data)
```
同時把既有 `listYearEndCycles` 等 `unknown` 回傳逐步補 typed（最小範圍：本計畫會用到的 org_settings GET/POST、class_targets GET、grid、settlements GET）。

- [ ] **Step 4: typecheck 0 error**
- [ ] **Step 5: Commit** — `feat(api): yearEnd.ts 加 grid/build/manual/class_target typed wrappers`

---

## Task F3（前端）: YearEndGridView 骨架 + 載入總表

**Files:** `src/views/yearEnd/YearEndGridView.vue`（new）, `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`（new）

- [ ] **Step 1: 失敗測試**

```ts
// YearEndGridView.spec.ts（仿 AppraisalPayoutView.spec.ts 的 mount + vi.mock('@/api/yearEnd')）
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
vi.mock('@/api/yearEnd', () => ({
  getYearEndGrid: vi.fn().mockResolvedValue({ data: [
    { employee_id: 1, employee_name: '蔡宜倩', payable_amount: 29044.71,
      special_bonuses: { APPRAISAL_HALF_BONUS_FIRST: 3312, EXCESS_ENROLLMENT: 2000 },
      total_amount: 40106.71, status: 'DRAFT' },
  ]}),
  buildSettlements: vi.fn().mockResolvedValue({ data: { built: 1, skipped_finalized: 0 }}),
}))
// 斷言：render 後表格出現「蔡宜倩」「40,106」；special bonus 欄正確對應
test('renders grid rows with totals', async () => { /* ... */ })
```

- [ ] **Step 2: 失敗** — view 不存在
- [ ] **Step 3: 實作骨架**

`<script setup lang="ts">`：
- props/route：`cycleId`（從 `useRoute().params.id`）。
- state：`rows = ref<...[]>()`、`loading`。
- `onMounted` → `getYearEndGrid(cycleId)` → `rows.value = res.data`。
- computed `bonusColumns`：從所有 rows 的 `special_bonuses` keys 聯集，對應中文 label（建一個 `SPECIAL_BONUS_LABELS` map：APPRAISAL_HALF_BONUS_FIRST→「考核上」… 對齊後端 SpecialBonusType）。
- 權限：`canWrite = computed(() => hasPermission('YEAR_END_WRITE'))`。

template：el-table（stripe, max-height），固定「姓名」欄 + 「主結算(payable)」+ 動態 special bonus 欄（v-for bonusColumns）+ 「合計(total)」(粗體) + 「狀態」 + 操作欄。money 格式化沿用既有 `money()` util。

- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** — `feat(year-end): YearEndGridView Excel 式總表骨架`

---

## Task F4（前端）: Grid 試算 + 手改 dialog + 匯出

**Files:** `src/views/yearEnd/YearEndGridView.vue`, spec

- [ ] **Step 1: 失敗測試**

```ts
test('build button calls buildSettlements then reloads', async () => {
  // 點「重新試算」→ buildSettlements 被呼叫 → getYearEndGrid 再次呼叫
})
test('manual edit dialog patches disciplinary and reloads row', async () => {
  // 點某列「手改」→ 填 deduction_disciplinary=-6000 → manualPatchSettlement 被呼叫
})
test('finalized row hides manual edit', async () => {
  // status=FINALIZED 的列不顯示手改按鈕（只能 DRAFT 改）
})
```

- [ ] **Step 2: 失敗**
- [ ] **Step 3: 實作**
- 頂部工具列：年份/cycle 顯示 + `[⚙️ 本期設定]`(連 config 頁) + `[↻ 重新試算]`(canWrite, 開 dialog 選 included_resigned → buildSettlements → reload + ElMessage 顯示 built/skipped) + 匯出按鈕群（`<a :href>` 直連後端，base 用 `api.defaults.baseURL`）：
  - 總表 xlsx：`/year_end/cycles/${id}/summary.xlsx`
  - 轉帳名冊 xlsx/pdf：`/year_end/cycles/${id}/transfer_roster.xlsx` `/.../transfer_roster.pdf`
  - 總表 pdf：`/year_end/cycles/${id}/summary.pdf`
- 手改 dialog（沿用 SalaryView pattern）：每列「手改」按鈕（僅 `status==='DRAFT'` 且 canWrite 顯示）→ 開 dialog，欄位 el-input-number：`deduction_disciplinary`（≤0）、`excess_amount`（≥0）、`hire_months_override`（0-12，可 0.5 step）→ 送 `manualPatchSettlement(settlementId, {...})` → reload。FINALIZED/已簽 → 不顯示（後端會 409，前端先擋）。
- 每列「個人明細條」連結：`<a :href="/year_end/cycles/${id}/settlements/${row.settlement_id}/slip.pdf">`（注意 grid row 需含 settlement_id — 若 GridRowOut 無 settlement_id，F2 補後端 schema 或用 employee 對照；**檢查 GridRowOut 是否有 settlement_id，無則 Task B 補欄**）。
- 列「展開」→ router push 到 `YearEndDetailView`（看 6 步明細 + 簽核）。

> ⚠️ 實作前先確認 `GridRowOut` 是否含 `settlement_id`（slip.pdf 與 manual patch 都需要）。後端 review 顯示 GridRowOut 欄位為 employee_id/employee_name/payable_amount/special_bonuses/total_amount/status —— **缺 settlement_id**。需回後端加（小改 grid 端點 schema + 查詢），列為 F4 的後端微依賴。

- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** — `feat(year-end): Grid 試算/手改 dialog/列印匯出串接`

---

## Task F5（前端）: YearEndConfigView 本期設定頁

**Files:** `src/views/yearEnd/YearEndConfigView.vue`（new）, spec

- [ ] **Step 1: 失敗測試**

```ts
test('loads org settings two semesters and saves', async () => {
  // GET org_settings → 兩學期表單；改目標人數 → POST org_settings
})
test('edits class target head_count', async () => {
  // class_targets 表格改編制 → upsertClassTarget 呼叫
})
```

- [ ] **Step 2: 失敗**
- [ ] **Step 3: 實作**
- Tab/Section 1「招生與班級」：
  - 全校目標（兩學期 el-input-number：`enrollment_target`；唯讀顯示自動算的 `school_achievement_rate` / `enrollment_actual`；機構比率顯示+可覆寫）→ POST org_settings（per semester）。
  - 各班編制 el-table（班級 | 上學期編制 | 下學期編制 | 班導 select | 舊生率 | 自動算經營績效唯讀）→ upsertClassTarget。
- Section 2「獎金標準/扣款費率」：**連結到既有 `BonusConfigPanel`**（才藝/教課單價、考核基準、費率已在該頁），不重做；顯示一段說明 + 跳轉按鈕。
- 權限：`YEAR_END_WRITE` 可編輯，`YEAR_END_READ` 唯讀。

- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** — `feat(year-end): YearEndConfigView 本期設定(目標/編制/達成率)`

---

## Task F6（前端）: DetailView 簽核改兩關

**Files:** `src/views/yearEnd/YearEndDetailView.vue`, spec

- [ ] **Step 1: 失敗測試**

```ts
test('shows two-gate signoff: accounting then finalize (no supervisor)', async () => {
  // DRAFT 狀態：顯示「會計簽核」按鈕（不顯示主管簽核）；ACCOUNTING_SIGNED：顯示「老闆核定」
})
```

- [ ] **Step 2: 失敗**
- [ ] **Step 3: 實作** — 隱藏 supervisor 簽核 UI；DRAFT 顯示「會計簽核」(`signAccountingSettlement`, perm APPRAISAL_ACCOUNTING)；ACCOUNTING_SIGNED 顯示「老闆核定」(`finalizeSettlement`, perm YEAR_END_FINALIZE)；狀態標籤中文化（草稿/會計已簽/已核定）。保留 reject 流程（若既有）。
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** — `feat(year-end): 簽核 UI 改兩關(會計→老闆)`

---

## Task F7（前端）: Router + Sidebar 入口

**Files:** `src/router/index.ts`, `src/components/layout/AdminSidebar.vue`, spec（router 可選）

- [ ] **Step 1-3: 實作**
- router 加：`/year_end/cycles/:id/grid` → YearEndGridView（meta permission `YEAR_END_READ`）；`/year_end/cycles/:id/config` → YearEndConfigView（`YEAR_END_READ`）。
- YearEndListView：每個 cycle 列加「總表」「設定」按鈕（router-link 到上述）。
- Sidebar：既有「年終獎金」項不變（進 list）；grid/config 從 list 進入，無需新增頂層選單。
- [ ] **Step 4: typecheck + build** — `npm run build` 成功
- [ ] **Step 5: Commit** — `feat(year-end): grid/config route + list 頁入口`

---

## Task F8（前端）: 整合驗證

- [ ] **Step 1:** `npm run test`（vitest 全綠，相對 main 無新增 fail）
- [ ] **Step 2:** `npm run typecheck`（0 error）+ `npm run build`（成功）
- [ ] **Step 3:** `npm run gen:api:check`（schema 無漂移）
- [ ] **Step 4:** 手動整合（`start.sh` 起兩端）：建 cycle（複製上一年）→ 設定頁填目標/編制 → 試算 → 總表顯示 → 手改超額/獎懲 → 簽核兩關 → 匯出明細表/轉帳名冊（比對 Excel 數字）。
- [ ] **Step 5: Commit**（若有整合修正）

---

## Self-Review（對後端 spec §8 + mockup 核對）

- Excel 式總表（一人一列+各獎金欄+合計+黃底可改）→ F3-F4 ✅
- 本期設定（目標→自動算達成率）→ F5 ✅（class_targets 寫入靠 B1）
- 每人明細表/轉帳名冊/總表匯出 → F4（後端端點已有）✅
- 兩關簽核 → F6 ✅
- OpenAPI 型別防漂移 → F1 ✅
- **後端缺口**：class_targets write（B1）、cycle 複製上一年（B2）、GridRowOut 缺 settlement_id（F4 註記，需小補）→ 計畫已含/標註
- Out of scope（階段 2）：才藝/教課/節慶差/學期紅利/考勤扣款全自動；班舊生率自動（沿用手填）

## Execution Handoff
完成後依 workspace SOP：後端（B1-B2）先 ship、前端（F1-F8）接上；分開 commit；OpenAPI 先 dump 後 gen。建議 subagent-driven 逐任務（worktree 從 origin/main，前端 worktree 內 `npm install`）。
