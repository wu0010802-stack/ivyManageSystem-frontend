# 考核與年終 批次 2b-1「年終 grid 密度改版 + 移除 auto-build」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把年終總表 grid 從「7 欄 + 9 個獎金欄 ≈ 1767px 必橫捲」改成「6 欄摘要表零橫捲 + 欄位開關 chips 選看分項 + 點列開明細抽屜（分項＋就地編輯手動調整，顯示目前值）」，並移除進頁 auto-build 改為顯式「開始試算」CTA。

**Architecture:** 主表縮為 6 欄（姓名/主結算/特別獎金合計/總額/狀態/操作），移除 expand 展開與 9 個常駐獎金欄；表頭上方一排欄位開關 chips（9 個獎金 key，localStorage 記憶）勾選才把該獎金欄插回主表。點列開新 `YearEndGridRowDrawer`：顯示主結算＋9 獎金分項＋總額 breakdown，並把原「手改 dialog」搬進抽屜做就地編輯（顯示目前值、非空白盲改）。BE 小幅擴充 `GridRowOut` 帶 `deduction_disciplinary`/`hire_months` 現值供抽屜預填。auto-build 副作用移除，沿用既有「重新試算」CTA 改名「開始試算」。溯源逐項下鑽（每個獎金「怎麼算的」）屬 2b-2，本批次抽屜先只顯示金額分項。

**Tech Stack:** FastAPI + SQLAlchemy（BE，**無 migration**）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（FE）。

**Spec:** `docs/superpowers/specs/2026-07-20-appraisal-yearend-taskflow-uiux-design.md` §4.2 + 延後的 §4.1（auto-build）

## Global Constraints

- 一律繁體中文（commit/docstring/UI 文案）；Conventional Commits；一個 commit 一件事。
- **工作位置**：FE worktree `~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow`（分支 `feat/appraisal-yearend-taskflow-uiux`，已含批次 1+2a）；BE worktree `~/Desktop/ivy-backend/.claude/worktrees/feat-yereject`（分支 `feat/yearend-settlement-reject`，已含批次 1+2a）。**嚴禁在共用 checkout 切分支**。
- FE TS-only 禁 any/as any；新 SFC `<script setup lang="ts">`；新測試放 `__tests__/`。
- **本批次無新 migration**（GridRowOut 擴充讀既有 settlement 欄位）。
- BE 針對性 pytest 加 `-o addopts=""`；測試掛自建 SQLite fixture（比照 `tests/test_year_end_batch_sign.py`）。BE worktree 用 `~/Desktop/ivy-backend/.venv/bin/python`。
- codegen：BE worktree 跑 `~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py`；FE 用絕對路徑 `npx openapi-typescript /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json -o src/api/_generated/schema.d.ts --alphabetize`。只 commit `schema.d.ts`。
- **push 順序 BE 先、FE 後**（本計畫只到分支完成＋驗證綠）。
- FE typecheck 既有 11 pre-existing 紅全在 `IntegrationsHealthCard.vue`（平行分支）。happy-dom + EP mount 偶 5s flaky。
- **GridRowOut 擴充新增路由欄位不改路由集合**，route freeze 快照不受影響（本批次不加/刪路由）。

## 現況關鍵事實（實作依據）

- `GridRowOut`（`schemas/year_end.py:279-288`）：settlement_id/employee_id/employee_name/payable_amount/special_bonuses{key}/total_amount/status/remark。**缺** deduction_disciplinary/hire_months 現值。
- grid 組裝在 `api/year_end/grid.py:175`（`GridRowOut(...)` from settlement）。settlement 有 `deduction_disciplinary`（:494）、`hire_months`（:505）、`special_bonus_total`（:522）欄。
- FE `YearEndGridView.vue`（636 行）：`SPECIAL_BONUS_LABELS`（:34-44，9 key）、`bonusColumns` computed（:90-105，union rows 的 key）、`expandFields`（:172-183）、`openEdit/submitEdit/editForm`（:265-304，3 override 欄「留空=不覆寫」，DRAFT-only）、`initGrid` auto-build（:212-232，`canWrite && cycleStatus==='OPEN'`）、`onBuild` 手動試算（:234-263）、`defineExpose`（:306-312）。`moneyInt`（:28-32）。手改 API `manualPatchSettlement(settlement_id, payload)`（PATCH `/year_end/settlements/{id}/manual`）。
- excess 現值＝`special_bonuses['EXCESS_ENROLLMENT']`（已在 GridRowOut）；deduction/hire_months 需 BE 補。
- 既有 `ProvenanceDrawer.vue` 是**溯源**抽屜（2b-2 用），本批次的 breakdown 抽屜是**新元件**，兩者不同。

