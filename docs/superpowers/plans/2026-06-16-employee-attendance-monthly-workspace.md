# 員工考勤月結工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把管理端 `/attendance` 重做成「月結工作台」（三欄：名冊 ｜ 異常佇列 ｜ 明細/處理 + 逐筆卡 + 匯入預覽），並修掉匯入路徑殘留的 shift-aware 正確性缺口。

**Architecture:** 後端先行——抽共用「班別視窗解析」util 統一三條匯入路徑（修正確性）+ 新增「匯入預覽（解析+逐列檢核、不寫入）」端點；前端照薪資 hub 範本（`useSalarySettlement` 純函式狀態機 + provide/inject）建容器 view + 三欄子元件 + 逐筆卡 + 匯入預覽對話框，盡量重用既有端點。

**Tech Stack:** 後端 FastAPI + SQLAlchemy + pytest（SQLite app+TestClient 真 login）；前端 Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（@vue/test-utils）。兩 repo 分開 commit。

**Repos:** BE = `/Users/yilunwu/Desktop/ivy-backend`，FE = `/Users/yilunwu/Desktop/ivy-frontend`。

**Spec:** `ivy-frontend/docs/superpowers/specs/2026-06-16-employee-attendance-monthly-workspace-design.md`

---

## 重要既有事實（實作前必讀，全部已查證）

- **異常 item id 非唯一**：`GET /attendance/anomalies` 的 `items[].id` 是 `Attendance.id`，一筆 Attendance 可展開成遲到/早退/缺上/缺下多筆 item 共用同一 id；`type ∈ {late, early_leave, missing_punch}`。前端「接受/豁免」要對 `att.id` 去重後再送 `batch-confirm`。
- **batch-confirm** `POST /attendance/anomalies/batch-confirm`：body `{attendance_ids: int[], action: 'admin_accept'|'admin_waive', remark?: string}`，回 `{processed: int}`。其他 action 一律 400（`anomalies.py:201-205`）。
- **補打卡** `POST /attendance/record`：body `{employee_id: int(DB主鍵), date: 'YYYY-MM-DD', punch_in?: 'HH:MM', punch_out?: 'HH:MM'}`，回 `{message, status, is_late, late_minutes, is_early_leave, early_leave_minutes}`。已封存月 → 409；自我考勤 → 守衛擋。
- **axios wrapper 不解包 `.data`**：FE 拿到的是 `AxiosResponse<T>`，一律 `res.data`。
- **權限**：BE 端點掛 `require_staff_permission(Permission.ATTENDANCE_READ/WRITE)`；FE 按鈕 gate 用 `hasPermission('ATTENDANCE_WRITE')`（`src/utils/auth.ts:205`），teacher 角色永遠回 false（工作台是 admin 不受影響）。
- **`compute_shift_aware_status(punch_in_dt, punch_out_dt, shift_start_dt, shift_end_dt) -> (is_late, late_minutes, is_early_leave, early_leave_minutes, status)`**（`utils/attendance_calc.py:243`）。caller 負責 `shift_end_dt` 跨夜 +1 日。
- **設計 token 跳過 `--space-7`**（4/8/12/16/20/24/32/40/48）。`html.ivy-admin` 由 AdminLayout 自動掛，勿自加 scope。

---

## File Structure

### 後端（BE）
- Create `utils/attendance_shift_window.py` — 共用「(employee, date) → 班別視窗 datetime」解析 + 狀態計算。三條匯入路徑 + 預覽端點唯一來源。
- Modify `api/attendance/upload.py` — CSV 路徑（`:805-1041`）與無排班 Excel 分支（`:367-417`）改走共用 util；CSV 路徑補建 `daily_shift_map`/`shift_schedule_map`。
- Create `api/attendance/preview.py` — `POST /attendance/upload/preview`：解析（raw_text 按 header 對應）+ 逐列檢核（找不到員工/日期無效/封存跳過/將覆蓋）+ shift-aware 狀態，**不寫入**。掛進 `api/attendance/__init__.py`。
- Create `schemas/attendance_preview.py` — 預覽 request/response Pydantic（給 response_model + OpenAPI codegen）。
- Tests：`tests/test_attendance_csv_shift_aware.py`、`tests/test_attendance_upload_preview.py`。

### 前端（FE）
- Create `src/views/attendance/AttendanceWorkspaceView.vue` — 容器：三欄骨架 + header + 行動退化。取代 `router/index.ts:127` 的 component。
- Create `src/composables/useAttendanceWorkspace.ts` — 狀態機（純函式 + epoch race 防護 + provide）。**spine，完整實作見 Task FE-1。**
- Create `src/components/attendance/WorkspaceHeader.vue` — 月份 ◀▶ + KPI + 匯入/匯出鈕。
- Create `src/components/attendance/RosterColumn.vue` — ① 名冊。
- Create `src/components/attendance/AnomalyQueueColumn.vue` — ② 異常佇列。
- Create `src/components/attendance/DetailColumn.vue` — ③ 明細/處理外殼（切 ResolveCard / EmployeeMonthPanel）。
- Create `src/components/attendance/ResolveCard.vue` — 逐筆卡（4 脈絡 + 3 動作 + ◀n/N▶ + auto-advance）。
- Create `src/components/attendance/EmployeeMonthPanel.vue` — 某人整月明細（看整月）。
- Create `src/components/attendance/ImportPreviewDialog.vue` — 匯入預覽對話框。
- Modify `src/api/attendance.ts` — 補 `previewImport`。
- Modify `src/router/index.ts:127` — component 指向新 view。
- Tests：各元件 `__tests__/*.spec.ts` + `src/composables/__tests__/useAttendanceWorkspace.test.ts`。

---

# Part 1 — 後端：正確性修補（先做，可獨立 ship）

## Task BE-1: 抽共用「班別視窗解析」util（TDD）

**Files:**
- Create: `/Users/yilunwu/Desktop/ivy-backend/utils/attendance_shift_window.py`
- Test: `/Users/yilunwu/Desktop/ivy-backend/tests/test_attendance_shift_window.py`

- [ ] **Step 1: 寫失敗測試**

