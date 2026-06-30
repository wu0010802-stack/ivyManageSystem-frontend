# 中央待審工作台批次核准/駁回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓中央審核工作台的請假/加班/補打卡三類待審皆可多選後批次核准/駁回，並補一個與 leaves/overtimes 同模式的補打卡 batch-approve 後端端點。

**Architecture:** 後端抽 `_apply_correction_decision` 共用函式（單筆與 batch 共用核准/駁回副作用），新增兩階段原子 `POST /punch-corrections/batch-approve`；前端在 `WorkbenchApprovalsView` 對三類各 new 一次既有 `useApprovalModule`，加 selection 欄 + 批次動作列 + 複用 `LeaveBatchRejectDialog`。

**Tech Stack:** FastAPI + SQLAlchemy + pytest（SQLite test client）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（happy-dom）。

**Spec:** `docs/superpowers/specs/2026-06-17-workbench-batch-approval-design.md`

---

## 前置：worktree 與分支

兩 repo 各開 worktree（**off `origin/main`**）。建立前先驗證我要動的檔在 origin/main 與 local main 內容相同（無差異才安全用 origin/main 為 base）：
```bash
git -C /Users/yilunwu/Desktop/ivy-backend diff --stat origin/main..main -- api/punch_corrections.py
git -C /Users/yilunwu/Desktop/ivy-frontend diff --stat origin/main..main -- src/views/workbench/WorkbenchApprovalsView.vue src/api/punchCorrections.ts
```
（空 = 安全。）分支：BE `feat/workbench-batch-approval-2026-06-17-be`、FE `feat/workbench-batch-approval-2026-06-17-fe`。後端 worktree 慣例 `.claude/worktrees/`、前端 `.worktrees/`。子代理一律 `git -C <worktree>`、開頭 `branch --show-current` 驗證。BE 測試用 `/Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest`。FE node_modules 可 symlink 主 checkout。

## File Structure

**後端（修改，BE worktree）**
- `api/punch_corrections.py` — ① 抽 `_apply_correction_decision` 共用函式、單筆端點改呼叫它 ② 新增 `PunchCorrectionBatchApproveRequest` + `batch_approve_punch_corrections` 端點 + `_batch_approve_limiter`。
- `tests/test_punch_correction_batch_approve.py`（新）— batch 端點 pytest。

**前端（修改，FE worktree）**
- `src/api/punchCorrections.ts` — 加 `batchApproveCorrections`。
- `src/views/workbench/WorkbenchApprovalsView.vue` — 三類接 `useApprovalModule` + selection 欄 + 批次列 + reject dialog。
- `src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`（新）— 批次互動 vitest。

無 migration、不動 `schema.d.ts`（batch api 走 `api.post` 直連不引型別）。

---

## Task 1: 後端抽 `_apply_correction_decision` 共用函式（重構，現有測試守護）

**Files:**
- Modify: `api/punch_corrections.py`（單筆 `approve_punch_correction` 在 124-386）
- Guard tests: `tests/test_punch_correction.py`、`tests/test_punch_correction_approve_recompute.py`、`tests/test_punch_correction_self_approve_guard.py`

這是純重構：把單筆端點「驗證通過後」的副作用搬進共用函式，端點改呼叫它。現有測試是守護網。

- [ ] **Step 1: 跑現有測試建立綠基線**

Run: `cd <BE worktree> && /Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_punch_correction.py tests/test_punch_correction_approve_recompute.py tests/test_punch_correction_self_approve_guard.py -q`
Expected: PASS（全綠；記住通過數）。

- [ ] **Step 2: 新增共用函式 `_apply_correction_decision`**

