# 在籍記錄表優化 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把學生工作台「在籍記錄表」做視覺精緻化（保留密集網格）+ dark/RWD 修正 + 輕量互動（年級班級篩選／姓名搜尋高亮／tag 人數統計／點學生跳名冊／匯出 Excel），並補後端 student_id、Excel 端點、PDF 排版。

**Architecture:** 後端先行（`api/student_enrollment.py` 補 `student_id`、新增 `roster.xlsx` 端點＋`services/enrollment_roster_xlsx.py`、`services/enrollment_roster_pdf.py` 排版優化），再前端接上（`EnrollmentRosterTable.vue` 純渲染＋高亮、`EnrollmentPanel.vue` 持有篩選/搜尋/匯出工具列並算 `displayRoster`、`StudentListPanel.vue` 讀 `?q=` 深連結）。前後端分開 commit。

**Tech Stack:** FastAPI + SQLAlchemy + openpyxl + reportlab（後端）；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（前端）。

## Global Constraints

- **語言**：一律繁體中文（對話、commit message、docstring、註解）。
- **Commit**：Conventional Commits；前後端分開 commit；一個 commit 一件事。
- **前端 TS-only**：`.vue` 一律 `<script setup lang="ts">`；禁 `: any`/`as any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`。
- **後端日誌**：`logging.getLogger(__name__)`，不用 `print()`。
- **後端 pytest**：掛 `test_db_session` fixture（否則打到 dev PG）；針對性跑時加 `-o addopts=""` 關 coverage 避免 120s timeout。
- **權限**：新端點沿用 `require_staff_permission(Permission.STUDENTS_READ)`。
- **無 migration**（純讀，無 schema 異動）。
- **OpenAPI 防漂移**：後端改 response model 後，跑 `python scripts/dump_openapi.py`（ivy-backend）+ `npm run gen:api`（ivy-frontend），commit `schema.d.ts`。
- **環境工具警示**：主 orchestrator session 的 Read/Bash 工具當前故障（輸出串台），**所有實作必經 subagent**（subagent 工具正常）。每個 subagent 用 `git -C <絕對路徑>`、自建 worktree 隔離 volatile main（見「執行環境」）。

## 執行環境（重要）

- **兩 repo 路徑**：`ivy-backend` = `/Users/yilunwu/Desktop/ivy-backend`；`ivy-frontend` = `/Users/yilunwu/Desktop/ivy-frontend`。
- **main 不穩定**：前端 main 正被平行 session 快速 rebase（ahead 49/behind 6），**勿在共用 main checkout 直接 commit**。每個實作 subagent 應：
  1. 在目標 repo 建 worktree：`git -C <repo> worktree add .claude/worktrees/<task-slug> -b feat/enrollment-roster-<task-slug> origin/main`（或從目前 main tip，視需要）。
  2. 前端 worktree 需 `ln -s <repo>/node_modules <worktree>/node_modules`（避免重裝）。
  3. 在 worktree 內 TDD + commit 到該 feature 分支。
  4. 回報分支名與 commit hash；**由 orchestrator 審查後串行併入 main**（用 `git merge` 讀 live tip，勿用 `branch -f` + 過時 SHA）。
