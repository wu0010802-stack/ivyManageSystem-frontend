# 考核與年終 批次 2a「年終單一工作區 shell + 左側流程導軌」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把年終「設定 / 總表 / 明細」三個獨立路由合併成單一工作區（左側流程導軌 shell，右側承載現有三 view 內容不改內部），並補齊支援性 BE 端點與動線雜項。

**Architecture:** 三個現有 view（Config/Grid/Detail 各 500-640 行）**不改內部邏輯**，只把「頂層讀 `route.params.id`」改成接 `cycleId` prop，使其可被新 shell 以 `v-if` 分步內嵌重用。新 `YearEndWorkspaceView.vue` 讀 route param、抓一支新的唯讀 `GET /year_end/cycles/{id}/progress` 端點填左導軌每步的完成狀態與數字，並把原 Detail 的「週期狀態機 toolbar（鎖定/封存/退回開放）＋ 週期頭」上移到 shell 常駐。舊三路徑改 redirect 到工作區的對應步驟。

**Tech Stack:** FastAPI + SQLAlchemy + Alembic（BE，本批次**無 migration**）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（FE）。

**Spec:** `docs/superpowers/specs/2026-07-20-appraisal-yearend-taskflow-uiux-design.md` §4.1 / §4.4

## Global Constraints

- 一律繁體中文（commit message、docstring、UI 文案）；Conventional Commits；一個 commit 一件事。
- **工作位置**：FE 在既有 worktree `~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow`（分支 `feat/appraisal-yearend-taskflow-uiux`，已含批次 1）；BE 在既有 worktree `~/Desktop/ivy-backend/.claude/worktrees/feat-yereject`（分支 `feat/yearend-settlement-reject`，已含批次 1）。**嚴禁在共用 checkout 切分支**。兩批次同分支累積，一起走 staging。
- FE TS-only：禁 `: any`／`as any`；新測試放對應 `__tests__/`。新 SFC 一律 `<script setup lang="ts">`。
- BE 針對性 pytest 加 `-o addopts=""` 關 coverage；測試必掛自建 SQLite fixture（比照 `tests/test_year_end_batch_sign.py` fixture），否則打 dev PG。
- BE worktree 無自己的 venv，用主 repo `.venv`：`~/Desktop/ivy-backend/.venv/bin/python -m pytest …`。
- **本批次無新 migration**（progress/批次儲存皆唯讀或複用既有表）。若任何 task 發現需要 migration → stop and escalate（超出本計畫範圍）。
- BE 改 router/schema 後 codegen：在 BE worktree 跑 `~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py`，openapi.json 落 BE worktree 根；FE codegen 用絕對路徑 `npx openapi-typescript /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json -o src/api/_generated/schema.d.ts --alphabetize`（worktree 內 `npm run gen:api` 路徑不通）。只 commit `schema.d.ts`。
- **push 順序 BE 先、FE 後**。本計畫只到「分支完成＋驗證綠」，staging promotion 由控制端另行執行。
- FE typecheck 既有 11 個 pre-existing 紅全在 `IntegrationsHealthCard.vue`（平行分支負責），非本批次造成。
- happy-dom + Element Plus mount 偶有 5s timeout flaky：單獨重跑綠即屬 flaky。

## 導軌步驟 ↔ 現有 view 對映（本批次核心設計決策）

spec §4.1 的 5 步流程標籤（設定→試算→調整→簽核→核定·鎖定）在 2a 中映射到**現有 3 個 view + 常駐 shell 頭**，不重寫內容：

| 導軌步驟 key | 顯示標籤 | 右側內容 view | 完成/數字來源（progress 端點欄位） |
|---|---|---|---|
| `config` | 設定 | `YearEndConfigView`（prop cycleId） | `settings_complete`（bool）+ `settings_missing_count` |
| `grid` | 試算·調整 | `YearEndGridView`（prop cycleId） | `settlement_count` + `unmatched_count` |
| `detail` | 簽核 | `YearEndDetailView`（prop cycleId） | `sign_counts`（各狀態）+ `pending_sign_count` |
| （常駐 shell 頭，非步驟）| 核定·鎖定 | shell header 的狀態機 toolbar（鎖定/封存/退回開放）+ 週期頭 | `cycle_status` + `finalized_count`/`total_count` |

- 「核定」（單筆 finalize）動作仍在 detail 內；「鎖定/封存/退回開放」（週期狀態機）上移 shell 頭常駐。2b 會把 grid 的「試算/調整」細分並加抽屜，本批次先合為一步。
- 預設步驟：優先沿用舊 muscle memory——無 `?step=` query 時預設 `detail`（原 `year-end/cycles/:id` 即 Detail）。`?step=config` / `?step=grid` deep-link 到對應步。

---

## BE 部分（Task 1-4，在 BE worktree）

### Task 1: BE `GET /year_end/cycles/{id}/progress` 唯讀彙總端點（TDD）

**Files:**
- Create: `~/Desktop/ivy-backend/api/year_end/progress.py`
- Modify: `~/Desktop/ivy-backend/api/year_end/__init__.py`（掛載 router，約 :29-36）
- Modify: `~/Desktop/ivy-backend/schemas/year_end.py`（新增 `CycleProgressOut`）
- Create: `~/Desktop/ivy-backend/tests/test_year_end_progress.py`

**Interfaces:**
- Produces: `GET /year_end/cycles/{cycle_id}/progress` → `CycleProgressOut`，權限 `YEAR_END_READ`。FE Task 8 依此填導軌。

`CycleProgressOut` 欄位（全部 int/bool/str，無巢狀計算）：
```
cycle_status: str            # OPEN/LOCKED/CLOSED
settings_complete: bool      # settings_missing_count == 0
settings_missing_count: int  # 缺 class_target/head_teacher 的 blocking 例外數（與例外中心口徑一致）
settlement_count: int        # 該 cycle settlement 總數
unmatched_count: int         # 才藝報名未匹配數（唯讀）
sign_counts: dict[str,int]   # {DRAFT: n, SUPERVISOR_SIGNED: n, ACCOUNTING_SIGNED: n, FINALIZED: n}
pending_sign_count: int      # 非 FINALIZED 總數
finalized_count: int
total_count: int             # == settlement_count
exception_count: int         # build_year_end_exceptions 總數
```

