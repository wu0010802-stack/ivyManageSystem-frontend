# 考核與年終 批次 1「止血與導引」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉年終簽核死路（單筆退回端點）、批次失敗黑箱、誤導級 UI（raw enum／過時預設／LOCKED 語意），並為總覽工作台加上「下一步」主卡引導。

**Architecture:** BE 新增一支 reject 端點（比照考核模組既有 reject 模式：unlocked read 守衛 → with_for_update mutation → append-only log）＋一支 enum migration；FE 全部為既有元件的行為修正與一個新純函式 `deriveNextStep` + 新元件 `WorkbenchNextStepCard`。狀態機與計算引擎不動。

**Tech Stack:** FastAPI + SQLAlchemy + Alembic（BE）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（FE）。

**Spec:** `docs/superpowers/specs/2026-07-20-appraisal-yearend-taskflow-uiux-design.md` §3

## Global Constraints

- 一律繁體中文（commit message、docstring、UI 文案）；Conventional Commits；一個 commit 一件事。
- **工作位置**：FE 在既有 worktree `~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow`（分支 `feat/appraisal-yearend-taskflow-uiux`）；BE 在 Task 1 新開 worktree `~/Desktop/ivy-backend/.claude/worktrees/feat-yereject`（分支 `feat/yearend-settlement-reject`）。**嚴禁在共用 checkout 切分支**。
- FE TS-only：禁 `: any`／`as any`；新測試放對應 `__tests__/`。
- BE 針對性跑測試加 `-o addopts=""` 關 coverage；測試必掛自建 SQLite fixture（見 Task 2 範本），否則會打 dev PG。
- BE worktree 無自己的 venv，用主 repo `.venv`：`cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject && ../../.venv/bin/python -m pytest …`（或 `~/Desktop/ivy-backend/.venv/bin/python`）。
- 新 migration：slug 先 `grep -r "yereject01" alembic/` 防撞名；完成後跑 `python scripts/validate_migrations.py`；**必須更新 head pin 測試**（`grep -rn "heads_contains" tests/` 找到該測試改 pin）。
- BE 改 router/schema 後：`cd ~/Desktop/ivy-backend && python scripts/dump_openapi.py`（在主 repo 跑，⚠ worktree 內 codegen 路徑不通——先把 BE worktree 分支的變更 merge 或直接在 worktree 跑 `python scripts/dump_openapi.py` 產出到主 repo 的 `openapi.json` 路徑；實測若 dump 腳本輸出相對路徑，需在 worktree 根跑並手動複製 `openapi.json` 到 `~/Desktop/ivy-backend/openapi.json`）→ FE `npm run gen:api` → 只 commit `schema.d.ts`。
- **push 順序 BE 先、FE 後**（否則 FE openapi-drift CI 誤紅）；本計畫只到「分支完成＋驗證綠」，staging promotion 由控制端另行執行。

---

### Task 1: BE migration — `YearEndSettlementLogAction` 增加 REJECT

**Files:**
- Modify: `~/Desktop/ivy-backend/models/year_end.py:67-74`（enum 增值）
- Create: `~/Desktop/ivy-backend/alembic/versions/yereject01_add_reject_settlement_log_action.py`
- Modify: head pin 測試（以 `grep -rn "heads_contains" ~/Desktop/ivy-backend/tests/` 定位）

**Interfaces:**
- Produces: `YearEndSettlementLogAction.REJECT`（Task 2 端點寫 log 用）；alembic head 變為 `yereject01`。

- [ ] **Step 1: 開 BE worktree**

```bash
git -C ~/Desktop/ivy-backend worktree add .claude/worktrees/feat-yereject -b feat/yearend-settlement-reject
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
grep -rn "yereject01" alembic/ || echo "slug 未撞名，可用"
```

- [ ] **Step 2: model enum 增值**

在 `models/year_end.py` 的 `YearEndSettlementLogAction`（現有 BUILD/MANUAL_PATCH/SIGN_SUPERVISOR/SIGN_ACCOUNTING/FINALIZE）加：

```python
    REJECT = "REJECT"
```

- [ ] **Step 3: 查當前 alembic head**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/alembic heads
```
Expected: 單一 head（若出現多 head，先停下回報，勿自行 merge）。記下 head id 填入 Step 4 的 `down_revision`。

- [ ] **Step 4: 寫 migration**

`alembic/versions/yereject01_add_reject_settlement_log_action.py`：

```python
"""year_end_settlement_log_action_enum 增加 REJECT 值

Revision ID: yereject01
Revises: <Step 3 查得的 head>
Create Date: 2026-07-20
"""
from alembic import op

revision = "yereject01"
down_revision = "<Step 3 查得的 head>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PG 12+ 允許在交易內 ADD VALUE；新值本 migration 內不使用，無同交易使用限制。
    # SQLite（測試）走 create_all，enum 值由 model 定義帶入，此處僅 PG 生效。
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TYPE year_end_settlement_log_action_enum "
            "ADD VALUE IF NOT EXISTS 'REJECT'"
        )


def downgrade() -> None:
    # PG 無法移除 enum 值；REJECT 軌跡屬 append-only 歷史，不可回收。刻意 no-op。
    pass
```

- [ ] **Step 5: 更新 head pin 測試並驗證**

```bash
grep -rn "heads_contains" ~/Desktop/ivy-backend/tests/
# 打開該測試，把 pin 的 head 名改為 "yereject01"
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python scripts/validate_migrations.py
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "heads_contains or migration" -o addopts="" -q
```
Expected: validate 無雙 head；pin 測試 PASS。

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
git add models/year_end.py alembic/versions/yereject01_add_reject_settlement_log_action.py tests/
git commit -m "feat(year-end): settlement log action 增加 REJECT（migration yereject01）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- models/year_end.py alembic/ tests/
```

---

### Task 2: BE reject 端點（TDD）

**Files:**
- Modify: `~/Desktop/ivy-backend/schemas/year_end.py`（`SettlementBatchSignRequest` 附近，約 :155）
- Modify: `~/Desktop/ivy-backend/api/year_end/settlements.py`（檔尾新增）
- Create: `~/Desktop/ivy-backend/tests/test_year_end_settlement_reject.py`

**Interfaces:**
- Consumes: Task 1 的 `YearEndSettlementLogAction.REJECT`。
- Produces: `POST /year_end/settlements/{settlement_id}/reject`，body `{"reason": str}`，回 `SettlementOut`。權限：入口 `YEAR_END_READ`＋依當前狀態二次驗（SUPERVISOR_SIGNED→`YEAR_END_REVIEW`／ACCOUNTING_SIGNED→`YEAR_END_ACCOUNTING`／FINALIZED→`YEAR_END_FINALIZE`）。FE Task 4 依此接線。

- [ ] **Step 1: 寫失敗測試**

`tests/test_year_end_settlement_reject.py`（fixture 形狀完全比照 `tests/test_year_end_batch_sign.py:38-120`）：