```python
# tests/test_attendance_shift_window.py
import os, sys
from datetime import date, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.attendance_shift_window import resolve_shift_window, compute_status_for_employee_date


class _Emp:
    def __init__(self, id, work_start_time=None, work_end_time=None):
        self.id = id
        self.work_start_time = work_start_time
        self.work_end_time = work_end_time


def test_daily_shift_takes_priority():
    emp = _Emp(1, work_start_time="08:00", work_end_time="17:00")
    daily = {(1, date(2026, 2, 5)): {"work_start": "13:00", "work_end": "22:00"}}
    start_dt, end_dt = resolve_shift_window(emp, date(2026, 2, 5), daily, {})
    assert start_dt == datetime(2026, 2, 5, 13, 0)
    assert end_dt == datetime(2026, 2, 5, 22, 0)


def test_falls_back_to_employee_work_times():
    emp = _Emp(1, work_start_time="09:30", work_end_time="18:30")
    start_dt, end_dt = resolve_shift_window(emp, date(2026, 2, 5), {}, {})
    assert start_dt == datetime(2026, 2, 5, 9, 30)
    assert end_dt == datetime(2026, 2, 5, 18, 30)


def test_default_when_unset():
    emp = _Emp(1)
    start_dt, end_dt = resolve_shift_window(emp, date(2026, 2, 5), {}, {})
    assert (start_dt.hour, end_dt.hour) == (8, 17)


def test_overnight_end_rolls_to_next_day():
    emp = _Emp(1, work_start_time="16:00", work_end_time="01:00")
    start_dt, end_dt = resolve_shift_window(emp, date(2026, 2, 5), {}, {})
    assert start_dt == datetime(2026, 2, 5, 16, 0)
    assert end_dt == datetime(2026, 2, 6, 1, 0)  # +1 day


def test_weekly_assignment_only_for_head_or_assistant():
    emp = _Emp(7, work_start_time="08:00", work_end_time="17:00")
    week_start = date(2026, 2, 2)  # Monday of 2026-02-05
    sched = {(7, week_start): {"work_start": "13:00", "work_end": "22:00"}}
    # 非導師/助教：不採用週排班，回員工自訂
    s1, e1 = resolve_shift_window(emp, date(2026, 2, 5), {}, sched, is_head_teacher=False, is_assistant=False)
    assert s1.hour == 8
    # 導師：採用週排班
    s2, e2 = resolve_shift_window(emp, date(2026, 2, 5), {}, sched, is_head_teacher=True)
    assert (s2.hour, e2.hour) == (13, 22)


def test_compute_status_uses_window():
    emp = _Emp(1)
    daily = {(1, date(2026, 2, 5)): {"work_start": "13:00", "work_end": "22:00"}}
    # 13:02 上班、22:00 下班 → 對 13:00 視窗不算遲到
    is_late, late_min, is_early, early_min, status = compute_status_for_employee_date(
        emp, date(2026, 2, 5),
        datetime(2026, 2, 5, 13, 2), datetime(2026, 2, 5, 22, 0),
        daily, {},
    )
    assert is_late is True and late_min == 2  # 13:02 > 13:00 → 遲到2分（無寬限，與 compute_shift_aware_status 一致）
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_shift_window.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'utils.attendance_shift_window'`

- [ ] **Step 3: 實作 util**

```python
# utils/attendance_shift_window.py
"""(employee, date) → 班別視窗 datetime 的唯一解析來源。
優先序：DailyShift > 週排班(僅導師/助教) > 員工自訂 work_start/end_time > 08:00/17:00。
end 落在 start 之前/相同視為跨夜，+1 日。三條匯入路徑與預覽端點共用，確保「預覽所見 = 匯入所得」。"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional

from utils.attendance_calc import compute_shift_aware_status

_DEFAULT_START = "08:00"
_DEFAULT_END = "17:00"


def resolve_shift_window(
    employee,
    attendance_date,
    daily_shift_map: dict,
    shift_schedule_map: dict,
    *,
    is_head_teacher: bool = False,
    is_assistant: bool = False,
) -> tuple[datetime, datetime]:
    ws = we = None
    daily = daily_shift_map.get((employee.id, attendance_date))
    if daily and daily.get("work_start") and daily.get("work_end"):
        ws, we = daily["work_start"], daily["work_end"]
    elif is_head_teacher or is_assistant:
        week_start = attendance_date - timedelta(days=attendance_date.weekday())
        wa = shift_schedule_map.get((employee.id, week_start))
        if wa and wa.get("work_start") and wa.get("work_end"):
            ws, we = wa["work_start"], wa["work_end"]
    if ws is None or we is None:
        ws = getattr(employee, "work_start_time", None) or _DEFAULT_START
        we = getattr(employee, "work_end_time", None) or _DEFAULT_END
    start_dt = datetime.combine(attendance_date, datetime.strptime(ws, "%H:%M").time())
    end_dt = datetime.combine(attendance_date, datetime.strptime(we, "%H:%M").time())
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def compute_status_for_employee_date(
    employee,
    attendance_date,
    punch_in_dt: Optional[datetime],
    punch_out_dt: Optional[datetime],
    daily_shift_map: dict,
    shift_schedule_map: dict,
    *,
    is_head_teacher: bool = False,
    is_assistant: bool = False,
) -> tuple[bool, int, bool, int, str]:
    start_dt, end_dt = resolve_shift_window(
        employee, attendance_date, daily_shift_map, shift_schedule_map,
        is_head_teacher=is_head_teacher, is_assistant=is_assistant,
    )
    return compute_shift_aware_status(punch_in_dt, punch_out_dt, start_dt, end_dt)
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_shift_window.py -v`
Expected: PASS（6 passed）

- [ ] **Step 5: Commit（BE）**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git add utils/attendance_shift_window.py tests/test_attendance_shift_window.py
git commit -m "feat(attendance): 抽共用班別視窗解析 util（含跨夜 normalize）"
```

---

## Task BE-2: CSV 匯入改走 shift-aware（TDD，修真實 bug）

**Files:**
- Modify: `/Users/yilunwu/Desktop/ivy-backend/api/attendance/upload.py`（CSV 路徑 `:805-1041`）
- Test: `/Users/yilunwu/Desktop/ivy-backend/tests/test_attendance_csv_shift_aware.py`

- [ ] **Step 1: 寫失敗回歸測試（重現 13:00 晚班 CSV 被誤算 300 分假遲到）**

```python
# tests/test_attendance_csv_shift_aware.py
import os, sys
from datetime import date
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models.base as base_module
from api.attendance import router as attendance_router
from api.auth import _account_failures, _ip_attempts, router as auth_router
from models.base import Base
from models.database import Attendance, Employee, User, ShiftType, DailyShift
from utils.auth import hash_password


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'a.sqlite'}", connect_args={"check_same_thread": False})
    sf = sessionmaker(bind=engine)
    old_e, old_s = base_module._engine, base_module._SessionFactory
    base_module._engine, base_module._SessionFactory = engine, sf
    Base.metadata.create_all(engine)
    _ip_attempts.clear(); _account_failures.clear()
    app = FastAPI(); app.include_router(auth_router); app.include_router(attendance_router)
    with TestClient(app) as c:
        yield c, sf
    _ip_attempts.clear(); _account_failures.clear()
    base_module._engine, base_module._SessionFactory = old_e, old_s
    engine.dispose()


def _seed(sf):
    with sf() as s:
        emp = Employee(employee_id="E01", name="晚班師", base_salary=30000, is_active=True)
        s.add(emp); s.flush()
        st = ShiftType(name="晚班", work_start="13:00", work_end="22:00", is_active=True)
        s.add(st); s.flush()
        s.add(DailyShift(employee_id=emp.id, shift_type_id=st.id, date=date(2026, 2, 5)))
        admin = User(username="pure_admin", password_hash=hash_password("Temp123456"),
                     role="admin", permission_names=["ATTENDANCE_READ", "ATTENDANCE_WRITE"],
                     employee_id=None, is_active=True, must_change_password=False)
        s.add(admin); s.commit()
        return emp.id