- [ ] **Step 1: 寫失敗測試**

`tests/test_year_end_progress.py`（fixture 比照 `tests/test_year_end_batch_sign.py:38-120` 的 `client_with_db` / `_login` / `_add_user` / `_seed_cycle`；此處自建精簡 seed）：

```python
"""年終週期進度彙總：GET /year_end/cycles/{id}/progress（唯讀，供工作區左導軌）。"""

from __future__ import annotations

import os
import sys
from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models.base as base_module
from api.auth import _account_failures, _ip_attempts
from api.auth import router as auth_router
from api.year_end import year_end_router
from models.database import Base, User
from models.employee import Employee
from models.year_end import (
    EmployeeYearEndSnapshot,
    YearEndCycle,
    YearEndCycleStatus,
    YearEndSettlement,
    YearEndSettlementStatus,
)
from utils.auth import hash_password


@pytest.fixture
def client_with_db(tmp_path):
    db_path = tmp_path / "year-end-progress.sqlite"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    sf = sessionmaker(bind=engine)
    old_e, old_sf = base_module._engine, base_module._SessionFactory
    base_module._engine = engine
    base_module._SessionFactory = sf
    Base.metadata.create_all(engine)
    _ip_attempts.clear()
    _account_failures.clear()
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(year_end_router)
    with TestClient(app) as client:
        yield client, sf
    _ip_attempts.clear()
    _account_failures.clear()
    base_module._engine = old_e
    base_module._SessionFactory = old_sf
    engine.dispose()


def _login(client, username):
    res = client.post(
        "/api/auth/login", json={"username": username, "password": "TempPass123"}
    )
    assert res.status_code == 200, res.text


def _add_user(sf, username, perms):
    with sf() as s:
        s.add(
            User(
                username=username,
                password_hash=hash_password("TempPass123"),
                role="admin",
                permission_names=perms,
                is_active=True,
            )
        )
        s.commit()


def _seed(sf, statuses):
    """建 cycle + len(statuses) 員工/結算，各給對應 status。回 cycle_id。"""
    with sf() as s:
        cycle = YearEndCycle(
            academic_year=114,
            start_date=date(2025, 8, 1),
            end_date=date(2026, 7, 31),
            bonus_calc_date=date(2026, 1, 15),
            status=YearEndCycleStatus.OPEN,
        )
        s.add(cycle)
        s.flush()
        for i, st in enumerate(statuses):
            emp = Employee(employee_id=f"E_P{i}", name=f"員工{i}", is_active=True)
            s.add(emp)
            s.flush()
            snap = EmployeeYearEndSnapshot(
                year_end_cycle_id=cycle.id,
                employee_id=emp.id,
                base_salary=Decimal("40000"),
                festival_total=Decimal("0"),
                hire_months=Decimal("12"),
            )
            s.add(snap)
            s.flush()
            s.add(
                YearEndSettlement(
                    year_end_cycle_id=cycle.id,
                    employee_id=emp.id,
                    snapshot_id=snap.id,
                    payable_amount=Decimal("10000"),
                    special_bonus_total=Decimal("0"),
                    total_amount=Decimal("10000"),
                    status=st,
                )
            )
        s.commit()
        return cycle.id


def test_progress_sign_counts_and_totals(client_with_db):
    client, sf = client_with_db
    cid = _seed(
        sf,
        [
            YearEndSettlementStatus.DRAFT,
            YearEndSettlementStatus.DRAFT,
            YearEndSettlementStatus.ACCOUNTING_SIGNED,
            YearEndSettlementStatus.FINALIZED,
        ],
    )
    _add_user(sf, "reader", ["YEAR_END_READ"])
    _login(client, "reader")
    res = client.get(f"/api/year_end/cycles/{cid}/progress")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cycle_status"] == "OPEN"
    assert body["settlement_count"] == 4
    assert body["total_count"] == 4
    assert body["sign_counts"]["DRAFT"] == 2
    assert body["sign_counts"]["ACCOUNTING_SIGNED"] == 1
    assert body["sign_counts"]["FINALIZED"] == 1
    assert body["pending_sign_count"] == 3
    assert body["finalized_count"] == 1
    # 空 cycle 亦不應報錯
    assert isinstance(body["exception_count"], int)
    assert isinstance(body["unmatched_count"], int)
    assert isinstance(body["settings_missing_count"], int)
    assert body["settings_complete"] == (body["settings_missing_count"] == 0)


def test_progress_requires_year_end_read(client_with_db):
    client, sf = client_with_db
    cid = _seed(sf, [YearEndSettlementStatus.DRAFT])
    _add_user(sf, "noperm", ["SALARY_READ"])
    _login(client, "noperm")
    res = client.get(f"/api/year_end/cycles/{cid}/progress")
    assert res.status_code == 403


def test_progress_404_for_missing_cycle(client_with_db):
    client, sf = client_with_db
    _add_user(sf, "reader", ["YEAR_END_READ"])
    _login(client, "reader")
    res = client.get("/api/year_end/cycles/99999/progress")
    assert res.status_code == 404
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_progress.py -o addopts="" -q
```
Expected: FAIL（404，端點不存在）。

- [ ] **Step 3: schema**

`schemas/year_end.py` 新增（沿用檔內既有 `BaseModel` import）：

```python
class CycleProgressOut(BaseModel):
    """年終工作區左導軌用的唯讀進度彙總（不新增表，全部由既有查詢組裝）。"""

    cycle_status: str
    settings_complete: bool
    settings_missing_count: int
    settlement_count: int
    unmatched_count: int
    sign_counts: dict[str, int]
    pending_sign_count: int
    finalized_count: int
    total_count: int
    exception_count: int
```

- [ ] **Step 4: 實作端點**

`api/year_end/progress.py`（import 依探索結果對齊實際名稱；`_count_unmatched` / `build_year_end_exceptions` 若簽名與此處不符，以實際檔內為準並在 report 註明）：

