# 教師端 Portal 大 polish — Phase 2 實作計畫（簡化版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修補 `api/portal/home.py:_classroom_card` 的 N+1 query（4 班 32-40 query → < 14 query），並為既有教師端 dashboard（PortalHomeView + 4 子元件 + composable + store）補 vitest 守護未來變更。

**Architecture:** 後端把每班 8-10 個 query 改為「先一次 batch 全班級的 IN clause + GROUP BY 結果」再組裝；前端純補測試，不改 dashboard 行為。前後端各一條 branch、各自獨立 PR；後端先 merge、前端後 merge。

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy 2.x（後端）；Vue 3 + `<script setup>` / Pinia / Vitest + happy-dom（前端）

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-2-design.md`

**Branches:**
- 後端：`feat/teacher-acd-v1-2-home-dashboard-be`（從 ivy-backend `origin/main` 出發）
- 前端：`feat/teacher-acd-v1-2-home-dashboard`（從 ivy-frontend `feat/teacher-acd-v1-1-foundation` 出發；phase 1 merge 後 rebase main）

---

## File Structure

### 後端修改

```
ivy-backend/
├── tests/conftest.py                       # 加 count_queries 工具
├── tests/test_portal_dashboard_service.py  # 新增（service batch unit tests）
├── tests/test_portal_home.py               # 加 query count assertion
├── services/portal_dashboard_service.py    # 5 個函式擴充 list 接收
├── services/contact_book_service.py        # compute_class_completion 擴充 list 接收
└── api/portal/home.py                      # _classroom_card refactor 為純組裝；get_home_summary 預先 batch
```

### 前端新增

```
ivy-frontend/
├── tests/unit/components/portal/home/{PendingActions,TodayShift,ClassroomOps,QuickLinks}Card.test.js
├── tests/unit/composables/usePortalDashboard.test.js
├── tests/unit/stores/portalDashboard.test.js
└── tests/unit/views/PortalHomeView.test.js
```

無前端產品檔案修改（純測試）。

---

# 後端 — Phase 2B

**Worktree**：`/Users/yilunwu/Desktop/ivy-backend/.worktrees/teacher-acd-2-be`（新建）

**Branch**：`feat/teacher-acd-v1-2-home-dashboard-be`

---

### Task 2B.1: 開後端 worktree + count_queries helper

- [ ] **Step 1: 確認 ivy-backend clean**

```bash
cd /Users/yilunwu/Desktop/ivy-backend && git status
```

Expected：`nothing to commit, working tree clean`。否則先 stash / commit。

- [ ] **Step 2: 開 worktree from origin/main**

```bash
cd /Users/yilunwu/Desktop/ivy-backend
git fetch origin main
git check-ignore -q .worktrees && echo "ignored" || echo "NOT ignored"
git worktree add .worktrees/teacher-acd-2-be -b feat/teacher-acd-v1-2-home-dashboard-be origin/main
cd .worktrees/teacher-acd-2-be
pip install -r requirements.txt 2>&1 | tail -3
```

如 `.worktrees` NOT ignored，先把 `.worktrees` 加進 `.gitignore` 並單獨 commit 再開 worktree。

- [ ] **Step 3: Baseline pytest**

```bash
pytest tests/test_portal_home.py -q 2>&1 | tail -10
```

Expected：既有 portal_home test 全綠。記下總數。

- [ ] **Step 4: 加 count_queries helper 到 tests/conftest.py**

先 grep 看是否已存在：

```bash
grep -n "count_queries\|sqlalchemy.*event" tests/conftest.py 2>&1 | head
```

如無，用 Edit 工具在 conftest.py 檔尾追加：

```python
from contextlib import contextmanager
from sqlalchemy import event


class _QueryCounter:
    def __init__(self):
        self.total = 0
        self.statements: list[str] = []


@contextmanager
def count_queries(engine):
    """Count SQLAlchemy queries during the with-block.

    Usage:
        with count_queries(db_session.get_bind()) as counter:
            ...do work...
        assert counter.total < 12
    """
    counter = _QueryCounter()

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        counter.total += 1
        counter.statements.append(statement)

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)
```

`from contextlib import contextmanager` / `from sqlalchemy import event` 如已 import，不重複加。

- [ ] **Step 5: Commit**

```bash
git add tests/conftest.py
git commit -m "$(cat <<'EOF'
test: 新增 count_queries 工具到 conftest

提供 SQLAlchemy event listener-based query counting context manager，
為 Phase 2 _classroom_card N+1 修補驗收使用。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2B.2: 寫 4 班 query count regression test（先 fail）

- [ ] **Step 1: Read TestHomeSummary 與 fixtures**

```bash
sed -n '358,400p' tests/test_portal_home.py
```

確認 `home_client` / `db_session` fixture 來源；找該 class 上方既有 test 的 setup pattern（如何建 teacher、classroom、student）。

- [ ] **Step 2: 在 tests/test_portal_home.py 加 helper + test**

如該檔上方還沒 `_build_teacher_with_n_classrooms`，加在 module top（class 外）：