---

### Task 1: BE `GridRowOut` 擴充現值欄（deduction_disciplinary / hire_months）

**Files:**
- Modify: `~/Desktop/ivy-backend/schemas/year_end.py`（`GridRowOut` :279-288）
- Modify: `~/Desktop/ivy-backend/api/year_end/grid.py`（`GridRowOut(...)` 組裝 :175）
- Modify: `~/Desktop/ivy-backend/tests/`（既有 grid 測試檔，補斷言）

**Interfaces:**
- Produces: `GridRowOut` 新增 `deduction_disciplinary: Decimal` 與 `hire_months: Decimal`（現值，供 FE 抽屜就地編輯預填）。FE Task 4 抽屜用。

- [ ] **Step 1: 找既有 grid 測試檔並寫失敗斷言**

```bash
grep -rln "GridRowOut\|/grid\b\|grid_endpoint\|def test.*grid" ~/Desktop/ivy-backend/tests/ | head
```
在既有 grid 端點測試檔（例如 `tests/test_year_end_grid_api.py`，以實際檔名為準）補一條斷言：grid 回傳每列含 `deduction_disciplinary` 與 `hire_months`，值等於 seed 的 settlement 對應欄位。若無現成 grid 測試檔，新建 `tests/test_year_end_grid_row_fields.py`（fixture 比照 `tests/test_year_end_batch_sign.py`，seed 一 cycle + 1 settlement 帶 `deduction_disciplinary=Decimal("-500")`、`hire_months=Decimal("12")`，GET grid 斷言該列兩欄值）。

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_grid_row_fields.py -o addopts="" -q   # 或既有 grid 測試檔
```
Expected: FAIL（KeyError / 欄位不存在）。

- [ ] **Step 3: schema 加欄位**

`schemas/year_end.py` `GridRowOut` 加（緊接 `remark` 前後）：

```python
    deduction_disciplinary: Decimal
    hire_months: Decimal
```

- [ ] **Step 4: grid 組裝帶入**

`api/year_end/grid.py:175` 的 `GridRowOut(...)` 加兩欄（from settlement `s`）：

```python
                deduction_disciplinary=s.deduction_disciplinary,
                hire_months=s.hire_months,
```

- [ ] **Step 5: 跑測試確認通過 + 回歸 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_grid_row_fields.py -o addopts="" -q
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "grid" -o addopts="" -q 2>&1 | tail -5
git add schemas/year_end.py api/year_end/grid.py tests/
git commit -m "feat(year-end): grid 列補 deduction_disciplinary/hire_months 現值，供抽屜就地編輯預填

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- schemas/year_end.py api/year_end/grid.py tests/
```
Expected: grid 測試綠（既有 pre-existing `test_guo`/activity token 紅除外）。

---

### Task 2: BE OpenAPI 產出

- [ ] **Step 1: dump**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py
~/Desktop/ivy-backend/.venv/bin/python -c "import json; d=json.load(open('openapi.json')); g=d['components']['schemas']['GridRowOut']['properties']; print('deduction_disciplinary' in g and 'hire_months' in g)"
```
Expected: `True`（兩欄入 schema）。

---

### Task 3: FE codegen + grid 摘要表（6 欄）+ 欄位開關 chips

**Files:**
- Modify: `src/api/_generated/schema.d.ts`（codegen）
- Modify: `src/views/yearEnd/YearEndGridView.vue`（主表欄位、chips、移 expand）
- Create: `src/views/yearEnd/gridColumns.ts`（欄位開關單一來源）
- Modify: `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

