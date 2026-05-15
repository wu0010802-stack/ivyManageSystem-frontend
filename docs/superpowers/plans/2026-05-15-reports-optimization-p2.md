# 報表統計優化 P2：篩選與下鑽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 admin 報表統計頁的 AttendancePanel/SalaryPanel 加 client-side filter + 點擊長條圖開 drill-down dialog，解 admin「看到趨勢但問不出為什麼」的痛點。

**Architecture:** 後端新 2 endpoint（仿 `/api/reports/finance-summary/detail`），用 `report_cache_service` TTL 30 分。前端新 2 dialog（仿 `FinanceDetailDialog.vue` bare-axios pattern，不走 useCachedAsync 因 drill-down 為一次性查詢）。Chart.js BarChart 透過 `options.onClick` callback 處理點擊；click 帶回 `elements[0].index` 對應 dataset 索引。

**Tech Stack:** FastAPI + SQLAlchemy + pytest（後端）；Vue 3 SFC + Element Plus + Chart.js（前端）

**Spec:** `docs/superpowers/specs/2026-05-15-reports-optimization-p2-design.md`

**Branches:**
- Backend：`feat/reports-p2-drilldown-backend`（worktree `~/Desktop/ivy-backend-p2`）
- Frontend：`feat/reports-p2-drilldown-frontend`（`~/Desktop/ivy-frontend`，已 commit P2 spec）

---

## 前置知識

### `report_cache_service.get_or_build` 介面

```python
from services.report_cache_service import report_cache_service

result = report_cache_service.get_or_build(
    session,
    category="reports_attendance_detail",   # 字串 prefix
    ttl_seconds=1800,
    params={"year": 2026, "month": 3, "classroom_id": 5},  # None 值可帶
    builder=lambda: build_data(...),  # 真的 query 拉資料
)
```

key = `"{category}:{json.dumps(params, sort_keys=True)}"`。可以用 `report_cache_service.invalidate_category(session, category)` 主動清。

### `has_full_salary_view` 與 `mask_dict_fields`（utils/salary_access.py）

```python
from utils.salary_access import has_full_salary_view, mask_dict_fields

if not has_full_salary_view(current_user):
    row = mask_dict_fields(row, ("gross_salary", "overtime_pay"), placeholder=None)
```

`has_full_salary_view` 對 admin/hr 回 True，其他 role 回 False。

### Permission 守衛

```python
from utils.auth import require_staff_permission
from utils.permissions import Permission

current_user: dict = Depends(require_staff_permission(Permission.REPORTS))
```

`Permission.REPORTS = 1 << 13`，admin 持有全部。

### Pytest fixture（複用 `test_finance_report.py` 的 `fin_client`）

```python
@pytest.fixture
def fin_client(tmp_path):
    # SQLite in-memory + reports_router + admin login flow
    # 詳見 tests/test_finance_report.py 開頭 60-90 行
    ...
```

新 test file `tests/test_reports_drilldown.py` 自己造一個類似的 fixture（不需 _register_auto_mirror_payment，drill-down 不碰 fees）。

### Chart.js onClick callback（vue-chartjs Bar）

```js
const options = {
  ...
  onClick: (event, elements, chart) => {
    if (elements.length === 0) return  // 點到空白
    const { index } = elements[0]  // dataset bar 的 index（0-based）
    // 對 attendance_monthly：index 0-11 → month = index + 1
    // 對 attendance_by_classroom：index → data[index]
  }
}
```

### Verification commands

```bash
# Backend
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py -v

# Frontend
cd ~/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Frontend baseline test count post-P1: **1365 passed / 2 failed (pre-existing OvertimeView)**。

---

## 檔案結構

| 路徑 | 動作 | 用途 |
|---|---|---|
| `~/Desktop/ivy-backend-p2/api/reports.py` | 修改 | + 2 endpoint；小改 `_query_attendance_by_classroom` 加 `classroom_id` |
| `~/Desktop/ivy-backend-p2/tests/test_reports_drilldown.py` | 新增 | 8 pytest case |
| `~/Desktop/ivy-frontend/src/api/reports.js` | 修改 | + 2 axios wrapper |
| `~/Desktop/ivy-frontend/src/views/reports/AttendanceDetailDialog.vue` | 新增 | 異常記錄 dialog |
| `~/Desktop/ivy-frontend/src/views/reports/SalaryContributorsDialog.vue` | 新增 | 薪資榜首 dialog |
| `~/Desktop/ivy-frontend/src/views/reports/AttendancePanel.vue` | 修改 | + 班級 filter + bar click + dialog mount |
| `~/Desktop/ivy-frontend/src/views/reports/SalaryPanel.vue` | 修改 | + bar click + dialog mount |

---

## Task 1：後端 `_query_attendance_by_classroom` 加 `classroom_id`

**動機**：前端點班級長條時用 id 開 drill-down dialog，而非 name（避免名字含特殊字元、改名時失準）。

**Files:**
- Modify: `~/Desktop/ivy-backend-p2/api/reports.py:80-125`

- [ ] **Step 1：修改 query 加 `Classroom.id`**

打開 `api/reports.py`，找到 `_query_attendance_by_classroom`（line 80 開頭）。把 SELECT clause 與 result dict 各加 `classroom_id`：

把當前的：

```python
def _query_attendance_by_classroom(session, start: date, end: date) -> list:
    """查詢並整理各班級年度考勤出勤率。"""
    rows = (
        session.query(
            Classroom.name.label("classroom"),
            func.count(Attendance.id).label("total"),
            func.sum(func.cast(Attendance.is_late, Integer)).label("late"),
            func.sum(func.cast(Attendance.is_early_leave, Integer)).label(
                "early_leave"
            ),
        )
        .join(
            Employee,
            Employee.classroom_id == Classroom.id,
        )
        .join(
            Attendance,
            Attendance.employee_id == Employee.id,
        )
        .filter(
            Attendance.attendance_date >= start,
            Attendance.attendance_date <= end,
            Classroom.is_active == True,
        )
        .group_by(Classroom.name)
        .order_by(Classroom.name)
        .all()
    )

    result = []
    for row in rows:
        total = int(row.total)
        late = int(row.late or 0)
        early = int(row.early_leave or 0)
        anomaly = late + early
        rate = round((total - anomaly) / total * 100, 1) if total > 0 else 0
        result.append(
            {
                "classroom": row.classroom,
                "total_records": total,
                "late": late,
                "early_leave": early,
                "rate": rate,
            }
        )
    return result