在 `api/punch_corrections.py` 的單筆端點函式**之前**，新增模組層函式。內容＝把單筆端點目前「**駁回分支副作用**（設 status=REJECTED / rejection_reason.strip() / approved_by → `_write_approval_log(action="rejected", comment=...)` → `dispatch.enqueue(event_type="punch_correction.rejected", ...)`，即原 **~182-223**；**不含** 179-181 的 `if not body.rejection_reason... raise 422`——該檢查移到 caller）」與「**核准分支**（`acquire_salary_lock` → `assert_months_not_finalized` + `collect_months_from_dates` → 取/建 `Attendance` → 依 `correction_type` 寫 punch 時間 → 跨夜 `+timedelta(days=1)` / 相同時刻 raise 400 → `apply_attendance_status` → set status=APPROVED / approved_by → `_write_approval_log(action="approved")` → `mark_salary_stale` → `dispatch.enqueue(event_type="punch_correction.approved", ...)`，即原 **~236-368**）」**原封不動搬進此函式**，**不含** `session.commit()` / `logger.warning` / `return` / try-except-finally（那些留在端點）。簽名：
```python
def _apply_correction_decision(
    session,
    correction,
    *,
    approved: bool,
    rejection_reason: str | None,
    current_user: dict,
) -> None:
    """套用單筆補打卡核准/駁回的副作用（不 commit）。單筆端點與 batch 端點共用，
    確保考勤寫入 / 薪資 stale / ApprovalLog / 通知邏輯不漂移。
    assumes caller 已驗證：correction 存在且為 pending、非自我核准、approver 有資格、
    （駁回時）rejection_reason 非空。核准分支可能 raise HTTPException(400)（跨夜後上下班同時刻）
    或 assert_months_not_finalized 的封存例外，由 caller 決定如何處理。"""
    # ↓↓↓ 搬入：原 178-223 的駁回副作用 與 236-368 的核准副作用 ↓↓↓
```
保留所有 lazy import（`from services.notification import dispatch`、`from utils.advisory_lock import acquire_salary_lock`、`from utils.attendance_calc import apply_attendance_status`、`from services.salary.utils import mark_salary_stale`）在函式內原位。`correction_id` 改用 `correction.id`。

- [ ] **Step 3: 單筆端點改呼叫共用函式**

把 `approve_punch_correction` 內「駁回/核准兩大分支的副作用」整段，替換為：先保留前面的驗證（404 / 已審 400 / 自我核准 403 / 資格 403），再加駁回原因檢查與呼叫：
```python
        if not body.approved and not (body.rejection_reason or "").strip():
            raise HTTPException(status_code=422, detail="駁回時必須填寫駁回原因")

        _apply_correction_decision(
            session,
            correction,
            approved=body.approved,
            rejection_reason=body.rejection_reason,
            current_user=current_user,
        )
        session.commit()
        logger.warning(
            "補打卡申請 #%d（員工 %d，日期 %s）已由 %s %s",
            correction.id,
            correction.employee_id,
            correction.attendance_date,
            current_user.get("username"),
            "核准" if body.approved else "駁回",
        )
        return {"message": "補打卡申請已核准，考勤記錄已更新" if body.approved else "補打卡申請已駁回"}
```
（`except HTTPException: raise` / `except Exception: session.rollback(); raise_safe_500(e)` / `finally: session.close()` 維持不動。）

- [ ] **Step 4: 跑守護測試確認重構無回歸**

Run: `cd <BE worktree> && /Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_punch_correction.py tests/test_punch_correction_approve_recompute.py tests/test_punch_correction_self_approve_guard.py -q`
Expected: PASS（與 Step 1 同通過數；訊息 "已核准" / "已駁回" 措辭若被測試精確比對，對齊原字串——原核准回 "補打卡申請已核准，考勤記錄已更新"、駁回回 "補打卡申請已駁回"，本步已保留原措辭）。

- [ ] **Step 5: Commit**

```bash
git -C <BE worktree> add api/punch_corrections.py
git -C <BE worktree> commit -m "refactor(punch-corrections): 抽 _apply_correction_decision 共用核准/駁回副作用"
```

---

## Task 2: 後端 `POST /punch-corrections/batch-approve`

**Files:**
- Modify: `api/punch_corrections.py`
- Test: `tests/test_punch_correction_batch_approve.py`（新）

- [ ] **Step 1: 寫失敗測試 `tests/test_punch_correction_batch_approve.py`**