- **dark mode token 速查**（`src/assets/design-tokens.css` 的 `html.dark` 已反轉）：用 `--border-color`(#d9d9d9→#3a3a3a)、`--neutral-100`(#f5f5f5→#262626)、`--neutral-500`(#9e9e9e→#7a7a7a)、`--bg-color-soft`(#fafafa→#1f1f1f)、`--surface`(#fff→#1f1f1f)、`--text-primary/secondary/tertiary`、`--color-warning-soft`(#fff7e6→#2e2410)、`--color-success/info/warning`（基礎色，狀態點用）。硬編碼 hex 不翻色，一律換 token。

---

## Task 1（後端）：`RosterStudent` 補 `student_id`

**Files:**
- Modify: `ivy-backend/api/student_enrollment.py:172-176`（`RosterStudent` model）、`:284-300`（student query）、`:315-318`（建構）
- Test: `ivy-backend/tests/test_student_enrollment_roster.py`（新建）

**Interfaces:**
- Produces: `RosterStudent.student_id: int`（前端 roster 型別、Task 4 / Task 8 依賴）。

- [ ] **Step 1: 寫失敗測試**

新建 `ivy-backend/tests/test_student_enrollment_roster.py`：

```python
"""在籍花名冊 API 測試。"""
from api.student_enrollment import get_enrollment_roster


def _seed_minimal_roster(session):
    """建 1 年級 1 班 2 學生；回傳 (classroom_id, [student_ids])。
    依現有 models 結構建立（ClassGrade / Classroom / Student）。實作 subagent
    請參照 tests/ 既有 seed helper 與 models/classroom.py 欄位填必填值。"""
    raise NotImplementedError  # subagent 依現有 model 欄位補齊


def test_roster_student_includes_student_id(test_db_session, staff_read_user):
    """roster 每個學生應帶 student_id（供前端點擊跳轉/Excel 追溯）。"""
    cid, sids = _seed_minimal_roster(test_db_session)
    resp = get_enrollment_roster(
        school_year=None, semester=None, current_user=staff_read_user
    )
    data = resp.model_dump()
    all_students = [s for c in data["classes"] for s in c["students"]]
    assert all_students, "應有學生"
    for s in all_students:
        assert "student_id" in s and isinstance(s["student_id"], int)
    assert set(s["student_id"] for s in all_students) >= set(sids)
```

> `test_db_session` / `staff_read_user`（或等義 staff fixture）請對照 `tests/conftest.py` 既有 fixture 名；若 staff fixture 名不同，改用現有者。

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_student_enrollment_roster.py -v -o addopts=""`
Expected: FAIL（`student_id` 不在 response，或 `NotImplementedError`→先補 seed helper 再 RED 在 assert student_id）。

- [ ] **Step 3: 最小實作**

`api/student_enrollment.py` `RosterStudent`（約 :172）加欄位：

```python
class RosterStudent(BaseModel):
    seq: int
    student_id: int
    name: str
    status_tag: Optional[str]
```

student query（約 :286）加 `Student.id`：

```python
session.query(
    Student.id,
    Student.classroom_id,
    Student.name,
    Student.status_tag,
)
```

建構（約 :315）帶入：

```python
roster_students = [
    RosterStudent(seq=i + 1, student_id=s.id, name=s.name, status_tag=s.status_tag)
    for i, s in enumerate(stu_list)
]
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_student_enrollment_roster.py -v -o addopts=""`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-backend add api/student_enrollment.py tests/test_student_enrollment_roster.py
git -C /Users/yilunwu/Desktop/ivy-backend commit -m "feat(enrollment): roster 學生加 student_id 供前端跳轉與 Excel 追溯"
```

---

## Task 2（後端）：Excel 匯出端點

**Files:**
- Create: `ivy-backend/services/enrollment_roster_xlsx.py`
- Modify: `ivy-backend/api/student_enrollment.py`（新增 `/student-enrollment/roster.xlsx` 端點；補 gender 查詢）
- Test: `ivy-backend/tests/test_student_enrollment_xlsx.py`（新建）

**Interfaces:**
- Consumes: `get_enrollment_roster(...)` 的 roster dict（含 Task 1 的 student_id）。
- Produces: `generate_enrollment_roster_xlsx(*, roster: dict, gender_by_student_id: dict[int, str]) -> bytes`；HTTP `GET /api/student-enrollment/roster.xlsx`。

- [ ] **Step 1: 寫失敗測試**

新建 `ivy-backend/tests/test_student_enrollment_xlsx.py`：

```python
"""在籍清單 Excel 匯出測試。"""
import io
from openpyxl import load_workbook
from api.student_enrollment import export_enrollment_roster_xlsx


def test_xlsx_has_two_sheets_and_counts(test_db_session, staff_read_user):
    from tests.test_student_enrollment_roster import _seed_minimal_roster
    cid, sids = _seed_minimal_roster(test_db_session)
    resp = export_enrollment_roster_xlsx(
        school_year=None, semester=None, current_user=staff_read_user
    )
    # StreamingResponse → 收集 body
    body = b"".join(resp.body_iterator) if hasattr(resp, "body_iterator") else resp.body
    wb = load_workbook(io.BytesIO(body))
    assert wb.sheetnames == ["在籍清單", "統計"]
    ws = wb["在籍清單"]
    # 標頭列 + N 學生列
    assert ws.max_row == 1 + len(sids)
    headers = [c.value for c in ws[1]]
    assert headers == ["序號", "年級", "班級", "姓名", "性別", "狀態", "標記", "班導師"]
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_student_enrollment_xlsx.py -v -o addopts=""`
Expected: FAIL（`export_enrollment_roster_xlsx` 不存在）。

- [ ] **Step 3: 實作 service**

新建 `ivy-backend/services/enrollment_roster_xlsx.py`：

```python
"""幼生在籍清單 Excel 產生器（雙工作表：在籍清單 / 統計）。"""
from __future__ import annotations

import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

_TAG_LABELS = {"特教生": "特教", "原住民": "原民", "不足齡": "不足齡"}


def _marks(status_tag: str | None) -> str:
    """非新生/舊生的特殊標記併列（特教·原民·不足齡）。"""
    if status_tag in _TAG_LABELS:
        return _TAG_LABELS[status_tag]
    return ""


def generate_enrollment_roster_xlsx(
    *, roster: dict[str, Any], gender_by_student_id: dict[int, str]
) -> bytes:
    wb = Workbook()

    # ── Sheet 1：在籍清單（扁平） ──
    ws = wb.active
    ws.title = "在籍清單"
    headers = ["序號", "年級", "班級", "姓名", "性別", "狀態", "標記", "班導師"]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.alignment = Alignment(horizontal="center")
    seq = 0
    for cls in roster.get("classes", []):
        for s in cls.get("students", []):
            seq += 1
            tag = s.get("status_tag")
            status = "新生" if tag == "新生" else "舊生"
            ws.append([
                seq,
                cls.get("grade_name") or "",
                cls.get("class_name") or "",
                s.get("name") or "",
                gender_by_student_id.get(s.get("student_id"), "") or "",
                status,
                _marks(tag),
                cls.get("head_teacher_name") or "",
            ])

    # ── Sheet 2：統計 ──
    st = wb.create_sheet("統計")
    st.append(["年級", "班級", "男", "女", "合計"])
    for c in st[1]:
        c.font = Font(bold=True)
    # 各班（性別需由 gender_by_student_id 推算）
    for cls in roster.get("classes", []):
        male = female = 0
        for s in cls.get("students", []):
            g = gender_by_student_id.get(s.get("student_id"))
            if g == "男":
                male += 1
            elif g == "女":
                female += 1
        st.append([
            cls.get("grade_name") or "",
            cls.get("class_name") or "",
            male, female, cls.get("total") or 0,
        ])
    # 全園總計 + tag 統計
    st.append([])
    st.append(["全園總計", "", "", "", roster.get("grand_total") or 0])
    tag_counts = {"新生": 0, "不足齡": 0, "特教生": 0, "原住民": 0}
    for cls in roster.get("classes", []):
        for s in cls.get("students", []):
            t = s.get("status_tag")
            if t in tag_counts:
                tag_counts[t] += 1
    st.append([])
    st.append(["標記統計", "新生", "不足齡", "特教生", "原住民"])
    st.append(["", tag_counts["新生"], tag_counts["不足齡"],
               tag_counts["特教生"], tag_counts["原住民"]])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: 實作端點**

`api/student_enrollment.py` 加（緊接 roster.pdf 端點之後）：

```python
from services.enrollment_roster_xlsx import generate_enrollment_roster_xlsx


@router.get("/student-enrollment/roster.xlsx")
def export_enrollment_roster_xlsx(
    school_year: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
    current_user: dict = Depends(require_staff_permission(Permission.STUDENTS_READ)),
):
    """匯出在籍清單 Excel（雙工作表：在籍清單 / 統計）。"""
    roster = get_enrollment_roster(
        school_year=school_year, semester=semester, current_user=current_user
    )
    roster_dict = roster.model_dump()
    # 補性別：依 roster 內所有 student_id 查 gender
    student_ids = [
        s["student_id"] for c in roster_dict["classes"] for s in c["students"]
    ]
    gender_by_id: dict[int, str] = {}
    if student_ids:
        with session_scope() as session:
            for sid, gender in (
                session.query(Student.id, Student.gender)
                .filter(Student.id.in_(student_ids))
                .all()
            ):
                gender_by_id[sid] = gender or ""
    xlsx_bytes = generate_enrollment_roster_xlsx(
        roster=roster_dict, gender_by_student_id=gender_by_id
    )
    label = roster_dict.get("semester_label") or ""
    filename = f"在籍清單_{roster_dict.get('school_year')}_{label}.xlsx"
    return StreamingResponse(
        BytesIO(xlsx_bytes),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )
```

- [ ] **Step 5: 跑測試確認通過**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_student_enrollment_xlsx.py -v -o addopts=""`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-backend add services/enrollment_roster_xlsx.py api/student_enrollment.py tests/test_student_enrollment_xlsx.py
git -C /Users/yilunwu/Desktop/ivy-backend commit -m "feat(enrollment): 新增在籍清單 Excel 匯出端點(雙工作表)"
```

---

## Task 3（後端）：PDF 排版優化

**Files:**
- Modify: `ivy-backend/services/enrollment_roster_pdf.py`
- Test: `ivy-backend/tests/test_enrollment_roster_pdf.py`（新建）

**Interfaces:**
- Consumes: 既有 `generate_enrollment_roster_pdf(*, roster: dict) -> bytes` 簽名不變。

- [ ] **Step 1: 寫失敗測試（smoke + 標記統計列）**

新建 `ivy-backend/tests/test_enrollment_roster_pdf.py`：

```python
"""在籍花名冊 PDF smoke 測試。"""
from services.enrollment_roster_pdf import (
    generate_enrollment_roster_pdf,
    _tag_counts,
)


def test_pdf_smoke_non_empty():
    roster = {
        "school_year": 2026, "semester_label": "上學期", "generated_date": "1150517",
        "classes": [{
            "class_number": 1, "grade_name": "幼幼", "class_name": "幼幼1",
            "head_teacher_name": "王老師", "assistant_teacher_name": None,
            "art_teacher_name": None,
            "students": [
                {"seq": 1, "student_id": 1, "name": "甲", "status_tag": "新生"},
                {"seq": 2, "student_id": 2, "name": "乙", "status_tag": "特教生"},
            ],
            "total": 2, "old_count": 1, "new_count": 1,
        }],
        "grade_summaries": [{"grade_name": "幼幼", "class_numbers": [1],
                             "total": 2, "old_count": 1, "new_count": 1}],
        "grand_total": 2, "old_grand_total": 1, "new_grand_total": 1,
        "staff_by_role": {"教師": [{"name": "王老師"}]},
    }
    pdf = generate_enrollment_roster_pdf(roster=roster)
    assert isinstance(pdf, bytes) and len(pdf) > 1000
    assert pdf[:4] == b"%PDF"


def test_pdf_empty_classes_ok():
    roster = {"school_year": 2026, "semester_label": "上學期",
              "generated_date": "1150517", "classes": [], "grade_summaries": [],
              "grand_total": 0, "old_grand_total": 0, "new_grand_total": 0,
              "staff_by_role": {}}
    pdf = generate_enrollment_roster_pdf(roster=roster)
    assert pdf[:4] == b"%PDF"


def test_tag_counts_helper():
    classes = [{"students": [
        {"status_tag": "新生"}, {"status_tag": "特教生"},
        {"status_tag": "原住民"}, {"status_tag": None},
    ]}]
    assert _tag_counts(classes) == {"新生": 1, "不足齡": 0, "特教生": 1, "原住民": 1}
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_enrollment_roster_pdf.py -v -o addopts=""`
Expected: FAIL（`_tag_counts` 不存在）。

- [ ] **Step 3: 加 `_tag_counts` helper + 表尾「標記統計」列 + 質感**

`services/enrollment_roster_pdf.py` 加 helper（檔尾，`_compute_grade_spans` 旁）：

```python
def _tag_counts(classes: list[dict[str, Any]]) -> dict[str, int]:
    """統計各狀態標記人數。"""
    counts = {"新生": 0, "不足齡": 0, "特教生": 0, "原住民": 0}
    for cls in classes:
        for s in cls.get("students") or []:
            t = s.get("status_tag")
            if t in counts:
                counts[t] += 1
    return counts
```

質感優化（在既有繪製流程中加，不改單頁自適應邏輯）：
1. **表頭底色**：畫表頭 6 列前，先填淡灰底。在表頭 for 迴圈開始前加：
   ```python
   c.setFillColor(colors.HexColor("#f2f3f5"))
   c.rect(margin_x, y - len(header_labels) * header_row_h, content_w,
          len(header_labels) * header_row_h, stroke=0, fill=1)
   c.setFillColor(colors.black)
   ```
2. **身體斑馬紋**：身體 for 迴圈內，偶數列填極淡灰。在 `y -= body_row_h` 後、畫線前加：
   ```python
   if ri % 2 == 1:
       c.setFillColor(colors.HexColor("#fafafa"))
       c.rect(margin_x, y, content_w, body_row_h, stroke=0, fill=1)
       c.setFillColor(colors.black)
   ```
3. **表尾加「標記統計」列**：在「全園總計」列之後加：
   ```python
   tc = _tag_counts(classes)
   y -= footer_row_h
   c.line(margin_x, y, margin_x + content_w, y)
   c.setFont(font, body_font_size)
   c.drawString(margin_x + 2 * mm, y + footer_row_h / 2 - 1.5 * mm,
                f"標記統計：新生 {tc['新生']}　不足齡 {tc['不足齡']}　"
                f"特教 {tc['特教生']}　原民 {tc['原住民']}")
   ```
   並把 `_finalize`/total_table_h 計算的表尾高度 `total_footer_h` 加一個 `footer_row_h`（讓單頁高度預留正確），避免與員工名單重疊。

> 注意：填色 rect 必須在畫該區文字「之前」（否則蓋住文字）。staff 區起始 `staff_top` 已隨 y 下移，加一列後自然下推。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_enrollment_roster_pdf.py -v -o addopts=""`
Expected: PASS（3 測試）。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-backend add services/enrollment_roster_pdf.py tests/test_enrollment_roster_pdf.py
git -C /Users/yilunwu/Desktop/ivy-backend commit -m "feat(enrollment): PDF 花名冊加表頭底色/斑馬紋/標記統計列"
```

---

## Task 4（契約）：OpenAPI regen + 前端 API wrapper

**Files:**
- Generate: `ivy-frontend/src/api/_generated/schema.d.ts`（regen）
- Modify: `ivy-frontend/src/api/studentEnrollment.ts`

**Interfaces:**
- Consumes: Task 1 的 `RosterStudent.student_id`、Task 2 的 `/student-enrollment/roster.xlsx`。
- Produces: `getEnrollmentRosterXlsx(params) => AxiosResp blob`。

- [ ] **Step 1: 後端 dump OpenAPI**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python scripts/dump_openapi.py`
Expected: 產出 `openapi.json`（local-only，不 commit）。

- [ ] **Step 2: 前端 regen schema**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api`
Expected: `src/api/_generated/schema.d.ts` 更新（出現 `roster.xlsx` path、`RosterStudent.student_id`）。

- [ ] **Step 3: 加 API wrapper**

`src/api/studentEnrollment.ts` 加：

```typescript
export const getEnrollmentRosterXlsx = (params: unknown) =>
  api.get('/student-enrollment/roster.xlsx', { params, responseType: 'blob' })
```

- [ ] **Step 4: typecheck + drift check**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api:check && npx vue-tsc --noEmit`
Expected: 無漂移、無型別錯誤。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/api/_generated/schema.d.ts src/api/studentEnrollment.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(enrollment): 前端契約同步 student_id 與 roster.xlsx api"
```

---

## Task 5（前端）：`EnrollmentRosterTable` 視覺重塑 + dark/RWD

**Files:**
- Modify: `ivy-frontend/src/components/enrollment/EnrollmentRosterTable.vue`
- Test: `ivy-frontend/src/components/enrollment/__tests__/EnrollmentRosterTable.spec.ts`（新建）

**Interfaces:**
- Produces: 狀態點以 `<span class="status-dot dot-new|dot-underage|dot-special|dot-indigenous">`；`RosterStudent` 型別加 `student_id: number`。

- [ ] **Step 1: 寫失敗測試（狀態點 class）**

新建 `src/components/enrollment/__tests__/EnrollmentRosterTable.spec.ts`：

```typescript
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import EnrollmentRosterTable from '../EnrollmentRosterTable.vue'

const roster = {
  school_year: 2026, semester: 1, generated_date: '1150517',
  classes: [{
    classroom_id: 1, class_number: 1, grade_name: '幼幼', class_name: '幼幼1',
    head_teacher_name: '王', assistant_teacher_name: null, art_teacher_name: null,
    students: [
      { seq: 1, student_id: 11, name: '甲', status_tag: '新生' },
      { seq: 2, student_id: 12, name: '乙', status_tag: '特教生' },
    ],
    total: 2, old_count: 1, new_count: 1,
  }],
  grade_summaries: [{ grade_name: '幼幼', class_numbers: [1], total: 2, old_count: 1, new_count: 1 }],
  grand_total: 2, old_grand_total: 1, new_grand_total: 1,
  staff_by_role: { 教師: [{ name: '王' }] },
}

describe('EnrollmentRosterTable', () => {
  it('新生顯示綠點、特教顯示紫點', () => {
    const w = mount(EnrollmentRosterTable, { props: { roster } })
    expect(w.find('.dot-new').exists()).toBe(true)
    expect(w.find('.dot-special').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment`
Expected: FAIL（無 `.dot-new`）。

- [ ] **Step 3: 實作 — 狀態點 + token 化 + sticky + hover + RWD**

3a. template 學生格改為姓名前置狀態點（取代整格染色 class）：

```html
<td
  v-for="cls in roster.classes"
  :key="cls.classroom_id"
  class="student-cell"
  :class="{ 'grade-border-right': gradeLastClassNumbers.has(cls.class_number) }"
>
  <template v-if="cls.students[rowIdx - 1]">
    <span
      v-if="dotClass(cls.students[rowIdx - 1])"
      class="status-dot"
      :class="dotClass(cls.students[rowIdx - 1])"
    />{{ cls.students[rowIdx - 1].name
    }}<span v-if="cls.students[rowIdx - 1].status_tag === '原住民'" class="indigenous-mark">原</span>
  </template>
</td>
```

3b. script 加 `dotClass` + `student_id` 型別：

```typescript
interface RosterStudent {
  student_id: number
  name: string
  status_tag?: string
}

function dotClass(student: RosterStudent | undefined) {
  if (!student) return ''
  switch (student.status_tag) {
    case '新生': return 'dot-new'
    case '不足齡': return 'dot-underage'
    case '特教生': return 'dot-special'
    case '原住民': return 'dot-indigenous'
    default: return ''
  }
}
```

> 移除舊 `studentTagClass`（整格染色）。

3c. style **token 化映射**（逐一替換硬編碼 hex）：

| 原硬編碼 | 換成 |
|---------|------|
| `border: 1px solid #aaa`（.roster-table td） | `border: 1px solid var(--border-color)` |
| `background: #f8f9fa`（.class-num-cell） | `background: var(--neutral-100)` |
| `background: #fff9db`（.grade-cell） | `background: var(--color-warning-soft)` |
| `background: #fffbe6`（.teacher-label/.teacher-cell） | `background: var(--color-warning-soft)` |
| `background: #fafafa`（.staff-section） | `background: var(--bg-color-soft)` |
| `border-right: 2px solid #8c8c8c`（.row-label/.seq-cell） | `border-right: 2px solid var(--neutral-500)` |
| `.row-label background: var(--neutral-100)`（已是 token，保留） | — |

3d. 新增狀態點 + 自訂紫 token + sticky 表頭 + hover + RWD（加進 `<style scoped>`）：

```css
/* 狀態點 */
.status-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  margin-right: 3px;
  vertical-align: middle;
}
.dot-new        { background: var(--color-success); }
.dot-underage   { background: var(--color-warning); }
.dot-special    { background: var(--tag-special, #7c3aed); }
.dot-indigenous { background: var(--color-info); }

/* 特教紫 token（無內建紫，自訂 + dark 覆寫） */
.roster-wrapper { --tag-special: #7c3aed; }
:global(html.dark) .roster-wrapper { --tag-special: #b39ddb; }

/* sticky 表頭（thead 各列固定於頂） */
.roster-table thead td { position: sticky; z-index: 1; background: var(--surface); }
/* row-label 與 seq-cell 既有 left sticky 保留；交叉處 z-index 提高已在既有 css */

/* hover 整列高亮（JS 控制 hoverRow） */
.student-row.is-hover td { background: var(--color-primary-soft); }

/* RWD：窄螢幕員工面板改堆疊 */
@media (max-width: 768px) {
  .roster-outer { flex-direction: column; }
  .staff-panel { width: 100%; }
}
```

3e. hover 整列：tbody `<tr>` 加 `class="student-row"` + `:class="{ 'is-hover': hoverRow === rowIdx }"` + `@mouseenter="hoverRow = rowIdx"` `@mouseleave="hoverRow = null"`；script 加 `const hoverRow = ref<number | null>(null)`。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment`
Expected: PASS。

- [ ] **Step 5: typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vue-tsc --noEmit`
Expected: 無錯誤。

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/components/enrollment/EnrollmentRosterTable.vue src/components/enrollment/__tests__/EnrollmentRosterTable.spec.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(enrollment): 在籍記錄表視覺重塑(token化/狀態點/sticky/hover/RWD)"
```

---

## Task 6（前端）：搜尋高亮 + tag 統計圖例

**Files:**
- Modify: `ivy-frontend/src/components/enrollment/EnrollmentRosterTable.vue`
- Test: 同 Task 5 的 spec（擴充）

**Interfaces:**
- Consumes: prop `highlightKeyword?: string`。
- Produces: 命中學生格加 `.is-hit` class；圖例顯示各 tag 人數（`tagCounts` computed）。

- [ ] **Step 1: 寫失敗測試**

擴充 `EnrollmentRosterTable.spec.ts`：

```typescript
it('highlightKeyword 命中學生加 .is-hit', () => {
  const w = mount(EnrollmentRosterTable, { props: { roster, highlightKeyword: '甲' } })
  const hits = w.findAll('.is-hit')
  expect(hits.length).toBe(1)
  expect(hits[0].text()).toContain('甲')
})

it('圖例顯示 tag 人數', () => {
  const w = mount(EnrollmentRosterTable, { props: { roster } })
  // 新生 1、特教 1
  expect(w.find('.legend').text()).toMatch(/新生\s*1/)
  expect(w.find('.legend').text()).toMatch(/特教生?\s*1/)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment`
Expected: FAIL。

- [ ] **Step 3: 實作**

3a. props 加 `highlightKeyword`：

```typescript
const props = defineProps<{
  roster: Roster
  highlightKeyword?: string
}>()
```

3b. 學生格加命中 class：template `student-cell` 的 `:class` 加 `{ 'is-hit': isHit(cls.students[rowIdx - 1]) }`；script：

```typescript
function isHit(student: RosterStudent | undefined) {
  const kw = (props.highlightKeyword || '').trim()
  return !!kw && !!student && student.name.includes(kw)
}
```

3c. tag 統計 computed：

```typescript
const tagCounts = computed(() => {
  const counts = { 新生: 0, 不足齡: 0, 特教生: 0, 原住民: 0 }
  for (const cls of props.roster.classes) {
    for (const s of cls.students) {
      if (s.status_tag && s.status_tag in counts) {
        counts[s.status_tag as keyof typeof counts]++
      }
    }
  }
  return counts
})
```

3d. 圖例 template 改為帶數字：

```html
<div class="legend">
  <div class="legend-item tag-new">● 新生 {{ tagCounts.新生 }}</div>
  <div class="legend-item tag-underage">● 不足齡 {{ tagCounts.不足齡 }}</div>
  <div class="legend-item tag-special">● 特教生 {{ tagCounts.特教生 }}</div>
  <div class="legend-item tag-indigenous">● 原住民 {{ tagCounts.原住民 }}</div>
</div>
```

3e. style 加命中高亮：

```css
.student-cell.is-hit {
  background: var(--color-warning-soft);
  outline: 2px solid var(--color-warning);
  font-weight: 700;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/components/enrollment/EnrollmentRosterTable.vue src/components/enrollment/__tests__/EnrollmentRosterTable.spec.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(enrollment): 在籍記錄表搜尋高亮與圖例 tag 人數統計"
```

---

## Task 7（前端）：`EnrollmentPanel` 工具列（篩選/搜尋/匯出/tag chips）

**Files:**
- Modify: `ivy-frontend/src/components/student/workbench/EnrollmentPanel.vue`
- Test: `ivy-frontend/src/components/student/workbench/__tests__/EnrollmentPanel.spec.ts`（新建）

**Interfaces:**
- Consumes: `getEnrollmentRosterXlsx`（Task 4）、RosterTable 的 `highlightKeyword` prop。
- Produces: `displayRoster` computed（依篩選過濾班 + 重算 summaries/tag）。

- [ ] **Step 1: 寫失敗測試（displayRoster 篩選 + 重算）**

新建 `src/components/student/workbench/__tests__/EnrollmentPanel.spec.ts`，測試 `displayRoster` 純函式邏輯。**因 Panel 依賴 store/api，測試以抽出的純函式為主**：先把篩選/重算邏輯抽成可測純函式 `filterRoster(roster, gradeFilter, classFilter)`（放同檔 export 或 `src/components/enrollment/rosterFilter.ts`）。

```typescript
import { describe, it, expect } from 'vitest'
import { filterRoster } from '@/components/enrollment/rosterFilter'

const roster = {
  classes: [
    { classroom_id: 1, grade_name: '幼幼', class_name: '幼幼1',
      students: [{ student_id: 1, name: '甲', status_tag: '新生' }],
      total: 1, old_count: 0, new_count: 1 },
    { classroom_id: 2, grade_name: '中班', class_name: '中1',
      students: [{ student_id: 2, name: '乙', status_tag: null }],
      total: 1, old_count: 1, new_count: 0 },
  ],
  grade_summaries: [], grand_total: 2, old_grand_total: 1, new_grand_total: 1,
  staff_by_role: {}, school_year: 2026, semester: 1, generated_date: '1150517',
}

describe('filterRoster', () => {
  it('依年級篩選只留該年級班 + 重算總計', () => {
    const r = filterRoster(roster as any, ['幼幼'], [])
    expect(r.classes.map(c => c.class_name)).toEqual(['幼幼1'])
    expect(r.grand_total).toBe(1)
  })
  it('空篩選回全部', () => {
    const r = filterRoster(roster as any, [], [])
    expect(r.classes.length).toBe(2)
    expect(r.grand_total).toBe(2)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/student/workbench src/components/enrollment`
Expected: FAIL（`filterRoster` 不存在）。

- [ ] **Step 3: 實作 `filterRoster`**

新建 `src/components/enrollment/rosterFilter.ts`：

```typescript
import type { Roster } from './rosterTypes'

export function filterRoster(
  roster: Roster, gradeFilter: string[], classFilter: number[],
): Roster {
  let classes = roster.classes
  if (gradeFilter.length) classes = classes.filter(c => gradeFilter.includes(c.grade_name))
  if (classFilter.length) classes = classes.filter(c => classFilter.includes(c.classroom_id))
  if (classes === roster.classes) return roster
  // 重算年級 summaries
  const gradeMap = new Map<string, { grade_name: string; class_numbers: number[]; total: number; old_count: number; new_count: number }>()
  for (const c of classes) {
    const g = gradeMap.get(c.grade_name) ?? { grade_name: c.grade_name, class_numbers: [], total: 0, old_count: 0, new_count: 0 }
    g.class_numbers.push(c.class_number)
    g.total += c.total; g.old_count += c.old_count; g.new_count += c.new_count
    gradeMap.set(c.grade_name, g)
  }
  return {
    ...roster,
    classes,
    grade_summaries: [...gradeMap.values()],
    grand_total: classes.reduce((s, c) => s + c.total, 0),
    old_grand_total: classes.reduce((s, c) => s + c.old_count, 0),
    new_grand_total: classes.reduce((s, c) => s + c.new_count, 0),
  }
}
```

> 若無 `rosterTypes.ts`，把 `Roster`/`RosterClass` 等 interface 從 `EnrollmentRosterTable.vue` 抽到 `src/components/enrollment/rosterTypes.ts` 供共用（RosterTable 改 import）。此抽取屬本 task。

- [ ] **Step 4: Panel 工具列 wiring（在「在籍記錄表」tab 上方）**

`EnrollmentPanel.vue` template `roster` tab 內、`<EnrollmentRosterTable>` 之前加工具列：

```html
<div v-if="roster" class="roster-toolbar">
  <el-select v-model="gradeFilter" multiple collapse-tags placeholder="年級" clearable style="min-width: 160px">
    <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
  </el-select>
  <el-select v-model="classFilter" multiple collapse-tags placeholder="班級" clearable style="min-width: 160px">
    <el-option v-for="c in classOptions" :key="c.classroom_id" :label="c.class_name" :value="c.classroom_id" />
  </el-select>
  <el-input v-model="searchInput" placeholder="搜尋學生姓名" clearable style="max-width: 200px" :prefix-icon="Search" />
  <div class="tag-chips">
    <span class="chip chip-new">● 新生 {{ displayTagCounts.新生 }}</span>
    <span class="chip chip-underage">● 不足齡 {{ displayTagCounts.不足齡 }}</span>
    <span class="chip chip-special">● 特教 {{ displayTagCounts.特教生 }}</span>
    <span class="chip chip-indigenous">● 原民 {{ displayTagCounts.原住民 }}</span>
  </div>
  <el-button :icon="Download" @click="exportXlsx">匯出 Excel</el-button>
</div>
<EnrollmentRosterTable :roster="displayRoster" :highlight-keyword="searchKeyword" @select-student="onSelectStudent" />
```

script 加：

```typescript
import { Search, Download } from '@element-plus/icons-vue'
import { getEnrollmentRosterXlsx } from '@/api/studentEnrollment'
import { downloadFile } from '@/utils/download'
import { filterRoster } from '@/components/enrollment/rosterFilter'

const gradeFilter = ref<string[]>([])
const classFilter = ref<number[]>([])
const searchInput = ref('')
const searchKeyword = ref('')
let _t: ReturnType<typeof setTimeout> | null = null
watch(searchInput, (v) => {
  if (_t) clearTimeout(_t)
  _t = setTimeout(() => { searchKeyword.value = v }, 300)
})

const gradeOptions = computed(() => [...new Set((roster.value?.classes ?? []).map(c => c.grade_name))])
const classOptions = computed(() => {
  const cs = roster.value?.classes ?? []
  return gradeFilter.value.length ? cs.filter(c => gradeFilter.value.includes(c.grade_name)) : cs
})
const displayRoster = computed(() =>
  roster.value ? filterRoster(roster.value, gradeFilter.value, classFilter.value) : roster.value)
const displayTagCounts = computed(() => {
  const counts = { 新生: 0, 不足齡: 0, 特教生: 0, 原住民: 0 }
  for (const c of displayRoster.value?.classes ?? [])
    for (const s of c.students)
      if (s.status_tag && s.status_tag in counts) counts[s.status_tag as keyof typeof counts]++
  return counts
})

const exportXlsx = async () => {
  await downloadFile('/student-enrollment/roster.xlsx', '在籍清單.xlsx', termParams())
}
```

> `getEnrollmentRosterXlsx` 已在 Task 4 加進 api（此處用 `downloadFile` 直接帶 url + params 即可，毋須額外 import api wrapper；若偏好用 wrapper 則 `saveBlobResponse(await getEnrollmentRosterXlsx(termParams()))`）。`onSelectStudent` 於 Task 8 實作（先放空函式 `const onSelectStudent = (_: { id: number; name: string }) => {}`）。

- [ ] **Step 5: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment src/components/student/workbench && npx vue-tsc --noEmit`
Expected: PASS、無型別錯誤。

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/components/enrollment/rosterFilter.ts src/components/enrollment/rosterTypes.ts src/components/enrollment/EnrollmentRosterTable.vue src/components/student/workbench/EnrollmentPanel.vue src/components/student/workbench/__tests__/EnrollmentPanel.spec.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(enrollment): 在籍記錄表工具列(年級班級篩選/搜尋/tag統計/匯出Excel)"
```

---

## Task 8（前端）：點學生跳名冊定位

**Files:**
- Modify: `EnrollmentRosterTable.vue`（學生格可點 + emit）、`EnrollmentPanel.vue`（router.push）、`src/components/student/workbench/StudentListPanel.vue`（讀 `?q=`）
- Test: `EnrollmentRosterTable.spec.ts` 擴充 + `StudentListPanel` 既有/新測試

**Interfaces:**
- Produces: RosterTable `emit('select-student', { id: number; name: string })`。

- [ ] **Step 1: 寫失敗測試**

擴充 `EnrollmentRosterTable.spec.ts`：

```typescript
it('點有 student_id 的學生 emit select-student', async () => {
  const w = mount(EnrollmentRosterTable, { props: { roster } })
  await w.find('.student-cell .student-link').trigger('click')
  const ev = w.emitted('select-student')
  expect(ev).toBeTruthy()
  expect(ev![0][0]).toMatchObject({ id: 11, name: '甲' })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment`
Expected: FAIL。

- [ ] **Step 3: RosterTable emit**

template 學生姓名包成可點元素：

```html
<span class="student-link" @click="onClick(cls.students[rowIdx - 1])">{{ cls.students[rowIdx - 1].name }}</span>
```

script：

```typescript
const emit = defineEmits<{ 'select-student': [{ id: number; name: string }] }>()
function onClick(student: RosterStudent | undefined) {
  if (student?.student_id) emit('select-student', { id: student.student_id, name: student.name })
}
```

style：`.student-link { cursor: pointer; } .student-link:hover { text-decoration: underline; color: var(--color-primary); }`

- [ ] **Step 4: Panel router.push**

`EnrollmentPanel.vue`：

```typescript
import { useRouter } from 'vue-router'
const router = useRouter()
const onSelectStudent = ({ id, name }: { id: number; name: string }) => {
  router.push({ path: '/students', query: { tab: 'roster', student_id: String(id), q: name } })
}
```

- [ ] **Step 5: StudentListPanel 讀 `?q=`**

`StudentListPanel.vue` 在 onMounted/route.query 處理處加：route.query.q 為字串時填入 `searchQuery.value = route.query.q`（沿用既有 search debounce 自動觸發查詢）。實作 subagent 對照該檔既有 `searchQuery` 與 route.query 讀取段落補上。

擴充測試（`StudentListPanel` 對應測試檔，若無則新建最小測試）：mount 時帶 `route.query = { q: '甲' }`，斷言 `searchQuery` 被填入 '甲'。

- [ ] **Step 6: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment src/components/student/workbench && npx vue-tsc --noEmit`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/components/enrollment/EnrollmentRosterTable.vue src/components/student/workbench/EnrollmentPanel.vue src/components/student/workbench/StudentListPanel.vue src/components/enrollment/__tests__/EnrollmentRosterTable.spec.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(enrollment): 點在籍記錄表學生跳學生名冊以姓名定位"
```

---

## 整合驗證（全部 task 後）

- [ ] **BE 全測**：`cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_student_enrollment_roster.py tests/test_student_enrollment_xlsx.py tests/test_enrollment_roster_pdf.py -v -o addopts=""` → 全綠。
- [ ] **FE 全測**：`cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/enrollment src/components/student/workbench && npx vue-tsc --noEmit` → 全綠。
- [ ] **實機目視**（`./start.sh` 後 `/students?tab=enrollment` →「在籍記錄表」）：篩選/搜尋高亮/tag chips/匯出 Excel/點學生跳轉；切 dark mode 確認無破版；縮窄視窗確認員工面板堆疊。
- [ ] **收尾**：前後端各自 feature 分支經 orchestrator 審查後併入各自 main（`git merge` 讀 live tip）；依使用者指示決定是否 push。

## Self-Review 註記

- **Spec 覆蓋**：§4.1→T1、§4.2→T2、§4.3→T3、§4.4(RosterTable)→T5/T6、§4.5(Panel)→T7、§4.6(點學生)→T8、§4.7(dark/RWD)→T5、契約→T4。全覆蓋。
- **型別一致**：`student_id`(BE T1 / FE T5 型別 / T8 emit)、`highlightKeyword`(T6 def → T7 用)、`filterRoster`(T7 def/用)、`tagCounts`/`displayTagCounts`（T6 圖例 / T7 chips，各自 computed 同名邏輯）。
- **無 migration、無 placeholder**（CSS token 化以映射表給出明確指令）。