```

替換為：

```python
def _query_attendance_by_classroom(session, start: date, end: date) -> list:
    """查詢並整理各班級年度考勤出勤率。"""
    rows = (
        session.query(
            Classroom.id.label("classroom_id"),
            Classroom.name.label("classroom"),
            func.count(Attendance.id).label("total"),
            func.sum(func.cast(Attendance.is_late, Integer)).label("late"),
            func.sum(func.cast(Attendance.is_early_leave, Integer)).label(
                "early_leave"
            ),
        )
        .join(
            Employee,
            Employee.classroom_id == Classroom.id,
        )
        .join(
            Attendance,
            Attendance.employee_id == Employee.id,
        )
        .filter(
            Attendance.attendance_date >= start,
            Attendance.attendance_date <= end,
            Classroom.is_active == True,
        )
        .group_by(Classroom.id, Classroom.name)
        .order_by(Classroom.name)
        .all()
    )

    result = []
    for row in rows:
        total = int(row.total)
        late = int(row.late or 0)
        early = int(row.early_leave or 0)
        anomaly = late + early
        rate = round((total - anomaly) / total * 100, 1) if total > 0 else 0
        result.append(
            {
                "classroom_id": int(row.classroom_id),
                "classroom": row.classroom,
                "total_records": total,
                "late": late,
                "early_leave": early,
                "rate": rate,
            }
        )
    return result
```

**改動點**：
- SELECT 加 `Classroom.id.label("classroom_id")`
- `group_by` 加 `Classroom.id`
- result dict 加 `"classroom_id": int(row.classroom_id)`

- [ ] **Step 2：執行既有測試確認不破**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/ -k "dashboard or finance" -v 2>&1 | tail -15
```

Expected: 既有 reports/finance 測試全綠。新欄位是 additive，不會破壞舊測試。

- [ ] **Step 3：Commit**

```bash
cd ~/Desktop/ivy-backend-p2 && git add api/reports.py && git commit -m "$(cat <<'EOF'
feat(reports): attendance_by_classroom 多回 classroom_id

P2 前置：前端 click 班級長條圖時用 id 開 drill-down dialog，
不再靠 name 反查（避免改名/特殊字元失準）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：後端 `/api/reports/attendance/detail` endpoint + pytest

**Files:**
- Modify: `~/Desktop/ivy-backend-p2/api/reports.py`
- Create: `~/Desktop/ivy-backend-p2/tests/test_reports_drilldown.py`

- [ ] **Step 1：寫 pytest fixture + 第一個失敗測試**

新建 `~/Desktop/ivy-backend-p2/tests/test_reports_drilldown.py`：

```python
"""Reports drill-down endpoints 測試（P2）。"""

import os
import sys
from datetime import date, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models.base as base_module
from api.auth import router as auth_router, _account_failures, _ip_attempts
from api.reports import router as reports_router
from models.database import (
    Attendance,
    Base,
    Classroom,
    Employee,
    SalaryRecord,
    User,
)
from utils.auth import hash_password


@pytest.fixture
def client(tmp_path):
    db_path = tmp_path / "drilldown.sqlite"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    session_factory = sessionmaker(bind=engine)
    old_e, old_sf = base_module._engine, base_module._SessionFactory
    base_module._engine = engine
    base_module._SessionFactory = session_factory
    Base.metadata.create_all(engine)
    _ip_attempts.clear()
    _account_failures.clear()
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(reports_router)
    with TestClient(app) as c:
        yield c, session_factory
    _ip_attempts.clear()
    _account_failures.clear()
    base_module._engine = old_e
    base_module._SessionFactory = old_sf
    engine.dispose()


def _login(client, sf, username="admin", role="admin", permissions=-1):
    with sf() as s:
        s.add(
            User(
                username=username,
                password_hash=hash_password("Passw0rd!"),
                role=role,
                permissions=permissions,
                is_active=True,
                must_change_password=False,
            )
        )
        s.commit()
    r = client.post(
        "/api/auth/login", json={"username": username, "password": "Passw0rd!"}
    )
    assert r.status_code == 200, r.text


def _seed_attendance_anomalies(sf):
    """造 2 個 employee × 2 個 classroom × 3 筆異常 = 6 筆異常記錄 (2026 年 3 月)。"""
    with sf() as s:
        s.add_all(
            [
                Classroom(id=10, name="A 班", is_active=True),
                Classroom(id=20, name="B 班", is_active=True),
                Employee(
                    id=1, name="王老師", classroom_id=10, position="老師",
                    employment_type="正式",
                ),
                Employee(
                    id=2, name="陳老師", classroom_id=20, position="老師",
                    employment_type="正式",
                ),
            ]
        )
        s.commit()
        s.add_all(
            [
                Attendance(
                    employee_id=1, attendance_date=date(2026, 3, 5),
                    is_late=True, late_minutes=10,
                ),
                Attendance(
                    employee_id=1, attendance_date=date(2026, 3, 12),
                    is_early_leave=True, early_leave_minutes=8,
                ),
                Attendance(
                    employee_id=1, attendance_date=date(2026, 3, 20),
                    is_missing_punch_in=True,
                ),
                Attendance(
                    employee_id=2, attendance_date=date(2026, 3, 7),
                    is_late=True, late_minutes=5,
                ),
                Attendance(
                    employee_id=2, attendance_date=date(2026, 4, 3),
                    is_late=True, late_minutes=15,
                ),
                # 正常考勤（不應出現在 anomalies）
                Attendance(
                    employee_id=1, attendance_date=date(2026, 3, 25),
                ),
            ]
        )
        s.commit()


def test_attendance_detail_no_filters_returns_anomalies(client):
    c, sf = client
    _login(c, sf)
    _seed_attendance_anomalies(sf)
    r = c.get("/api/reports/attendance/detail?year=2026")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["year"] == 2026
    assert data["month"] is None
    assert data["classroom_id"] is None
    assert data["total_records"] == 5  # 5 筆異常（不含 normal）
    assert data["truncated"] is False
    types = [set(rec["anomaly_types"]) for rec in data["records"]]
    assert {"late"} in types
    assert {"early_leave"} in types
```

- [ ] **Step 2：跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py::test_attendance_detail_no_filters_returns_anomalies -v 2>&1 | tail -15
```

Expected: FAIL（404 或 endpoint not found），因 endpoint 尚未建立。

- [ ] **Step 3：實作 endpoint**

在 `api/reports.py` 檔尾（`export_finance_summary` 之後）新增：