沿用 `tests/test_punch_correction_approve_recompute.py` 的 fixture/helper 慣例（`punch_client`、`_make_employee`、`_make_user`、`ApprovalPolicy(doc_type="punch_correction", submitter_role="teacher", approver_roles="supervisor,admin")`、`_login`、密碼 `Passw0rd!`、approver role=`supervisor` 帶 `["APPROVALS","ATTENDANCE_READ"]` 且自帶不同 employee）。本檔自建相同 fixture（複製該檔的 fixture/helper 區，或 import）：
```python
def test_batch_approve_updates_attendance_and_marks_succeeded(punch_client):
    client, sf = punch_client
    with sf() as s:
        emp = _make_employee(s, employee_id="T001", name="教師甲")
        sup_emp = _make_employee(s, employee_id="S001", name="主管")
        _make_user(s, username="t1", role="teacher", permission_names=["ATTENDANCE_READ"], employee_id=emp.id)
        _make_user(s, username="sup_ok", role="supervisor", permission_names=["APPROVALS", "ATTENDANCE_READ"], employee_id=sup_emp.id)
        s.add(ApprovalPolicy(doc_type="punch_correction", submitter_role="teacher", approver_roles="supervisor,admin", is_active=True))
        on_date = date(2026, 5, 6)
        c1 = PunchCorrectionRequest(employee_id=emp.id, attendance_date=on_date, correction_type="punch_in",
                                    requested_punch_in=datetime(2026, 5, 6, 8, 0), reason="忘刷", status="pending")
        c2 = PunchCorrectionRequest(employee_id=emp.id, attendance_date=date(2026, 5, 7), correction_type="punch_in",
                                    requested_punch_in=datetime(2026, 5, 7, 8, 0), reason="忘刷", status="pending")
        s.add_all([c1, c2]); s.commit(); ids = [c1.id, c2.id]
    assert _login(client, "sup_ok").status_code == 200
    res = client.post("/api/punch-corrections/batch-approve", json={"ids": ids, "approved": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert sorted(body["succeeded"]) == sorted(ids)
    assert body["failed"] == []
    with sf() as s:
        atts = s.query(Attendance).filter(Attendance.employee_id == _emp_id(s, "T001")).all()
        assert len(atts) == 2
        for a in atts:
            assert a.punch_in_time is not None
        corrs = s.query(PunchCorrectionRequest).filter(PunchCorrectionRequest.id.in_(ids)).all()
        assert all(c.status == "approved" for c in corrs)


def test_batch_approve_partial_self_approval_goes_to_failed(punch_client):
    client, sf = punch_client
    with sf() as s:
        emp = _make_employee(s, employee_id="T001", name="教師甲")
        sup_emp = _make_employee(s, employee_id="S001", name="主管")
        _make_user(s, username="t1", role="teacher", permission_names=["ATTENDANCE_READ"], employee_id=emp.id)
        _make_user(s, username="sup_ok", role="supervisor", permission_names=["APPROVALS", "ATTENDANCE_READ"], employee_id=sup_emp.id)
        s.add(ApprovalPolicy(doc_type="punch_correction", submitter_role="teacher", approver_roles="supervisor,admin", is_active=True))
        s.add(ApprovalPolicy(doc_type="punch_correction", submitter_role="supervisor", approver_roles="admin", is_active=True))
        good = PunchCorrectionRequest(employee_id=emp.id, attendance_date=date(2026, 5, 6), correction_type="punch_in",
                                      requested_punch_in=datetime(2026, 5, 6, 8, 0), reason="x", status="pending")
        self_corr = PunchCorrectionRequest(employee_id=sup_emp.id, attendance_date=date(2026, 5, 6), correction_type="punch_in",
                                           requested_punch_in=datetime(2026, 5, 6, 8, 0), reason="x", status="pending")
        s.add_all([good, self_corr]); s.commit(); good_id, self_id = good.id, self_corr.id
    assert _login(client, "sup_ok").status_code == 200
    res = client.post("/api/punch-corrections/batch-approve", json={"ids": [good_id, self_id], "approved": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["succeeded"] == [good_id]
    assert len(body["failed"]) == 1 and body["failed"][0]["id"] == self_id
    with sf() as s:
        assert s.query(PunchCorrectionRequest).get(good_id).status == "approved"
        assert s.query(PunchCorrectionRequest).get(self_id).status == "pending"


def test_batch_reject_requires_reason(punch_client):
    client, sf = punch_client
    with sf() as s:
        emp = _make_employee(s, employee_id="T001", name="教師甲")
        sup_emp = _make_employee(s, employee_id="S001", name="主管")
        _make_user(s, username="t1", role="teacher", permission_names=["ATTENDANCE_READ"], employee_id=emp.id)
        _make_user(s, username="sup_ok", role="supervisor", permission_names=["APPROVALS", "ATTENDANCE_READ"], employee_id=sup_emp.id)
        s.add(ApprovalPolicy(doc_type="punch_correction", submitter_role="teacher", approver_roles="supervisor,admin", is_active=True))
        c = PunchCorrectionRequest(employee_id=emp.id, attendance_date=date(2026, 5, 6), correction_type="punch_in",
                                   requested_punch_in=datetime(2026, 5, 6, 8, 0), reason="x", status="pending")
        s.add(c); s.commit(); cid = c.id
    assert _login(client, "sup_ok").status_code == 200
    bad = client.post("/api/punch-corrections/batch-approve", json={"ids": [cid], "approved": False, "rejection_reason": "   "})
    assert bad.status_code == 400
    ok = client.post("/api/punch-corrections/batch-approve", json={"ids": [cid], "approved": False, "rejection_reason": "時間不符"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["succeeded"] == [cid]
    with sf() as s:
        assert s.query(PunchCorrectionRequest).get(cid).status == "rejected"
```
小工具（放測試檔內）：`def _emp_id(s, code): return s.query(Employee).filter(Employee.employee_id == code).first().id`。imports 對齊範本檔（`date`/`datetime` from datetime；`Attendance`/`Employee`/`PunchCorrectionRequest`/`ApprovalPolicy`/`User` from models.database）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd <BE worktree> && /Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_punch_correction_batch_approve.py -v`
Expected: FAIL — 404（端點不存在）。

- [ ] **Step 3: 新增 schema、limiter、端點**

`api/punch_corrections.py`：檔頭加 import（若缺）`from typing import List`、`from fastapi import Request`、`from utils.rate_limit import create_limiter`、`from utils.approval_helpers import _check_approval_eligibility, _get_submitter_role`（部分已 import，補齊）。在 `ApproveRequest` class 後加：
```python
class PunchCorrectionBatchApproveRequest(BaseModel):
    ids: List[int]
    approved: bool
    rejection_reason: Optional[str] = None