**Interfaces:**
- Produces: 主表 6 欄摘要 + chips 控制哪些獎金欄插回；`gridColumns.ts` 匯出 `BONUS_COL_KEYS`（9 個 key 順序）與 localStorage helper。

- [ ] **Step 1: codegen**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npx openapi-typescript /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json -o src/api/_generated/schema.d.ts --alphabetize
git diff --stat src/api/_generated/schema.d.ts   # 應只新增 GridRowOut 兩欄；若移除既有 core 型別停下回報
```

- [ ] **Step 2: 欄位開關單一來源**

`src/views/yearEnd/gridColumns.ts`：

```ts
/** 年終 grid 獎金欄開關（單一來源，元件與測試共用）。 */
export const BONUS_COL_KEYS = [
  'APPRAISAL_HALF_BONUS_FIRST', 'APPRAISAL_HALF_BONUS_SECOND',
  'SEMESTER_DIVIDEND_FIRST', 'SEMESTER_DIVIDEND_SECOND',
  'AFTER_CLASS_AWARD', 'TEACHING_EXTRA',
  'EXCESS_ENROLLMENT', 'FESTIVAL_DIFF', 'CUSTOM',
] as const

export type BonusColKey = (typeof BONUS_COL_KEYS)[number]

const LS_KEY = 'ye-grid-visible-bonus-cols'

/** 讀取使用者勾選要顯示的獎金欄（預設全不顯示——摘要表零橫捲）。 */
export function loadVisibleBonusCols(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((k) => (BONUS_COL_KEYS as readonly string[]).includes(k)) : [])
  } catch {
    return new Set()
  }
}

export function saveVisibleBonusCols(cols: Set<string>): void {
  localStorage.setItem(LS_KEY, JSON.stringify([...cols]))
}
```

- [ ] **Step 3: 寫失敗測試**

`YearEndGridView.spec.ts` 補：預設主表不含任何獎金欄（只 6 欄摘要）、勾一個 chip 後該獎金欄出現。斷言用欄位 label 文字（例如預設 `wrapper.text()` 不含「考核上」的欄頭，勾選後含）。既有 expand 相關斷言移除。

- [ ] **Step 4: 實作摘要表 + chips**

`YearEndGridView.vue`：
- 移除 el-table 的 `type="expand"` 欄（:407）與 `expandFields`（:172-183 相關；expandFields 邏輯改由 Task 4 抽屜承接，可先保留函式供抽屜用或移入抽屜）。
- 主表固定欄：姓名（fixed left）/ 主結算 / **特別獎金合計**（新欄，值 `special_bonus_total(row)` = `Object.values(row.special_bonuses).reduce(sum)`，或 `row.total_amount - row.payable_amount`）/ 總額（fixed right 前）/ 狀態 / 操作（fixed right）。
- 獎金欄改為**條件渲染**：`v-for` 只渲染 `visibleBonusCols` 內的 key（`bonusColumns` 過濾成 visible）。預設空集合 → 零獎金欄 → 零橫捲。
- 表頭上方加 chips 列：`BONUS_COL_KEYS` 每個一個 `el-check-tag`（或 el-tag + click toggle），勾選 toggle `visibleBonusCols`（`ref<Set<string>>`，init `loadVisibleBonusCols()`，change 時 `saveVisibleBonusCols`）。chip label 用 `SPECIAL_BONUS_LABELS`。
- 移除 `max-height="640"` 若不再需要（摘要表列高有限）——或保留，擇一。

- [ ] **Step 5: 驗證 + Commit**

```bash
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npx vitest run src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git add src/api/_generated/schema.d.ts src/views/yearEnd/gridColumns.ts src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git commit -m "feat(year-end): grid 改 6 欄摘要表＋獎金欄位開關 chips，移除 expand 消除橫向捲動

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 4: FE 明細抽屜（breakdown + 手動調整就地編輯）