def test_csv_import_uses_daily_shift_not_default_0800(client):
    c, sf = client
    emp_id = _seed(sf)
    assert c.post("/api/auth/login", json={"username": "pure_admin", "password": "Temp123456"}).status_code == 200
    payload = {"records": [{"department": "教學", "employee_number": "E01", "name": "晚班師",
                            "date": "2026-02-05", "weekday": "四", "punch_in": "13:02", "punch_out": "22:00"}],
               "year": 2026, "month": 2}
    res = c.post("/api/attendance/upload-csv", json=payload)
    assert res.status_code == 200, res.text
    with sf() as s:
        att = s.query(Attendance).filter_by(employee_id=emp_id, attendance_date=date(2026, 2, 5)).one()
        # 修前：CSV 不查 DailyShift → 用預設 08:00 → 13:02 算遲到 302 分（RED）
        # 修後：用 13:00 視窗 → 遲到 2 分
        assert att.is_late is True
        assert att.late_minutes == 2
        assert att.is_early_leave is False
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_csv_shift_aware.py -v`
Expected: FAIL — `assert att.late_minutes == 2`（實際約 302，因走預設 08:00）

- [ ] **Step 3: 在 CSV 函式頂部建 shift maps（仿 Excel 路徑 `upload.py:161-196`）**

在 `upload_attendance_csv`（`api/attendance/upload.py:805` 起）解析出涉及的 employee ids 與日期範圍後、進入逐列迴圈前，加入（沿用 Excel 路徑同款 query；`ShiftAssignment`/`ShiftType`/`DailyShift` 已在檔頭 import，若無則補）：

```python
    # --- 建 shift maps（與 Excel 新格式路徑一致，供 shift-aware 判定）---
    from models.database import ShiftAssignment, ShiftType, DailyShift  # 若檔頭未 import
    emp_ids = [e.id for e in employees_by_number.values()]  # 依本函式既有的員工查找結果調整變數名
    daily_shift_map: dict = {}
    shift_schedule_map: dict = {}
    if emp_ids:
        for ds, st in (
            session.query(DailyShift, ShiftType)
            .outerjoin(ShiftType, DailyShift.shift_type_id == ShiftType.id)
            .filter(DailyShift.employee_id.in_(emp_ids))
            .all()
        ):
            daily_shift_map[(ds.employee_id, ds.date)] = (
                {"work_start": st.work_start, "work_end": st.work_end, "name": st.name} if st else {}
            )
        for sa, st in (
            session.query(ShiftAssignment, ShiftType)
            .join(ShiftType, ShiftAssignment.shift_type_id == ShiftType.id)
            .filter(ShiftAssignment.employee_id.in_(emp_ids))
            .all()
        ):
            shift_schedule_map[(sa.employee_id, sa.week_start_date)] = {
                "work_start": st.work_start, "work_end": st.work_end, "name": st.name
            }
```

> 註：變數名 `employees_by_number` 為示意——實作時對齊 CSV 函式既有的「員工編號→Employee」對照結構。若該函式逐列才查員工，改為先收集 employee 物件建 `emp_ids`。

- [ ] **Step 4: 逐列狀態計算改用共用 util**

把 CSV 路徑 `:921-962` 的 inline 計算（`work_start = ...work_start_time or "08:00"` 起到算出 `is_late/late_minutes/is_early_leave/early_leave_minutes/status` 為止）整段替換為（`punch_in_time`/`punch_out_time` 為該列已組好的 datetime，沿用既有變數名）：

```python
        from utils.attendance_shift_window import compute_status_for_employee_date
        is_head = getattr(employee, "is_head_teacher", False)
        is_asst = getattr(employee, "is_assistant", False)
        (is_late, late_minutes, is_early_leave, early_leave_minutes, status) = \
            compute_status_for_employee_date(
                employee, attendance_date, punch_in_time, punch_out_time,
                daily_shift_map, shift_schedule_map,
                is_head_teacher=is_head, is_assistant=is_asst,
            )
```

> 缺一側打卡時 `punch_in_time`/`punch_out_time` 傳 `None`，util 內 `compute_shift_aware_status` 會補 `missing` 旗標——與既有行為一致。維持後續 `merge_attendance_with_leave(...)`、`_mark_attendance_upload_stale(...)` 不動。

- [ ] **Step 5: 跑測試確認 pass + CSV 既有回歸**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_csv_shift_aware.py tests/test_attendance_csv_row_cap.py tests/test_attendance_self_guard.py -v`
Expected: PASS（含既有 CSV 列數上限、self-guard 回歸不破）

- [ ] **Step 6: Commit（BE）**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git add api/attendance/upload.py tests/test_attendance_csv_shift_aware.py
git commit -m "fix(attendance): CSV 匯入改走 shift-aware 班別視窗，修晚班假遲到（修前用預設 08:00）"
```

---

## Task BE-3: 無排班 Excel 分支也走共用 util（TDD）

**Files:**
- Modify: `/Users/yilunwu/Desktop/ivy-backend/api/attendance/upload.py`（無 shift_data 分支 `:367-417`）
- Test: 沿用 `tests/test_attendance_csv_shift_aware.py` 新增 Excel 案例（或 `tests/test_attendance_excel_no_shift_shift_aware.py`）

- [ ] **Step 1: 寫失敗測試**

針對「Excel 新格式、員工有 DailyShift 但走到無 shift_data 分支」的情境補測試（建 Employee + DailyShift，上傳 Excel `.xlsx` 含「上班時間/下班時間」欄但該日無排班命中 → 應採員工自訂工時而非硬編）。骨架同 BE-2 的 `client` fixture；用 `openpyxl`/`pandas` 寫一個臨時 xlsx：

```python
def test_excel_no_shift_branch_uses_employee_work_times(client, tmp_path):
    # 員工自訂 13:00-22:00、無當日排班命中 → 13:05 上班應只遲到 5 分（非對 08:00 算 305）
    ...  # 建 Employee(work_start_time="13:00", work_end_time="22:00")，上傳 xlsx 後斷言 att.late_minutes == 5
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_excel_no_shift_shift_aware.py -v`
Expected: FAIL（late_minutes 約 305）

- [ ] **Step 3: 把無 shift_data 分支替換為共用 util**

`upload.py:367-417` 無 shift_data 分支的 inline 計算替換為 `compute_status_for_employee_date(employee, attendance_date, punch_in_time, punch_out_time, daily_shift_map, shift_schedule_map, is_head_teacher=..., is_assistant=...)`（此路徑 `daily_shift_map`/`shift_schedule_map` 已存在於上層）。有 shift_data 分支（`:443-470`）已正確，可一併改用 util 收斂（行為等價），或保留。

- [ ] **Step 4: 跑測試確認 pass + Excel 路徑回歸**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_excel_no_shift_shift_aware.py tests/test_overnight_attendance.py tests/test_attendance_shift_aware_status_2026_06_13.py -v`
Expected: PASS