```python
"""api/year_end/progress.py — 年終週期進度彙總（唯讀，供單一工作區左導軌）。

不新增表：狀態分佈由 YearEndSettlement group_by 計；未匹配用 auto_derive 唯讀計數；
例外用 build_year_end_exceptions；設定完成度以「缺 class_target/head_teacher」blocking
例外數為準（與例外中心口徑一致，避免第二套判定）。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.base import get_session_dep
from models.year_end import YearEndCycle, YearEndSettlement, YearEndSettlementStatus
from schemas.year_end import CycleProgressOut
from services.year_end.exceptions import build_year_end_exceptions
from utils.auth import require_staff_permission
from utils.permissions import Permission

router = APIRouter()

# 設定缺漏的例外型別（與 services/year_end/exceptions.py 對齊）
_SETTINGS_MISSING_TYPES = {"missing_class_target", "missing_head_teacher"}


@router.get("/cycles/{cycle_id}/progress", response_model=CycleProgressOut)
def get_cycle_progress(
    cycle_id: int,
    current_user: dict = Depends(require_staff_permission(Permission.YEAR_END_READ)),
    session: Session = Depends(get_session_dep),
):
    cycle = session.get(YearEndCycle, cycle_id)
    if cycle is None:
        raise HTTPException(404, "年終週期不存在")

    # 狀態分佈（一條 group_by）
    rows = (
        session.query(YearEndSettlement.status, func.count(YearEndSettlement.id))
        .filter(YearEndSettlement.year_end_cycle_id == cycle_id)
        .group_by(YearEndSettlement.status)
        .all()
    )
    sign_counts = {s.value: 0 for s in YearEndSettlementStatus}
    for status, cnt in rows:
        key = status.value if hasattr(status, "value") else str(status)
        sign_counts[key] = cnt
    total = sum(sign_counts.values())
    finalized = sign_counts.get(YearEndSettlementStatus.FINALIZED.value, 0)

    # 例外（唯讀衍生）→ 例外總數 + 設定缺漏數
    exceptions = build_year_end_exceptions(session, cycle)
    exception_count = len(exceptions)
    settings_missing = sum(
        1 for e in exceptions if getattr(e, "type", None) in _SETTINGS_MISSING_TYPES
    )

    # 未匹配（才藝報名）——唯讀。若 _count_unmatched 需要 academic_year：
    from services.year_end.auto_derive.after_class_award import _count_unmatched

    unmatched = _count_unmatched(session, academic_year=cycle.academic_year)

    return CycleProgressOut(
        cycle_status=cycle.status.value,
        settings_complete=(settings_missing == 0),
        settings_missing_count=settings_missing,
        settlement_count=total,
        unmatched_count=int(unmatched),
        sign_counts=sign_counts,
        pending_sign_count=total - finalized,
        finalized_count=finalized,
        total_count=total,
        exception_count=exception_count,
    )
```

`api/year_end/__init__.py` 掛載（比照既有 router include 慣例）：

```python
from api.year_end.progress import router as progress_router
year_end_router.include_router(progress_router)
```

⚠ 若 `_count_unmatched` / `build_year_end_exceptions` 的實際簽名與上方不符（例如需要 db positional、或 exceptions 回傳的 item 用 `.type` 以外的屬性名），**以實際檔內簽名為準調整**，不要臆造；調整處在 report 說明。

- [ ] **Step 5: 跑測試確認通過**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_progress.py -o addopts="" -q
```
Expected: 3 passed。

- [ ] **Step 6: 年終回歸 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "year_end" -o addopts="" -q 2>&1 | tail -5
git add api/year_end/progress.py api/year_end/__init__.py schemas/year_end.py tests/test_year_end_progress.py
git commit -m "feat(year-end): 週期進度彙總端點 GET /cycles/{id}/progress（唯讀，供工作區導軌）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- api/year_end/progress.py api/year_end/__init__.py schemas/year_end.py tests/test_year_end_progress.py
```
Expected: 回歸綠（既有 pre-existing 紅 `test_guo_partial_year_deductions_and_special` 除外，非本分支）。

---

### Task 2: BE 班級編制批次儲存端點（TDD）

**Files:**
- Modify: `~/Desktop/ivy-backend/api/year_end/class_targets.py`（檔尾新增批次端點）
- Modify: `~/Desktop/ivy-backend/schemas/year_end.py`（新增批次 request/result schema）
- Create: `~/Desktop/ivy-backend/tests/test_year_end_class_targets_batch.py`

**Interfaces:**
- Consumes: 既有 `ClassEnrollmentTargetUpsert`（schemas :301）、`_class_target_out`（class_targets.py :28）、`assert_cycle_writable`。
- Produces: `POST /year_end/cycles/{cycle_id}/class_targets/batch`，body `{items: list[ClassEnrollmentTargetUpsert]}`，回 `ClassTargetBatchResultOut`（部分成功語意，比照批次簽核）。FE Task 8「全部儲存」用。

- [ ] **Step 1: 寫失敗測試**

`tests/test_year_end_class_targets_batch.py`（fixture 同 Task 1 樣板；seed 一 cycle + 2 classroom）：