**Files:**
- Create: `src/views/yearEnd/components/GridRowDetailDrawer.vue`
- Modify: `src/views/yearEnd/YearEndGridView.vue`（點列開抽屜、移除舊手改 dialog）
- Create: `src/views/yearEnd/__tests__/GridRowDetailDrawer.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `GridRowOut.deduction_disciplinary`/`hire_months`；`manualPatchSettlement`。
- Produces: `GridRowDetailDrawer`（props: `modelValue:boolean`、`row: GridRow | null`、`canWrite:boolean`）；emit `saved`（父層重載 grid）。

- [ ] **Step 1: 寫失敗測試**

`GridRowDetailDrawer.spec.ts`：mount 抽屜傳一個 row（status='DRAFT'、deduction_disciplinary=-500、hire_months=12、special_bonuses 帶幾個 key）→ 斷言：① breakdown 顯示主結算/各獎金/總額 ② DRAFT + canWrite 時就地編輯欄**預填目前值**（deduction 顯示 -500、hire_months 顯示 12，非空白）③ 改值按儲存呼叫 `manualPatchSettlement(settlement_id, {...})` 帶改動欄。非 DRAFT 時編輯區唯讀/隱藏。

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/views/yearEnd/__tests__/GridRowDetailDrawer.spec.ts
```
Expected: FAIL（元件不存在）。

- [ ] **Step 3: 實作抽屜**

`src/views/yearEnd/components/GridRowDetailDrawer.vue`（`<script setup lang="ts">`）：
- Props `{ modelValue: boolean; row: GridRow | null; canWrite: boolean }`；`defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()`。
- 上半 breakdown：`el-descriptions` 或列表顯示 主結算(`moneyInt(row.payable_amount)`) + 逐個 `SPECIAL_BONUS_LABELS` 有值的獎金(`moneyInt(row.special_bonuses[key] ?? 0)`) + 特別獎金合計 + 總額 + 狀態 + 備註。（金額用 `moneyInt`，from `@/utils/currency` 或沿用 GridView 既有。）
- 下半就地編輯（`v-if="canWrite && row?.status === 'DRAFT'"`）：三欄 `deduction_disciplinary`（≤0）/ `excess_amount`（≥0）/ `hire_months_override`（0-12 step0.5），**預填 row 現值**：deduction←`row.deduction_disciplinary`、hire←`row.hire_months`、excess←`row.special_bonuses['EXCESS_ENROLLMENT'] ?? 0`。備註←`row.remark`。送出時**只把「與預填原值不同」的欄放進 payload**（`manualPatchSettlement(row.settlement_id, payload)`），沒改的欄不送（等價於使用者實際改動的欄才覆寫）。成功 emit `saved` + 關抽屜 + `ElMessage.success`。
- 非 DRAFT：只顯 breakdown，編輯區隱藏。

⚠ 語意調和（重要）：舊 dialog 是「三欄一律空白、留空＝不覆寫」；本抽屜改「預填目前值、改了才送」。後端 manual API 維持「有帶欄位才覆寫」不變——**不新增「清除既有 override 還原自動值」功能**（現行 API 不支援清除 override，勿在 UI 承諾此行為）。就地編輯只做「看到目前值 → 改成新值 → 送新值覆寫」。在 report 說明此語意調和與「不做還原自動值」的取捨。
- **保精度注意**：`deduction_disciplinary`/`hire_months` 現值來自 GridRowOut（後端 Decimal 序列化字串），預填前用 `Number()` 轉；比對「是否改動」用 `Number(現值) !== 編輯值`，避免字串 vs number 誤判恆為「已改」而每次全送。

- [ ] **Step 4: GridView 接抽屜、移除舊 dialog**

`YearEndGridView.vue`：
- 移除舊手改 dialog（`editVisible`/`editForm`/`editingRow`/`openEdit`/`submitEdit` 及其 template dialog :515-560）。
- 操作欄「手改」按鈕改為「明細」按鈕（所有 status 皆可開抽屜看 breakdown；DRAFT 才顯編輯區），`@click="openDrawer(row)"`。或整列可點開抽屜。
- 加 `drawerVisible`/`drawerRow` ref + `openDrawer(row)`；template 掛 `<GridRowDetailDrawer v-model="drawerVisible" :row="drawerRow" :can-write="canWrite" @saved="loadGrid" />`。
- `defineExpose` 更新（移除 editForm/openEdit/submitEdit，加 drawerVisible/drawerRow/openDrawer）。