```python
ATTENDANCE_DETAIL_CACHE_TTL_SECONDS = 1800  # 30 分鐘
ATTENDANCE_DETAIL_LIMIT = 200


def _build_attendance_detail(
    session,
    year: int,
    month: int | None,
    classroom_id: int | None,
) -> dict:
    """查詢指定年份/月份/班級的考勤異常記錄。"""
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    if month is not None:
        # month 邊界
        from calendar import monthrange

        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])

    query = (
        session.query(
            Attendance.attendance_date.label("date"),
            Employee.id.label("employee_id"),
            Employee.name.label("employee_name"),
            Classroom.id.label("classroom_id"),
            Classroom.name.label("classroom_name"),
            Attendance.is_late,
            Attendance.is_early_leave,
            Attendance.is_missing_punch_in,
            Attendance.is_missing_punch_out,
            Attendance.late_minutes,
            Attendance.early_leave_minutes,
            Attendance.remark,
        )
        .join(Employee, Employee.id == Attendance.employee_id)
        .outerjoin(Classroom, Classroom.id == Employee.classroom_id)
        .filter(
            Attendance.attendance_date >= start,
            Attendance.attendance_date <= end,
            # 異常條件：任一旗標為 true
            (
                Attendance.is_late.is_(True)
                | Attendance.is_early_leave.is_(True)
                | Attendance.is_missing_punch_in.is_(True)
                | Attendance.is_missing_punch_out.is_(True)
            ),
        )
    )
    if classroom_id is not None:
        query = query.filter(Employee.classroom_id == classroom_id)

    # 先算總筆數
    total = query.count()
    rows = (
        query.order_by(Attendance.attendance_date.desc(), Employee.id)
        .limit(ATTENDANCE_DETAIL_LIMIT)
        .all()
    )

    records = []
    for row in rows:
        anomaly_types = []
        if row.is_late:
            anomaly_types.append("late")
        if row.is_early_leave:
            anomaly_types.append("early_leave")
        if row.is_missing_punch_in:
            anomaly_types.append("missing_punch_in")
        if row.is_missing_punch_out:
            anomaly_types.append("missing_punch_out")
        records.append(
            {
                "date": row.date.isoformat(),
                "employee_id": int(row.employee_id),
                "employee_name": row.employee_name,
                "classroom_id": int(row.classroom_id) if row.classroom_id else None,
                "classroom_name": row.classroom_name,
                "anomaly_types": anomaly_types,
                "late_minutes": int(row.late_minutes or 0),
                "early_minutes": int(row.early_leave_minutes or 0),
                "missing_punch_in": bool(row.is_missing_punch_in),
                "missing_punch_out": bool(row.is_missing_punch_out),
                "note": row.remark,
            }
        )

    return {
        "year": year,
        "month": month,
        "classroom_id": classroom_id,
        "records": records,
        "total_records": total,
        "truncated": total > ATTENDANCE_DETAIL_LIMIT,
    }


@router.get("/attendance/detail")
def get_attendance_detail(
    year: int = Query(..., ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    classroom_id: Optional[int] = Query(None, ge=1),
    current_user: dict = Depends(require_staff_permission(Permission.REPORTS)),
):
    """考勤異常記錄列表（drill-down）。

    任一旗標 (is_late / is_early_leave / is_missing_punch_in/out) 為 true 即列入。
    LIMIT 200；total_records 為 filter 後總數，前端據 truncated 顯提示。
    """
    session = get_session()
    try:
        return report_cache_service.get_or_build(
            session,
            category="reports_attendance_detail",
            ttl_seconds=ATTENDANCE_DETAIL_CACHE_TTL_SECONDS,
            params={"year": year, "month": month, "classroom_id": classroom_id},
            builder=lambda: _build_attendance_detail(
                session, year, month, classroom_id
            ),
        )
    finally:
        session.close()
```

- [ ] **Step 4：跑測試確認通過**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py::test_attendance_detail_no_filters_returns_anomalies -v 2>&1 | tail -10
```

Expected: PASS。

- [ ] **Step 5：補其他 4 個 attendance 測試**

在 `test_reports_drilldown.py` 加：

```python
def test_attendance_detail_filtered_by_month(client):
    c, sf = client
    _login(c, sf)
    _seed_attendance_anomalies(sf)
    r = c.get("/api/reports/attendance/detail?year=2026&month=3")
    assert r.status_code == 200
    data = r.json()
    assert data["month"] == 3
    assert data["total_records"] == 4  # 3 月只 4 筆（不含 4/3 的）
    for rec in data["records"]:
        assert rec["date"].startswith("2026-03-")


def test_attendance_detail_filtered_by_classroom(client):
    c, sf = client
    _login(c, sf)
    _seed_attendance_anomalies(sf)
    r = c.get("/api/reports/attendance/detail?year=2026&classroom_id=10")
    assert r.status_code == 200
    data = r.json()
    assert data["classroom_id"] == 10
    assert data["total_records"] == 3  # employee_id=1 全部異常筆數
    for rec in data["records"]:
        assert rec["classroom_id"] == 10


def test_attendance_detail_no_permission_returns_403(client):
    c, sf = client
    # 建立無 REPORTS 權限的 user (perm bit 13)
    _login(c, sf, username="reader", role="staff", permissions=0)
    r = c.get("/api/reports/attendance/detail?year=2026")
    assert r.status_code == 403


def test_attendance_detail_truncates_at_200(client, monkeypatch):
    c, sf = client
    _login(c, sf)
    # 直接降 LIMIT 到 3 模擬截斷
    from api import reports as reports_mod

    monkeypatch.setattr(reports_mod, "ATTENDANCE_DETAIL_LIMIT", 3)
    _seed_attendance_anomalies(sf)  # 5 筆異常
    r = c.get("/api/reports/attendance/detail?year=2026")
    data = r.json()
    assert data["total_records"] == 5
    assert len(data["records"]) == 3
    assert data["truncated"] is True
```

- [ ] **Step 6：跑 4 個新測試**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py -v 2>&1 | tail -20
```

Expected: 5/5 PASS（含 Step 1 的 + 新 4 個）。

- [ ] **Step 7：Commit**

```bash
cd ~/Desktop/ivy-backend-p2 && git add api/reports.py tests/test_reports_drilldown.py && git commit -m "$(cat <<'EOF'
feat(reports): 新增 /api/reports/attendance/detail drill-down endpoint

回應指定 year/month/classroom_id 的考勤異常記錄（遲到/早退/缺卡），
任一旗標 true 即列入；LIMIT 200，total_records 為截斷前總數。
report_cache_service 加 reports_attendance_detail category TTL 30 分。

5 pytest（no_filters / by_month / by_classroom / no_permission / truncated）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：後端 `/api/reports/salary/contributors` endpoint + pytest

**Files:**
- Modify: `~/Desktop/ivy-backend-p2/api/reports.py`
- Modify: `~/Desktop/ivy-backend-p2/tests/test_reports_drilldown.py`

- [ ] **Step 1：寫第一個失敗測試**

加到 `tests/test_reports_drilldown.py`：

```python
def _seed_salary_contributors(sf):
    """造 6 筆 2026/3 已封存薪資 + 1 筆草稿（不入榜）。"""
    with sf() as s:
        s.add_all(
            [
                Employee(id=11, name="王老師", position="老師"),
                Employee(id=12, name="陳老師", position="老師"),
                Employee(id=13, name="李老師", position="老師"),
                Employee(id=14, name="林老師", position="老師"),
                Employee(id=15, name="張老師", position="老師"),
                Employee(id=16, name="黃老師", position="老師"),
                Employee(id=17, name="周老師（草稿）", position="老師"),
            ]
        )
        s.commit()
        s.add_all(
            [
                SalaryRecord(
                    employee_id=11, salary_year=2026, salary_month=3,
                    gross_salary=70000, net_salary=60000, overtime_pay=5000,
                    is_finalized=True, needs_recalc=False,
                ),
                SalaryRecord(
                    employee_id=12, salary_year=2026, salary_month=3,
                    gross_salary=65000, net_salary=55000, overtime_pay=12000,
                    is_finalized=True, needs_recalc=False,
                ),
                SalaryRecord(
                    employee_id=13, salary_year=2026, salary_month=3,
                    gross_salary=60000, net_salary=50000, overtime_pay=8000,
                    is_finalized=True, needs_recalc=False,
                ),
                SalaryRecord(
                    employee_id=14, salary_year=2026, salary_month=3,
                    gross_salary=55000, net_salary=45000, overtime_pay=3000,
                    is_finalized=True, needs_recalc=False,
                ),
                SalaryRecord(
                    employee_id=15, salary_year=2026, salary_month=3,
                    gross_salary=50000, net_salary=42000, overtime_pay=0,
                    is_finalized=True, needs_recalc=False,
                ),
                SalaryRecord(
                    employee_id=16, salary_year=2026, salary_month=3,
                    gross_salary=45000, net_salary=38000, overtime_pay=2000,
                    is_finalized=True, needs_recalc=False,
                ),
                # 草稿：不入榜
                SalaryRecord(
                    employee_id=17, salary_year=2026, salary_month=3,
                    gross_salary=999999, net_salary=999999, overtime_pay=999999,
                    is_finalized=False, needs_recalc=True,
                ),
            ]
        )
        s.commit()