- [ ] **Step 5: Commit（BE）**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git add api/attendance/upload.py tests/test_attendance_excel_no_shift_shift_aware.py
git commit -m "fix(attendance): 無排班 Excel 分支改走共用班別視窗 util"
```

---

# Part 2 — 後端：匯入預覽端點

## Task BE-4: 預覽 schema + 解析/檢核核心（TDD）

**Files:**
- Create: `/Users/yilunwu/Desktop/ivy-backend/schemas/attendance_preview.py`
- Create: `/Users/yilunwu/Desktop/ivy-backend/api/attendance/preview.py`
- Modify: `/Users/yilunwu/Desktop/ivy-backend/api/attendance/__init__.py`（掛 router）
- Test: `/Users/yilunwu/Desktop/ivy-backend/tests/test_attendance_upload_preview.py`

**端點契約：** `POST /attendance/upload/preview`，權限 `ATTENDANCE_READ`（唯讀、不寫）。
- request：`{ raw_text: str, year: int, month: int }`（貼上文字；CSV/TSV，含標題列，**後端按 header 對應欄位**），或 `{ records: AttendanceCSVRow[], year, month }`（已正規化）。raw_text 與 records 擇一。
- response（`response_model=AttendancePreviewResult`）：
  - `summary: { importable: int, problems: int, overwrites: int }`
  - `rows: PreviewRow[]`，每筆 `{ row_num, employee_number, employee_name, matched_employee_id|None, date, punch_in|None, punch_out|None, status|None, check: 'importable'|'employee_not_found'|'invalid_date'|'month_finalized'|'overwrite' }`
  - `normalized: AttendanceCSVRow[]`（只含 check ∈ {importable, overwrite} 的列，前端確認後原樣送 `/upload-csv` commit，免再解析）

- [ ] **Step 1: 寫失敗測試**

```python
# tests/test_attendance_upload_preview.py
import os, sys
from datetime import date
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import models.base as base_module
from api.attendance import router as attendance_router
from api.auth import _account_failures, _ip_attempts, router as auth_router
from models.base import Base
from models.database import Employee, User
from utils.auth import hash_password


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'p.sqlite'}", connect_args={"check_same_thread": False})
    sf = sessionmaker(bind=engine)
    old_e, old_s = base_module._engine, base_module._SessionFactory
    base_module._engine, base_module._SessionFactory = engine, sf
    Base.metadata.create_all(engine)
    _ip_attempts.clear(); _account_failures.clear()
    app = FastAPI(); app.include_router(auth_router); app.include_router(attendance_router)
    with TestClient(app) as c:
        yield c, sf
    _ip_attempts.clear(); _account_failures.clear()
    base_module._engine, base_module._SessionFactory = old_e, old_s
    engine.dispose()


def _login(c, sf):
    with sf() as s:
        s.add(Employee(employee_id="E01", name="王小明", base_salary=30000, is_active=True))
        s.add(User(username="pure_admin", password_hash=hash_password("Temp123456"),
                   role="admin", permission_names=["ATTENDANCE_READ", "ATTENDANCE_WRITE"],
                   employee_id=None, is_active=True, must_change_password=False))
        s.commit()
    assert c.post("/api/auth/login", json={"username": "pure_admin", "password": "Temp123456"}).status_code == 200


def test_preview_classifies_rows(client):
    c, sf = client
    _login(c, sf)
    raw = "\n".join([
        "部門\t編號\t姓名\t日期\t星期\t上班時間\t下班時間",
        "教學\tE01\t王小明\t2026/02/03\t二\t08:00\t17:00",   # importable
        "教學\tE99\t查無人\t2026/02/03\t二\t08:00\t17:00",   # employee_not_found
        "教學\tE01\t王小明\t2026/02/30\t六\t08:00\t17:00",   # invalid_date
    ])
    res = c.post("/api/attendance/upload/preview", json={"raw_text": raw, "year": 2026, "month": 2})
    assert res.status_code == 200, res.text
    body = res.json()
    checks = [r["check"] for r in body["rows"]]
    assert checks == ["importable", "employee_not_found", "invalid_date"]
    assert body["summary"]["importable"] == 1
    assert body["summary"]["problems"] == 2
    assert len(body["normalized"]) == 1  # 只回可匯入列
    assert body["rows"][0]["matched_employee_id"] is not None


def test_preview_does_not_write(client):
    c, sf = client
    _login(c, sf)
    raw = "編號\t姓名\t日期\t上班時間\t下班時間\nE01\t王小明\t2026/02/03\t08:00\t17:00"
    c.post("/api/attendance/upload/preview", json={"raw_text": raw, "year": 2026, "month": 2})
    from models.database import Attendance
    with sf() as s:
        assert s.query(Attendance).count() == 0  # 預覽不得寫入
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_upload_preview.py -v`
Expected: FAIL — 404（端點未存在）

- [ ] **Step 3: 寫 schema**

```python
# schemas/attendance_preview.py
from typing import List, Optional, Literal
from pydantic import BaseModel
from api.attendance._shared import AttendanceCSVRow


class AttendancePreviewRequest(BaseModel):
    year: int
    month: int
    raw_text: Optional[str] = None
    records: Optional[List[AttendanceCSVRow]] = None


class PreviewRow(BaseModel):
    row_num: int
    employee_number: str
    employee_name: str
    matched_employee_id: Optional[int] = None
    date: Optional[str] = None
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    status: Optional[str] = None
    check: Literal["importable", "employee_not_found", "invalid_date", "month_finalized", "overwrite"]


class PreviewSummary(BaseModel):
    importable: int
    problems: int
    overwrites: int


class AttendancePreviewResult(BaseModel):
    summary: PreviewSummary
    rows: List[PreviewRow]
    normalized: List[AttendanceCSVRow]
```

- [ ] **Step 4: 寫 router**

```python
# api/attendance/preview.py
from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException

from models.base import get_session
from models.database import Attendance, Employee
from utils.auth import require_staff_permission
from utils.permissions import Permission
from utils.approval_helpers import _get_finalized_salary_record
from utils.attendance_shift_window import compute_status_for_employee_date
from schemas.attendance_preview import (
    AttendancePreviewRequest, AttendancePreviewResult, PreviewRow, PreviewSummary,
)
from api.attendance._shared import AttendanceCSVRow

logger = logging.getLogger(__name__)
router = APIRouter()

_HEADER_ALIASES = {
    "部門": "department", "編號": "employee_number", "員工編號": "employee_number",
    "姓名": "name", "日期": "date", "星期": "weekday",
    "上班時間": "punch_in", "上班": "punch_in", "下班時間": "punch_out", "下班": "punch_out",
}


def _parse_raw_text(raw: str) -> list[dict]:
    lines = [ln for ln in raw.replace("\r\n", "\n").split("\n") if ln.strip()]
    if len(lines) < 2:
        return []
    sep = "\t" if "\t" in lines[0] else ","
    headers = [_HEADER_ALIASES.get(h.strip(), h.strip()) for h in lines[0].split(sep)]
    out = []
    for ln in lines[1:]:
        cols = [c.strip() for c in ln.split(sep)]
        row = {headers[i]: cols[i] for i in range(min(len(headers), len(cols)))}
        out.append(row)
    return out