```python
def _build_teacher_with_n_classrooms(db_session, n: int, students_per_class: int):
    """為 query count test 建 teacher + n 個班級 + 學生。

    所有綁定方式（head_teacher_id 還是 EmployeeClassroom 中介表）必須
    對齊該檔上方既有 test 用的 pattern；先 grep 看上方範例。
    """
    from models.database import Employee, Classroom, Student, User

    user = User(username=f"teacher_qc_{n}", password_hash="x", role="teacher")
    db_session.add(user)
    db_session.flush()
    teacher = Employee(user_id=user.id, name="老師_qc", employee_id=f"T_QC_{n}")
    db_session.add(teacher)
    db_session.flush()
    classrooms = []
    for i in range(n):
        c = Classroom(name=f"qc-class-{i}", is_active=True)
        db_session.add(c)
        db_session.flush()
        # ⚠ 此處綁定方式照該檔既有 test 範例：可能是 c.head_teacher_id 或加
        # EmployeeClassroom 中介列。Read 上方 test 後對齊。
        c.head_teacher_id = teacher.id
        for s in range(students_per_class):
            db_session.add(Student(
                name=f"s{i}-{s}", classroom_id=c.id, is_active=True,
            ))
        classrooms.append(c)
    db_session.commit()
    return teacher, classrooms
```

在 `class TestHomeSummary` 末尾加 test method：

```python
    def test_classroom_cards_query_count_under_baseline(
        self, home_client, db_session
    ):
        """4 班 _classroom_card 不應 N+1（baseline ~32-40 → batch <= 14）。"""
        from tests.conftest import count_queries

        teacher, _ = _build_teacher_with_n_classrooms(db_session, n=4, students_per_class=5)
        client = home_client(teacher)

        with count_queries(db_session.get_bind()) as counter:
            resp = client.get("/portal/home/summary")

        assert resp.status_code == 200
        payload = resp.json()
        assert len(payload["classrooms"]) == 4
        assert counter.total <= 14, (
            f"query count regressed: {counter.total} (baseline ~32-40, target <=14). "
            f"Last 5 statements: {counter.statements[-5:]}"
        )
```

- [ ] **Step 3: 跑新 test 確認 fail**

```bash
pytest tests/test_portal_home.py::TestHomeSummary::test_classroom_cards_query_count_under_baseline -v 2>&1 | tail -20
```

Expected：FAIL，message 為 `query count regressed: NN (target <=14)`。如果 import / fixture 錯，先修；test 必須能 run 並 fail 在 assertion。

- [ ] **Step 4: Commit failing test**

```bash
git add tests/test_portal_home.py
git commit -m "$(cat <<'EOF'
test(portal-home): _classroom_card N+1 regression test (failing)

4 班 dashboard 預期 query count <= 14；實作 batch 後此 test 應 pass。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2B.3: portal_dashboard_service 5 函式擴充 list 接收

- [ ] **Step 1: Read 5 函式現況**

```bash
sed -n '40,260p' services/portal_dashboard_service.py
```

對 5 個函式各記下：(a) 既有 signature；(b) 主要 query；(c) 回傳型別。

- [ ] **Step 2: 寫 service batch unit tests（先 fail）**

新建 `tests/test_portal_dashboard_service.py`：

```python
"""Phase 2: portal_dashboard_service batch overload 單元測試。"""
from __future__ import annotations

from datetime import date

import pytest

from models.database import Classroom
from services.portal_dashboard_service import (
    compute_allergy_alerts,
    compute_consecutive_absences,
    compute_upcoming_birthdays,
    count_pending_medications,
    has_attendance_today,
)


@pytest.fixture
def two_classrooms(db_session):
    c1 = Classroom(name="c1", is_active=True)
    c2 = Classroom(name="c2", is_active=True)
    db_session.add_all([c1, c2])
    db_session.commit()
    return c1, c2