_batch_approve_limiter = create_limiter(
    max_calls=10,
    window_seconds=60,
    name="punch_correction_batch_approve",
    error_detail="批次審核操作過於頻繁，請稍後再試",
).as_dependency()
```
在單筆端點後新增 batch 端點：
```python
@router.post("/punch-corrections/batch-approve")
def batch_approve_punch_corrections(
    data: PunchCorrectionBatchApproveRequest,
    request: Request,
    _rl=Depends(_batch_approve_limiter),
    current_user: dict = Depends(require_staff_permission(Permission.APPROVALS)),
):
    """批次核准/駁回補打卡。兩階段：Pass 1 純驗證收集 failed，Pass 2 逐筆套用
    （savepoint 隔離），最後統一 commit。核准成功項會寫考勤 + 標薪資 stale。"""
    if not data.approved and not (data.rejection_reason or "").strip():
        raise HTTPException(status_code=400, detail="批次駁回時必須填寫原因")

    succeeded: list[int] = []
    failed: list[dict] = []
    session = get_session()
    try:
        corr_map = {
            c.id: c
            for c in session.query(PunchCorrectionRequest)
            .filter(PunchCorrectionRequest.id.in_(data.ids))
            .with_for_update()
            .all()
        }
        approver_role = current_user.get("role", "")
        approver_eid = current_user.get("employee_id")
        _elig_cache: dict[str, bool] = {}

        # Pass 1：純驗證
        valid = []
        for cid in data.ids:
            c = corr_map.get(cid)
            if not c:
                failed.append({"id": cid, "reason": "找不到此補打卡申請"})
                continue
            if c.status != ApprovalStatus.PENDING.value:
                failed.append({"id": cid, "reason": "此申請已審核，無法再次審核"})
                continue
            if approver_eid and c.employee_id == approver_eid:
                failed.append({"id": cid, "reason": "不可自我核准補打卡申請"})
                continue
            submitter_role = _get_submitter_role(c.employee_id, session)
            if submitter_role not in _elig_cache:
                _elig_cache[submitter_role] = _check_approval_eligibility(
                    "punch_correction", submitter_role, approver_role, session
                )
            if not _elig_cache[submitter_role]:
                failed.append({
                    "id": cid,
                    "reason": f"您的角色（{approver_role}）無權審核此員工（{submitter_role}）的補打卡申請",
                })
                continue
            valid.append(c)

        # Pass 2：逐筆套用（savepoint 隔離，單筆失敗不污染其他）
        for c in valid:
            try:
                with session.begin_nested():
                    _apply_correction_decision(
                        session,
                        c,
                        approved=data.approved,
                        rejection_reason=data.rejection_reason,
                        current_user=current_user,
                    )
                succeeded.append(c.id)
            except HTTPException as he:
                failed.append({"id": c.id, "reason": he.detail if isinstance(he.detail, str) else "處理失敗"})
            except Exception as e:  # noqa: BLE001
                logger.error("批次補打卡 #%d 套用失敗：%s", c.id, e)
                failed.append({"id": c.id, "reason": "處理失敗"})

        session.commit()
        return {"succeeded": succeeded, "failed": failed}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error("批次核准補打卡時發生錯誤：%s", e)
        raise_safe_500(e)
    finally:
        session.close()
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd <BE worktree> && /Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_punch_correction_batch_approve.py -v`
Expected: PASS（3 tests）。再跑 Task 1 守護測試確認單筆未壞：`... -m pytest tests/test_punch_correction.py tests/test_punch_correction_approve_recompute.py tests/test_punch_correction_self_approve_guard.py -q`。

- [ ] **Step 5: Commit**

```bash
git -C <BE worktree> add api/punch_corrections.py tests/test_punch_correction_batch_approve.py
git -C <BE worktree> commit -m "feat(punch-corrections): 新增 batch-approve 端點（兩階段原子，含考勤/薪資副作用）"
```

---

## Task 3: 前端 `batchApproveCorrections` api

**Files:**
- Modify: `src/api/punchCorrections.ts`

- [ ] **Step 1: 加函式**

在 `src/api/punchCorrections.ts` 末尾加（比照 `batchApproveLeaves`）：
```ts
// 批次審核
export const batchApproveCorrections = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/punch-corrections/batch-approve', { ids, approved, rejection_reason })
```

- [ ] **Step 2: typecheck**

Run: `cd <FE worktree> && npm run typecheck`
Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
git -C <FE worktree> add src/api/punchCorrections.ts
git -C <FE worktree> commit -m "feat(api): 補打卡批次審核 api batchApproveCorrections"
```