```python
"""年終結算單筆退回：POST /settlements/{id}/reject。

已簽核任一狀態 → DRAFT，清除對應簽核欄位；寫 REJECT log（含 reason）；
LOCKED/CLOSED 週期拒絕；FINALIZED 退回需 YEAR_END_FINALIZE 並失效財務快取。
"""

from __future__ import annotations

import os
import sys
from datetime import date
from decimal import Decimal
from unittest.mock import patch

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
    YearEndSettlementLog,
    YearEndSettlementLogAction,
    YearEndSettlementStatus,
)
from utils.auth import hash_password


@pytest.fixture
def client_with_db(tmp_path):
    db_path = tmp_path / "year-end-reject.sqlite"
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


def _add_user(sf, username, perms, *, employee_id=None, role="admin"):
    with sf() as s:
        s.add(
            User(
                username=username,
                password_hash=hash_password("TempPass123"),
                role=role,
                permission_names=perms,
                employee_id=employee_id,
                is_active=True,
            )
        )
        s.commit()


def _seed_settlement(
    sf,
    *,
    status=YearEndSettlementStatus.ACCOUNTING_SIGNED,
    cycle_status=YearEndCycleStatus.OPEN,
    accounting_signed_by=None,
):
    with sf() as s:
        cycle = YearEndCycle(
            academic_year=114,
            start_date=date(2025, 8, 1),
            end_date=date(2026, 7, 31),
            bonus_calc_date=date(2026, 1, 15),
            status=cycle_status,
        )
        s.add(cycle)
        s.flush()
        emp = Employee(employee_id="E_R0", name="退回測試員", is_active=True)
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
        st = YearEndSettlement(
            year_end_cycle_id=cycle.id,
            employee_id=emp.id,
            snapshot_id=snap.id,
            payable_amount=Decimal("10000"),
            special_bonus_total=Decimal("0"),
            total_amount=Decimal("10000"),
            status=status,
            accounting_signed_by=accounting_signed_by,
        )
        s.add(st)
        s.commit()
        return st.id, emp.id


def test_reject_accounting_signed_back_to_draft_clears_fields_and_logs(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf, accounting_signed_by=999)
    _add_user(sf, "acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"])
    _login(client, "acct")
    res = client.post(
        f"/api/year_end/settlements/{sid}/reject", json={"reason": "金額有誤需重算"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "DRAFT"
    with sf() as s:
        st = s.get(YearEndSettlement, sid)
        assert st.accounting_signed_by is None
        assert st.accounting_signed_at is None
        log = (
            s.query(YearEndSettlementLog)
            .filter_by(settlement_id=sid, action=YearEndSettlementLogAction.REJECT)
            .one()
        )
        assert log.reason == "金額有誤需重算"
        assert log.from_status == YearEndSettlementStatus.ACCOUNTING_SIGNED
        assert log.to_status == YearEndSettlementStatus.DRAFT


def test_reject_draft_returns_400(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf, status=YearEndSettlementStatus.DRAFT)
    _add_user(sf, "acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"])
    _login(client, "acct")
    res = client.post(f"/api/year_end/settlements/{sid}/reject", json={"reason": "x"})
    assert res.status_code == 400


def test_reject_finalized_requires_finalize_permission(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf, status=YearEndSettlementStatus.FINALIZED)
    _add_user(sf, "acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"])
    _login(client, "acct")
    res = client.post(f"/api/year_end/settlements/{sid}/reject", json={"reason": "x"})
    assert res.status_code == 403


def test_reject_finalized_with_permission_invalidates_finance_cache(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf, status=YearEndSettlementStatus.FINALIZED)
    _add_user(sf, "boss", ["YEAR_END_READ", "YEAR_END_FINALIZE"])
    _login(client, "boss")
    with patch(
        "api.year_end.settlements.invalidate_finance_summary_cache"
    ) as mock_inv:
        res = client.post(
            f"/api/year_end/settlements/{sid}/reject", json={"reason": "核定後發現錯誤"}
        )
    assert res.status_code == 200, res.text
    mock_inv.assert_called_once()
    with sf() as s:
        st = s.get(YearEndSettlement, sid)
        assert st.finalized_by is None and st.finalized_at is None


def test_reject_blocked_when_cycle_locked(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf, cycle_status=YearEndCycleStatus.LOCKED)
    _add_user(sf, "acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"])
    _login(client, "acct")
    res = client.post(f"/api/year_end/settlements/{sid}/reject", json={"reason": "x"})
    assert res.status_code == 400


def test_reject_self_settlement_forbidden(client_with_db):
    client, sf = client_with_db
    sid, emp_id = _seed_settlement(sf)
    _add_user(
        sf, "self_acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"], employee_id=emp_id
    )
    _login(client, "self_acct")
    res = client.post(f"/api/year_end/settlements/{sid}/reject", json={"reason": "x"})
    assert res.status_code == 403


def test_reject_reason_required(client_with_db):
    client, sf = client_with_db
    sid, _ = _seed_settlement(sf)
    _add_user(sf, "acct", ["YEAR_END_READ", "YEAR_END_ACCOUNTING"])
    _login(client, "acct")
    res = client.post(f"/api/year_end/settlements/{sid}/reject", json={"reason": ""})
    assert res.status_code == 422
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_settlement_reject.py -o addopts="" -q
```
Expected: 全部 FAIL（404 Not Found — 端點不存在）。

- [ ] **Step 3: 加 schema**

`schemas/year_end.py`（`SettlementBatchSignRequest` 上方）：

```python
class SettlementRejectRequest(BaseModel):
    """單筆退回草稿；原因必填（寫入 settlement log 供稽核）。"""

    reason: str = Field(min_length=1, max_length=500)
```

（確認檔頭已 `from pydantic import BaseModel, Field`，缺 `Field` 就補。）

- [ ] **Step 4: 實作端點**

`api/year_end/settlements.py` 檔尾新增（import 區補 `SettlementRejectRequest`）：