class TestBatchSignature:
    def test_consecutive_absences_int_returns_int(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = compute_consecutive_absences(db_session, c1.id, date.today())
        assert isinstance(result, int)

    def test_consecutive_absences_list_returns_dict(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = compute_consecutive_absences(db_session, [c1.id, c2.id], date.today())
        assert isinstance(result, dict)
        assert set(result.keys()) == {c1.id, c2.id}

    def test_consecutive_absences_empty_list_returns_empty_dict(self, db_session):
        assert compute_consecutive_absences(db_session, [], date.today()) == {}

    def test_upcoming_birthdays_int_returns_list(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = compute_upcoming_birthdays(db_session, c1.id, date.today())
        assert isinstance(result, list)

    def test_upcoming_birthdays_list_returns_dict_of_lists(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = compute_upcoming_birthdays(db_session, [c1.id, c2.id], date.today())
        assert isinstance(result, dict)
        assert all(isinstance(v, list) for v in result.values())

    def test_allergy_alerts_int_returns_list(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = compute_allergy_alerts(db_session, c1.id)
        assert isinstance(result, list)

    def test_allergy_alerts_list_returns_dict_of_lists(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = compute_allergy_alerts(db_session, [c1.id, c2.id])
        assert isinstance(result, dict)
        assert set(result.keys()) == {c1.id, c2.id}

    def test_pending_medications_int_returns_int(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = count_pending_medications(db_session, c1.id, date.today())
        assert isinstance(result, int)

    def test_pending_medications_list_returns_dict_of_ints(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = count_pending_medications(db_session, [c1.id, c2.id], date.today())
        assert isinstance(result, dict)
        assert all(isinstance(v, int) for v in result.values())

    def test_has_attendance_today_int_returns_bool(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = has_attendance_today(db_session, c1.id, today=date.today())
        assert isinstance(result, bool)

    def test_has_attendance_today_list_returns_dict_of_bools(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = has_attendance_today(db_session, [c1.id, c2.id], today=date.today())
        assert isinstance(result, dict)
        assert all(isinstance(v, bool) for v in result.values())
```

- [ ] **Step 3: 跑新 test 確認 list 路徑 fail**

```bash
pytest tests/test_portal_dashboard_service.py -v 2>&1 | tail -20
```

Expected：所有 list 路徑 fail（TypeError 或 wrong type）。

- [ ] **Step 4: 改 5 個函式為 dispatch by input type**

對每個函式套用 pattern。範例（compute_consecutive_absences）：

```python
def compute_consecutive_absences(session, classroom_id, today: date_cls):
    """支援 int 或 list[int]。
    int → int（向後相容）
    list[int] → dict[int, int]
    空 list → {}
    """
    if isinstance(classroom_id, list):
        if not classroom_id:
            return {}
        return _compute_consecutive_absences_batch(session, classroom_id, today)
    return _compute_consecutive_absences_single(session, classroom_id, today)


def _compute_consecutive_absences_single(session, classroom_id: int, today: date_cls) -> int:
    # 把原本 compute_consecutive_absences 整段 body 搬進來
    ...


def _compute_consecutive_absences_batch(
    session, classroom_ids: list[int], today: date_cls
) -> dict[int, int]:
    """先求正確性：dict comprehension 呼叫 _single；後續若為瓶頸再優化為 IN+GROUP BY。"""
    return {cid: _compute_consecutive_absences_single(session, cid, today) for cid in classroom_ids}
```

對其餘 4 個函式同樣 dispatch pattern。**簡單型必須真 batch**：

| 函式 | int 回傳 | list 模式策略 |
|---|---|---|
| `compute_consecutive_absences` | int | dict-comp fallback（語意複雜） |
| `compute_upcoming_birthdays` | list | dict-comp fallback（語意複雜） |
| `compute_allergy_alerts` | list | 真 IN clause（單純 filter Student.allergies）|
| `count_pending_medications` | int | 真 IN + GROUP BY |
| `has_attendance_today` | bool | 真 IN + GROUP BY |

**真 batch 範例（count_pending_medications）**：

```python
def _count_pending_medications_batch(
    session, classroom_ids: list[int], today: date_cls
) -> dict[int, int]:
    from sqlalchemy import func
    from models.database import StudentMedication, Student
    rows = (
        session.query(Student.classroom_id, func.count(StudentMedication.id))
        .join(Student, Student.id == StudentMedication.student_id)
        .filter(
            Student.classroom_id.in_(classroom_ids),
            StudentMedication.medication_date == today,
            StudentMedication.executed_at.is_(None),
        )
        .group_by(Student.classroom_id)
        .all()
    )
    counts = dict(rows)
    return {cid: counts.get(cid, 0) for cid in classroom_ids}
```

實際 model 名稱（`StudentMedication`、欄位 `medication_date` / `executed_at`）以該檔 _single 用的為準。

- [ ] **Step 5: 跑 unit tests + service 既有 tests**

```bash
pytest tests/test_portal_dashboard_service.py -v 2>&1 | tail -20
pytest tests/ -k "portal_dashboard or portal_home" 2>&1 | tail -10
```

Expected：11 個 batch test 全綠；既有 test_portal_home.py 中除 query count test 仍 fail 外其餘綠。

- [ ] **Step 6: Commit**

```bash
git add services/portal_dashboard_service.py tests/test_portal_dashboard_service.py
git commit -m "$(cat <<'EOF'
feat(portal-dashboard-service): 5 函式擴充 list 接收

compute_consecutive_absences / compute_upcoming_birthdays /
compute_allergy_alerts / count_pending_medications / has_attendance_today
都改為支援 int 或 list[int]：
- int → 原型別（向後相容）
- list[int] → dict[int, T]
- 空 list → {}

簡單型欄位用 IN + GROUP BY；語意複雜函式 fallback dict-comp 呼叫 single。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2B.4: contact_book_service.compute_class_completion 擴充 list 接收

- [ ] **Step 1: Read 既有實作**

```bash
sed -n '258,330p' services/contact_book_service.py
```

確認 input args、回傳結構（roster / draft / published / missing 等）、用了哪些 model。

- [ ] **Step 2: 在 test_portal_dashboard_service.py 加 completion test class**

檔尾追加：

```python
from services.contact_book_service import compute_class_completion


class TestContactBookCompletionBatch:
    def test_int_returns_dict_with_roster_keys(self, db_session, two_classrooms):
        c1, _ = two_classrooms
        result = compute_class_completion(db_session, classroom_id=c1.id, log_date=date.today())
        assert isinstance(result, dict)
        assert "roster" in result
        assert "draft" in result
        assert "published" in result

    def test_list_returns_dict_of_dicts(self, db_session, two_classrooms):
        c1, c2 = two_classrooms
        result = compute_class_completion(
            db_session, classroom_id=[c1.id, c2.id], log_date=date.today()
        )
        assert isinstance(result, dict)
        assert set(result.keys()) == {c1.id, c2.id}
        assert all(isinstance(v, dict) and "roster" in v for v in result.values())

    def test_empty_list_returns_empty_dict(self, db_session):
        result = compute_class_completion(db_session, classroom_id=[], log_date=date.today())
        assert result == {}
```

- [ ] **Step 3: 跑確認 fail**

```bash
pytest tests/test_portal_dashboard_service.py::TestContactBookCompletionBatch -v 2>&1 | tail -10
```

- [ ] **Step 4: 擴充 compute_class_completion**

開 `services/contact_book_service.py`，把既有 `compute_class_completion(session, classroom_id: int, log_date)` 改為 dispatch pattern：

```python
def compute_class_completion(session, classroom_id, log_date):
    if isinstance(classroom_id, list):
        if not classroom_id:
            return {}
        return _compute_class_completion_batch(session, classroom_id, log_date)
    return _compute_class_completion_single(session, classroom_id, log_date)


def _compute_class_completion_single(session, classroom_id: int, log_date) -> dict:
    # 既有 body 搬進來
    ...


def _compute_class_completion_batch(
    session, classroom_ids: list[int], log_date
) -> dict[int, dict]:
    """一次 query 取所有班級 roster + entries。"""
    from sqlalchemy import func
    from models.database import Student, StudentContactBookEntry

    rosters = dict(
        session.query(Student.classroom_id, func.count(Student.id))
        .filter(
            Student.classroom_id.in_(classroom_ids),
            Student.is_active.is_(True),
        )
        .group_by(Student.classroom_id)
        .all()
    )

    entry_counts = (
        session.query(
            StudentContactBookEntry.classroom_id,
            StudentContactBookEntry.status,
            func.count(func.distinct(StudentContactBookEntry.student_id)),
        )
        .filter(
            StudentContactBookEntry.classroom_id.in_(classroom_ids),
            StudentContactBookEntry.log_date == log_date,
            StudentContactBookEntry.deleted_at.is_(None),
        )
        .group_by(
            StudentContactBookEntry.classroom_id,
            StudentContactBookEntry.status,
        )
        .all()
    )

    result = {}
    for cid in classroom_ids:
        roster = rosters.get(cid, 0)
        draft = sum(c for (cidx, st, c) in entry_counts if cidx == cid and st == "draft")
        published = sum(c for (cidx, st, c) in entry_counts if cidx == cid and st == "published")
        missing = max(0, roster - draft - published)
        result[cid] = {
            "roster": roster,
            "draft": draft,
            "published": published,
            "missing": missing,
        }
    return result
```

實際欄位（`status` enum 字串、`deleted_at` 是否存在、額外欄位如 percentage）以 `_single` 結構為準對齊。

- [ ] **Step 5: 跑 batch test + 既有 contact_book tests**

```bash
pytest tests/test_portal_dashboard_service.py::TestContactBookCompletionBatch -v 2>&1 | tail
pytest tests/ -k "contact_book" 2>&1 | tail -10
```

Expected：3 個 completion batch test 綠 + 既有 contact_book test 不破壞。

- [ ] **Step 6: Commit**

```bash
git add services/contact_book_service.py tests/test_portal_dashboard_service.py
git commit -m "$(cat <<'EOF'
feat(contact-book-service): compute_class_completion 擴充 list 接收

新增 batch 模式用 GROUP BY classroom_id 一次取 roster + entries，
4 班從 4 query 變 2 query。

向後相容：int 輸入仍回原 dict 結構。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2B.5: home.py `_classroom_card` refactor + `get_home_summary` 預先 batch

- [ ] **Step 1: Read 既有 _classroom_card 與 get_home_summary**

```bash
sed -n '60,170p' api/portal/home.py
```

- [ ] **Step 2: 用 Edit 工具替換 _classroom_card 整個函式**

```python
def _classroom_card(classroom: Classroom, today: date_cls, batches: dict) -> dict:
    """純資料組裝；所有 query 由呼叫端預先 batch。

    `batches` 必須含以下 keys（每個 value 為 dict[classroom_id, T]）:
      - student_count: dict[int, int]
      - completion: dict[int, dict]
      - pending_dismissal: dict[int, int]
      - attendance_called: dict[int, bool]
      - consecutive_absences: dict[int, int]
      - upcoming_birthdays: dict[int, list]
      - allergy_alerts: dict[int, list]
      - pending_medications: dict[int, int]
    """
    cid = classroom.id
    completion = batches["completion"].get(cid, {"roster": 0, "draft": 0, "published": 0, "missing": 0})
    roster = completion.get("roster", 0)
    return {
        "classroom_id": cid,
        "classroom_name": classroom.name,
        "student_count": batches["student_count"].get(cid, 0),
        "contact_book": {
            "roster": roster,
            "draft": completion.get("draft", 0),
            "published": completion.get("published", 0),
            "missing": completion.get("missing", 0),
            "percentage": (
                round(completion.get("published", 0) / roster * 100, 1) if roster else 0.0
            ),
        },
        "attendance_called_today": batches["attendance_called"].get(cid, False),
        "pending_dismissal_calls": batches["pending_dismissal"].get(cid, 0),
        "consecutive_absences": batches["consecutive_absences"].get(cid, 0),
        "upcoming_birthdays_7d": batches["upcoming_birthdays"].get(cid, []),
        "allergy_alerts": batches["allergy_alerts"].get(cid, []),
        "pending_medications_today": batches["pending_medications"].get(cid, 0),
    }
```

- [ ] **Step 3: Refactor get_home_summary 在 classrooms 後預先 batch**

找到原本 `classroom_cards = [_classroom_card(session, c, today) for c in classrooms]`，前面插入：

```python
        # batch 預取所有班級 dashboard 資料（避免 _classroom_card N+1）
        ids = [c.id for c in classrooms]
        if ids:
            from sqlalchemy import func
            student_counts = dict(
                session.query(Student.classroom_id, func.count(Student.id))
                .filter(
                    Student.classroom_id.in_(ids),
                    Student.is_active.is_(True),
                )
                .group_by(Student.classroom_id)
                .all()
            )
            pending_dismissal = dict(
                session.query(StudentDismissalCall.classroom_id, func.count(StudentDismissalCall.id))
                .filter(
                    StudentDismissalCall.classroom_id.in_(ids),
                    StudentDismissalCall.status == "pending",
                )
                .group_by(StudentDismissalCall.classroom_id)
                .all()
            )
            batches = {
                "student_count": student_counts,
                "completion": compute_class_completion(session, classroom_id=ids, log_date=today),
                "pending_dismissal": pending_dismissal,
                "attendance_called": has_attendance_today(session, ids, today=today),
                "consecutive_absences": compute_consecutive_absences(session, ids, today),
                "upcoming_birthdays": compute_upcoming_birthdays(session, ids, today),
                "allergy_alerts": compute_allergy_alerts(session, ids),
                "pending_medications": count_pending_medications(session, ids, today),
            }
        else:
            batches = {
                "student_count": {}, "completion": {}, "pending_dismissal": {},
                "attendance_called": {}, "consecutive_absences": {},
                "upcoming_birthdays": {}, "allergy_alerts": {}, "pending_medications": {},
            }

        classroom_cards = [_classroom_card(c, today, batches) for c in classrooms]
```

保留 endpoint 後續邏輯（actions / today shift / unread_announcements 等）不動。

- [ ] **Step 4: 跑全 portal home + query count test**

```bash
pytest tests/test_portal_home.py -v 2>&1 | tail -20
```

Expected：所有測試（含 `test_classroom_cards_query_count_under_baseline`）通過。如 query count 仍 > 14：
- 看 `counter.statements[-5:]` 判斷瀑布來源
- 常見：service `_batch` 仍迴圈呼叫 `_single`（compute_consecutive_absences / compute_upcoming_birthdays 是 fallback 版本），影響 query 數
- 必要時：把 fallback 改為真 IN（讀 single body 看能否一次 query）

- [ ] **Step 5: 跑全 pytest**

```bash
pytest 2>&1 | tail -10
```

Expected：全綠。

- [ ] **Step 6: Commit**

```bash
git add api/portal/home.py
git commit -m "$(cat <<'EOF'
refactor(portal-home): _classroom_card 改為純組裝 + batch 預取

把每班 8-10 query 集中到 endpoint 層一次 batch：
- student_count / pending_dismissal 用 IN + GROUP BY
- 6 個 service 函式用 list 模式 + dict 結果

效能：4 班教師 32-40 query → 約 13-14 query。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2B.6: 後端 push branch + 開 PR

- [ ] **Step 1: 全 pytest 最終確認**

```bash
pytest 2>&1 | tail -10
```

Expected：全綠 + 新增 ~15 條測試。

- [ ] **Step 2: 看 commit 歷史**

```bash
git log --oneline origin/main..
```

Expected：5 commit（count_queries / failing test / 5 service batch / completion batch / endpoint refactor）。

- [ ] **Step 3: ⚠ Push 前 pause，待用戶批准**

```bash
# 用戶批准後執行：
git push -u origin feat/teacher-acd-v1-2-home-dashboard-be
```

- [ ] **Step 4: 開 PR（用戶批准後）**

```bash
gh pr create --title "feat(portal-home): _classroom_card N+1 修補（教師端 ACD Phase 2 後端）" --body "$(cat <<'EOF'
## Summary

- 6 個 dashboard service 函式擴充支援 \`int | list[int]\` 雙模式
- \`_classroom_card\` 從每班 8-10 query 改為純資料組裝，所有 query 在 endpoint 層 batch 預取
- 新增 query count regression test（4 班從 32-40 query → ≤ 14 query）

依據 spec：\`docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-2-design.md\`

## Test plan
- [x] 新增 ~15 條 unit test（5 service batch + completion batch + query count）
- [x] 既有 portal home / contact book test 全綠
- [ ] reviewer 在本機跑 pytest 確認
- [ ] staging 部署後手動 hit /portal/home/summary 觀察延遲下降
EOF
)"
```

---

# 前端 — Phase 2F

**Worktree**：複用 `/Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1`

**Branch**：`feat/teacher-acd-v1-2-home-dashboard`（從 `feat/teacher-acd-v1-1-foundation` 出發）

---

### Task 2F.1: 開前端 phase-2 branch

- [ ] **Step 1: 確認 phase-1 worktree clean**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1 && git status
```

Expected：clean 或只有 spec/plan untracked。

- [ ] **Step 2: 從 phase-1 head 開 phase-2 branch**

```bash
git checkout -b feat/teacher-acd-v1-2-home-dashboard
git log --oneline -3
```

- [ ] **Step 3: 把 phase 2 spec + plan 加入 commit**

```bash
git add docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-2-design.md docs/superpowers/plans/2026-05-06-teacher-portal-acd-phase-2.md
git commit -m "$(cat <<'EOF'
docs: Phase 2 spec + plan（簡化版）

Phase 2 範圍簡化：後端 N+1 修補 + 前端補測試；YAGNI 砍掉重打 dashboard
與新建 4 子元件等原 spec 項目。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Baseline 仍 798 綠**

```bash
npm run test 2>&1 | tail -5
```

Expected：`798 passed`。

---

### Task 2F.2: PendingActionsCard 測試

- [ ] **Step 1: 寫測試**

`tests/unit/components/portal/home/PendingActionsCard.test.js`：

```javascript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PendingActionsCard from '@/components/portal/home/PendingActionsCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

const FULL_ACTIONS = {
  unread_messages: 2,
  pending_substitute: 1,
  pending_swap: 0,
  pending_anomaly_confirms: 3,
  unread_announcements: 5,
}

function mountIt(actions = FULL_ACTIONS) {
  return mount(PendingActionsCard, {
    props: { actions },
    global: { plugins: [router] },
  })
}

describe('PendingActionsCard', () => {
  it('renders 5 tiles in correct order', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    expect(tiles.length).toBe(5)
    expect(tiles[0].text()).toContain('待回覆訊息')
    expect(tiles[1].text()).toContain('待回應代理')
    expect(tiles[2].text()).toContain('待回應換班')
    expect(tiles[3].text()).toContain('異常待確認')
    expect(tiles[4].text()).toContain('未讀公告')
  })

  it('renders count from actions prop', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    expect(tiles[0].text()).toContain('2')
    expect(tiles[3].text()).toContain('3')
    expect(tiles[4].text()).toContain('5')
  })

  it('marks tile as is-empty when count is 0', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    expect(tiles[2].classes()).toContain('is-empty')
    expect(tiles[0].classes()).not.toContain('is-empty')
  })

  it('clicking tile pushes to correct route', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    await tiles[1].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/leave')
  })

  it('handles missing actions prop fields gracefully', () => {
    const w = mountIt({})
    const tiles = w.findAll('.action-tile')
    tiles.forEach((t) => {
      expect(t.text()).toMatch(/\b0\b/)
      expect(t.classes()).toContain('is-empty')
    })
  })

  it('applies tint class to count circle', () => {
    const w = mountIt()
    const counts = w.findAll('.tile-count')
    expect(counts[0].classes()).toContain('tint-message')
    expect(counts[1].classes()).toContain('tint-leave')
    expect(counts[2].classes()).toContain('tint-calendar')
  })
})
```

- [ ] **Step 2: 跑 test**

```bash
npm run test -- tests/unit/components/portal/home/PendingActionsCard.test.js 2>&1 | tail -8
```

Expected：6/6 pass。元件已實作，這是「補測試覆蓋」而非 TDD 新建，所以 test 期望直接綠。如有 fail 是 selector 或 fixture 不對，調 test（不改元件）。

- [ ] **Step 3: Commit**

```bash
git add tests/unit/components/portal/home/PendingActionsCard.test.js
git commit -m "$(cat <<'EOF'
test(portal-home): 補 PendingActionsCard 6 條 vitest

Phase 2 dashboard 守護回歸。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2F.3: TodayShiftCard 測試

- [ ] **Step 1: Read 元件以確認 props/template**

```bash
cat src/components/portal/home/TodayShiftCard.vue
```

了解 props.today schema（shift / attendance subfields）與 template 用什麼選擇器。

- [ ] **Step 2: 寫測試（依實際 schema 調整 fixture）**

`tests/unit/components/portal/home/TodayShiftCard.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayShiftCard from '@/components/portal/home/TodayShiftCard.vue'

// fixture schema 必對齊元件實際存取路徑（read 元件後修正）
const TODAY_WITH_SHIFT = {
  shift: { name: '正班', work_start: '08:00', work_end: '17:00' },
  attendance: { punch_in_at: '2026-05-06T08:05:00', punch_out_at: null, is_anomaly: false },
}

const TODAY_NO_SHIFT = {
  shift: null,
  attendance: { punch_in_at: null, punch_out_at: null, is_anomaly: false },
}

const TODAY_ANOMALY = {
  shift: { name: '正班', work_start: '08:00', work_end: '17:00' },
  attendance: { punch_in_at: '2026-05-06T08:35:00', punch_out_at: null, is_anomaly: true },
}

describe('TodayShiftCard', () => {
  it('renders shift name + times when shift exists', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT } })
    expect(w.text()).toContain('正班')
    expect(w.text()).toContain('08:00')
    expect(w.text()).toContain('17:00')
  })

  it('renders empty state when no shift', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_NO_SHIFT } })
    expect(w.text().length).toBeGreaterThan(0)
  })

  it('shows punch-in time when present', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT } })
    expect(w.text()).toMatch(/08:05/)
  })

  it('marks anomaly visually when is_anomaly true', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_ANOMALY } })
    expect(w.html()).toMatch(/anomaly|異常|warning/i)
  })
})
```

- [ ] **Step 3: 跑直到綠**

```bash
npm run test -- tests/unit/components/portal/home/TodayShiftCard.test.js 2>&1 | tail -8
```

如有 fail，看 element 實際 schema 修正 fixture。

- [ ] **Step 4: Commit**

```bash
git add tests/unit/components/portal/home/TodayShiftCard.test.js
git commit -m "test(portal-home): 補 TodayShiftCard vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2F.4: ClassroomOpsCard 測試