def _norm_date(raw: str) -> str | None:
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except (ValueError, AttributeError):
            continue
    return None


@router.post("/upload/preview", response_model=AttendancePreviewResult)
def preview_attendance_upload(
    body: AttendancePreviewRequest,
    current_user: dict = Depends(require_staff_permission(Permission.ATTENDANCE_READ)),
):
    if body.raw_text:
        raw_rows = _parse_raw_text(body.raw_text)
    elif body.records:
        raw_rows = [r.model_dump() for r in body.records]
    else:
        raise HTTPException(400, "需提供 raw_text 或 records")

    with get_session() as session:
        emps = {e.employee_id: e for e in session.query(Employee).filter(Employee.is_active.is_(True)).all()}
        rows: list[PreviewRow] = []
        normalized: list[AttendanceCSVRow] = []
        importable = problems = overwrites = 0
        for i, r in enumerate(raw_rows, start=1):
            num = (r.get("employee_number") or "").strip()
            name = (r.get("name") or "").strip()
            emp = emps.get(num)
            iso = _norm_date(r.get("date") or "")
            pin = (r.get("punch_in") or "").strip() or None
            pout = (r.get("punch_out") or "").strip() or None
            if emp is None:
                rows.append(PreviewRow(row_num=i, employee_number=num, employee_name=name, check="employee_not_found"))
                problems += 1; continue
            if iso is None:
                rows.append(PreviewRow(row_num=i, employee_number=num, employee_name=emp.name,
                                       date=(r.get("date") or None), check="invalid_date"))
                problems += 1; continue
            d = datetime.fromisoformat(iso).date()
            if _get_finalized_salary_record(session, emp.id, d.year, d.month):
                rows.append(PreviewRow(row_num=i, employee_number=num, employee_name=emp.name,
                                       date=iso, punch_in=pin, punch_out=pout, check="month_finalized"))
                problems += 1; continue
            # shift-aware 狀態（與匯入同源；缺一側傳 None）
            pin_dt = datetime.combine(d, datetime.strptime(pin, "%H:%M").time()) if pin else None
            pout_dt = datetime.combine(d, datetime.strptime(pout, "%H:%M").time()) if pout else None
            if pout_dt and pin_dt and pout_dt < pin_dt:
                from datetime import timedelta
                pout_dt += timedelta(days=1)
            _, _, _, _, status = compute_status_for_employee_date(
                emp, d, pin_dt, pout_dt, {}, {},
                is_head_teacher=getattr(emp, "is_head_teacher", False),
                is_assistant=getattr(emp, "is_assistant", False),
            )
            exists = session.query(Attendance.id).filter_by(employee_id=emp.id, attendance_date=d).first() is not None
            check = "overwrite" if exists else "importable"
            if check == "overwrite":
                overwrites += 1
            else:
                importable += 1
            rows.append(PreviewRow(row_num=i, employee_number=num, employee_name=emp.name,
                                   matched_employee_id=emp.id, date=iso, punch_in=pin, punch_out=pout,
                                   status=status, check=check))
            normalized.append(AttendanceCSVRow(department=r.get("department", ""), employee_number=num,
                                               name=emp.name, date=iso, weekday=r.get("weekday", ""),
                                               punch_in=pin, punch_out=pout))
        return AttendancePreviewResult(
            summary=PreviewSummary(importable=importable, problems=problems, overwrites=overwrites),
            rows=rows, normalized=normalized,
        )
```

> 註：`get_session` / `require_staff_permission` / `_get_finalized_salary_record` 的 import 路徑以實檔為準（見「重要既有事實」與 BE 探查：`require_staff_permission` 在 `utils/auth.py`，封存判定 helper 在 `utils/approval_helpers`）。`status="month_finalized"` 列 summary 計入 problems（不可寫）。

- [ ] **Step 5: 掛 router**

`api/attendance/__init__.py:12-17` 的 `include_router` 區塊加入 `from .preview import router as preview_router` 並 `router.include_router(preview_router)`（前綴維持 `/attendance`）。

- [ ] **Step 6: 跑測試確認 pass**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_upload_preview.py -v`
Expected: PASS（2 passed）

- [ ] **Step 7: 重新產 OpenAPI + 前端型別（讓 FE 可 typed）**

```bash
cd /Users/yilunwu/Desktop/ivy-backend && ENV=development python scripts/dump_openapi.py
cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api
```

- [ ] **Step 8: Commit（BE）**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git add schemas/attendance_preview.py api/attendance/preview.py api/attendance/__init__.py tests/test_attendance_upload_preview.py
git commit -m "feat(attendance): 新增匯入預覽端點（後端解析 header + 逐列檢核 + shift-aware 狀態，不寫入）"
```

---

# Part 3 — 前端：工作台骨架與狀態機

## Task FE-1: `useAttendanceWorkspace` 狀態機（TDD，spine）

**Files:**
- Create: `/Users/yilunwu/Desktop/ivy-frontend/src/composables/useAttendanceWorkspace.ts`
- Modify: `/Users/yilunwu/Desktop/ivy-frontend/src/api/attendance.ts`（補 `previewImport`）
- Test: `/Users/yilunwu/Desktop/ivy-frontend/src/composables/__tests__/useAttendanceWorkspace.test.ts`

**設計（照 `useSalarySettlement.ts` 範本）：** 純函式 `dedupeAnomalyIds`、`buildKpis` 可獨立單測；本體用 epoch race 防護 + 本月並行載入三來源 + `provide`。

- [ ] **Step 1: 補 api 函式**

`src/api/attendance.ts` 末尾加：
```ts
export const previewImport = (payload: { raw_text?: string; records?: unknown[]; year: number; month: number }) =>
  api.post('/attendance/upload/preview', payload)
```

- [ ] **Step 2: 寫失敗測試（純函式 + 載入/race）**

```ts
// src/composables/__tests__/useAttendanceWorkspace.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { dedupeAnomalyIds, buildKpis, useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'