---

## Task 4: 前端 `WorkbenchApprovalsView` 接批次

**Files:**
- Modify: `src/views/workbench/WorkbenchApprovalsView.vue`（script 1-145；三 section el-table 開標 271/392/489，header actions 260-266/381-387/478-484；`</el-table>` 369/466/539）
- Test: `src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`（新）

- [ ] **Step 1: 寫失敗測試 `src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const batchApproveLeaves = vi.fn().mockResolvedValue({ data: { succeeded: [1], failed: [] } })
const batchApproveOvertimes = vi.fn().mockResolvedValue({ data: { succeeded: [], failed: [] } })
const batchApproveCorrections = vi.fn().mockResolvedValue({ data: { succeeded: [9], failed: [] } })
vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn().mockResolvedValue({ data: [] }),
  approveLeave: vi.fn(), getLeaveAttachment: vi.fn(),
  batchApproveLeaves,
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue({ data: [] }),
  approveOvertime: vi.fn(), batchApproveOvertimes,
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue({ data: [] }),
  approveCorrection: vi.fn(), batchApproveCorrections,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ getUserInfo: () => ({ role: 'admin' }) }))
vi.mock('@/stores/approvalPolicy', () => ({ useApprovalPolicyStore: () => ({ policies: [] }) }))

import WorkbenchApprovalsView from '@/views/workbench/WorkbenchApprovalsView.vue'

const stubs = {
  teleport: true,
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': { props: ['data'], template: '<div><slot /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': true, 'el-badge': true, 'el-empty': true, 'el-icon': true,
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-tooltip': { template: '<div><slot /></div>' },
  TableSkeleton: true, LeaveBatchRejectDialog: true,
  'router-link': true,
}
const directives = { loading: () => {} }
const mountView = () => mount(WorkbenchApprovalsView, { global: { stubs, directives, mocks: { $router: { push: vi.fn() } } } })

describe('WorkbenchApprovalsView 批次核准', () => {
  beforeEach(() => vi.clearAllMocks())

  it('補打卡選取後批次核准帶 ids 呼叫 batchApproveCorrections', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      handleSelectionChangeC: (s: { id: number }[]) => void
      approveBatchC: () => Promise<void>
    }
    vm.handleSelectionChangeC([{ id: 9 }])
    await vm.approveBatchC()
    await flushPromises()
    expect(batchApproveCorrections).toHaveBeenCalledWith([9], true)
  })

  it('補打卡批次駁回帶 approved=false + 原因', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      handleSelectionChangeC: (s: { id: number }[]) => void
      batchRejectReasonC: string
      confirmBatchRejectC: () => Promise<void>
    }
    vm.handleSelectionChangeC([{ id: 9 }])
    vm.batchRejectReasonC = '時間不符'
    await vm.confirmBatchRejectC()
    await flushPromises()
    expect(batchApproveCorrections).toHaveBeenCalledWith([9], false, '時間不符')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd <FE worktree> && npx vitest run src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`