```python
"""班級編制批次儲存：POST /cycles/{id}/class_targets/batch（部分成功語意）。"""
# fixture / _login / _add_user 比照 tests/test_year_end_batch_sign.py，此處省略樣板註記，
# 實作時完整複製該檔 fixture 段落（client_with_db / _login / _add_user）。
# seed：一個 OPEN cycle + 兩個 Classroom（models.classroom.Classroom），回 (cycle_id, [cls_ids])。

def test_batch_upsert_two_rows(client_with_db):
    client, sf = client_with_db
    cid, cls_ids = _seed_cycle_with_classes(sf, n=2)
    _add_user(sf, "hr", ["YEAR_END_WRITE"])
    _login(client, "hr")
    res = client.post(
        f"/api/year_end/cycles/{cid}/class_targets/batch",
        json={
            "items": [
                {"semester_first": True, "classroom_id": cls_ids[0],
                 "head_count_target": 25, "returning_student_rate": 0.9},
                {"semester_first": True, "classroom_id": cls_ids[1],
                 "head_count_target": 23, "returning_student_rate": 0.85},
            ]
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["succeeded_count"] == 2
    assert body["failed"] == []

def test_batch_requires_write_permission(client_with_db):
    client, sf = client_with_db
    cid, cls_ids = _seed_cycle_with_classes(sf, n=1)
    _add_user(sf, "reader", ["YEAR_END_READ"])
    _login(client, "reader")
    res = client.post(
        f"/api/year_end/cycles/{cid}/class_targets/batch",
        json={"items": [{"semester_first": True, "classroom_id": cls_ids[0],
                         "head_count_target": 25, "returning_student_rate": 0.9}]},
    )
    assert res.status_code == 403

def test_batch_blocked_when_cycle_locked(client_with_db):
    client, sf = client_with_db
    cid, cls_ids = _seed_cycle_with_classes(sf, n=1, locked=True)
    _add_user(sf, "hr", ["YEAR_END_WRITE"])
    _login(client, "hr")
    res = client.post(
        f"/api/year_end/cycles/{cid}/class_targets/batch",
        json={"items": [{"semester_first": True, "classroom_id": cls_ids[0],
                         "head_count_target": 25, "returning_student_rate": 0.9}]},
    )
    assert res.status_code == 400
```

⚠ `_seed_cycle_with_classes` 需依實際 `Classroom` model 欄位建立（探索 `models/classroom.py` 必填欄位）；`assert_cycle_writable` 對 LOCKED 回 400。實作測試時先 grep `models/classroom.py` 確認 Classroom 必填欄位再寫 seed。

- [ ] **Step 2: 跑測試確認失敗**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_class_targets_batch.py -o addopts="" -q
```
Expected: FAIL（404）。

- [ ] **Step 3: schema**

`schemas/year_end.py` 新增：

```python
class ClassTargetBatchRequest(BaseModel):
    items: list[ClassEnrollmentTargetUpsert]


class ClassTargetBatchFailedItem(BaseModel):
    classroom_id: int
    semester_first: bool
    reason: str


class ClassTargetBatchResultOut(BaseModel):
    succeeded_count: int
    failed: list[ClassTargetBatchFailedItem]
```

- [ ] **Step 4: 實作端點**

`api/year_end/class_targets.py` 檔尾新增（複用既有單列 upsert 主體邏輯——**抽出共用 helper `_apply_class_target_upsert(session, cycle_id, payload)` 供單列端點與批次共用**，避免邏輯重複；若既有單列端點邏輯內嵌不易抽，批次端點內逐列複用相同的「查找/新建/更新三段」，並在 report 說明為何未抽）：

```python
@router.post(
    "/cycles/{cycle_id}/class_targets/batch",
    response_model=ClassTargetBatchResultOut,
)
def upsert_class_targets_batch(
    cycle_id: int,
    body: ClassTargetBatchRequest,
    current_user: dict = Depends(require_staff_permission(Permission.YEAR_END_WRITE)),
    session: Session = Depends(get_session_dep),
):
    """一次 upsert 多列班級編制（部分成功；guard 一次、逐列套用）。"""
    cycle = session.get(YearEndCycle, cycle_id)
    if cycle is None:
        raise HTTPException(404, "年終週期不存在")
    assert_cycle_writable(cycle)

    succeeded = 0
    failed: list[dict] = []
    for item in body.items:
        try:
            _apply_class_target_upsert(session, cycle_id, item)  # 複用單列主體
            succeeded += 1
        except HTTPException as e:
            reason = e.detail if isinstance(e.detail, str) else str(e.detail)
            failed.append(
                {
                    "classroom_id": item.classroom_id,
                    "semester_first": item.semester_first,
                    "reason": reason,
                }
            )
    session.commit()
    return ClassTargetBatchResultOut(succeeded_count=succeeded, failed=failed)
```

import 區補 `ClassTargetBatchRequest, ClassTargetBatchResultOut`。

- [ ] **Step 5: 跑測試確認通過 + 回歸 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_class_targets_batch.py -o addopts="" -q
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "class_target" -o addopts="" -q 2>&1 | tail -5
git add api/year_end/class_targets.py schemas/year_end.py tests/test_year_end_class_targets_batch.py
git commit -m "feat(year-end): 班級編制批次儲存端點（部分成功，供設定頁全部儲存）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- api/year_end/class_targets.py schemas/year_end.py tests/test_year_end_class_targets_batch.py
```
Expected: 批次測試綠 + 既有單列 class_target 測試不受影響。

---

### Task 3: BE 例外 deep_link 改指新工作區路徑（更新 + 測試同步）

**Files:**
- Modify: `~/Desktop/ivy-backend/services/year_end/exceptions.py`（4 處內部路徑，:90/:141/:156/:327）
- Modify: `~/Desktop/ivy-backend/tests/test_exception_center_year_end.py`（對應斷言 :262/:300-301 等）

**Interfaces:**
- Produces: 例外 deep_link 內部年終路徑改為新工作區格式：grid → `/appraisal-year-end/year-end/cycles/{id}?step=grid`；config → `/appraisal-year-end/year-end/cycles/{id}?step=config`。跨模組路徑（`/activity/courses`、`/activity/registrations…`、`/appraisal-year-end?section=payout`）**不動**（仍走既有相容層）。

- [ ] **Step 1: 改測試斷言（先紅）**

`tests/test_exception_center_year_end.py`：把對內部年終路徑的斷言改為新格式。定位方式：
```bash
grep -n "year_end/cycles" ~/Desktop/ivy-backend/tests/test_exception_center_year_end.py
```
把 `f"/year_end/cycles/{cycle.id}/grid"` → `f"/appraisal-year-end/year-end/cycles/{cycle.id}?step=grid"`；`f"/year_end/cycles/{cycle.id}/config"` → `f"/appraisal-year-end/year-end/cycles/{cycle.id}?step=config"`。跨模組路徑斷言（`/activity/...`、`?section=payout`）不動。