- [ ] **Step 1: Read 元件**

```bash
cat src/components/portal/home/ClassroomOpsCard.vue
```

- [ ] **Step 2: 寫測試**

`tests/unit/components/portal/home/ClassroomOpsCard.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'

const FULL_CARD = {
  classroom_id: 1,
  classroom_name: '小白兔班',
  student_count: 15,
  contact_book: { roster: 15, draft: 3, published: 10, missing: 2, percentage: 66.7 },
  attendance_called_today: false,
  pending_dismissal_calls: 2,
  consecutive_absences: 1,
  upcoming_birthdays_7d: [{ name: '小明', birthday: '2026-05-08' }],
  allergy_alerts: ['花生', '海鮮'],
  pending_medications_today: 1,
}

const EMPTY_CARD = {
  classroom_id: 2,
  classroom_name: '空班',
  student_count: 0,
  contact_book: { roster: 0, draft: 0, published: 0, missing: 0, percentage: 0 },
  attendance_called_today: false,
  pending_dismissal_calls: 0,
  consecutive_absences: 0,
  upcoming_birthdays_7d: [],
  allergy_alerts: [],
  pending_medications_today: 0,
}

describe('ClassroomOpsCard', () => {
  it('renders classroom_name', () => {
    const w = mount(ClassroomOpsCard, { props: { card: FULL_CARD } })
    expect(w.text()).toContain('小白兔班')
  })

  it('renders student_count', () => {
    const w = mount(ClassroomOpsCard, { props: { card: FULL_CARD } })
    expect(w.text()).toContain('15')
  })

  it('renders contact_book percentage', () => {
    const w = mount(ClassroomOpsCard, { props: { card: FULL_CARD } })
    expect(w.text()).toMatch(/66\.7|66%/)
  })

  it('shows pending dismissal count', () => {
    const w = mount(ClassroomOpsCard, { props: { card: FULL_CARD } })
    expect(w.text()).toContain('2')
  })

  it('renders allergy alerts list', () => {
    const w = mount(ClassroomOpsCard, { props: { card: FULL_CARD } })
    expect(w.text()).toContain('花生')
    expect(w.text()).toContain('海鮮')
  })

  it('handles empty card gracefully', () => {
    const w = mount(ClassroomOpsCard, { props: { card: EMPTY_CARD } })
    expect(w.text()).toContain('空班')
  })

  it('does not crash on missing optional fields', () => {
    const minimal = {
      classroom_id: 3,
      classroom_name: 'min',
      student_count: 0,
      contact_book: { roster: 0, draft: 0, published: 0, missing: 0, percentage: 0 },
    }
    expect(() => mount(ClassroomOpsCard, { props: { card: minimal } })).not.toThrow()
  })
})
```