```python
# ===== 單筆退回（批次 1「止血」：修「簽核後手改被 409 擋、卻無退路」死路）=====


def _resolve_settlement_reject_permission(
    status: YearEndSettlementStatus,
) -> Permission:
    """依當前 status 決定退回需要的 Permission（對齊考核 _resolve_reject_permission）。"""
    if status == YearEndSettlementStatus.SUPERVISOR_SIGNED:
        return Permission.YEAR_END_REVIEW
    if status == YearEndSettlementStatus.ACCOUNTING_SIGNED:
        return Permission.YEAR_END_ACCOUNTING
    return Permission.YEAR_END_FINALIZE


@router.post("/settlements/{settlement_id}/reject", response_model=SettlementOut)
def reject_settlement(
    settlement_id: int,
    payload: SettlementRejectRequest,
    current_user: dict = Depends(require_staff_permission(Permission.YEAR_END_READ)),
    session: Session = Depends(get_session_dep),
):
    """退回草稿：任一已簽核狀態 → DRAFT，清除全部簽核欄位。

    與簽核不同，退回是「重開計算輸入」的入口，因此 LOCKED（結構凍結）與
    CLOSED 一律拒絕（不走 allow_when_locked）。先 unlocked read 做守衛，
    通過後才 with_for_update mutation（見 appraisal reject 同模式註解）。
    """
    s = session.get(YearEndSettlement, settlement_id)
    if s is None:
        raise HTTPException(404)
    cycle = session.get(YearEndCycle, s.year_end_cycle_id)
    if cycle is not None:
        assert_cycle_writable(cycle)

    from utils.permissions import has_permission

    def _assert_rejectable(st: YearEndSettlement) -> None:
        if st.status == YearEndSettlementStatus.DRAFT:
            raise HTTPException(400, "DRAFT 狀態無需退回")
        required = _resolve_settlement_reject_permission(st.status)
        if not has_permission(current_user.get("permission_names"), required):
            raise HTTPException(403, f"權限不足，需要 {required.name}")

    _assert_rejectable(s)

    s = (
        session.query(YearEndSettlement)
        .filter(YearEndSettlement.id == settlement_id)
        .with_for_update()
        .first()
    )
    if s is None:
        raise HTTPException(404)
    # 取鎖後重驗（unlocked read 與取鎖之間狀態可能被並發簽核改變）
    _assert_rejectable(s)
    assert_not_self_approval(current_user, s.employee_id, doc_label="年終獎金結算")

    from_status = s.status
    was_finalized = from_status == YearEndSettlementStatus.FINALIZED
    s.status = YearEndSettlementStatus.DRAFT
    s.supervisor_signed_by = None
    s.supervisor_signed_at = None
    s.accounting_signed_by = None
    s.accounting_signed_at = None
    s.finalized_by = None
    s.finalized_at = None
    write_settlement_log(
        session,
        s,
        YearEndSettlementLogAction.REJECT,
        actor_user_id=current_user.get("user_id"),
        actor_role=current_user.get("role"),
        from_status=from_status,
        to_status=s.status,
        reason=payload.reason,
    )
    session.commit()
    session.refresh(s)
    if was_finalized:
        # FINALIZED 計入現金收支/收支彙總（見 finalize_settlement 註解）；
        # 退回等同自報表移除，須同步失效快取。
        invalidate_finance_summary_cache()
    return _settlement_out(s, _employee_name_or_fallback(session, s.employee_id))
```

- [ ] **Step 5: 跑測試確認通過**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_year_end_settlement_reject.py -o addopts="" -q
```
Expected: 7 passed。

- [ ] **Step 6: 跑年終相關全量測試（回歸）**

```bash
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -k "year_end" -o addopts="" -q
```
Expected: 全綠（既有紅先查該檔 git log 歸屬，勿假設是自己弄壞）。

- [ ] **Step 7: Commit**

```bash
git add schemas/year_end.py api/year_end/settlements.py tests/test_year_end_settlement_reject.py
git commit -m "feat(year-end): 結算單筆退回端點（已簽核→DRAFT，修簽核後死路）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- schemas/year_end.py api/year_end/settlements.py tests/test_year_end_settlement_reject.py
```

---

### Task 3: BE 收尾 + OpenAPI 產出

**Files:**
- 無新檔；產出 `~/Desktop/ivy-backend/openapi.json`（local-only，不 commit）

**Interfaces:**
- Produces: 含 `/year_end/settlements/{settlement_id}/reject` 的 openapi.json，供 Task 4 FE codegen。

- [ ] **Step 1: BE 全套測試**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -q 2>&1 | tail -5
```
Expected: 全綠（或僅 pre-existing 紅——逐筆以 `git log <測試檔>` 確認歸屬非本分支）。

- [ ] **Step 2: 產 openapi.json**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python scripts/dump_openapi.py
# dump 輸出若落在 worktree 根，複製到主 repo 給 FE codegen 用：
cp openapi.json ~/Desktop/ivy-backend/openapi.json 2>/dev/null || true
grep -c "reject" ~/Desktop/ivy-backend/openapi.json
```
Expected: grep 計數 ≥ 1（新端點已入 openapi.json）。

---

### Task 4: FE 退回接線（api wrapper + 明細頁退回 UI + grid 409 提示）

**Files:**
- Modify: `src/api/yearEnd.ts`（:61 `finalizeSettlement` 附近）
- Modify: `src/views/yearEnd/YearEndDetailView.vue`（簽核欄 :357-377、`sign()` 附近）
- Modify: `src/views/yearEnd/YearEndGridView.vue`（`submitEdit` catch :297-300）
- Create: `src/views/yearEnd/__tests__/YearEndDetailView.reject.spec.ts`
- Modify: `src/api/_generated/schema.d.ts`（codegen 產物）

**Interfaces:**
- Consumes: Task 3 的 openapi.json；`rejectSettlement(settlementId: number, reason: string)`。
- Produces: 明細頁每列「退回」按鈕＋原因 dialog；grid 409 導引文案。

- [ ] **Step 1: codegen**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npm run gen:api && npm run gen:api:check
git add src/api/_generated/schema.d.ts
```
Expected: check 通過；diff 只新增 reject 路徑（若出現「移除既有型別」立即停下——代表 BE 未同步，見 openapi-sync skill）。

- [ ] **Step 2: api wrapper**

`src/api/yearEnd.ts` 在 `finalizeSettlement` 後加：

```ts
export const rejectSettlement = (settlementId: number, reason: string) =>
  api.post(`/year_end/settlements/${settlementId}/reject`, { reason })
```

- [ ] **Step 3: 寫失敗測試（元件行為）**

`src/views/yearEnd/__tests__/YearEndDetailView.reject.spec.ts`（mock 形狀必抄真實契約——`rejectSettlement` 回 `SettlementOut`；沿用同目錄既有 spec 的 mount/stub 慣例）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rejectableStages } from '../settlementReject'

describe('rejectableStages（退回按鈕權限矩陣，鏡射 BE _resolve_settlement_reject_permission）', () => {
  it('SUPERVISOR_SIGNED 需要 YEAR_END_REVIEW', () => {
    expect(rejectableStages['SUPERVISOR_SIGNED']).toBe('YEAR_END_REVIEW')
  })
  it('ACCOUNTING_SIGNED 需要 YEAR_END_ACCOUNTING', () => {
    expect(rejectableStages['ACCOUNTING_SIGNED']).toBe('YEAR_END_ACCOUNTING')
  })
  it('FINALIZED 需要 YEAR_END_FINALIZE', () => {
    expect(rejectableStages['FINALIZED']).toBe('YEAR_END_FINALIZE')
  })
  it('DRAFT 不可退回', () => {
    expect(rejectableStages['DRAFT']).toBeUndefined()
  })
})
```

- [ ] **Step 4: 實作**

新增 `src/views/yearEnd/settlementReject.ts`（單一來源，元件與測試共用）：

```ts
/** 退回按鈕權限矩陣：status → 所需權限（鏡射 BE _resolve_settlement_reject_permission）。 */
export const rejectableStages: Record<string, string> = {
  SUPERVISOR_SIGNED: 'YEAR_END_REVIEW',
  ACCOUNTING_SIGNED: 'YEAR_END_ACCOUNTING',
  FINALIZED: 'YEAR_END_FINALIZE',
}
```

`YearEndDetailView.vue` script 區新增：

```ts
import { rejectSettlement } from '@/api/yearEnd'
import { rejectableStages } from './settlementReject'

