# 考核與年終 批次 2b-2「溯源正向獎金 provider + 抽屜逐項下鑽」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓年終 grid 明細抽屜的每個正向獎金分項（考核上/下、紅利上/下、才藝鼓勵、教課獎勵、超額）都能下鑽「怎麼算的」——後端為這 7 個 bonus key 各建 provenance provider（逐筆 source_records + formula_summary，維持 Σ逐筆==value 不變式），前端抽屜逐項展開顯示。

**Architecture:** 後端在 `services/provenance/` 新增 provider（讀既有 `SpecialBonusItem`（權威 amount + calc_meta）建 `DerivedValue`，**value 一律取 SpecialBonusItem.amount 之和、零漂移**），依 key 分組註冊到 `_GROUP_KEYS`。紅利需先讓 `semester_dividend.py` 把達標金額（returning/activity）寫進 calc_meta 使 provider 自足。前端抽屜（2b-1 已建 `GridRowDetailDrawer`）每個獎金分項加「怎麼算的」展開，呼叫既有 `getProvenance(key, cycleId, employeeId)` 顯示 source_records + formula_summary（沿用既有 `ProvenanceDrawer` 的顯示邏輯或抽共用子元件）。

**Tech Stack:** FastAPI + SQLAlchemy（BE，**無 migration**——calc_meta 加欄是 JSONB 內容、非 schema）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（FE）。

**Spec:** `docs/superpowers/specs/2026-07-20-appraisal-yearend-taskflow-uiux-design.md` §4.3

## Global Constraints

- 一律繁體中文（commit/docstring/UI）；Conventional Commits；一個 commit 一件事。
- **工作位置**：FE worktree `~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow`（分支 `feat/appraisal-yearend-taskflow-uiux`，已含批次1+2a+2b-1）；BE worktree `~/Desktop/ivy-backend/.claude/worktrees/feat-yereject`（分支 `feat/yearend-settlement-reject`，已含批次1+2a+2b-1）。**嚴禁在共用 checkout 切分支**。
- FE TS-only 禁 any；繁中；新測試放 `__tests__/`。
- **本批次無新 migration**。
- BE 針對性 pytest 加 `-o addopts=""`；測試掛自建 SQLite fixture（比照 `tests/test_year_end_batch_sign.py`）。BE worktree 用 `~/Desktop/ivy-backend/.venv/bin/python`。
- **每個 provider 的 Σ逐筆==value 不變式測試是硬 gate**（比照 `tests/test_provenance_attendance_provider.py`）：`_q2(sum(sr.amount for sr in dv.source_records)) == dv.value` 且 `dv.value == SpecialBonusItem.amount 之和`（零漂移）。
- codegen：本批次 BE 不改對外 schema（provenance 端點已存在、DerivedValue 已定義），**理論上前端型別不變**；FE 抽屜用既有 `getProvenance` 即可，若確認無 schema 變更則不需 codegen（Task 8 確認）。
- **push 順序 BE 先、FE 後**。
- FE typecheck 11 pre-existing 紅全在 IntegrationsHealthCard.vue。BE 3 pre-existing 紅（test_guo + 2× activity token）非本批次。

## 現況關鍵事實（實作依據，來自探索）