- [ ] **Step 3: 跑直到綠**

```bash
npm run test -- tests/unit/components/portal/home/ClassroomOpsCard.test.js 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/components/portal/home/ClassroomOpsCard.test.js
git commit -m "test(portal-home): 補 ClassroomOpsCard vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2F.5: QuickLinksCard 測試

- [ ] **Step 1: Read 元件**

```bash
cat src/components/portal/home/QuickLinksCard.vue
```

- [ ] **Step 2: 寫測試**

`tests/unit/components/portal/home/QuickLinksCard.test.js`：

```javascript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

describe('QuickLinksCard', () => {
  it('renders quick links', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const links = w.findAll('a, button, .quick-link, [data-test="quick-link"]')
    expect(links.length).toBeGreaterThanOrEqual(3)
  })

  it('clicking a link triggers navigation', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const links = w.findAll('a, button, .quick-link, [data-test="quick-link"]')
    if (links.length > 0) {
      await links[0].trigger('click')
      expect(push).toHaveBeenCalled()
    }
  })

  it('mounts without props', () => {
    expect(() => mount(QuickLinksCard, { global: { plugins: [router] } })).not.toThrow()
  })
})
```

- [ ] **Step 3: 跑直到綠 + Commit**

```bash
npm run test -- tests/unit/components/portal/home/QuickLinksCard.test.js 2>&1 | tail -8
git add tests/unit/components/portal/home/QuickLinksCard.test.js
git commit -m "test(portal-home): 補 QuickLinksCard vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2F.6: usePortalDashboard composable 測試