def test_salary_contributors_top5_gross_and_overtime(client):
    c, sf = client
    _login(c, sf)
    _seed_salary_contributors(sf)
    r = c.get("/api/reports/salary/contributors?year=2026&month=3")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["year"] == 2026
    assert data["month"] == 3
    # top_gross：排序 70000, 65000, 60000, 55000, 50000（不含 45000）
    assert len(data["top_gross"]) == 5
    gross_amounts = [rec["gross_salary"] for rec in data["top_gross"]]
    assert gross_amounts == [70000, 65000, 60000, 55000, 50000]
    # top_overtime：排序 12000, 8000, 5000, 3000, 2000（不含 0）
    assert len(data["top_overtime"]) == 5
    ot_amounts = [rec["overtime_pay"] for rec in data["top_overtime"]]
    assert ot_amounts == [12000, 8000, 5000, 3000, 2000]
    # 草稿不入榜（id=17 的 999999 不會出現）
    all_ids = {r["employee_id"] for r in data["top_gross"] + data["top_overtime"]}
    assert 17 not in all_ids
```

- [ ] **Step 2：跑測試確認失敗**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py::test_salary_contributors_top5_gross_and_overtime -v 2>&1 | tail -10
```

Expected: FAIL (404)。

- [ ] **Step 3：實作 endpoint**

在 `api/reports.py` 檔尾新增：

```python
SALARY_CONTRIBUTORS_CACHE_TTL_SECONDS = 1800
SALARY_CONTRIBUTORS_LIMIT = 5


def _build_salary_contributors(session, year: int, month: int) -> dict:
    """查指定月份 top 5 gross + top 5 overtime（只認 finalized 非 stale）。"""
    base_filter = (
        SalaryRecord.salary_year == year,
        SalaryRecord.salary_month == month,
        SalaryRecord.is_finalized == True,  # noqa: E712
        SalaryRecord.needs_recalc == False,  # noqa: E712
    )

    top_gross_rows = (
        session.query(
            SalaryRecord.employee_id,
            Employee.name.label("employee_name"),
            SalaryRecord.gross_salary,
            SalaryRecord.is_finalized,
        )
        .join(Employee, Employee.id == SalaryRecord.employee_id)
        .filter(*base_filter)
        .order_by(SalaryRecord.gross_salary.desc())
        .limit(SALARY_CONTRIBUTORS_LIMIT)
        .all()
    )

    top_overtime_rows = (
        session.query(
            SalaryRecord.employee_id,
            Employee.name.label("employee_name"),
            SalaryRecord.overtime_pay,
            SalaryRecord.is_finalized,
        )
        .join(Employee, Employee.id == SalaryRecord.employee_id)
        .filter(
            *base_filter,
            func.coalesce(SalaryRecord.overtime_pay, 0) > 0,
        )
        .order_by(SalaryRecord.overtime_pay.desc())
        .limit(SALARY_CONTRIBUTORS_LIMIT)
        .all()
    )

    return {
        "year": year,
        "month": month,
        "top_gross": [
            {
                "employee_id": int(r.employee_id),
                "employee_name": r.employee_name,
                "gross_salary": int(r.gross_salary or 0),
                "is_finalized": bool(r.is_finalized),
            }
            for r in top_gross_rows
        ],
        "top_overtime": [
            {
                "employee_id": int(r.employee_id),
                "employee_name": r.employee_name,
                "overtime_pay": int(r.overtime_pay or 0),
                "is_finalized": bool(r.is_finalized),
            }
            for r in top_overtime_rows
        ],
    }


@router.get("/salary/contributors")
def get_salary_contributors(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: dict = Depends(require_staff_permission(Permission.REPORTS)),
):
    """指定月份的薪資 top contributors（top 5 應發 + top 5 加班費）。

    F-031：非 admin/hr 看不到金額，gross_salary / overtime_pay 遮罩為 null。
    只認 is_finalized=True AND needs_recalc=False 的薪資。
    """
    from utils.salary_access import has_full_salary_view, mask_dict_fields

    session = get_session()
    try:
        result = report_cache_service.get_or_build(
            session,
            category="reports_salary_contributors",
            ttl_seconds=SALARY_CONTRIBUTORS_CACHE_TTL_SECONDS,
            params={"year": year, "month": month},
            builder=lambda: _build_salary_contributors(session, year, month),
        )

        # 金額遮罩在 cache 之外做（同 user 對應同遮罩；不同 user 不能共享 cache 結果）
        # 因此用 dict copy 後遮罩，不污染原 cache payload
        if not has_full_salary_view(current_user):
            result = dict(result)
            result["top_gross"] = [
                mask_dict_fields(r, ("gross_salary",), placeholder=None)
                for r in result.get("top_gross", [])
            ]
            result["top_overtime"] = [
                mask_dict_fields(r, ("overtime_pay",), placeholder=None)
                for r in result.get("top_overtime", [])
            ]
        return result
    finally:
        session.close()
```

> ⚠️ **注意**：上面的「遮罩在 cache 之外做」確實是有 subtle bug — `report_cache_service` 內部 deep cache 同份 payload，若我們 mutate 它，下次 admin 拿到的會是遮罩過的。因此採取 `result = dict(result)` 淺拷貝外層後**重建 top_gross / top_overtime 兩個 list**（list 元素也 copy）。`mask_dict_fields` 既有實作如為 in-place mutate 需確認。

- [ ] **Step 4：驗證 `mask_dict_fields` 不破壞 cache**

```bash
cd ~/Desktop/ivy-backend-p2 && grep -n "def mask_dict_fields" utils/salary_access.py
```

讀 `utils/salary_access.py` 確認 `mask_dict_fields` 行為。若為 **回傳新 dict**（不 in-place 改），上面 Step 3 邏輯 OK；若為 **in-place mutate**，需要先 `dict(r)` 再 mask。`api/reports.py:312-326`（既有 `get_finance_summary_detail`）用同樣 pattern，可參考。