const rejectDialog = ref(false)
const rejectTarget = ref<Settlement | null>(null)
const rejectReason = ref('')

function canReject(row: { status: string }): boolean {
  const perm = rejectableStages[row.status]
  return !!perm && hasPermission(perm) && cycleStatus.value === 'OPEN'
}

function openReject(row: Settlement) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectDialog.value = true
}

async function submitReject() {
  if (!rejectTarget.value || !rejectReason.value.trim()) return
  busy.value = true
  try {
    await rejectSettlement(rejectTarget.value.id, rejectReason.value.trim())
    ElMessage.success('已退回草稿，可重新手動調整或試算')
    rejectDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '退回失敗'))
  } finally {
    busy.value = false
  }
}
```

（`cycleStatus` 為該 view 既有的週期狀態 ref；若命名不同，以檔內實際名稱為準對齊。）

簽核欄 template（:357-377）在「已核定」tag 後補退回按鈕，並讓 FINALIZED 列也保留操作空間：

```html
<el-button
  v-if="canReject(row)"
  size="small"
  type="warning"
  plain
  @click="openReject(row)"
>退回</el-button>
```

dialog（template 尾端、既有 dialog 附近）：

```html
<el-dialog v-model="rejectDialog" title="退回草稿" width="480px">
  <el-alert
    v-if="rejectTarget?.status === 'FINALIZED'"
    type="warning" :closable="false" show-icon
    title="此筆已核定：退回後將自財務報表移除，需重新完成簽核與核定。"
    style="margin-bottom: 12px"
  />
  <el-form label-width="80px">
    <el-form-item label="員工">{{ rejectTarget?.employee_name }}</el-form-item>
    <el-form-item label="原因" required>
      <el-input v-model="rejectReason" type="textarea" :rows="3"
        placeholder="退回原因（必填，寫入簽核軌跡）" maxlength="500" show-word-limit />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="rejectDialog = false">取消</el-button>
    <el-button type="warning" :loading="busy" :disabled="!rejectReason.trim()"
      @click="submitReject">確認退回</el-button>
  </template>
</el-dialog>
```

`YearEndGridView.vue` `submitEdit` 的 catch（:297-300）改為：

```ts
  } catch (e) {
    ElMessage.error(
      apiError(e, '更新失敗：僅草稿狀態可手動調整；已簽核者請先到「結算明細」將該筆退回草稿')
    )
  }
```

（檔頭補 `import { apiError } from '@/utils/error'`，已存在則略。）

- [ ] **Step 5: 跑測試與 typecheck**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npx vitest run src/views/yearEnd/__tests__/YearEndDetailView.reject.spec.ts
npm run typecheck
```
Expected: 測試 PASS；typecheck 0 error（IntegrationsHealthCard 的 11 個 pre-existing 紅除外，屬平行分支）。

- [ ] **Step 6: Commit**

```bash
git add src/api/yearEnd.ts src/api/_generated/schema.d.ts src/views/yearEnd/settlementReject.ts src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndDetailView.reject.spec.ts
git commit -m "feat(year-end): 結算明細補單筆退回（含原因與 FINALIZED 警示），grid 409 導引退回動線

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 5: FE 批次簽核失敗明細透傳

**Files:**
- Modify: `src/views/yearEnd/YearEndDetailView.vue`（`signBatch` :171-196）
- Create: `src/views/yearEnd/__tests__/batchFailureList.spec.ts`

**Interfaces:**
- Consumes: 後端批次 response 既有 `failed: [{settlement_id, reason}]`；本 view 既有 `settlements` rows（含 `employee_name`）。
- Produces: `formatBatchFailures(failed, rows): string[]`（純函式，放 `src/views/yearEnd/settlementReject.ts` 同檔）。

- [ ] **Step 1: 寫失敗測試**

`src/views/yearEnd/__tests__/batchFailureList.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { formatBatchFailures } from '../settlementReject'

describe('formatBatchFailures', () => {
  const rows = [
    { id: 1, employee_name: '王小明' },
    { id: 2, employee_name: '李美華' },
  ]
  it('把 settlement_id 映射成姓名並帶原因', () => {
    const out = formatBatchFailures(
      [{ settlement_id: 2, reason: '會計簽核人需與主管簽核人為不同人（職責分離）' }],
      rows,
    )
    expect(out).toEqual(['李美華：會計簽核人需與主管簽核人為不同人（職責分離）'])
  })
  it('rows 找不到時退回顯示編號', () => {
    const out = formatBatchFailures([{ settlement_id: 99, reason: '找不到結算單' }], rows)
    expect(out).toEqual(['結算單 #99：找不到結算單'])
  })
})
```

- [ ] **Step 2: 實作**

`src/views/yearEnd/settlementReject.ts` 追加：

```ts
export interface BatchFailedItem {
  settlement_id: number
  reason: string
}

/** 批次簽核 failed 明細 → 「姓名：原因」清單（後端已回傳明細，前端不再只給計數）。 */
export function formatBatchFailures(
  failed: BatchFailedItem[],
  rows: Array<{ id: number; employee_name?: string }>,
): string[] {
  const nameById = new Map(rows.map((r) => [r.id, r.employee_name]))
  return failed.map((f) => {
    const name = nameById.get(f.settlement_id)
    return `${name ?? `結算單 #${f.settlement_id}`}：${f.reason}`
  })
}
```

`YearEndDetailView.vue`：script 加 `const batchFailures = ref<string[]>([])`；`signBatch` 成功分支改為：

```ts
    const done = data?.succeeded_count ?? 0
    const failedItems = data?.failed ?? []
    batchFailures.value = formatBatchFailures(failedItems, settlements.value)
    if (failedItems.length) {
      ElMessage.warning(`完成 ${done} 筆，${failedItems.length} 筆未處理（明細見下方清單）`)
    } else {
      ElMessage.success(`已完成 ${done} 筆`)
    }
```

（`settlements` 為本 view 既有結算列 ref；命名不同則以檔內實際為準。）template 批次工具列（:301-306）下方加：

```html
<el-alert
  v-if="batchFailures.length"
  type="warning"
  :closable="true"
  show-icon
  title="以下結算單未完成批次簽核"
  style="margin: 8px 0"
  @close="batchFailures = []"