vi.mock('@/api/attendance', () => ({
  getSummary: vi.fn(), getAnomalyList: vi.fn(), getRecords: vi.fn(),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
import { getSummary, getAnomalyList, getRecords } from '@/api/attendance'

describe('dedupeAnomalyIds', () => {
  it('多筆 item 共用 att.id → 去重', () => {
    const items = [{ id: 5, type: 'late' }, { id: 5, type: 'missing_punch' }, { id: 8, type: 'early_leave' }]
    expect(dedupeAnomalyIds(items as never)).toEqual([5, 8])
  })
})

describe('buildKpis', () => {
  it('彙總全勤/遲到/缺卡/待處理', () => {
    const summary = [{ employee_id: 1, normal_days: 20, late_count: 0, missing_punch_in: 0, missing_punch_out: 0 },
                     { employee_id: 2, normal_days: 18, late_count: 2, missing_punch_in: 1, missing_punch_out: 0 }]
    const anomalies = { pending: 3 }
    const kpi = buildKpis(summary as never, anomalies as never)
    expect(kpi.lateCount).toBe(2)
    expect(kpi.missingCount).toBe(1)
    expect(kpi.pendingAnomalies).toBe(3)
  })
})

describe('useAttendanceWorkspace load', () => {
  beforeEach(() => vi.clearAllMocks())
  it('並行載入三來源並組 KPI', async () => {
    ;(getSummary as never).mockResolvedValue({ data: [{ employee_id: 1, normal_days: 20, late_count: 1, missing_punch_in: 0, missing_punch_out: 0 }] })
    ;(getAnomalyList as never).mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [{ id: 1, type: 'late' }] } })
    const year = ref(2026), month = ref(2)
    const ws = useAttendanceWorkspace(year, month)
    await ws.refresh()
    expect(ws.roster.value.length).toBe(1)
    expect(ws.anomalyQueue.value.length).toBe(1)
    expect(ws.kpis.value.pendingAnomalies).toBe(1)
  })
  it('切月 race：晚到舊請求不蓋新月', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    ;(getSummary as never).mockReturnValueOnce(new Promise(r => { resolveOld = r }))
      .mockResolvedValue({ data: [] })
    ;(getAnomalyList as never).mockResolvedValue({ data: { items: [], pending: 0 } })
    const year = ref(2026), month = ref(2)
    const ws = useAttendanceWorkspace(year, month)
    const p1 = ws.refresh()       // 舊月（卡住）
    const p2 = ws.refresh()       // 新月（先完成）
    await p2
    resolveOld({ data: [{ employee_id: 999, normal_days: 1, late_count: 0, missing_punch_in: 0, missing_punch_out: 0 }] })
    await p1
    expect(ws.roster.value.find(r => r.employee_id === 999)).toBeUndefined() // 舊請求被丟棄
  })
})
```

- [ ] **Step 3: 跑測試確認 fail**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/composables/__tests__/useAttendanceWorkspace.test.ts`
Expected: FAIL — 模組不存在

- [ ] **Step 4: 實作 composable（鏡像 useSalarySettlement 的 epoch + 純函式）**

```ts
// src/composables/useAttendanceWorkspace.ts
import { ref, computed, watch, type Ref } from 'vue'
import { getSummary, getAnomalyList, getRecords } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'

export interface RosterRow {
  employee_id: number; employee_name: string; employee_number?: string
  normal_days: number; late_count: number; early_leave_count: number
  missing_punch_in: number; missing_punch_out: number; total_late_minutes: number
  anomaly_count: number
}
export interface AnomalyItem {
  id: number; employee_name: string; employee_number: string; date: string; weekday: string
  type: 'late' | 'early_leave' | 'missing_punch'; type_label: string; detail: string
  estimated_deduction: number; confirmed_action: string | null
}
export interface Kpis { fullAttendance: number; lateCount: number; missingCount: number; pendingAnomalies: number }

export function dedupeAnomalyIds(items: Pick<AnomalyItem, 'id'>[]): number[] {
  const seen = new Set<number>(); const out: number[] = []
  for (const it of items) if (!seen.has(it.id)) { seen.add(it.id); out.push(it.id) }
  return out
}

export function buildKpis(summary: RosterRow[], anomalies: { pending?: number }): Kpis {
  let lateCount = 0, missingCount = 0, full = 0
  for (const r of summary) {
    lateCount += r.late_count || 0
    missingCount += (r.missing_punch_in || 0) + (r.missing_punch_out || 0)
    if (!r.late_count && !r.early_leave_count && !r.missing_punch_in && !r.missing_punch_out) full += 1
  }
  return { fullAttendance: full, lateCount, missingCount, pendingAnomalies: anomalies?.pending || 0 }
}

export function useAttendanceWorkspace(year: Ref<number>, month: Ref<number>) {
  const { notify } = useErrorNotify()
  const roster = ref<RosterRow[]>([])
  const anomalyQueue = ref<AnomalyItem[]>([])
  const anomalyMeta = ref<{ total: number; pending: number; confirmed: number }>({ total: 0, pending: 0, confirmed: 0 })
  const loading = ref(false)
  let epoch = 0

  const kpis = computed<Kpis>(() => buildKpis(roster.value, anomalyMeta.value))

  async function refresh() {
    const my = ++epoch
    loading.value = true
    try {
      const [sumRes, anoRes] = await Promise.all([
        getSummary({ year: year.value, month: month.value }),
        getAnomalyList({ year: year.value, month: month.value, status: 'all' }),
      ])
      if (my !== epoch) return // 切月 race：舊請求丟棄
      const items: AnomalyItem[] = anoRes.data.items || []
      const counts = new Map<number, number>()
      for (const it of items) counts.set(it.employee_id ?? -1, (counts.get(it.employee_id ?? -1) || 0) + 1)
      roster.value = (sumRes.data as RosterRow[]).map(r => ({ ...r, anomaly_count: 0 }))
      anomalyQueue.value = items.filter(it => it.confirmed_action == null)
      anomalyMeta.value = { total: anoRes.data.total || 0, pending: anoRes.data.pending || 0, confirmed: anoRes.data.confirmed || 0 }
    } catch (e) {
      if (my === epoch) notify(e, 'useAttendanceWorkspace.refresh', '載入考勤工作台失敗')
    } finally {
      if (my === epoch) loading.value = false
    }
  }

  watch([year, month], refresh)
  return { roster, anomalyQueue, anomalyMeta, kpis, loading, refresh, getRecords }
}
export type AttendanceWorkspace = ReturnType<typeof useAttendanceWorkspace>
```

> 註：`AnomalyItem` 的 `employee_id` 後端 anomalies item 未必有——若無，roster 異常數改由 `getRecords`/`summary` 推導或暫不顯示徽章（見 Task FE-3 註）。`buildKpis`/`dedupeAnomalyIds` 為測試鎖定的純函式契約。

- [ ] **Step 5: 跑測試確認 pass**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/composables/__tests__/useAttendanceWorkspace.test.ts`
Expected: PASS

- [ ] **Step 6: typecheck + commit（FE）**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && npx vue-tsc --noEmit -p tsconfig.json
git add src/composables/useAttendanceWorkspace.ts src/composables/__tests__/useAttendanceWorkspace.test.ts src/api/attendance.ts
git commit -m "feat(attendance): useAttendanceWorkspace 狀態機 + previewImport api"
```

---

## Task FE-2: 容器 view + header + 三欄空殼 + 路由切換

**Files:**
- Create: `src/views/attendance/AttendanceWorkspaceView.vue`
- Create: `src/components/attendance/WorkspaceHeader.vue`
- Modify: `src/router/index.ts:127`
- Test: `src/views/attendance/__tests__/AttendanceWorkspaceView.spec.ts`