Expected: FAIL — `vm.handleSelectionChangeC` / `approveBatchC` undefined。

- [ ] **Step 3: 改實作 `WorkbenchApprovalsView.vue`**

（a）import 區（1-13）加：
```ts
import { batchApproveLeaves } from '@/api/leaves'
import { batchApproveOvertimes } from '@/api/overtimes'
import { batchApproveCorrections } from '@/api/punchCorrections'
import { useApprovalModule } from '@/composables/useApprovalModule'
import LeaveBatchRejectDialog from '@/views/leave/LeaveBatchRejectDialog.vue'
```
（`getLeaves`/`getOvertimes`/`getCorrections` 等既有 import 保留。）

（b）在三組 `useFetchPending`（22-24）之後加三個 `useApprovalModule`（**三個都對全部用到的鍵 alias**，避免命名衝突）。`batchApproveFn` 的型別 cast 比照 LeaveView：
```ts
type BatchFn = (ids: unknown[], approved: boolean, reason?: string) => Promise<{ data: { succeeded: { length: number }[]; failed: { id: unknown; reason: string }[] } }>

const {
  selectedItems: selectedLeaves, batchLoading: batchLoadingL,
  batchRejectVisible: batchRejectVisibleL, batchRejectReason: batchRejectReasonL,
  handleSelectionChange: handleSelectionChangeL, showBatchApproveConfirm: approveBatchL,
  openBatchReject: openBatchRejectL, confirmBatchReject: confirmBatchRejectL, canApprove: canApproveL,
} = useApprovalModule({ docType: 'leave', batchApproveFn: batchApproveLeaves as BatchFn, fetchFn: () => fetchPendingLeaves(), recordLabel: '請假記錄' })

const {
  selectedItems: selectedOvertimes, batchLoading: batchLoadingO,
  batchRejectVisible: batchRejectVisibleO, batchRejectReason: batchRejectReasonO,
  handleSelectionChange: handleSelectionChangeO, showBatchApproveConfirm: approveBatchO,
  openBatchReject: openBatchRejectO, confirmBatchReject: confirmBatchRejectO, canApprove: canApproveO,
} = useApprovalModule({ docType: 'overtime', batchApproveFn: batchApproveOvertimes as BatchFn, fetchFn: () => fetchPendingOvertimes(), recordLabel: '加班記錄' })

const {
  selectedItems: selectedCorrections, batchLoading: batchLoadingC,
  batchRejectVisible: batchRejectVisibleC, batchRejectReason: batchRejectReasonC,
  handleSelectionChange: handleSelectionChangeC, showBatchApproveConfirm: approveBatchC,
  openBatchReject: openBatchRejectC, confirmBatchReject: confirmBatchRejectC, canApprove: canApproveC,
} = useApprovalModule({ docType: 'punch_correction', batchApproveFn: batchApproveCorrections as BatchFn, fetchFn: () => fetchPendingCorrections(), recordLabel: '補打卡記錄' })
```