- provenance 註冊：`services/provenance/base.py` `_GROUP_KEYS`（:22-29）`dict[ProviderGroup, tuple[str,...]]`，目前只 1 組 `derive_attendance_provenance`→4 扣款 key。`_KEY_TO_GROUP`（:32）反向索引，重複 key `assert` 炸。`resolve_provenance(db,cycle,emp,key)`（:42）分派 `_KEY_TO_GROUP[key](db,cycle,emp)[key]`。`KNOWN_KEYS`（:39）。
- `ProviderGroup = Callable[[Session, YearEndCycle, Employee], dict[str, DerivedValue]]`。
- `DerivedValue`（`schemas/provenance.py:27`）：key/value:Decimal/formula_summary:str/breakdown:dict/source_records:list[SourceRecord]/deep_link:Optional[str]/is_override:bool。`SourceRecord`（:17）：date:Date/label:str/amount:Decimal/module:str/source_id:Optional[int]。
- `SpecialBonusItem`（`models/year_end.py`）：唯一鍵 (year_end_cycle_id, employee_id, bonus_type, period_label)；`amount:Decimal`（權威值）、`calc_meta:JSONB`、`classroom_id:Optional`、`source_ref:Optional`。**一個 (cycle,emp,bonus_type) 可能多列**（不同 period_label/classroom）→ value = SUM(amount)。
- `SpecialBonusType` 值（= provenance key）：`APPRAISAL_HALF_BONUS_FIRST/SECOND`、`SEMESTER_DIVIDEND_FIRST/SECOND`、`AFTER_CLASS_AWARD`、`TEACHING_EXTRA`、`EXCESS_ENROLLMENT`、`FESTIVAL_DIFF`、`CUSTOM`。本批次做前 7 個正向 key；`FESTIVAL_DIFF`（節慶差額，可正可負）與 `CUSTOM` 本批次**不做**（calc_meta 結構不定，屬非目標）。
- 各 key calc_meta（探索確認）：
  - `EXCESS_ENROLLMENT`：`{months: {"114-08": "金額str", ...}, coverage, eligible, ...}`（逐月）
  - `TEACHING_EXTRA`：`{courses: {課名: {student_count, units, amount}}, unit_price, sessions_per_unit, ...}`（逐課）
  - `SEMESTER_DIVIDEND_FIRST/SECOND`：`{returning_qualified:bool, activity_qualified:bool, returning_rate, activity_rate, ...}`（**目前無金額拆分**，Task 1 補 `returning_amount`/`activity_amount`）
  - `AFTER_CLASS_AWARD`：每班段 `{J:人次, K:單價}`、才藝老師段 `{total_J, art_unit_price}`
  - `APPRAISAL_HALF_BONUS_FIRST/SECOND`：`{summary_status, appraisal_cycle_id, partition, ...}`；`source_ref="appraisal_summary:{id}"`；value 來自 AppraisalSummary.bonus_amount（已存為 SpecialBonusItem.amount）
- 不變式測試範式：`tests/test_provenance_attendance_provider.py`（造資料→`dv=derive_X(...)[key]`→`dv.value==權威值`→`_q2(sum(sr.amount))==dv.value`→驗逐筆 label/module/source_id）。

---

### Task 1: BE 紅利 calc_meta 補達標金額（讓 dividend provider 自足）

**Files:**
- Modify: `~/Desktop/ivy-backend/services/year_end/auto_derive/semester_dividend.py`（calc_meta 組裝 :573-587）
- Modify/Create: `~/Desktop/ivy-backend/tests/`（既有 semester_dividend 測試補斷言，或新建）

**Interfaces:**
- Produces: `SEMESTER_DIVIDEND_*` 的 calc_meta 新增 `returning_amount: str`（達標時實際 +金額，否則 "0"）與 `activity_amount: str`（同理）。Task 4 dividend provider 讀此建兩列 source_records。

- [ ] **Step 1: 寫失敗測試**

在既有 semester_dividend 測試檔（`grep -rln "semester_dividend\|derive_semester_dividend" tests/`）補：舊生達標 + 才藝達標的員工，其 SpecialBonusItem.calc_meta 含 `returning_amount == "500"` 與 `activity_amount == "1000"`（或 config 值）；只舊生達標者 `activity_amount == "0"`。

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/<semester_dividend測試檔> -o addopts="" -q
```
Expected: FAIL（calc_meta 無此欄）。

- [ ] **Step 3: 實作**

`semester_dividend.py` calc_meta 組裝（:573-587）加：

```python
        "returning_amount": str(ret_amount if returning_qualified else Decimal("0")),
        "activity_amount": str(act_amount if activity_qualified else Decimal("0")),