**契約：**
- `AttendanceWorkspaceView`：`reactive({ year, month })` → `useAttendanceWorkspace(toRef(query,'year'), toRef(query,'month'))`，`onMounted(refresh)`；`provide('attendanceWs', ws)`。桌機渲染三欄（grid `grid-template-columns: 240px 280px 1fr`，用 `var(--space-3)` gap），`useIsMobile()` 為真時改 `el-tabs` 分頁 [名冊][異常][明細]。
- `WorkspaceHeader`：props `{ year, month, kpis }`；emits `update:year`、`update:month`、`import`、`export`。月份 `◀ el-select(年) el-select(月) ▶`；KPI 四顆 `el-statistic`（全勤/遲到/缺卡/待處理異常，最後一顆紅）；右側「匯入」「匯出月報」`el-button`（匯入 gate `hasPermission('ATTENDANCE_WRITE')`）。

- [ ] **Step 1: 寫 view 測試（mirror `SalaryHubView.spec.ts`）** — mock vue-router 與 `@/api/attendance`（回 `{data:[]}` / `{data:{items:[],pending:0}}`），mount 後 `await flushPromises()`，斷言 header KPI 文字出現、三欄容器存在。完整 stub 套用 §測試慣例。
- [ ] **Step 2: 跑測試確認 fail**（元件不存在）
- [ ] **Step 3: 實作 `WorkspaceHeader.vue`**（KPI + 月份 + 動作鈕；按鈕 emit）
- [ ] **Step 4: 實作 `AttendanceWorkspaceView.vue`**（grid 三欄 + isMobile 分頁 + provide ws；三欄先放空 `<div>` 佔位，下個 task 填）
- [ ] **Step 5: 改路由** `src/router/index.ts:127` component 改為 `() => import('../views/attendance/AttendanceWorkspaceView.vue')`（path/name/meta 不變）
- [ ] **Step 6: 跑測試確認 pass + typecheck**
- [ ] **Step 7: Commit（FE）** `feat(attendance): 月結工作台容器 + header + 路由切換`

---

# Part 4 — 前端：三欄內容

## Task FE-3: RosterColumn（名冊）

**Files:** Create `src/components/attendance/RosterColumn.vue` + `__tests__/RosterColumn.spec.ts`

**契約：** props `{ roster: RosterRow[]; selectedEmployeeId: number|null; loading: boolean }`；emits `select(employeeId)`。內含搜尋框（姓名/編號，本地 filter）+ 排序（預設 `anomaly_count desc`，其次姓名 `localeCompare(...,'zh-TW')`）；每列顯示姓名 + 狀態徽章（全勤 `el-tag success ✓` / 遲到N `warning` / 缺卡N `danger`）；選中列高亮（`var(--brand-primary-soft)`）。空資料用 `EmptyState`。

- [ ] Step 1：寫測試（給 3 列 roster，斷言搜尋過濾、點列 emit `select` 帶 id、徽章文字）
- [ ] Step 2：跑測試 fail
- [ ] Step 3：實作（`<el-input>` 搜尋 + `computed` filtered/sorted + `v-for` 列 + `@click="$emit('select', r.employee_id)"`）
- [ ] Step 4：跑測試 pass + typecheck
- [ ] Step 5：Commit `feat(attendance): RosterColumn 名冊欄`

> 異常數徽章來源：若 anomalies item 無 `employee_id`，改用 summary 的 `late_count + missing_punch_in + missing_punch_out + early_leave_count` 當「該員異常數」估計（先驗證 anomalies response 是否含 employee_id；BE 探查未明列，實作前 grep `_build_anomaly_rows` 確認，缺則加進後端 item 或用 summary 估計）。

## Task FE-4: AnomalyQueueColumn（異常佇列）

**Files:** Create `src/components/attendance/AnomalyQueueColumn.vue` + `__tests__/AnomalyQueueColumn.spec.ts`

**契約：** props `{ items: AnomalyItem[]; selectedIndex: number; loading: boolean }`；emits `select(index)`、`filterChange({type, status})`。頂部篩選 `el-select`（類型 all/late/early_leave/missing_punch、狀態 all/pending/confirmed）；列顯示「姓名 日期 type_label 預估扣款」，pending 紅點；選中高亮。空用 `EmptyState`。

- [ ] Step 1：寫測試（給 items，斷言渲染、點列 emit `select(index)`、篩選 emit）
- [ ] Step 2-4：fail → 實作 → pass + typecheck
- [ ] Step 5：Commit `feat(attendance): AnomalyQueueColumn 異常佇列欄`

## Task FE-5: ResolveCard 逐筆卡（核心，含 auto-advance）

**Files:** Create `src/components/attendance/ResolveCard.vue` + `__tests__/ResolveCard.spec.ts`

**契約：** props `{ item: AnomalyItem; index: number; total: number; context: { punch_in: string|null; punch_out: string|null; has_leave: boolean; estimated_deduction: number } }`；emits `resolve({ action, payload })`、`navigate(delta)`（◀▶）。
- 標頭：姓名 · 日期(weekday) · type_label badge · `第 {index+1}/{total} 筆` + ◀▶。
- 脈絡卡：上班/下班（缺者顯示可編輯欄 `el-time-picker` 或 `el-input HH:MM`）、是否有請假、預估扣款。
- 動作（3 顆，gate `hasPermission('ATTENDANCE_WRITE')`）：
  - 「補打下班卡並重算」→ emit `resolve({ action:'punch', payload:{ punch_in, punch_out } })`（父呼叫 `POST /attendance/record`）。
  - 「接受扣款」→ emit `resolve({ action:'admin_accept' })`（父呼叫 `batch-confirm` 傳 `[item.id]`）。
  - 「豁免」→ emit `resolve({ action:'admin_waive' })`。
- 父層（DetailColumn）處理 resolve 成功後：從 `anomalyQueue` 移除同 `att.id` 全部 item、KPI 更新、`navigate(+1)` 自動跳下一筆。

- [ ] Step 1：寫測試（mock `hasPermission` true；點三顆鈕各 emit 對應 action；缺下班卡時補時間後 emit payload 帶 punch_out；◀▶ emit navigate）
- [ ] Step 2-4：fail → 實作 → pass + typecheck
- [ ] Step 5：Commit `feat(attendance): ResolveCard 逐筆異常處理卡`

## Task FE-6: DetailColumn 外殼 + EmployeeMonthPanel + 串接動作

**Files:** Create `src/components/attendance/DetailColumn.vue`、`src/components/attendance/EmployeeMonthPanel.vue` + 各 `__tests__`

**契約：**
- `DetailColumn`：inject `attendanceWs`；state `mode: 'resolve'|'month'`。`mode==='resolve'` 渲染 `ResolveCard`（餵 `anomalyQueue[selectedIndex]` + context）；`mode==='month'` 渲染 `EmployeeMonthPanel`。提供「看整月」按鈕切 month、月面板提供「回佇列」切 resolve。
  - 處理 `ResolveCard` 的 `resolve`：`action==='punch'` → `createOrUpdate({ employee_id, date, punch_in, punch_out })`（用 `POST /attendance/record`，需在 attendance.ts 補 `upsertRecord`）；`admin_accept`/`admin_waive` → `batchConfirmAnomalies({ attendance_ids:[id], action })`。成功 → `ElMessage.success` + `ws.refresh()`（或局部移除）+ auto-advance；失敗 → `notify(e, ...)`（409 封存月明確提示）。