- [ ] **Step 2: 跑測試確認失敗**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_exception_center_year_end.py -o addopts="" -q
```
Expected: FAIL（實作仍回舊路徑）。

- [ ] **Step 3: 改實作**

`services/year_end/exceptions.py` 四處 f-string：
- `:90`（qualification）`f"/year_end/cycles/{cycle.id}/grid"` → `f"/appraisal-year-end/year-end/cycles/{cycle.id}?step=grid"`
- `:141`（missing_class_target）`.../config"` → `f"/appraisal-year-end/year-end/cycles/{cycle.id}?step=config"`
- `:156`（missing_head_teacher）同上 config
- `:327`（performance_anomaly）同上 config

（跨模組 3 處 :199/:228/:262/:279 不動。）

- [ ] **Step 4: 跑測試確認通過 + Commit**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_exception_center_year_end.py -o addopts="" -q
git add services/year_end/exceptions.py tests/test_exception_center_year_end.py
git commit -m "fix(year-end): 例外 deep_link 內部年終路徑改指新單一工作區（?step=grid/config）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- services/year_end/exceptions.py tests/test_exception_center_year_end.py
```

---

### Task 4: BE 全套 + OpenAPI 產出

**Files:** 無新檔；產出 `~/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json`（不 commit）。

- [ ] **Step 1: BE 全套**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -q 2>&1 | tail -4
```
Expected: 全綠（僅 pre-existing `test_guo…` 紅）。

- [ ] **Step 2: 產 openapi.json**

```bash
~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py
grep -c "cycles/{cycle_id}/progress\|class_targets/batch" openapi.json
```
Expected: grep ≥ 2（兩新端點入檔）。

---

## FE 部分（Task 5-9，在 FE worktree）

### Task 5: FE 三 view 改接 `cycleId` prop（可被 shell 內嵌）

**Files:**
- Modify: `src/views/yearEnd/YearEndConfigView.vue`（:18-20）
- Modify: `src/views/yearEnd/YearEndGridView.vue`（:51-52）
- Modify: `src/views/yearEnd/YearEndDetailView.vue`（:45-47）
- Modify 對應 spec（三 view 的既有測試若 mount 時靠 route param 提供 id，改為傳 prop）

**Interfaces:**
- Produces: 三 view 皆 `defineProps<{ cycleId: number }>()`，內部 `cycleId` 變數改用 `props.cycleId`。route 仍可用（Detail/Config 的 `useRouter` 保留），但 id 一律來自 prop。Task 6 的 shell 以 `<YearEndConfigView :cycle-id="cycleId" />` 等內嵌。

- [ ] **Step 1: 改三 view（同一模式）**

每個 view 頂層把 `const cycleId = Number(route.params.id)` 改為：
```ts
const props = defineProps<{ cycleId: number }>()
// cycleId 直接用 props.cycleId；若檔內大量引用區域 cycleId 變數，加一行別名維持最小 diff：
const cycleId = computed(() => props.cycleId)
```
⚠ 注意：若原檔把 `cycleId` 當**常數 number** 用在非 template 處（例如 `listYearEndSettlements(cycleId)`），改成 `computed` 會變 ref，呼叫處要 `.value`。**較安全的最小改法**：直接 `const cycleId = props.cycleId`（prop 在元件生命週期內不變，shell 不會動態改 id——切 cycle 是換路由/重新 mount），保持 `cycleId` 為 number 常數，全檔引用零改動。採此法。
- Config（:18-20）：刪 `const cycleId = Number(route.params.id)`，改 `const props = defineProps<{ cycleId: number }>()` + `const cycleId = props.cycleId`。`useRoute()` 若僅用於取 id 可移除；`useRouter()`（goToYearEndRules）保留。
- Grid（:51-52）：同上；Grid 無 useRouter，`useRoute` 移除。
- Detail（:45-47）：同上；`useRouter()`（router.back）暫時保留（Task 7 會處理 el-page-header 移除）。

- [ ] **Step 2: 修既有測試 mount 傳 prop**

三 view 的既有 spec（`YearEndDetailView.spec.ts` / `YearEndGridView.spec.ts` / `YearEndConfigView.spec.ts`）若原本靠 mock `vue-router` 的 `route.params.id` 提供 id，改為 mount 時 `props: { cycleId: <id> }`。定位：
```bash
grep -rn "params:\s*{\s*id\|route.params\|params: { id" src/views/yearEnd/__tests__/YearEnd{Detail,Grid,Config}View.spec.ts
```
逐檔把 id 來源改成 props。

- [ ] **Step 3: 驗證 + Commit**

```bash
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npx vitest run src/views/yearEnd/__tests__/YearEndDetailView.spec.ts src/views/yearEnd/__tests__/YearEndGridView.spec.ts src/views/yearEnd/__tests__/YearEndConfigView.spec.ts
git add src/views/yearEnd/YearEndConfigView.vue src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/
git commit -m "refactor(year-end): 三結算 view 改接 cycleId prop，供單一工作區內嵌重用

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/yearEnd/
```
Expected: typecheck 無新紅；三 view 測試綠。

---

### Task 6: FE `YearEndWorkspaceView` shell scaffold（左導軌 + 分步內容 + 路由/redirect）

**Files:**
- Create: `src/views/yearEnd/YearEndWorkspaceView.vue`
- Create: `src/views/yearEnd/workspaceSteps.ts`（步驟定義單一來源）
- Modify: `src/router/index.ts`（:339-342 三路由 → 單一工作區 + redirects）
- Create: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`

**Interfaces:**
- Consumes: Task 5 的三 view（prop cycleId）。
- Produces: 路由 `year-end/cycles/:id`（name `year-end-cycle-workspace`）→ WorkspaceView；`?step=config|grid|detail` 選步（預設 `detail`）。舊 `.../grid`、`.../config` 子路由改 redirect 到 `?step=`。

- [ ] **Step 1: 步驟定義**

`src/views/yearEnd/workspaceSteps.ts`：
```ts
/** 年終工作區左導軌步驟（單一來源，shell 與測試共用）。 */
export type WorkspaceStepKey = 'config' | 'grid' | 'detail'

export interface WorkspaceStep {
  key: WorkspaceStepKey
  label: string
  hint: string
}

export const WORKSPACE_STEPS: WorkspaceStep[] = [
  { key: 'config', label: '設定', hint: '招生目標與班級編制' },
  { key: 'grid', label: '試算 · 調整', hint: '總表試算與手動調整' },
  { key: 'detail', label: '簽核', hint: '結算明細與兩關簽核' },
]