```

（`ret_amount`/`act_amount` 已在 :445-449 從 config 取。）

- [ ] **Step 4: 跑測試確認通過 + 回歸 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/<檔> -o addopts="" -q
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "dividend or year_end" -o addopts="" -q 2>&1 | tail -5
git add services/year_end/auto_derive/semester_dividend.py tests/
git commit -m "feat(year-end): 紅利 calc_meta 補達標金額（returning/activity_amount），供溯源逐列拆分

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- services/year_end/auto_derive/semester_dividend.py tests/
```

---

### Task 2: BE bonus provider 模組 + 考核獎金 provider（最簡，單值）

**Files:**
- Create: `~/Desktop/ivy-backend/services/provenance/bonus_provider.py`
- Modify: `~/Desktop/ivy-backend/services/provenance/base.py`（`_GROUP_KEYS` 註冊）
- Create: `~/Desktop/ivy-backend/tests/test_provenance_bonus_provider.py`

**Interfaces:**
- Produces: `derive_appraisal_bonus_provenance(db, cycle, emp) -> dict[str, DerivedValue]` 涵蓋 `APPRAISAL_HALF_BONUS_FIRST`/`APPRAISAL_HALF_BONUS_SECOND`；一個共用 helper `_sum_special_bonus(db, cycle_id, emp_id, bonus_type) -> (Decimal, list[SpecialBonusItem])`（Task 3/4/5 共用）；`_q2`（quantize 0.01 HALF_UP）。註冊到 `_GROUP_KEYS`。

- [ ] **Step 1: 寫失敗測試**

`tests/test_provenance_bonus_provider.py`（fixture 比照 `tests/test_year_end_batch_sign.py`；另需 seed SpecialBonusItem）。第一批測試針對考核獎金：seed 一個 cycle + emp + 一筆 `SpecialBonusItem(bonus_type=APPRAISAL_HALF_BONUS_FIRST, amount=Decimal("8000"), period_label=..., calc_meta={"summary_status":"FINALIZED","appraisal_cycle_id":1,"partition":"earlier"}, source_ref="appraisal_summary:10")` →
```python
dv = derive_appraisal_bonus_provenance(db, cycle, emp)["APPRAISAL_HALF_BONUS_FIRST"]
assert dv.value == Decimal("8000")
assert _q2(sum(sr.amount for sr in dv.source_records)) == dv.value   # 硬不變式
assert len(dv.source_records) == 1
assert dv.source_records[0].module == "appraisal"
assert dv.source_records[0].source_id == 10   # 從 source_ref 解析
assert "考核" in dv.formula_summary
# 無資料 → value 0、source_records []、summary 含「無紀錄」
```
另補 registry 測試：`resolve_provenance(db,cycle,emp,"APPRAISAL_HALF_BONUS_FIRST")` 可解、key ∈ KNOWN_KEYS。