- `EmployeeMonthPanel`：props `{ employeeId, year, month }`；onMounted 呼叫 `getRecords({year, month, employee_id})` 顯示整月列表（日期/上下班/狀態），異常日標紅，列上可「補打卡」（同 upsert）。

- [ ] Step 1：寫 DetailColumn 測試（mock api，模擬點「接受」→ 呼叫 batchConfirm 帶 `[id]` 且去重；punch → 呼叫 upsert）
- [ ] Step 2-4：fail → 實作 → pass + typecheck
- [ ] Step 5：在 `src/api/attendance.ts` 補 `export const upsertRecord = (data: {employee_id:number; date:string; punch_in?:string; punch_out?:string}) => api.post('/attendance/record', data)`
- [ ] Step 6：Commit `feat(attendance): DetailColumn + 整月面板 + 動作串接`

---

# Part 5 — 前端：匯入預覽對話框

## Task FE-7: ImportPreviewDialog

**Files:** Create `src/components/attendance/ImportPreviewDialog.vue` + `__tests__/ImportPreviewDialog.spec.ts`

**契約：** props `{ modelValue: boolean; year: number; month: number }`；emits `update:modelValue`、`imported(summary)`。
- 步驟 1 選來源：`el-tabs` [上傳檔案 `el-upload`／貼上文字 `el-input textarea`]。
- 取得來源後呼叫 `previewImport({ raw_text 或 records, year, month })` → 渲染 banner（可匯入N／問題M／將覆蓋K）+ 逐列表（row_num/員工/日期/上下班/狀態/檢核 tag，問題列紅、覆蓋列黃）。
- footer：取消／下載問題清單（前端組 CSV）／`確認匯入 {importable+overwrites} 筆`（呼叫既有 `uploadCsv({ records: normalized, year, month })`）→ 成功 emit `imported` + 關閉。**前端不再硬編欄位解析**（解析在後端 preview）。
- el-dialog teleport：測試 stub `'el-dialog': true`、`teleport: true`。

- [ ] Step 1：寫測試（mock `previewImport` 回 fixture → 斷言 banner 數字、各檢核列 tag；點確認 → 呼叫 `uploadCsv` 帶 normalized；emit imported）
- [ ] Step 2-4：fail → 實作 → pass + typecheck
- [ ] Step 5：Commit `feat(attendance): 匯入預覽對話框（後端解析 + 逐列檢核）`

## Task FE-8: header 接 ImportPreviewDialog + 收尾

**Files:** Modify `AttendanceWorkspaceView.vue`（掛 dialog、接 header `@import`）；刪除舊 `src/views/AttendanceView.vue`

- [ ] Step 1：`AttendanceWorkspaceView` 接 header `@import="importOpen=true"`，掛 `<ImportPreviewDialog v-model="importOpen" :year :month @imported="onImported" />`，`onImported` → `ws.refresh()` + `ElMessage.success`。
- [ ] Step 2：grep 確認無其他地方 import 舊 `views/AttendanceView.vue`（除路由已改），刪除該檔。
- [ ] Step 3：跑全前端考勤相關測試 + typecheck + lint：
  Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/attendance src/composables/__tests__/useAttendanceWorkspace.test.ts src/views/attendance && npx vue-tsc --noEmit -p tsconfig.json && npx eslint src/views/attendance src/components/attendance`
  Expected: 全綠、typecheck 0 error、ESLint 0
- [ ] Step 4：Commit（FE）`refactor(attendance): 工作台接匯入對話框並移除舊 AttendanceView`

---

# Part 6 — 整合驗證與收尾

## Task INT-1: 端到端整合驗證
- [ ] `cd ~/Desktop/ivyManageSystem && ./start.sh` 起兩端。
- [ ] 實機走一遍：選月 → 匯入（貼上含一筆查無員工/一筆無效日期）看預覽分類 → 確認匯入 → 異常進佇列 → 逐筆卡補打卡/接受/豁免 → KPI 更新 → 匯出月報。
- [ ] 驗證行動裝置（縮窗）三欄退化成分頁可用。
- [ ] 驗證封存月匯入被標 `month_finalized` 跳過、封存月補打卡 409 有明確訊息。

## Task INT-2: 後端全套回歸 + 漂移檢查
- [ ] `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_attendance_shift_window.py tests/test_attendance_csv_shift_aware.py tests/test_attendance_upload_preview.py tests/test_overnight_attendance.py tests/test_attendance_calc.py tests/test_attendance_leave_merge.py -v` 全綠。
- [ ] `cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api:check`（OpenAPI 漂移）綠。

## Task INT-3: 收尾紀律
- [ ] 兩 repo 分開 commit 已完成；確認 `git log` 訊息描述同一功能。
- [ ] 按 workspace「完成 = push + CI 綠 + worktree remove」：`cd ~/Desktop/ivyManageSystem && ./scripts/finish-check.sh`（push 由 user 決定，含 migration 的後端 push 前確認 prod 前置）。
- [ ] 更新 memory（本次新增工作台 + 匯入預覽端點 + shift-window util）。

---

## Self-Review（已執行）

**1. Spec coverage：** ① 三欄工作台 → FE-2~6 ② 逐筆卡+auto-advance → FE-5/6 ③ 匯入預覽（後端解析+逐列檢核） → BE-4 + FE-7 ④ shift-aware 正確性修補 → BE-1~3（TDD RED 重現 13:00 假遲到） ⑤ 行動退化 → FE-2/INT-1 ⑥ 重用既有端點（summary/anomalies/records/batch-confirm/record） → FE-1/6 ⑦ 保留守衛（封存/self-guard/旗標同步） → 未改既有寫入路徑、預覽計入 month_finalized。全覆蓋。

**2. Placeholder scan：** 後端任務全含完整測試碼+實作碼；前端 spine（useAttendanceWorkspace）完整碼，SFC 任務以「契約 + mirror 範本檔（SalaryHubView/AdjustDrawer/StepReview）+ 測試斷言」描述（執行子代理照範本補 SFC body）。BE-3 的 xlsx 建檔與 BE-2 變數名對齊標為實作時對齊既有結構——非佔位，是明確的對齊指示。

**3. Type consistency：** `compute_status_for_employee_date` 5-tuple 與 `compute_shift_aware_status` 一致；FE `RosterRow`/`AnomalyItem`/`Kpis` 跨 FE-1~6 一致；`dedupeAnomalyIds`/`buildKpis` 純函式契約被測試鎖定；batch-confirm 傳 `attendance_ids:[id]`、record 傳 `employee_id` DB 主鍵——與 BE 探查一致。

**已知待實作時確認（非阻斷）：** ① anomalies item 是否含 `employee_id`（影響名冊異常徽章來源，FE-3 註明 grep 確認） ② CSV 函式既有「員工編號→Employee」變數名（BE-2 Step3 對齊） ③ `is_head_teacher`/`is_assistant` 欄位是否存在於 Employee model（不存在則 `getattr(...,False)` 安全退化）。