（c）三張 `el-table` 各加 `@selection-change` 與 selection 欄。請假表（271 開標）改為加 `@selection-change="handleSelectionChangeL"`，並在表內第一個 `<el-table-column>` 之前插入：
```html
        <el-table-column type="selection" width="45" :selectable="canApproveL" />
```
加班表（392）同理用 `handleSelectionChangeO` / `canApproveO`；補打卡表（489）用 `handleSelectionChangeC` / `canApproveC`。

（d）三個 section 的 `.card-header__actions`（260-266 / 381-387 / 478-484，在跳轉連結旁）各加批次按鈕。請假：
```html
          <el-button v-if="selectedLeaves.length > 0" type="success" size="small" :loading="batchLoadingL" @click="approveBatchL">批次核准 ({{ selectedLeaves.length }})</el-button>
          <el-button v-if="selectedLeaves.length > 0" type="danger" size="small" :loading="batchLoadingL" @click="openBatchRejectL">批次駁回 ({{ selectedLeaves.length }})</el-button>
```
加班用 `selectedOvertimes`/`batchLoadingO`/`approveBatchO`/`openBatchRejectO`；補打卡用 `selectedCorrections`/`batchLoadingC`/`approveBatchC`/`openBatchRejectC`。

（e）template 末（附件 dialog 之後、`</template>` 之前）加三個 reject dialog：
```html
    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleL" v-model:reason="batchRejectReasonL" :loading="batchLoadingL" @confirm="confirmBatchRejectL" />
    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleO" v-model:reason="batchRejectReasonO" :loading="batchLoadingO" @confirm="confirmBatchRejectO" />
    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleC" v-model:reason="batchRejectReasonC" :loading="batchLoadingC" @confirm="confirmBatchRejectC" />
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd <FE worktree> && npx vitest run src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`
Expected: PASS（2 tests）。若 `LeaveBatchRejectDialog` stub 導致 `confirmBatchRejectC` 找不到 reason，注意 reason 是 `batchRejectReasonC` ref（測試直接設 vm 值），與 dialog 渲染無關。

- [ ] **Step 5: typecheck + commit**

Run: `cd <FE worktree> && npm run typecheck`
Expected: 0 errors（三組 alias 無重名；`canApproveX` 作為 `:selectable` 接受 `(row) => boolean`）。
```bash
git -C <FE worktree> add src/views/workbench/WorkbenchApprovalsView.vue src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts
git -C <FE worktree> commit -m "feat(workbench): 審核工作台三類待審加多選批次核准/駁回"
```

---

## 收尾驗證（全部完成後）

- [ ] 後端：`cd <BE worktree> && /Users/yilunwu/Desktop/ivy-backend/.venv/bin/python -m pytest tests/test_punch_correction.py tests/test_punch_correction_approve_recompute.py tests/test_punch_correction_self_approve_guard.py tests/test_punch_correction_batch_approve.py -q`（全綠）。
- [ ] 前端：`cd <FE worktree> && npm run typecheck && npx vitest run src/views/workbench/__tests__/WorkbenchApprovalsView.test.ts`（0 錯 + 綠）。
- [ ] 兩 repo 各自收尾（merge local main / PR，依使用者）；當天清 worktree。無 migration。`schema.d.ts` 不在此批重生（batch api 走 `api.post` 直連不依賴型別），收斂到 BE push 同步批次。