- [ ] **Step 2: 跑測試確認失敗**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_provenance_bonus_provider.py -o addopts="" -q
```
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作模組 + 考核 provider**

`services/provenance/bonus_provider.py`：

```python
"""正向獎金 provenance provider。value 一律取 SpecialBonusItem.amount 之和（零漂移），
source_records 由 calc_meta 逐項拆分，維持 Σ逐筆==value 不變式（不足處補調整列）。"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.employee import Employee
from models.year_end import SpecialBonusItem, SpecialBonusType, YearEndCycle
from schemas.provenance import DerivedValue, SourceRecord


def _q2(v: Decimal) -> Decimal:
    return Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _sum_special_bonus(
    db: Session, cycle_id: int, emp_id: int, bonus_type: SpecialBonusType
) -> tuple[Decimal, list[SpecialBonusItem]]:
    """回 (Σamount, 該 bonus_type 的所有 SpecialBonusItem 列)。"""
    items = list(
        db.scalars(
            select(SpecialBonusItem).where(
                SpecialBonusItem.year_end_cycle_id == cycle_id,
                SpecialBonusItem.employee_id == emp_id,
                SpecialBonusItem.bonus_type == bonus_type,
            )
        )
    )
    return _q2(sum((i.amount for i in items), Decimal("0"))), items


def _empty_dv(key: str) -> DerivedValue:
    return DerivedValue(
        key=key, value=Decimal("0.00"), formula_summary="無紀錄",
        breakdown={}, source_records=[], deep_link=None,
    )


def _parse_source_id(source_ref: str | None) -> int | None:
    if source_ref and ":" in source_ref:
        tail = source_ref.rsplit(":", 1)[1]
        return int(tail) if tail.isdigit() else None
    return None


def derive_appraisal_bonus_provenance(
    db: Session, cycle: YearEndCycle, emp: Employee
) -> dict[str, DerivedValue]:
    out: dict[str, DerivedValue] = {}
    for key, btype in (
        ("APPRAISAL_HALF_BONUS_FIRST", SpecialBonusType.APPRAISAL_HALF_BONUS_FIRST),
        ("APPRAISAL_HALF_BONUS_SECOND", SpecialBonusType.APPRAISAL_HALF_BONUS_SECOND),
    ):
        value, items = _sum_special_bonus(db, cycle.id, emp.id, btype)
        if not items or value == 0:
            out[key] = _empty_dv(key)
            continue
        recs: list[SourceRecord] = []
        for it in items:
            meta = it.calc_meta or {}
            status = meta.get("summary_status", "")
            recs.append(
                SourceRecord(
                    date=cycle.bonus_calc_date, label=f"考核獎金（{status}）",
                    amount=_q2(it.amount), module="appraisal",
                    source_id=_parse_source_id(it.source_ref),
                )
            )
        part = "上學期" if btype == SpecialBonusType.APPRAISAL_HALF_BONUS_FIRST else "下學期"
        out[key] = DerivedValue(
            key=key, value=value,
            formula_summary=f"前一完整學年{part}考核獎金，逐筆取自考核總表核定金額。",
            breakdown={"item_count": len(items)},
            source_records=recs,
            deep_link="/appraisal-year-end/appraisal/history",
        )
    return out
```

`base.py` `_GROUP_KEYS` 加一筆（import `derive_appraisal_bonus_provenance`）：

```python
    derive_appraisal_bonus_provenance: (
        "APPRAISAL_HALF_BONUS_FIRST", "APPRAISAL_HALF_BONUS_SECOND",
    ),
```

- [ ] **Step 4: 跑測試確認通過 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_provenance_bonus_provider.py -o addopts="" -q
git add services/provenance/bonus_provider.py services/provenance/base.py tests/test_provenance_bonus_provider.py
git commit -m "feat(provenance): 考核獎金上下學期溯源 provider（單筆核定金額，Σ==value）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- services/provenance/ tests/test_provenance_bonus_provider.py
```

---

### Task 3: BE 超額 + 教課獎勵 provider（逐項）

**Files:**
- Modify: `~/Desktop/ivy-backend/services/provenance/bonus_provider.py`（加 `derive_itemized_bonus_provenance`）
- Modify: `~/Desktop/ivy-backend/services/provenance/base.py`（註冊）
- Modify: `~/Desktop/ivy-backend/tests/test_provenance_bonus_provider.py`（補測試）

**Interfaces:**
- Consumes: Task 2 的 `_sum_special_bonus`/`_q2`/`_empty_dv`。
- Produces: `derive_itemized_bonus_provenance(db, cycle, emp)` 涵蓋 `EXCESS_ENROLLMENT`（calc_meta.months 逐月）與 `TEACHING_EXTRA`（calc_meta.courses 逐課）。註冊。

- [ ] **Step 1: 寫失敗測試**

補測試：
- 超額：seed `SpecialBonusItem(bonus_type=EXCESS_ENROLLMENT, amount=Decimal("3000"), calc_meta={"months": {"114-08":"1000","114-09":"1000","114-10":"1000"}})` → `dv.value==3000`、`len(source_records)==3`、逐月 amount `["1000"]*3`、`_q2(sum)==value`、module="year_end"。
- 教課：seed `calc_meta={"courses": {"畫畫":{"student_count":5,"units":2,"amount":"130"},"鋼琴":{"student_count":3,"units":1,"amount":"65"}}}` amount=Decimal("195") → `len==2`、逐課 amount、`_q2(sum)==value`。
- **Σ != value 的容錯**：若逐項和與 amount 有微差（rounding），provider 補一列「調整」使 Σ==value——補一條測試：calc_meta.months 和為 2999、amount=3000 → source_records 末補 +1 調整列、`_q2(sum)==3000`。

- [ ] **Step 2: 跑測試確認失敗** → **Step 3: 實作** → **Step 4: 綠 + Commit**

`derive_itemized_bonus_provenance`：對 EXCESS 讀 `calc_meta["months"]`（dict[月, 金額str]）逐月建 SourceRecord（date 用 cycle.bonus_calc_date 或月首日、label 月份、amount=Decimal(月金額)、module="year_end"）；對 TEACHING 讀 `calc_meta["courses"]` 逐課建（label 課名、amount=Decimal(course.amount)）。value=`_sum_special_bonus` 之和。**Σ 逐項後若 != value，append 一列 label「四捨五入調整」amount=value-Σ**（維持不變式）。formula_summary 說明「逐月超額幼生 × 費率」/「逐課 ⌊出席堂數÷4⌋×65」。deep_link 可 None 或指工作區。register 兩 key。commit 繁中 + footer + path 限定。

---

### Task 4: BE 紅利 provider（兩列達標）

**Files:**
- Modify: `bonus_provider.py`（加 `derive_dividend_bonus_provenance`）+ `base.py` 註冊 + 測試補。

**Interfaces:**
- Consumes: Task 1 的 calc_meta `returning_amount`/`activity_amount`；Task 2 的 helper。
- Produces: `derive_dividend_bonus_provenance` 涵蓋 `SEMESTER_DIVIDEND_FIRST`/`SECOND`。

- [ ] **Step 1-4（TDD）**：測試 seed dividend item（amount=1500、calc_meta `{"returning_qualified":true,"activity_qualified":true,"returning_amount":"500","activity_amount":"1000",...}`）→ `dv.value==1500`、`source_records` 兩列（舊生達標 +500「舊生註冊率達標」/ 才藝達標 +1000「才藝參加率達標」）、`_q2(sum)==value`、未達標的列不出現（或 amount 0 不列）。只舊生達標 → 一列 +500、value==500。實作讀 calc_meta returning_amount/activity_amount 建列（>0 才列）；Σ 若 != value 補調整列。register 兩 key。commit。

---

### Task 5: BE 才藝鼓勵 provider（J×K / 逐段）

**Files:**
- Modify: `bonus_provider.py`（加 `derive_after_class_bonus_provenance`）+ `base.py` 註冊 + 測試補。

**Interfaces:**
- Produces: `derive_after_class_bonus_provenance` 涵蓋 `AFTER_CLASS_AWARD`。

- [ ] **Step 1-4（TDD）**：一個 (cycle,emp,AFTER_CLASS_AWARD) 可能多列（每班段 `{J,K}`、才藝老師段 `{total_J, art_unit_price}`）。測試 seed 兩列（班段 `{"J":10,"K":"65"}` amount=650、才藝師段 `{"total_J":100,"art_unit_price":"5"}` amount=500）→ `dv.value==1150`、`source_records` 兩列（label 各「班級 J×K」「才藝老師 全校總人次×單價」、amount 各列 = 該 SpecialBonusItem.amount）、`_q2(sum)==value`。實作：逐 SpecialBonusItem 一列（label 依 calc_meta 有 `J`/`total_J` 分辨、amount=item.amount）。register key。commit。

---

### Task 6: BE openapi + 全 provenance 測試 sweep

- [ ] **Step 1: 全 provenance 測試 + 年終回歸**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "provenance or dividend or year_end" -o addopts="" -q 2>&1 | tail -5
```
Expected: 綠（pre-existing test_guo/activity token 除外）。

- [ ] **Step 2: openapi**

```bash
~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py 2>&1 | tail -1
```
（provenance 端點與 DerivedValue schema 本批次未改對外形狀——確認 openapi 無非預期 diff；provenance 端點以 key 為 path param，7 個新 key 不改 schema 結構，僅 runtime 可解析更多 key。）

---

### Task 7: FE 抽屜逐項下鑽「怎麼算的」

**Files:**
- Modify: `src/views/yearEnd/components/GridRowDetailDrawer.vue`（每獎金分項加「怎麼算的」展開 → getProvenance）
- Modify: `src/views/yearEnd/__tests__/GridRowDetailDrawer.spec.ts`
- （可選）Create: `src/views/yearEnd/components/ProvenanceInline.vue`（若把 getProvenance+顯示抽成共用子元件）

**Interfaces:**
- Consumes: 既有 `getProvenance(key, cycleId, employeeId)`（`src/api/yearEnd.ts:202`，回 DerivedValue：formula_summary/source_records/deep_link）；bonus key = special_bonuses dict 的 key（= SpecialBonusType 值）。

- [ ] **Step 1: 寫失敗測試**

`GridRowDetailDrawer.spec.ts` 補：mock `getProvenance` 回一個含 source_records 的 DerivedValue；抽屜某獎金分項點「怎麼算的」→ 斷言呼叫 `getProvenance(該bonus key, cycleId, employeeId)`、展開顯示 formula_summary + 逐筆 source_records（date/label/amount）。

- [ ] **Step 2-5：實作 + 綠 + Commit**

抽屜 breakdown 的每個獎金分項（有值者）加一個可展開的「怎麼算的」（el-collapse 或按鈕 toggle），展開時 lazy 呼叫 `getProvenance(key, props.row.settlement對應的cycleId, employeeId)`——⚠ 抽屜需要 cycleId 與 employeeId：`employeeId=row.employee_id`；`cycleId` 目前抽屜 props 無——**加 prop `cycleId: number`**（GridView 傳入，GridView 有 `cycleId`）。顯示沿用既有 `ProvenanceDrawer` 的呈現（formula_summary + source_records 列表 + deep_link 按鈕）——可抽 `ProvenanceInline.vue` 共用或在抽屜內直接渲染。失敗/無資料降級。扣款 key（attendance 那 4 個）不在 grid 抽屜的獎金分項（那是 DetailView 的溯源），本 task 只做正向獎金 7 key。commit 繁中 + footer + path 限定；若確認無 BE schema 變更則不需 codegen。

---

### Task 8: 跨端收尾驗證

- [ ] **Step 1: FE 全套**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npm run lint 2>&1 | tail -3
npx vitest run src/views/yearEnd src/views/appraisalYearEnd
```

- [ ] **Step 2: BE 全套 provenance + 年終**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "provenance or year_end" -o addopts="" -q 2>&1 | tail -4
```

- [ ] **Step 3: 手動 smoke**：grid 抽屜點某獎金分項「怎麼算的」→ 顯示逐筆來源；每個正向獎金 key 都能下鑽；金額逐筆和 == 分項金額。

- [ ] **Step 4: 控制端回報兩分支 SHA，等 staging promotion（BE 先 FE 後）。**

## 非目標（本批次 2b-2 排除）

- `FESTIVAL_DIFF`（節慶差額）與 `CUSTOM` 的溯源（calc_meta 結構不定/保留擴充）——不做。
- 扣款 4 key 的溯源（已存在於 DetailView 的 ProvenanceDrawer）——不動。
- provenance is_override/override_meta（P2 預留欄）——不做。