export const DEFAULT_STEP: WorkspaceStepKey = 'detail'

export function normalizeStep(raw: unknown): WorkspaceStepKey {
  return raw === 'config' || raw === 'grid' || raw === 'detail' ? raw : DEFAULT_STEP
}
```

- [ ] **Step 2: 寫 shell 測試（先紅）**

`src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`（mock 三 view 為 stub、mock progress api、mock vue-router 提供 `route.params.id` 與 `route.query.step`；沿用同目錄 spec 的 mock 慣例）：
```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { normalizeStep, WORKSPACE_STEPS } from '../workspaceSteps'

describe('workspaceSteps', () => {
  it('三步定義齊全且順序為 config→grid→detail', () => {
    expect(WORKSPACE_STEPS.map((s) => s.key)).toEqual(['config', 'grid', 'detail'])
  })
  it('normalizeStep 對非法值回退 detail', () => {
    expect(normalizeStep('grid')).toBe('grid')
    expect(normalizeStep('xxx')).toBe('detail')
    expect(normalizeStep(undefined)).toBe('detail')
  })
})

// mount-level：預設 step、點導軌切換、右側只掛對應 view
const routeRef = { value: { params: { id: '9' }, query: {} as Record<string, unknown> } }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => routeRef.value,
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/api/yearEnd', () => ({
  getCycleProgress: vi.fn().mockResolvedValue({
    data: { cycle_status: 'OPEN', settings_complete: true, settings_missing_count: 0,
      settlement_count: 5, unmatched_count: 0, sign_counts: { DRAFT: 2, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 2, FINALIZED: 1 },
      pending_sign_count: 4, finalized_count: 1, total_count: 5, exception_count: 0 },
  }),
  updateCycleStatus: vi.fn(),
  listYearEndCycles: vi.fn().mockResolvedValue({ data: [{ id: 9, academic_year: 114, status: 'OPEN', bonus_calc_date: '2026-01-15' }] }),
}))