- [ ] **Step 5: 驗證 + Commit**

```bash
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npx vitest run src/views/yearEnd/__tests__/GridRowDetailDrawer.spec.ts src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git add src/views/yearEnd/components/GridRowDetailDrawer.vue src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/
git commit -m "feat(year-end): grid 點列開明細抽屜（分項＋手動調整就地編輯顯示目前值），取代手改 dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 5: FE 移除 auto-build 改顯式「開始試算」CTA

**Files:**
- Modify: `src/views/yearEnd/YearEndGridView.vue`（initGrid、banner、CTA 文案）
- Modify: `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

**Interfaces:**
- Produces: 進頁不再自動 build；顯式「開始試算」CTA（OPEN + canWrite 顯示）；未試算過的空/舊資料以提示引導點 CTA。

- [ ] **Step 1: 寫失敗測試**

`YearEndGridView.spec.ts` 改/補：mount（OPEN + canWrite）→ 斷言 `buildSettlements`（試算 API）**未被自動呼叫**（`expect(buildSettlements).not.toHaveBeenCalled()`）、`loadGrid` 有被呼叫（仍載入現有資料）、「開始試算」CTA 存在。點 CTA → confirm → `buildSettlements` 被呼叫。（既有測試若斷言 auto-build 被呼叫，改為斷言不呼叫。）

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/views/yearEnd/__tests__/YearEndGridView.spec.ts
```
Expected: FAIL（現行 initGrid 仍 auto-build）。

- [ ] **Step 3: 移除 auto-build**

`YearEndGridView.vue` `initGrid`（:212-232）：移除 `canWrite && cycleStatus==='OPEN'` 的自動 `buildSettlements` 分支（:218-230），只保留取 `cycleStatus` + `loadGrid`。移除 auto-build 失敗的 `buildFailed` stale banner（:370-379）與 `buildFailedDescription`（:154-158）—— 這些只服務 auto-build。`buildResult` 成功摘要 banner 保留（手動試算成功仍顯）。「↻ 重新試算」按鈕（:326-333）文案改「開始試算」（`onBuild` 邏輯不變）；OPEN + canWrite 顯示。若 grid 為空（未試算過）加一句引導文字「尚未試算，點『開始試算』產生結算」（`v-if="!rows.length && canWrite && cycleStatus==='OPEN'"`）。

- [ ] **Step 4: 驗證 + Commit**

```bash
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npx vitest run src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git add src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git commit -m "feat(year-end): 移除總表進頁自動試算，改顯式「開始試算」CTA（避免非預期 DB 寫入）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 6: 跨端收尾驗證

- [ ] **Step 1: FE 全套**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npm run lint 2>&1 | tail -3
npx vitest run src/views/yearEnd src/views/appraisalYearEnd
```
Expected: typecheck 無新紅、lint 乾淨、兩樹綠。

- [ ] **Step 2: BE grid 回歸**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "grid or year_end" -o addopts="" -q 2>&1 | tail -4
```
Expected: 綠（pre-existing `test_guo`/activity token 除外）。

- [ ] **Step 3: 手動 smoke 清單（交控制端/user）**

主表零橫捲；chips 勾選插回獎金欄且 localStorage 記憶；點列開抽屜看分項；DRAFT 抽屜就地編輯預填目前值、改值儲存生效、非 DRAFT 唯讀；進頁不自動試算、「開始試算」CTA 點擊產生結算；空 grid 引導文字。

- [ ] **Step 4: 控制端回報兩分支 SHA，等 staging promotion（BE 先 FE 後）。**

## 非目標（本批次 2b-1 排除，屬 2b-2）

- **溯源逐項下鑽（每個獎金「怎麼算的」）**：BE provenance 正向獎金 provider（考核上下/紅利上下/才藝鼓勵/教課獎勵/超額，各 Σ==value 不變式）+ FE 抽屜內每個獎金分項的「怎麼算的」展開。本批次抽屜只顯金額分項，2b-2 加溯源下鑽。
- 導軌「試算/調整」5 步細分（2a 已合為一步，維持）。