- [ ] **Step 5：跑測試確認通過**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py::test_salary_contributors_top5_gross_and_overtime -v 2>&1 | tail -10
```

Expected: PASS。

- [ ] **Step 6：補 2 個遮罩與草稿排除測試**

```python
def test_salary_contributors_masks_amount_for_non_admin(client):
    c, sf = client
    # REPORTS 權限但非 admin / 非 hr role
    _login(c, sf, username="viewer", role="staff", permissions=1 << 13)
    _seed_salary_contributors(sf)
    r = c.get("/api/reports/salary/contributors?year=2026&month=3")
    assert r.status_code == 200, r.text
    data = r.json()
    for rec in data["top_gross"]:
        assert rec["gross_salary"] is None  # 遮罩
        assert rec["employee_name"]  # 名字不遮
    for rec in data["top_overtime"]:
        assert rec["overtime_pay"] is None


def test_salary_contributors_excludes_draft_salaries(client):
    c, sf = client
    _login(c, sf)
    _seed_salary_contributors(sf)
    # 草稿 id=17 已在 fixture 設成 needs_recalc=True
    r = c.get("/api/reports/salary/contributors?year=2026&month=3")
    data = r.json()
    all_employee_ids = {
        rec["employee_id"] for rec in data["top_gross"] + data["top_overtime"]
    }
    assert 17 not in all_employee_ids
```

- [ ] **Step 7：跑全部 drilldown 測試**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/test_reports_drilldown.py -v 2>&1 | tail -15
```

Expected: 7/7 PASS（5 attendance + 2 salary 加 1 排除 = wait 應該是 5 + 3 = 8）。

實際應該是 5 attendance + 3 salary = **8 case 全綠**。

- [ ] **Step 8：跑全部 backend 測試確認不破**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/ 2>&1 | tail -5
```

Expected: baseline 數量全綠（3167 左右）。

- [ ] **Step 9：Commit**

```bash
cd ~/Desktop/ivy-backend-p2 && git add api/reports.py tests/test_reports_drilldown.py && git commit -m "$(cat <<'EOF'
feat(reports): 新增 /api/reports/salary/contributors drill-down endpoint

回應指定 month 的 top 5 gross + top 5 overtime；只認封存非 stale 薪資。
F-031 金額遮罩：非 admin/hr role gross_salary / overtime_pay 顯示 null。
TTL 30 分 cache（reports_salary_contributors category）。

3 pytest 補上去（top5 / mask / draft exclude），加上 attendance 5 個共 8 個全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：前端 api/reports.js + 2 dialog 元件

**Files:**
- Modify: `~/Desktop/ivy-frontend/src/api/reports.js`
- Create: `~/Desktop/ivy-frontend/src/views/reports/AttendanceDetailDialog.vue`
- Create: `~/Desktop/ivy-frontend/src/views/reports/SalaryContributorsDialog.vue`

- [ ] **Step 1：修改 api/reports.js**

替換整檔內容（目前 19 行）為：

```js
import api from './index'

export const getDashboard = (params) => api.get('/reports/dashboard', { params })

export const getFinanceSummary = (year, month) => {
  const params = { year }
  if (month != null) params.month = month
  return api.get('/reports/finance-summary', { params })
}

export const getFinanceSummaryDetail = (year, month) =>
  api.get('/reports/finance-summary/detail', { params: { year, month } })

// 配合 utils/download.js 的 downloadFile(url)：回傳端點路徑
export const financeSummaryExportUrl = (year, month) => {
  const qs = new URLSearchParams({ year: String(year) })
  if (month != null) qs.set('month', String(month))
  return `/reports/finance-summary/export?${qs.toString()}`
}

export const getAttendanceDetail = (year, { month = null, classroomId = null } = {}) => {
  const params = { year }
  if (month != null) params.month = month
  if (classroomId != null) params.classroom_id = classroomId
  return api.get('/reports/attendance/detail', { params })
}

export const getSalaryContributors = (year, month) =>
  api.get('/reports/salary/contributors', { params: { year, month } })
```

- [ ] **Step 2：建立 AttendanceDetailDialog.vue**

新建 `~/Desktop/ivy-frontend/src/views/reports/AttendanceDetailDialog.vue`：

```vue
<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getAttendanceDetail } from '@/api/reports'
import { apiError } from '@/utils/error'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  year: { type: Number, required: true },
  month: { type: Number, default: null },
  classroomId: { type: Number, default: null },
  classroomName: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref(null)

const load = async () => {
  if (!props.year) return
  loading.value = true
  try {
    const res = await getAttendanceDetail(props.year, {
      month: props.month,
      classroomId: props.classroomId,
    })
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入考勤明細失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month, props.classroomId],
  ([open]) => {
    if (open) load()
  },
)

const records = computed(() => data.value?.records || [])
const totalRecords = computed(() => data.value?.total_records || 0)
const truncated = computed(() => data.value?.truncated || false)

const title = computed(() => {
  const parts = [`${props.year} 年`]
  if (props.month != null) parts.push(`${props.month} 月`)
  else parts.push('全年')
  if (props.classroomName) parts.push(props.classroomName)
  parts.push('異常記錄')
  return parts.join(' ')
})

const ANOMALY_LABELS = {
  late: '遲到',
  early_leave: '早退',
  missing_punch_in: '缺打上班',
  missing_punch_out: '缺打下班',
}

const ANOMALY_TAG_TYPE = {
  late: 'warning',
  early_leave: 'warning',
  missing_punch_in: 'danger',
  missing_punch_out: 'danger',
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="900px"
    append-to-body
  >
    <div v-if="truncated" class="truncate-hint">
      結果共 {{ totalRecords }} 筆，僅顯示前 200 筆；建議縮小範圍（月份或班級）。
    </div>
    <el-table
      v-loading="loading"
      :data="records"
      border
      stripe
      max-height="500"
      size="small"
      empty-text="無異常記錄"
    >
      <el-table-column prop="date" label="日期" width="110" />
      <el-table-column prop="employee_name" label="員工" width="110" />
      <el-table-column prop="classroom_name" label="班級" width="100" />
      <el-table-column label="異常類型" min-width="180">
        <template #default="{ row }">
          <el-tag
            v-for="t in row.anomaly_types"
            :key="t"
            :type="ANOMALY_TAG_TYPE[t]"
            size="small"
            style="margin-right: 4px;"
          >
            {{ ANOMALY_LABELS[t] || t }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="遲到/早退" width="120" align="right">
        <template #default="{ row }">
          <span v-if="row.late_minutes">遲 {{ row.late_minutes }} 分</span>
          <span v-if="row.late_minutes && row.early_minutes"> / </span>
          <span v-if="row.early_minutes">早退 {{ row.early_minutes }} 分</span>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="備註" min-width="120" show-overflow-tooltip />
    </el-table>
  </el-dialog>
</template>

<style scoped>
.truncate-hint {
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  color: var(--el-color-warning-dark-2);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
}
</style>
```

- [ ] **Step 3：建立 SalaryContributorsDialog.vue**

新建 `~/Desktop/ivy-frontend/src/views/reports/SalaryContributorsDialog.vue`：