describe('YearEndWorkspaceView', () => {
  it('預設掛 detail 步、導軌顯示三步', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const YearEndWorkspaceView = (await import('../YearEndWorkspaceView.vue')).default
    const wrapper = mount(YearEndWorkspaceView, {
      global: { stubs: {
        YearEndConfigView: { template: '<div data-test="stub-config" />' },
        YearEndGridView: { template: '<div data-test="stub-grid" />' },
        YearEndDetailView: { template: '<div data-test="stub-detail" />' },
      } },
    })
    await new Promise((r) => setTimeout(r))
    expect(wrapper.find('[data-test="stub-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="stub-grid"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test^="rail-step-"]').length).toBe(3)
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
npx vitest run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: FAIL（元件不存在）。

- [ ] **Step 4: 實作 shell**

`src/views/yearEnd/YearEndWorkspaceView.vue`——**scaffold 版**（本 task 只做：讀 id、讀/寫 step query、左導軌靜態三步（可收合）、右側依 step v-if 掛對應 view。progress 數字填入與狀態機 toolbar 留給 Task 7）：

```vue
<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WORKSPACE_STEPS, normalizeStep, type WorkspaceStepKey } from './workspaceSteps'

const YearEndConfigView = defineAsyncComponent(() => import('./YearEndConfigView.vue'))
const YearEndGridView = defineAsyncComponent(() => import('./YearEndGridView.vue'))
const YearEndDetailView = defineAsyncComponent(() => import('./YearEndDetailView.vue'))

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const step = computed<WorkspaceStepKey>(() => normalizeStep(route.query.step))
function goStep(key: WorkspaceStepKey) {
  if (key === step.value) return
  router.replace({ query: { ...route.query, step: key } })
}

const RAIL_COLLAPSE_KEY = 'ye-workspace-rail-collapsed'
const collapsed = ref(localStorage.getItem(RAIL_COLLAPSE_KEY) === '1')
function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem(RAIL_COLLAPSE_KEY, collapsed.value ? '1' : '0')
}
</script>

<template>
  <div class="ye-workspace" :class="{ 'ye-workspace--collapsed': collapsed }">
    <nav class="ye-rail" aria-label="年終流程導軌">
      <button class="ye-rail__toggle" type="button" @click="toggleCollapse"
        :aria-label="collapsed ? '展開導軌' : '收合導軌'">{{ collapsed ? '»' : '«' }}</button>
      <ul class="ye-rail__steps">
        <li v-for="s in WORKSPACE_STEPS" :key="s.key">
          <button
            type="button"
            class="ye-rail__step"
            :class="{ 'is-active': step === s.key }"
            :data-test="`rail-step-${s.key}`"
            :aria-current="step === s.key ? 'step' : undefined"
            @click="goStep(s.key)"
          >
            <span class="ye-rail__label">{{ s.label }}</span>
            <span v-if="!collapsed" class="ye-rail__hint">{{ s.hint }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <section class="ye-workspace__body">
      <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
      <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
      <YearEndDetailView v-else :cycle-id="cycleId" />
    </section>
  </div>
</template>

<style scoped>
.ye-workspace { display: flex; gap: var(--space-4); align-items: flex-start; padding: var(--space-4); }
.ye-rail { flex: 0 0 200px; position: sticky; top: var(--space-4); }
.ye-workspace--collapsed .ye-rail { flex-basis: 56px; }
.ye-rail__toggle { border: none; background: transparent; cursor: pointer; color: var(--text-secondary); margin-bottom: var(--space-2); }
.ye-rail__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.ye-rail__step { width: 100%; text-align: left; border: none; background: transparent; cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border-left: 3px solid transparent; display: flex; flex-direction: column; gap: 2px; }
.ye-rail__step.is-active { background: var(--el-color-primary-light-9); border-left-color: var(--el-color-primary); }
.ye-rail__label { font-weight: 600; font-size: var(--text-sm); }
.ye-rail__hint { font-size: var(--text-xs); color: var(--text-secondary); }
.ye-workspace__body { flex: 1; min-width: 0; }
</style>
```

⚠ style token（`--radius-md`/`--space-1` 等）以 `src/assets/design-tokens.css` 實際存在者為準；不存在就用相近既有 token，勿臆造。

- [ ] **Step 5: 路由改動**

`src/router/index.ts`（:339-342 附近）：
- `year-end/cycles/:id`（原 Detail）改 component 為 `YearEndWorkspaceView`，name 改 `year-end-cycle-workspace`，meta.title `年終 › 結算工作區`。
- 原 `year-end/cycles/:id/grid` 與 `.../config` 兩子路由改為 **redirect** 到工作區帶 step：
```ts
{ path: 'year-end/cycles/:id/grid', redirect: (to) => ({ path: `/appraisal-year-end/year-end/cycles/${to.params.id}`, query: { step: 'grid' } }) },
{ path: 'year-end/cycles/:id/config', redirect: (to) => ({ path: `/appraisal-year-end/year-end/cycles/${to.params.id}`, query: { step: 'config' } }) },
```
（頂層 legacy `/year_end/cycles/:id/grid|config` 的 redirect :390-398 維持不動——它們指向上面兩個 nested 路徑，會再鏈式 redirect 到 workspace，無需改。）

- [ ] **Step 6: 跑測試確認通過 + Commit**

```bash
npx vitest run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts && npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
git add src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/workspaceSteps.ts src/router/index.ts src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
git commit -m "feat(year-end): 單一工作區 shell 骨架（左導軌三步＋step 路由＋收合），合併三路由

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/yearEnd/ src/router/index.ts
```
Expected: shell 測試綠、typecheck 無新紅。

---

### Task 7: FE 週期頭 + 狀態機 toolbar 上移 shell + 導軌數字

**Files:**
- Modify: `src/views/yearEnd/YearEndWorkspaceView.vue`（加週期頭 + 狀態機 toolbar + progress 數字）
- Modify: `src/views/yearEnd/YearEndDetailView.vue`（移除 el-page-header + 週期頭 meta + 狀態機 toolbar；保留三 tab 內容與簽核）
- Modify: `src/api/yearEnd.ts`（加 `getCycleProgress`）
- Modify: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts` / `YearEndDetailView.spec.ts`（斷言遷移）

**Interfaces:**
- Consumes: BE `getCycleProgress(cycleId)` → `CycleProgressOut`；Detail 既有 `updateCycleStatus`。
- Produces: shell 頭顯示 學年/狀態/基準日 + 鎖定/封存/退回開放 toolbar；左導軌每步顯示 progress 數字（config→缺漏數、grid→試算筆數/未匹配、detail→待簽核數）。

- [ ] **Step 1: codegen（本 task 先做，讓 progress 型別就緒）+ api wrapper**

先產型別（Task 4 已在 BE worktree 產出 openapi.json）：
```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npx openapi-typescript /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json -o src/api/_generated/schema.d.ts --alphabetize
git diff --stat src/api/_generated/schema.d.ts   # 應只新增 progress/class_targets_batch 型別；若移除既有 core 型別停下回報
```
`src/api/yearEnd.ts` 加：
```ts
export const getCycleProgress = (cycleId: number): AxiosResp<'/year_end/cycles/{cycle_id}/progress', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/progress`)
```

- [ ] **Step 2: 週期頭 + toolbar 上移**

從 `YearEndDetailView.vue` **剪下** el-page-header（:288）、週期 meta 區（:289-293，學年/基準日/狀態 tag）、LOCKED alert（:296）、狀態機 toolbar（:306-340 的鎖定/封存/退回開放 群組；**保留** SignProgressBar 與重新載入/匯出於 Detail 內或一併上移由實作判斷——狀態機三鈕與週期頭一定上移，SignProgressBar 留 Detail）。把這些**貼到** shell 的頭部區（導軌上方或 body 上方橫幅）。狀態機邏輯（`updateCycleStatus` + confirm 文案）一併搬到 shell；Detail 移除後對應 script（transitionStatus/lock/archive/reopen 等）搬 shell。
- Detail 移除 `useRouter`/`router.back`（el-page-header 已移除）。

- [ ] **Step 3: 導軌數字**

shell `onMounted` 抓 `getCycleProgress(cycleId)`，把數字掛到導軌各步（config 顯示「缺 N」badge 當 settings_missing_count>0、grid 顯示 settlement_count/unmatched、detail 顯示 pending_sign_count），並在頭部顯示 finalized_count/total_count 與 cycle_status。progress 抓取失敗走靜默降級（導軌不顯數字、不擋操作）。

- [ ] **Step 4: 測試遷移 + 補導軌數字斷言**

- `YearEndDetailView.spec.ts`：移除對 el-page-header/狀態機 toolbar 的斷言（那些已搬 shell）；保留三 tab 與簽核相關斷言。
- `YearEndWorkspaceView.spec.ts`：補「progress 到位後導軌顯示 pending_sign_count」與「狀態機 toolbar 存在（OPEN 顯示鎖定鈕）」斷言。

- [ ] **Step 5: 驗證 + Commit**

```bash
npx vitest run src/views/yearEnd && npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
git add src/views/yearEnd/ src/api/yearEnd.ts src/api/_generated/schema.d.ts
git commit -m "feat(year-end): 週期頭與狀態機 toolbar 上移工作區 shell，左導軌顯示各步進度數字

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/yearEnd/ src/api/yearEnd.ts src/api/_generated/schema.d.ts
```

---

### Task 8: FE 設定頁「全部儲存」（班級批次）+ api wrapper

**Files:**
- Modify: `src/api/yearEnd.ts`（加 `upsertClassTargetsBatch`）
- Modify: `src/views/yearEnd/YearEndConfigView.vue`（各班編制表加「全部儲存」）
- Modify: `src/views/yearEnd/__tests__/YearEndConfigView.spec.ts`

**Interfaces:**
- Consumes: BE `POST /cycles/{id}/class_targets/batch`。
- Produces: 設定頁各班編制表上方「全部儲存」鈕，收集所有列 `classEdits` 一次送出；逐列儲存保留。

- [ ] **Step 1: api wrapper**

```ts
export const upsertClassTargetsBatch = (cycleId: number, items: unknown[]) =>
  api.post(`/year_end/cycles/${cycleId}/class_targets/batch`, { items })
```

- [ ] **Step 2: 「全部儲存」**

`YearEndConfigView.vue` 各班編制 el-table 上方加「全部儲存」鈕（`canWrite` gate），點擊收集所有列的編輯值（既有 `classEdits` reactive）組成 items 陣列送 `upsertClassTargetsBatch`，成功後重載 `loadClassTargets`；失敗列以 ElMessage warning 列出（比照批次簽核失敗顯示：`failed` 逐筆 classroom_id + reason）。逐列「儲存此列」保留不動。

- [ ] **Step 3: 測試 + Commit**

`YearEndConfigView.spec.ts` 補「全部儲存呼叫 upsertClassTargetsBatch 帶所有列」測試（mock api、斷言呼叫參數）。
```bash
npx vitest run src/views/yearEnd/__tests__/YearEndConfigView.spec.ts && npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
git add src/api/yearEnd.ts src/views/yearEnd/YearEndConfigView.vue src/views/yearEnd/__tests__/YearEndConfigView.spec.ts
git commit -m "feat(year-end): 設定頁各班編制加全部儲存（批次端點），逐列儲存保留

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 9: FE 清單進度欄 + payout 頂層導覽入口 + codegen + 全套驗證

**Files:**
- Modify: `src/views/yearEnd/YearEndListView.vue`（加「進度」欄）
- Modify: `src/views/appraisalYearEnd/AppraisalYearEndLayout.vue`（SECTIONS 加 payout + activeKey 修正）
- Modify: `src/api/_generated/schema.d.ts`（codegen）

**Interfaces:**
- Consumes: `getCycleProgress`。
- Produces: 清單每列迷你進度（pending_sign_count / total_count + 下一步文字）；工作區頂層導覽多「發放」段。

- [ ] **Step 1: codegen 再確認（Task 7 已產一次，此處確認冪等無漂移）**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npx openapi-typescript /Users/yilunwu/Desktop/ivy-backend/.claude/worktrees/feat-yereject/openapi.json -o src/api/_generated/schema.d.ts --alphabetize
git diff --stat src/api/_generated/schema.d.ts   # Task 7 已 commit 過 schema.d.ts，此處應無新變更（或僅 class_targets_batch 若 Task 7 時尚未含）
```

- [ ] **Step 2: 清單進度欄**

`YearEndListView.vue` 表格加「進度」欄：載入清單後對每列（或僅 OPEN 週期）抓 `getCycleProgress`，顯示迷你進度條（finalized/total）+ 文字（例：「4/5 未核定」）。為避免 N 支請求，可只對 status==='OPEN' 的列抓、或加載入態逐列填。實作採「onMounted 後對每列並發抓 progress、各列各自 loading」，失敗該列顯「—」。

- [ ] **Step 3: payout 頂層導覽**

`AppraisalYearEndLayout.vue` SECTIONS 加一段：
```ts
{ key: 'payout', label: '發放', to: '/appraisal-year-end/year-end/payout',
  can: () => hasPermission('APPRAISAL_FINALIZE') },
```
並修 `activeKey`（現 `route.path.split('/')[2]`）：payout 路由 path 第 3 段是 `year-end`，會誤停「年終」。改為：若 `route.path` 以 `/appraisal-year-end/year-end/payout` 開頭 → activeKey='payout'，否則維持既有 split 邏輯。

- [ ] **Step 4: 全套驗證**

```bash
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard   # 應空
npm run lint 2>&1 | tail -5
npx vitest run src/views/yearEnd src/views/appraisalYearEnd
```
Expected: typecheck 無新紅、lint 乾淨、兩樹綠。

- [ ] **Step 5: Commit**

```bash
git add src/views/yearEnd/YearEndListView.vue src/views/appraisalYearEnd/AppraisalYearEndLayout.vue src/api/_generated/schema.d.ts
git commit -m "feat(year-end): 清單頁加進度欄、工作區頂層導覽補發放入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 10: 跨端收尾驗證

- [ ] **Step 1: FE 全套**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npm run typecheck 2>&1 | grep -iE "error TS" | grep -v IntegrationsHealthCard
npx vitest run src/views/yearEnd src/views/appraisalYearEnd src/views/appraisal
```
Expected: typecheck 無新紅；三樹綠。

- [ ] **Step 2: BE 全套 + migration 驗證**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -q 2>&1 | tail -3
~/Desktop/ivy-backend/.venv/bin/python scripts/validate_migrations.py
```
Expected: 全綠（僅 pre-existing `test_guo…`）；單一 head（本批次無新 migration，head 應仍為 yereject01）。

- [ ] **Step 3: 手動 smoke 清單（交控制端/user 實機）**

列出需實機驗證項：舊 `/grid`、`/config` 網址 redirect 到工作區對應 step；導軌三步切換右側內容正確；收合狀態記憶；週期頭狀態機 toolbar（鎖定/封存/退回開放）在 shell 可用；例外中心 deep_link 點擊落到工作區對應 step；清單進度欄；payout 導覽入口。

- [ ] **Step 4: 控制端回報兩分支最終 SHA，等 staging promotion（BE 先 FE 後）。**

## 非目標（本批次 2a 明確排除，屬 2b 或延後）

- grid 密度改版（摘要 6 欄 + 欄位開關 chips + 明細抽屜就地編輯）——2a 的 grid 步仍是現有 GridView 全欄表。屬 2b。
- provenance 正向獎金 key 擴充（BE）——2b。
- 導軌 5 步細分（試算/調整分離）——2a 合為「試算·調整」一步；2b grid 改版後可再細分。
- **顯式「開始試算」CTA + 移除 GridView auto-build 副作用**（spec §4.1）——耦合 GridView 內部行為（`initGrid` 進頁 auto-build），2a 保留 GridView 不改內部，故此項隨 grid 改版一起做，歸 2b。
- **例外「前往處理」新分頁開啟 / 處理後返回例外中心動線**（spec §4.4）——2a 只更新 deep_link 目標路徑（Task 3），返回動線 UX 屬例外中心 view 的獨立小改，延後（可併 2b 或單獨小批）。