>
  <ul style="margin: 4px 0 0; padding-left: 18px">
    <li v-for="line in batchFailures" :key="line">{{ line }}</li>
  </ul>
</el-alert>
```

- [ ] **Step 3: 跑測試 + Commit**

```bash
npx vitest run src/views/yearEnd/__tests__/batchFailureList.spec.ts && npm run typecheck
git add src/views/yearEnd/settlementReject.ts src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/batchFailureList.spec.ts
git commit -m "fix(year-end): 批次簽核失敗改列出逐筆姓名與原因（原僅計數）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 6: FE 術語／翻譯修復

**Files:**
- Modify: `src/constants/appraisalYearEnd.ts`（hoist `ROLE_GROUP_LABEL`）
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue:291`、`src/views/appraisal/AggregatedStatusDetailDialog.vue:28`（改 import）
- Modify: `src/views/appraisal/components/ListView.vue:89-90`
- Modify: `src/views/appraisal/components/RejectDialog.vue:90`
- Modify: `src/views/appraisal/components/RuleEditorDialog.vue:60-65`

**Interfaces:**
- Produces: `ROLE_GROUP_LABEL` 由 `@/constants/appraisalYearEnd` 匯出（單一來源）。

- [ ] **Step 1: hoist ROLE_GROUP_LABEL**

把 `CurrentSemesterOverview.vue:291` 的 `ROLE_GROUP_LABEL` 物件整個搬到 `src/constants/appraisalYearEnd.ts` export；`CurrentSemesterOverview.vue` 與 `AggregatedStatusDetailDialog.vue` 刪本地定義改 `import { ROLE_GROUP_LABEL } from '@/constants/appraisalYearEnd'`。搬移時保留原物件內容逐字不動。

- [ ] **Step 2: ListView 姓名與角色群翻譯**

`ListView.vue:89-90` 兩欄改為：

```html
<el-table-column label="員工" width="120">
  <template #default="{ row }">{{ row.employee_name ?? `員工 ${row.employee_id}` }}</template>
</el-table-column>
<el-table-column label="角色群" width="140">
  <template #default="{ row }">{{ ROLE_GROUP_LABEL[row.role_group ?? ''] || row.role_group }}</template>
</el-table-column>
```

script 補 `import { ROLE_GROUP_LABEL } from '@/constants/appraisalYearEnd'`。

- [ ] **Step 3: RejectDialog 狀態中文化**

`RejectDialog.vue:90` `{{ summary?.status }}` 改：

```html
<el-tag>{{ statusLabel(summary?.status ?? '') }}</el-tag>
```

script 補 `import { statusLabel } from '@/constants/appraisalYearEnd'`（該 helper 已存在於 constants :68 一帶；若實際命名不同以 constants 檔內為準）。

- [ ] **Step 4: RuleEditorDialog rule_type 白話**

`RuleEditorDialog.vue:60-65` 下拉選項後加說明區（選項 label 去掉英文括號，僅保留中文）：

```html
<div class="rule-type-hint">
  <template v-if="form.rule_type === 'PER_UNIT'">每發生 1 次扣固定分。例：遲到 1 次扣 0.5 分。</template>
  <template v-else-if="form.rule_type === 'TIER'">依數值落在哪個區間給對應分數。例：留校率 90–95% 扣 1 分、低於 90% 扣 2 分。</template>
  <template v-else-if="form.rule_type === 'FLAT_THRESHOLD'">超過（或低於）單一門檻時一次性加減分。</template>
  <template v-else-if="form.rule_type === 'DISCIPLINARY_TIERED'">依懲處（嘉獎/申誡/記過…）分級對應分值，功過相抵。</template>
</div>
```

style 加 `.rule-type-hint { font-size: var(--text-sm); color: var(--text-secondary); margin: 4px 0 8px; }`。

- [ ] **Step 5: 驗證 + Commit**

```bash
npm run typecheck && npx vitest run src/views/appraisal
git add src/constants/appraisalYearEnd.ts src/views/appraisal/
git commit -m "fix(appraisal): raw enum 全面中文化（員工姓名/角色群/退簽狀態/規則型別白話）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```
Expected: appraisal 測試樹全綠（既有 spec 若斷言舊欄位標籤「員工 ID」，同 commit 內更新斷言）。

---

### Task 7: FE 動態預設 + 權限前置

**Files:**
- Modify: `src/views/appraisal/CycleListView.vue:35-47`
- Modify: `src/views/yearEnd/YearEndListView.vue:33-56, 118, 123-129`

**Interfaces:**
- Consumes: `useAcademicTermStore`（`school_year: number`（民國學年）、`semester: number`（1/2））；`hasPermission`。

- [ ] **Step 1: CycleListView 動態預設**

`CycleListView.vue` script：

```ts
import { useAcademicTermStore } from '@/stores/academicTerm'

const term = useAcademicTermStore()
const west = term.school_year + 1911 // 學年起始西元年

const form = ref({
  academic_year: term.school_year,
  semester: (term.semester === 2 ? 'SECOND' : 'FIRST') as 'FIRST' | 'SECOND',
  enrollment_target: null as number | null,
  enrollment_actual: null as number | null,
})

// 匯入日期預設依學期推算（僅供修改的建議值；基準日對齊 9/15、3/15 口徑）
const importForm = ref({
  file: null as UploadRawFile | null,
  start_date: term.semester === 2 ? `${west + 1}-02-01` : `${west}-08-01`,
  end_date: term.semester === 2 ? `${west + 1}-07-31` : `${west + 1}-01-31`,
  base_score_calc_date: term.semester === 2 ? `${west + 1}-03-15` : `${west}-09-15`,
})
```

送出時 `enrollment_target` 為 null 傳 `0`（維持既有 API 契約）：submit payload 用 `{ ...form.value, enrollment_target: form.value.enrollment_target ?? 0 }`，並在該欄位加 placeholder「可稍後於規則設定→學年目標人數補填」。

- [ ] **Step 2: YearEndListView 動態預設**

`YearEndListView.vue`：刪 `form` 的寫死初值，改 `openCreate()` 開窗時計算（並把 `@click="createDialog = true"` 改 `@click="openCreate"`）：

```ts
import { useAcademicTermStore } from '@/stores/academicTerm'

const term = useAcademicTermStore()

function openCreate() {
  const y = term.school_year
  const west = y + 1911
  form.value = {
    academic_year: y,
    start_date: `${west}-08-01`,
    end_date: `${west + 1}-07-31`,
    bonus_calc_date: `${west + 1}-01-15`,
  }
  createDialog.value = true
}
```

匯入 dialog 的 `start_date/end_date/bonus_calc_date` 同公式預設；`org_rate_first: 83.6`／`org_rate_second: 91.5`／`enrollment_target: 160` 三個歷史魔數改 `null`（欄位 placeholder：「留空＝沿用系統自動值」；送出時 null 欄位不帶入 payload）。