- [ ] **Step 1: 寫測試**

`tests/unit/composables/usePortalDashboard.test.js`：

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/stores/portalDashboard', () => ({
  usePortalDashboardStore: () => ({
    summary: { value: null },
    loading: { value: false },
    error: { value: null },
    fetchSummary: vi.fn().mockResolvedValue({}),
    invalidate: vi.fn(),
  }),
}))

import {
  usePortalDashboard,
  broadcastDashboardInvalidate,
  PORTAL_DASHBOARD_INVALIDATE_EVENT,
} from '@/composables/usePortalDashboard'

describe('usePortalDashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('exports invalidate event name', () => {
    expect(PORTAL_DASHBOARD_INVALIDATE_EVENT).toBe('portal-dashboard-invalidate')
  })

  it('broadcastDashboardInvalidate dispatches CustomEvent', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    broadcastDashboardInvalidate()
    expect(spy).toHaveBeenCalled()
    const call = spy.mock.calls[0][0]
    expect(call).toBeInstanceOf(CustomEvent)
    expect(call.type).toBe('portal-dashboard-invalidate')
    spy.mockRestore()
  })

  it('returns summary/loading/error/refresh', () => {
    const result = usePortalDashboard({ autoFetch: false })
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('loading')
    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('refresh')
    expect(typeof result.refresh).toBe('function')
  })
})
```

- [ ] **Step 2: 跑直到綠 + Commit**

```bash
npm run test -- tests/unit/composables/usePortalDashboard.test.js 2>&1 | tail -8
git add tests/unit/composables/usePortalDashboard.test.js
git commit -m "test(portal-home): 補 usePortalDashboard composable vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2F.7: portalDashboard store 測試