```vue
<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalaryContributors } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref(null)

const load = async () => {
  if (!props.year || !props.month) return
  loading.value = true
  try {
    const res = await getSalaryContributors(props.year, props.month)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入薪資榜首失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month],
  ([open]) => {
    if (open) load()
  },
)

const topGross = computed(() => data.value?.top_gross || [])
const topOvertime = computed(() => data.value?.top_overtime || [])

const formatAmount = (v) => (v == null ? '—' : money(v))
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${year} 年 ${month} 月 薪資榜首`"
    width="800px"
    append-to-body
  >
    <el-row :gutter="16" v-loading="loading">
      <el-col :span="12">
        <h4 class="section-title">應發前 5 名</h4>
        <el-table :data="topGross" border size="small" empty-text="無資料">
          <el-table-column prop="employee_name" label="員工" width="120" />
          <el-table-column label="應發" align="right">
            <template #default="{ row }">{{ formatAmount(row.gross_salary) }}</template>
          </el-table-column>
          <el-table-column label="封存" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-col>
      <el-col :span="12">
        <h4 class="section-title">加班費前 5 名</h4>
        <el-table :data="topOvertime" border size="small" empty-text="無加班費">
          <el-table-column prop="employee_name" label="員工" width="120" />
          <el-table-column label="加班費" align="right">
            <template #default="{ row }">{{ formatAmount(row.overtime_pay) }}</template>
          </el-table-column>
          <el-table-column label="封存" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-col>
    </el-row>
  </el-dialog>
</template>

<style scoped>
.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
```

- [ ] **Step 4：跑 npm test 確認既有測試不破**

```bash
cd ~/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Expected: 1365 passed / 2 pre-existing 失敗。

- [ ] **Step 5：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/api/reports.js src/views/reports/AttendanceDetailDialog.vue src/views/reports/SalaryContributorsDialog.vue && git commit -m "$(cat <<'EOF'
feat(reports): AttendanceDetailDialog + SalaryContributorsDialog

新增 2 個 drill-down dialog（仿 FinanceDetailDialog bare-axios 模式）：
- AttendanceDetailDialog：顯示異常考勤記錄（含 truncated 提示）
- SalaryContributorsDialog：顯示 top 5 gross + top 5 overtime；金額
  從後端取 null 時顯「—」（F-031 遮罩前端呈現）

src/api/reports.js 加 getAttendanceDetail + getSalaryContributors 兩個 wrapper。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：AttendancePanel 整合 filter + click + dialog

**Files:**
- Modify: `~/Desktop/ivy-frontend/src/views/reports/AttendancePanel.vue`

- [ ] **Step 1：替換整個 `<script setup>`**

把當前 `AttendancePanel.vue` 的 `<script setup>` 區塊（line 1 到 line 84 左右）整段替換為：

```vue
<script setup>
import { computed, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard } from '@/api/reports'
import { LineChart, BarChart, MONTH_LABELS } from './chartSetup.js'
import AttendanceDetailDialog from './AttendanceDetailDialog.vue'

const props = defineProps({
  year: { type: Number, required: true },
})

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => dashboard.refresh(false))

const data = computed(() => dashboard.data.value || {
  attendance_monthly: [],
  attendance_by_classroom: [],
  leave_monthly: [],
})

// 班級多選 filter（client-side）
const selectedClassrooms = ref([])
const classroomOptions = computed(() =>
  (data.value.attendance_by_classroom || []).map(d => ({
    id: d.classroom_id,
    name: d.classroom,
  })),
)

// drill-down dialog state
const detailDialog = ref({
  visible: false,
  month: null,
  classroomId: null,
  classroomName: null,
})

function openMonthDetail(monthIdx) {
  // monthIdx 從 Chart.js 來，0-11
  detailDialog.value = {
    visible: true,
    month: monthIdx + 1,
    classroomId: null,
    classroomName: null,
  }
}

function openClassroomDetail(arrIdx) {
  const arr = filteredClassroomData.value._rawData
  if (!arr || arrIdx >= arr.length) return
  const row = arr[arrIdx]
  detailDialog.value = {
    visible: true,
    month: null,
    classroomId: row.classroom_id,
    classroomName: row.classroom,
  }
}

const attendanceChartData = computed(() => {
  const monthMap = {}
  ;(data.value.attendance_monthly || []).forEach(d => { monthMap[d.month] = d })
  const rates = [], late = [], early = [], miss = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d ? d.rate : null)
    late.push(d ? d.late : null)
    early.push(d ? d.early_leave : null)
    miss.push(d ? d.missing : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '出勤率 (%)', data: rates, borderColor: '#409EFF', backgroundColor: 'rgba(64,158,255,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
      { label: '遲到次數', data: late, borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' },
      { label: '早退次數', data: early, borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', borderDash: [4, 4], tension: 0.3, yAxisID: 'y1' },
      { label: '缺卡次數', data: miss, borderColor: '#F56C6C', backgroundColor: 'rgba(245,108,108,0.1)', borderDash: [3, 3], tension: 0.3, yAxisID: 'y1' },
    ],
  }
})

const attendanceChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'top' }, title: { display: false } },
  scales: {
    y: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } },
    y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '次數' } },
  },
  spanGaps: true,
  onClick: (e, elements) => {
    if (!elements.length) return
    openMonthDetail(elements[0].index)
  },
}))

// 班級長條圖：套用 client-side filter
const filteredClassroomData = computed(() => {
  const arr = data.value.attendance_by_classroom || []
  const filtered = selectedClassrooms.value.length === 0
    ? arr
    : arr.filter(d => selectedClassrooms.value.includes(d.classroom_id))
  const labels = filtered.map(d => d.classroom)
  const rates = filtered.map(d => d.rate)
  const colors = rates.map(r => r >= 95 ? '#67C23A' : r >= 90 ? '#E6A23C' : '#F56C6C')
  return {
    labels,
    datasets: [{ label: '出勤率 (%)', data: rates, backgroundColor: colors, borderRadius: 4 }],
    _rawData: filtered,
  }
})

const classroomChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } } },
  onClick: (e, elements) => {
    if (!elements.length) return
    openClassroomDetail(elements[0].index)
  },
}))

const leaveChartData = computed(() => {
  const arr = data.value.leave_monthly || []
  const personal = arr.map(d => d.personal || 0)
  const sick = arr.map(d => d.sick || 0)
  const annual = arr.map(d => d.annual || 0)
  const other = arr.map(d => (d.menstrual || 0) + (d.maternity || 0) + (d.paternity || 0))
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '事假', data: personal, backgroundColor: '#E6A23C', stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: '#409EFF', stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: '#67C23A', stack: 'leaves' },
      { label: '其他', data: other, backgroundColor: '#909399', stack: 'leaves' },
    ],
  }
})

const leaveChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '次數' } } },
}
</script>
```