- [ ] **Step 3: 權限前置**

`YearEndListView.vue` template：

```html
<el-tooltip content="需要年終核定權限" :disabled="canCreate">
  <span>
    <el-button type="primary" :icon="Plus" :disabled="!canCreate" @click="openCreate">新增年度週期</el-button>
  </span>
</el-tooltip>
```

script 加：

```ts
import { hasPermission } from '@/utils/auth'
const canCreate = hasPermission('YEAR_END_FINALIZE')
const canImport = hasPermission('YEAR_END_WRITE')
```

「例外匯入 Excel」dropdown item 加 `v-if="canImport"`；`canImport` 為 false 時整個「更多操作」dropdown 一併 `v-if` 隱藏（現在只有一個 item）。

- [ ] **Step 4: 驗證 + Commit**

```bash
npm run typecheck && npx vitest run src/views/yearEnd src/views/appraisal
git add src/views/appraisal/CycleListView.vue src/views/yearEnd/YearEndListView.vue
git commit -m "fix(appraisal-yearend): 建週期/匯入預設依當前學年動態推算；無權限按鈕前置擋下

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 8: FE LOCKED 語意明示 + grid 金額位數統一

**Files:**
- Modify: `src/views/yearEnd/YearEndDetailView.vue`（header meta 區）
- Modify: `src/views/yearEnd/YearEndGridView.vue`（:171-182 `expandFields`、頂部 banner）

- [ ] **Step 1: DetailView LOCKED banner**

header meta（頂部週期資訊區）加：

```html
<el-alert
  v-if="cycleStatus === 'LOCKED'"
  type="info" :closable="false" show-icon
  title="週期已鎖定：僅可簽核與核定；不可再試算、手動調整或修改設定。"
  style="margin-bottom: 12px"
/>
```

- [ ] **Step 2: GridView 非 OPEN 提示**

grid 頂部（試算摘要列附近）加：

```html
<el-alert
  v-if="cycleStatus && cycleStatus !== 'OPEN'"
  type="info" :closable="false" show-icon
  :title="`週期${cycleStatus === 'LOCKED' ? '已鎖定' : '已封存'}：本頁為最後一次試算結果，開啟頁面不會重新試算。`"
  style="margin-bottom: 8px"
/>
```

（`cycleStatus` 為 GridView 既有 ref，`initGrid` 內已取得。）

- [ ] **Step 3: 金額位數統一**

`expandFields`（:171-182）三處 `formatCurrency(...)` 改 `moneyInt(...)`（主列既有格式），讓同筆金額主列/展開列一致：

```ts
function expandFields(row: GridRow): ExpandField[] {
  const fields: ExpandField[] = [
    { label: '主結算', value: moneyInt(row.payable_amount) },
  ]
  for (const col of bonusColumns.value) {
    fields.push({ label: col.label, value: moneyInt(row.special_bonuses[col.key] ?? 0) })
  }
  fields.push({ label: '合計', value: moneyInt(row.total_amount) })
  fields.push({ label: '狀態', value: (SIGN_STATUS_LABEL as Record<string, string>)[row.status] ?? row.status })
  fields.push({ label: '備註', value: row.remark || '—' })
  return fields
}
```

- [ ] **Step 4: 驗證 + Commit**

```bash
npm run typecheck && npx vitest run src/views/yearEnd
git add src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/YearEndGridView.vue
git commit -m "fix(year-end): LOCKED 語意明示於明細/總表；展開列金額格式對齊主列

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 9: FE `deriveNextStep` 純函式（TDD）

**Files:**
- Create: `src/views/appraisalYearEnd/nextStep.ts`
- Create: `src/views/appraisalYearEnd/__tests__/nextStep.spec.ts`

**Interfaces:**
- Produces: `deriveNextStep(stats: WorkbenchStats): NextStep | null`；Task 10 的 `WorkbenchNextStepCard` 呼叫。`null` = 資訊未到齊（呼叫端顯示 skeleton）。

- [ ] **Step 1: 寫失敗測試**

`src/views/appraisalYearEnd/__tests__/nextStep.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { deriveNextStep, type WorkbenchStats } from '../nextStep'

const base: WorkbenchStats = {
  appraisalCycle: { id: 1, label: '115 學年上學期', status: 'OPEN' },
  yearEndCycle: { id: 9, label: '114 學年度', status: 'OPEN' },
  blockingExceptions: 0,
  yearEndPendingSign: 0,
  appraisalPendingSign: 0,
  payoutReadyCount: 0,
}

describe('deriveNextStep 優先序', () => {
  it('任一統計未到齊（undefined）回 null', () => {
    expect(deriveNextStep({ ...base, blockingExceptions: undefined })).toBeNull()
  })
  it('阻斷例外最優先', () => {
    const s = deriveNextStep({ ...base, blockingExceptions: 2, yearEndPendingSign: 5 })
    expect(s?.key).toBe('exceptions')
    expect(s?.to).toBe('/appraisal-year-end/exceptions')
  })
  it('年終待簽（週期 OPEN）優於考核待簽', () => {
    const s = deriveNextStep({ ...base, yearEndPendingSign: 5, appraisalPendingSign: 3 })
    expect(s?.key).toBe('year-end-sign')
    expect(s?.to).toBe('/appraisal-year-end/year-end/cycles/9')
  })
  it('年終週期非 OPEN 時年終待簽不觸發，落到考核待簽', () => {
    const s = deriveNextStep({
      ...base,
      yearEndCycle: { id: 9, label: '114 學年度', status: 'LOCKED' },
      yearEndPendingSign: 5,
      appraisalPendingSign: 3,
    })
    expect(s?.key).toBe('appraisal-sign')
  })
  it('可發放次於簽核', () => {
    const s = deriveNextStep({ ...base, payoutReadyCount: 4 })
    expect(s?.key).toBe('payout')
  })
  it('缺考核週期時引導建立', () => {
    const s = deriveNextStep({ ...base, appraisalCycle: null })
    expect(s?.key).toBe('create-appraisal')
  })
  it('全部完成回 done', () => {
    expect(deriveNextStep(base)?.key).toBe('done')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/views/appraisalYearEnd/__tests__/nextStep.spec.ts
```
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

`src/views/appraisalYearEnd/nextStep.ts`：