- [ ] **Step 1: Read store**

```bash
cat src/stores/portalDashboard.js
```

確認 state shape 與 actions name（fetchSummary / invalidate）；可能用 setup style 或 options style。

- [ ] **Step 2: 寫測試（依實際 store API 對齊）**

`tests/unit/stores/portalDashboard.test.js`：

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/portal', () => ({
  getHomeSummary: vi.fn(),
}))

import { usePortalDashboardStore } from '@/stores/portalDashboard'
import { getHomeSummary } from '@/api/portal'

describe('usePortalDashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial state', () => {
    const store = usePortalDashboardStore()
    expect(store.summary).toBe(null)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('fetchSummary sets summary on success', async () => {
    getHomeSummary.mockResolvedValue({ data: { me: { name: 'X' }, classrooms: [] } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    expect(store.summary).toEqual({ me: { name: 'X' }, classrooms: [] })
    expect(store.error).toBe(null)
  })

  it('fetchSummary sets error on failure', async () => {
    getHomeSummary.mockRejectedValue(new Error('boom'))
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    expect(store.error).toBeInstanceOf(Error)
  })

  it('invalidate clears summary', () => {
    const store = usePortalDashboardStore()
    store.summary = { me: { name: 'X' } }
    store.invalidate()
    expect(store.summary).toBe(null)
  })

  it('fetchSummary({ force: true }) refetches', async () => {
    getHomeSummary.mockResolvedValue({ data: { v: 1 } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    getHomeSummary.mockResolvedValue({ data: { v: 2 } })
    await store.fetchSummary({ force: true })
    expect(getHomeSummary).toHaveBeenCalledTimes(2)
    expect(store.summary).toEqual({ v: 2 })
  })
})
```

注意：實際 API 名稱（可能不是 `getHomeSummary`）以 store 內部的 import 為準對齊 mock 路徑。

- [ ] **Step 3: 跑直到綠 + Commit**

```bash
npm run test -- tests/unit/stores/portalDashboard.test.js 2>&1 | tail -8
git add tests/unit/stores/portalDashboard.test.js
git commit -m "test(portal-home): 補 portalDashboard store vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2F.8: PortalHomeView view-level 測試 + 全 vitest 確認

- [ ] **Step 1: 寫測試**

`tests/unit/views/PortalHomeView.test.js`：

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PortalHomeView from '@/views/portal/PortalHomeView.vue'

vi.mock('@/api/portal', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({
    data: {
      me: { name: '老師' },
      today: { shift: null, attendance: { punch_in_at: null, punch_out_at: null, is_anomaly: false } },
      classrooms: [],
      actions: {
        unread_messages: 0,
        pending_substitute: 0,
        pending_swap: 0,
        pending_anomaly_confirms: 0,
        unread_announcements: 0,
      },
    },
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

function mountIt() {
  return mount(PortalHomeView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        PendingActionsCard: true,
        TodayShiftCard: true,
        ClassroomOpsCard: true,
        QuickLinksCard: true,
      },
    },
  })
}

describe('PortalHomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders greeting', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toMatch(/早安|午安|晚安|凌晨好|中午好/)
  })

  it('shows refresh button', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('button').exists()).toBe(true)
  })

  it('mounts without crashing on empty classrooms', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('未綁定')
  })

  it('renders classrooms section title', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('我的班級')
  })
})
```

- [ ] **Step 2: 跑直到綠**

```bash
npm run test -- tests/unit/views/PortalHomeView.test.js 2>&1 | tail -8
```

- [ ] **Step 3: 跑全 vitest 最終確認**

```bash
npm run test 2>&1 | tail -8
```

Expected：之前 798 + 新加 25-30 條 = 約 823-828 passed。

- [ ] **Step 4: Commit**

```bash
git add tests/unit/views/PortalHomeView.test.js
git commit -m "$(cat <<'EOF'
test(portal-home): 補 PortalHomeView view-level vitest