**改動點**：
- 新 import: `ref` + `AttendanceDetailDialog`
- 新 state: `selectedClassrooms`, `detailDialog`, `classroomOptions`
- 新 function: `openMonthDetail`, `openClassroomDetail`
- `attendanceChartOptions` 從常數變 computed（加 `onClick`）
- `classroomChartOptions` 從常數變 computed（加 `onClick`）
- `classroomChartData` 重命名為 `filteredClassroomData`，套 filter，附 `_rawData` 給 click handler 用

- [ ] **Step 2：替換 `<template>` 加 filter 與 dialog**

整段 template 替換為：

```vue
<template>
  <el-skeleton v-if="dashboard.pending.value && !dashboard.data.value" :rows="8" animated />
  <div v-else>
    <div class="filter-bar">
      <el-select
        v-model="selectedClassrooms"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="選擇班級（不選 = 全部）"
        style="width: 320px;"
      >
        <el-option
          v-for="opt in classroomOptions"
          :key="opt.id"
          :label="opt.name"
          :value="opt.id"
        />
      </el-select>
      <span class="filter-hint">此 filter 只影響右下「各班級出勤統計」圖</span>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">月度出勤率趨勢（點擊長條開明細）</span></template>
          <div class="chart-container"><LineChart :data="attendanceChartData" :options="attendanceChartOptions" /></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">各班級出勤統計（點擊長條開明細）</span></template>
          <div class="chart-container">
            <BarChart v-if="filteredClassroomData._rawData?.length" :data="filteredClassroomData" :options="classroomChartOptions" />
            <el-empty v-else description="無班級出勤資料" :image-size="60" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">請假趨勢分析</span></template>
          <div class="chart-container"><BarChart :data="leaveChartData" :options="leaveChartOptions" /></div>
        </el-card>
      </el-col>
    </el-row>

    <AttendanceDetailDialog
      v-model="detailDialog.visible"
      :year="year"
      :month="detailDialog.month"
      :classroom-id="detailDialog.classroomId"
      :classroom-name="detailDialog.classroomName"
    />
  </div>
</template>
```

- [ ] **Step 3：替換 `<style scoped>` 末尾加 filter-bar 樣式**

把當前的：

```vue
<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; }
</style>
```

替換為：

```vue
<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; cursor: pointer; }
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.filter-hint {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
```

- [ ] **Step 4：跑 npm test**

```bash
cd ~/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Expected: 1365 passed / 2 pre-existing 失敗。

- [ ] **Step 5：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/AttendancePanel.vue && git commit -m "$(cat <<'EOF'
feat(reports): AttendancePanel 加班級 filter + 長條點擊 drill-down

- 上方加 el-select multiple 班級 filter（client-side 只過濾班級長條圖）
- 月度長條 click → openMonthDetail → AttendanceDetailDialog
- 班級長條 click → openClassroomDetail → 同 dialog（傳 classroomId）
- chartOptions 從常數改為 computed 才能注入 onClick callback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：SalaryPanel 整合 click + dialog

**Files:**
- Modify: `~/Desktop/ivy-frontend/src/views/reports/SalaryPanel.vue`

- [ ] **Step 1：替換 `<script setup>` 加 dialog state + click handler + canSeeAmount**

把 SalaryPanel.vue 的 `<script setup>` 整段替換為：

```vue
<script setup>
import { computed, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { BarChart, MONTH_LABELS } from './chartSetup.js'
import { money } from '@/utils/format'
import { getUserInfo } from '@/utils/auth'
import SalaryContributorsDialog from './SalaryContributorsDialog.vue'

const props = defineProps({
  year: { type: Number, required: true },
})

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
const finance = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => {
  dashboard.refresh(false)
  finance.refresh(false)
})

const data = computed(() => dashboard.data.value || { salary_monthly: [] })
const financeData = computed(() => finance.data.value)
const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)

// canSeeAmount：admin/hr 看完整金額，其他 role 顯「—」（後端遮罩決定，前端僅 UI label 用）
const canSeeAmount = computed(() => {
  const info = getUserInfo()
  return info?.role === 'admin' || info?.role === 'hr'
})

// drill-down dialog state
const contribDialog = ref({ visible: false, month: null })

function openContributors(monthIdx) {
  contribDialog.value = { visible: true, month: monthIdx + 1 }
}

const salaryChartData = computed(() => {
  const monthMap = {}
  ;(data.value.salary_monthly || []).forEach(d => { monthMap[d.month] = d })
  const gross = [], net = [], bonus = [], ot = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    gross.push(d ? d.total_gross : null)
    net.push(d ? d.total_net : null)
    bonus.push(d ? d.total_bonus : null)
    ot.push(d ? d.total_overtime_pay : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '應發總額', data: gross, backgroundColor: 'rgba(64,158,255,0.6)', borderColor: '#409EFF', borderWidth: 1, borderRadius: 4, order: 3 },
      { label: '實發總額', data: net, type: 'line', borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: false, tension: 0.3, pointRadius: 4, order: 1 },
      { label: '獎金', data: bonus, type: 'line', borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', fill: false, tension: 0.3, borderDash: [5, 5], pointRadius: 3, order: 2 },
      { label: '加班費', data: ot, type: 'line', borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', fill: false, tension: 0.3, borderDash: [3, 3], pointRadius: 3, order: 2 },
    ],
  }
})

const salaryChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : 0}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: '金額 (NTD)' },
      ticks: { callback: (val) => '$' + (val / 1000).toFixed(0) + 'k' },
    },
  },
  spanGaps: true,
  onClick: (e, elements) => {
    if (!elements.length) return
    openContributors(elements[0].index)
  },
}))