```ts
/**
 * 總覽工作台「下一步」推導（純函式，供 WorkbenchNextStepCard 與測試共用）。
 * 優先序（spec §3.3）：阻斷例外 > 年終待簽（OPEN）> 考核待簽 > 可發放 > 建立缺失週期 > 全部完成。
 * 任一統計 undefined = 尚在載入 → 回 null，呼叫端顯示 skeleton。
 */
export interface CycleHandle {
  id: number
  label: string
  status: string
}

export interface WorkbenchStats {
  appraisalCycle: CycleHandle | null
  yearEndCycle: CycleHandle | null
  blockingExceptions: number | undefined
  yearEndPendingSign: number | undefined
  appraisalPendingSign: number | undefined
  payoutReadyCount: number | undefined
}

export interface NextStep {
  key:
    | 'exceptions'
    | 'year-end-sign'
    | 'appraisal-sign'
    | 'payout'
    | 'create-appraisal'
    | 'create-year-end'
    | 'done'
  title: string
  reason: string
  ctaLabel: string
  to: string
}

export function deriveNextStep(stats: WorkbenchStats): NextStep | null {
  const {
    appraisalCycle,
    yearEndCycle,
    blockingExceptions,
    yearEndPendingSign,
    appraisalPendingSign,
    payoutReadyCount,
  } = stats
  if (
    blockingExceptions === undefined ||
    yearEndPendingSign === undefined ||
    appraisalPendingSign === undefined ||
    payoutReadyCount === undefined
  ) {
    return null
  }
  if (blockingExceptions > 0) {
    return {
      key: 'exceptions',
      title: `處理 ${blockingExceptions} 筆阻斷級例外`,
      reason: '阻斷級例外會讓試算與簽核出錯，建議最先處理。',
      ctaLabel: '前往例外中心',
      to: '/appraisal-year-end/exceptions',
    }
  }
  if (yearEndCycle?.status === 'OPEN' && yearEndPendingSign > 0) {
    return {
      key: 'year-end-sign',
      title: `年終結算還有 ${yearEndPendingSign} 筆未核定`,
      reason: `${yearEndCycle.label}結算進行中，完成兩關簽核後才能鎖定發放。`,
      ctaLabel: '前往結算明細',
      to: `/appraisal-year-end/year-end/cycles/${yearEndCycle.id}`,
    }
  }
  if (appraisalCycle && appraisalPendingSign > 0) {
    return {
      key: 'appraisal-sign',
      title: `考核還有 ${appraisalPendingSign} 筆未核定`,
      reason: `${appraisalCycle.label}簽核進行中。`,
      ctaLabel: '前往簽核',
      to: `/appraisal-year-end/appraisal/history?cycle=${appraisalCycle.id}&view=kanban`,
    }
  }
  if (payoutReadyCount > 0) {
    return {
      key: 'payout',
      title: `${payoutReadyCount} 筆考核年終可發放`,
      reason: '簽核已完成，可產生轉帳資料。',
      ctaLabel: '前往發放',
      to: '/appraisal-year-end/year-end/payout',
    }
  }
  if (!appraisalCycle) {
    return {
      key: 'create-appraisal',
      title: '建立本學期考核週期',
      reason: '本學期尚未建立考核週期，建立後才能開始評分與簽核。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/appraisal',
    }
  }
  if (!yearEndCycle) {
    return {
      key: 'create-year-end',
      title: '建立年終結算週期',
      reason: '尚未建立年終週期；年底結算前建立即可。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/year-end',
    }
  }
  return {
    key: 'done',
    title: '目前沒有待辦',
    reason: '簽核、例外與發放皆已處理完畢。',
    ctaLabel: '',
    to: '',
  }
}
```

- [ ] **Step 4: 跑測試確認通過 + Commit**

```bash
npx vitest run src/views/appraisalYearEnd/__tests__/nextStep.spec.ts && npm run typecheck
git add src/views/appraisalYearEnd/nextStep.ts src/views/appraisalYearEnd/__tests__/nextStep.spec.ts
git commit -m "feat(workbench): 下一步推導純函式 deriveNextStep（阻斷例外>年終簽>考核簽>發放>建週期）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```

---

### Task 10: FE 工作台改版（主卡 + 固定卡序 + 副標 + 空狀態）

**Files:**
- Create: `src/views/appraisalYearEnd/components/WorkbenchNextStepCard.vue`
- Modify: `src/views/appraisalYearEnd/OverviewWorkbenchView.vue`
- Modify: `src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue`（emit stats + 空狀態連結 + 副標）
- Modify: `src/views/appraisalYearEnd/components/WorkbenchYearEndCard.vue`（emit stats + 副標 + 待簽核文案）
- Modify: `src/views/appraisalYearEnd/components/WorkbenchExceptionsCard.vue`（emit stats + 副標）
- Modify: `src/views/appraisalYearEnd/components/WorkbenchPayoutCard.vue`（emit stats + 真空狀態 + 副標）
- Test: `src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.nextstep.spec.ts`

**Interfaces:**
- Consumes: Task 9 `deriveNextStep` / `WorkbenchStats` / `NextStep`。
- Produces: 各卡 `defineEmits<{ stats: [n: number]; 'stats-error': [] }>()`——emit 一個數字：考核卡＝未核定筆數、年終卡＝未核定筆數、例外卡＝blocking 筆數、發放卡＝可發放筆數；`stats-error` 表示載入失敗（父層以 0 計並在主卡顯示註記）。

- [ ] **Step 1: 各卡 emit stats**

四張卡同一模式，以年終卡為例（`WorkbenchYearEndCard.vue`）：

```ts
const emit = defineEmits<{ stats: [n: number]; 'stats-error': [] }>()

async function load() {
  if (!props.cycle) {
    emit('stats', 0)
    return
  }
  loading.value = true
  error.value = ''
  try {
    const rows = (await getYearEndGrid(props.cycle.id)).data
    const acc: Record<string, number> = {}
    for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1
    counts.value = acc
    pendingCount.value = rows.filter((r) => r.status !== 'FINALIZED').length
    emit('stats', pendingCount.value)
  } catch (e) {
    error.value = apiError(e, '載入失敗')
    emit('stats-error')
  } finally {
    loading.value = false
  }
}
```

- 考核卡：emit 其簽核統計中非 FINALIZED 總數（依該卡既有 counts 結構計算）。
- 例外卡：`emit('stats', severityCounts.value.blocking ?? 0)`（成功時），props 兩把手皆 null 時 emit 0。
- 發放卡：emit 預覽列數。

- [ ] **Step 2: 副標與文案**

各卡 header title 下加副標（`<p class="wb-card__subtitle">`，style：`font-size: var(--text-xs); color: var(--text-secondary); margin: 2px 0 0;`）：
- 考核卡「本學期教師考核與簽核進度」
- 年終卡「年度結算與兩關簽核」＋「待簽核 N」改「尚未核定 {{ pendingCount }} 筆（含草稿與簽核中，進度條為各階段分布）」
- 例外卡「試算與簽核前需要處理的資料缺口」
- 發放卡「考核年終獎金 E 化轉帳」

- [ ] **Step 3: 空狀態行動連結**

- `WorkbenchAppraisalCard.vue` 空狀態（`el-empty「本學期尚未建立考核週期」`）內加：

```html
<router-link class="wb-card__cta" to="/appraisal-year-end/appraisal">前往建立 →</router-link>
```

- `WorkbenchPayoutCard.vue`：`count === 0` 時改渲染：

```html
<el-empty description="本年度尚無可發放的考核年終" :image-size="48" />
```