Phase 2F 收尾。dashboard 全鏈路測試覆蓋完成。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2F.9: 前端 push branch + 開 PR（用戶確認後）

- [ ] **Step 1: 看 commit 歷史**

```bash
git log --oneline feat/teacher-acd-v1-1-foundation..
```

Expected：8 commit。

- [ ] **Step 2: ⚠ Push 前 pause，等用戶批准**

```bash
# 待用戶批准後執行：
git push -u origin feat/teacher-acd-v1-2-home-dashboard
```

- [ ] **Step 3: 開 PR（用戶批准後）**

```bash
gh pr create --base feat/teacher-acd-v1-1-foundation --title "test(portal-home): 補 dashboard vitest 守護回歸（教師端 ACD Phase 2 前端）" --body "$(cat <<'EOF'
## Summary

為既有教師端 dashboard 補 vitest 覆蓋：4 個子元件 + composable + Pinia store + view。
純測試補強，無產品檔案修改。

依據 spec：\`docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-2-design.md\`

## Test plan
- [x] 新增 25-30 條 vitest 全綠
- [x] 既有 798 vitest 不受影響
- [ ] reviewer 確認 dashboard 行為與測試斷言對齊

## 注意

本 PR base 指向 \`feat/teacher-acd-v1-1-foundation\`（phase 1）。phase 1 merge
後本 branch 需 rebase main 重新 push。
EOF
)"
```

---

## Phase 2 完成檢核

### 後端

- [ ] count_queries helper 加入 conftest
- [ ] 5 個 portal_dashboard_service 函式擴充 list 接收
- [ ] compute_class_completion 擴充 list 接收
- [ ] _classroom_card 改純組裝，get_home_summary 預先 batch
- [ ] 4 班 query count test ≤ 14 通過
- [ ] 既有 pytest 全綠
- [ ] backend PR 開好

### 前端

- [ ] 4 個元件測試檔
- [ ] usePortalDashboard composable test
- [ ] portalDashboard store test
- [ ] PortalHomeView view test
- [ ] 全 vitest 約 823-828 綠
- [ ] frontend PR 開好（base 指向 phase 1）