const expenseCategories = computed(() => financeData.value?.expense_by_category || [])
const totalEmployerBenefit = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'employer_benefit')
  return row?.amount || 0
})
const totalGross = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'salary_gross')
  return row?.amount || 0
})
</script>
```

**改動點**：
- 新 import：`ref` + `getUserInfo` + `SalaryContributorsDialog`
- 新 state：`canSeeAmount`, `contribDialog`
- 新 function：`openContributors`
- `salaryChartOptions` 從常數變 computed（加 `onClick`）

- [ ] **Step 2：替換 `<template>` 加 dialog mount**

把當前 SalaryPanel.vue 的 `<template>` 整段替換為：

```vue
<template>
  <el-skeleton v-if="loading" :rows="8" animated />
  <div v-else>
    <el-card class="chart-card" shadow="hover">
      <template #header><span class="chart-title">薪資支出月度比較（點擊長條看 top 5 contributors）</span></template>
      <div class="chart-container chart-container--tall">
        <BarChart :data="salaryChartData" :options="salaryChartOptions" />
      </div>
    </el-card>

    <el-card v-if="financeData" class="chart-card" shadow="hover">
      <template #header><span class="chart-title">園方人事成本（本年彙總）</span></template>
      <el-row :gutter="16">
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">員工應發</div>
            <div class="kpi-value">{{ money(totalGross) }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">雇主保費+勞退</div>
            <div class="kpi-value kpi-orange">{{ money(totalEmployerBenefit) }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="kpi">
            <div class="kpi-label">園方真實支出</div>
            <div class="kpi-value kpi-blue">{{ money(totalGross + totalEmployerBenefit) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <SalaryContributorsDialog
      v-model="contribDialog.visible"
      :year="year"
      :month="contribDialog.month || 1"
    />
  </div>
</template>
```

> 註：`<SalaryContributorsDialog :month="contribDialog.month || 1">` 的 `|| 1` 是 fallback；dialog 的 watch 會在 `contribDialog.month` 設定時才實際 load，所以 1 永遠不會被打到。但 `month` prop 是 `required: true` 不能為 null，所以給個合法 default。

`<style scoped>` 區塊：加 `cursor: pointer` 給 chart-container：

```vue
<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; cursor: pointer; }
.chart-container--tall { height: 380px; cursor: pointer; }
.kpi { text-align: center; padding: 12px 0; }
.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.kpi-blue { color: #409EFF; }
.kpi-orange { color: var(--color-warning); }
</style>
```

- [ ] **Step 3：跑 npm test**

```bash
cd ~/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Expected: 1365 passed / 2 pre-existing 失敗。

- [ ] **Step 4：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/SalaryPanel.vue && git commit -m "$(cat <<'EOF'
feat(reports): SalaryPanel 長條點擊 drill-down 開 contributors dialog

salaryChartOptions 從常數改為 computed 注入 onClick callback；
click bar → openContributors → SalaryContributorsDialog（含 top 5 gross + top 5 OT）。
canSeeAmount 從 getUserInfo() role 推（admin/hr）；金額顯示由後端遮罩決定。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：手動驗證 + final tests

**動機**：dialog + chart click 互動只有真實瀏覽器能驗。

**Files:** 無修改

- [ ] **Step 1：起 dev server**

開新終端：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

打開 `http://localhost:5173/login`，用 `admin / admin123` 登入。

- [ ] **Step 2：跑後端最終測試**

```bash
cd ~/Desktop/ivy-backend-p2 && pytest tests/ 2>&1 | tail -5
```

Expected: baseline 全綠 + 8 個新測試。

- [ ] **Step 3：跑前端最終測試**

```bash
cd ~/Desktop/ivy-frontend && npm test -- --run 2>&1 | tail -10
```

Expected: 1365 passed / 2 pre-existing 失敗（無新失敗）。

- [ ] **Step 4：手動 5 場景驗證**

進 `/reports`：

| 場景 | 預期 |
|---|---|
| 出勤 tab，上方班級 filter 選 A 班 | 右下「各班級出勤統計」只顯示 A 班；filter hint 文字可見 |
| 出勤 tab，月度長條 click 3 月（任一條柱） | dialog 開，title「2026 年 3 月 異常記錄」，list 顯示異常 |
| 出勤 tab，班級長條 click A 班 | dialog 開，title「2026 年 全年 A 班 異常記錄」 |
| 薪資 tab，月度長條 click 3 月 | dialog 開，title「2026 年 3 月 薪資榜首」，兩個 5 列表 |
| 切換 user：用非 admin 帳號（若有）→ 薪資 dialog | 金額欄顯「—」（如沒有非 admin user 可建 staff role 帳號驗證） |

任一壞掉就回到對應 task commit 排查。

- [ ] **Step 5：建立 backend PR**

```bash
cd ~/Desktop/ivy-backend-p2 && git log --oneline feat/reports-p2-drilldown-backend ^main
```

確認 3 個 commit：
- feat(reports): attendance_by_classroom 多回 classroom_id
- feat(reports): /api/reports/attendance/detail drill-down endpoint
- feat(reports): /api/reports/salary/contributors drill-down endpoint

Push 與開 PR：

```bash
cd ~/Desktop/ivy-backend-p2 && git push -u origin feat/reports-p2-drilldown-backend
cd ~/Desktop/ivy-backend-p2 && gh pr create --title "feat(reports): P2 attendance + salary drill-down endpoints" --body "..."
```

PR body 由執行者根據 spec §1-§6 摘寫；至少包含：summary、endpoints 列表、測試覆蓋、permission/cache 行為、test plan checklist。

- [ ] **Step 6：建立 frontend PR**

```bash
cd ~/Desktop/ivy-frontend && git log --oneline feat/reports-p2-drilldown-frontend ^main
```

確認 4 個 commit（spec + 3 個 feature）：
- docs(reports): P2 篩選與下鑽設計 spec
- feat(reports): AttendanceDetailDialog + SalaryContributorsDialog
- feat(reports): AttendancePanel 加班級 filter + 長條點擊 drill-down
- feat(reports): SalaryPanel 長條點擊 drill-down 開 contributors dialog

Push 與開 PR（同上 pattern）。

- [ ] **Step 7：報告 user**

整理結果回報：
- 後端 3 commit + PR
- 前端 4 commit + PR
- 8 backend test 全綠；前端 baseline 全綠
- 5 場景手動驗證結果

---

## Self-Review

### Spec coverage 對照

| Spec 章節 | Task 對應 |
|---|---|
| §2.1 前置小改 classroom_id | Task 1 |
| §2.1 attendance/detail endpoint | Task 2 |
| §2.1 salary/contributors endpoint + F-031 遮罩 | Task 3 |
| §2.2 AttendanceDetailDialog | Task 4 Step 2 |
| §2.2 SalaryContributorsDialog | Task 4 Step 3 |
| §2.3 AttendancePanel 整合 | Task 5 |
| §2.4 SalaryPanel 整合 | Task 6 |
| §4 後端 8 pytest | Tasks 2 + 3（含 attendance 5 + salary 3） |
| §4 手動驗證 5 場景 | Task 7 Step 4 |
| §6 驗收標準 1-8 | Task 7 |

### Placeholder scan

無 TBD / TODO / 未具體化的 step。Task 7 Step 5/6 的 PR body 留「由執行者根據 spec 摘寫」屬合理彈性（spec 已詳盡，PR body 是 mechanical 轉述）。

### Type consistency

- `classroom_id: int | None` 在 backend Task 1, 2 一致
- Cache key 慣例：`reports_attendance_detail` / `reports_salary_contributors`
- API wrapper 簽名：`getAttendanceDetail(year, { month, classroomId })`、`getSalaryContributors(year, month)`
- Dialog props：`year, month, classroomId, classroomName` 一致
- detailDialog state shape：`{ visible, month, classroomId, classroomName }` 一致

### 風險

- **`mask_dict_fields` 行為未在 plan 內驗證**：Task 3 Step 4 要求實作前讀 `utils/salary_access.py` 確認是否 in-place mutate。Implementer 必須做此檢查；若 in-place mutate，Step 3 的 `dict(r)` 已預先 copy 避免污染 cache。
- **Chart.js `onClick` 在 `<script setup>` 函式 hoisting**：`openMonthDetail` / `openContributors` 需在 `attendanceChartOptions` computed 之前定義（已注意，按 plan 排序正確）。
- **班級 filter `_rawData` 內部 key**：在 dataset 物件加底線 prefix key（`_rawData`）是 hack，避開 Chart.js 解析。可改為 panel 外部維護 `filteredRawData` ref；但目前作法簡單可行。