（不再顯示「可發放 0 筆、合計 NT$0」與 CTA。）

- [ ] **Step 4: 父層組裝主卡**

`WorkbenchNextStepCard.vue`：

```html
<script setup lang="ts">
import type { NextStep } from '../nextStep'

defineProps<{ step: NextStep | null; partialError: boolean }>()
</script>

<template>
  <el-card shadow="never" class="wb-next" data-test="next-step-card">
    <el-skeleton v-if="!step" :rows="1" animated />
    <template v-else>
      <div class="wb-next__row">
        <div>
          <p class="wb-next__title">
            <template v-if="step.key === 'done'">✓ {{ step.title }}</template>
            <template v-else>下一步：{{ step.title }}</template>
          </p>
          <p class="wb-next__reason">{{ step.reason }}</p>
          <p v-if="partialError" class="wb-next__warn">部分卡片載入失敗，建議內容可能不完整。</p>
        </div>
        <router-link v-if="step.to" :to="step.to">
          <el-button type="primary">{{ step.ctaLabel }}</el-button>
        </router-link>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.wb-next { border-left: 4px solid var(--el-color-primary); }
.wb-next__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.wb-next__title { font-weight: 600; font-size: var(--text-base); margin: 0; }
.wb-next__reason { font-size: var(--text-sm); color: var(--text-secondary); margin: 4px 0 0; }
.wb-next__warn { font-size: var(--text-xs); color: var(--el-color-warning); margin: 4px 0 0; }
</style>
```

`OverviewWorkbenchView.vue`：

```ts
import { deriveNextStep, type WorkbenchStats } from './nextStep'
import WorkbenchNextStepCard from './components/WorkbenchNextStepCard.vue'

// 固定卡序（原依年終 OPEN 動態換位——破壞空間記憶，移除）
const CARD_ORDER = ['appraisal', 'year-end', 'exceptions', 'payout'] as const

const cardStats = ref<{
  appraisal: number | undefined
  yearEnd: number | undefined
  exceptions: number | undefined
  payout: number | undefined
}>({ appraisal: undefined, yearEnd: undefined, exceptions: undefined, payout: undefined })
const statsErrors = ref(new Set<string>())

function onStats(key: 'appraisal' | 'yearEnd' | 'exceptions' | 'payout', n: number) {
  cardStats.value = { ...cardStats.value, [key]: n }
}
function onStatsError(key: 'appraisal' | 'yearEnd' | 'exceptions' | 'payout') {
  statsErrors.value = new Set(statsErrors.value).add(key)
  onStats(key, 0) // 失敗以 0 計，主卡顯示 partialError 註記
}

const nextStep = computed(() =>
  deriveNextStep({
    appraisalCycle: appraisalCycle.value,
    yearEndCycle: yearEndCycle.value,
    blockingExceptions: cardStats.value.exceptions,
    yearEndPendingSign: cardStats.value.yearEnd,
    appraisalPendingSign: cardStats.value.appraisal,
    payoutReadyCount: cardStats.value.payout,
  }),
)
```

template：主卡放 grid 上方全寬；`cardOrder` 換 `CARD_ORDER`；各卡掛 `@stats="(n) => onStats('yearEnd', n)" @stats-error="onStatsError('yearEnd')"`（各卡對應各 key）。根把手錯誤卡的分支也視為該卡 stats-error（在 `loadHandles` 的 rejected 分支呼叫 `onStatsError('appraisal')`／`onStatsError('yearEnd')`）。

```html
<WorkbenchNextStepCard :step="nextStep" :partial-error="statsErrors.size > 0" class="wb-next-slot" />
```

style：`.wb-next-slot { grid-column: 1 / -1; }`。

- [ ] **Step 5: 元件測試**

`src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.nextstep.spec.ts`（mount 慣例沿用同目錄既有 spec；mock 四卡子元件為 stub、由測試直接 emit）：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OverviewWorkbenchView from '../OverviewWorkbenchView.vue'

// mock 兩支把手 API（沿用既有 spec 的 vi.mock 寫法與回傳形狀）
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn().mockResolvedValue({
    data: { id: 1, academic_year: 115, semester: 'FIRST', status: 'OPEN' },
  }),
}))
vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn().mockResolvedValue({
    data: [{ id: 9, academic_year: 114, status: 'OPEN' }],
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

describe('OverviewWorkbenchView 下一步主卡', () => {
  it('卡片 stats 到齊後主卡依優先序顯示年終待簽', async () => {
    const wrapper = mount(OverviewWorkbenchView, {
      global: {
        stubs: {
          WorkbenchAppraisalCard: true,
          WorkbenchYearEndCard: true,
          WorkbenchExceptionsCard: true,
          WorkbenchPayoutCard: true,
        },
      },
    })
    await new Promise((r) => setTimeout(r))
    wrapper.findComponent({ name: 'WorkbenchAppraisalCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchYearEndCard' }).vm.$emit('stats', 5)
    wrapper.findComponent({ name: 'WorkbenchExceptionsCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchPayoutCard' }).vm.$emit('stats', 0)
    await wrapper.vm.$nextTick()
    const card = wrapper.find('[data-test="next-step-card"]')
    expect(card.text()).toContain('年終結算還有 5 筆未核定')
  })
})
```

- [ ] **Step 6: 跑測試 + Commit**

```bash
npx vitest run src/views/appraisalYearEnd && npm run typecheck
git add src/views/appraisalYearEnd/
git commit -m "feat(workbench): 下一步主卡＋固定卡序＋各卡副標與空狀態行動連結

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/
```
Expected: appraisalYearEnd 測試樹全綠（既有 spec 若斷言動態卡序，同 commit 更新為固定卡序）。

---

### Task 11: 跨端收尾驗證

**Files:** 無新檔。

- [ ] **Step 1: FE 全套驗證**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
npm run typecheck && npm run lint && npx vitest run
npm run gen:api:check
```
Expected: typecheck/lint 乾淨（pre-existing IntegrationsHealthCard 紅除外）；三棵樹綠；drift check 通過。

- [ ] **Step 2: BE 全套驗證**

```bash
cd ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject
~/Desktop/ivy-backend/.venv/bin/python -m pytest tests/ -q 2>&1 | tail -3
~/Desktop/ivy-backend/.venv/bin/python scripts/validate_migrations.py
```
Expected: 全綠＋單一 head。

- [ ] **Step 3: 金流終審（reject 端點屬金流路徑）**

派 `finance-correctness-reviewer` agent 審 BE 分支 diff（`git -C ~/Desktop/ivy-backend/.claude/worktrees/feat-yereject diff main...HEAD`），確認：退回清欄位完整、FINALIZED 退回快取失效、log Σ 軌跡完整。P0/P1 需修完才算完成。

- [ ] **Step 4: 控制端回報**

回報兩分支最終 SHA 與驗證結果，等候 staging promotion 指示（push 順序 BE 先、FE 後）。
