# 招生整合 Phase 2+3（歷程頁 + 統計大彙整）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 = 小孩「參觀→入學」歷程時間軸（訪視名單/學生檔案雙入口，後端複用漏斗那段正確的 timeline union）；Phase 3 = 官網報名併進招生統計成 tab + 全管道彙整卡 + 移除獨立選單項。

**Architecture:** Phase 2 後端把 timeline 邏輯抽 service + 正確路由端點，funnel 改呼叫同 service；前端獨立 JourneyTimeline 元件。Phase 3 純前端，複用既有 RecruitmentIvykidsTab + RecruitmentView 的 Bar chart。**全程不需 codegen**（timeline 回應型別 `Schema<'TimelineOut'>` 已在 schema.d.ts；profile 端點無 response_model）。

**Tech Stack:** FastAPI + Pydantic + pytest；Vue 3 `<script setup lang="ts">` + Element Plus + Vitest。

**Spec:** `docs/superpowers/specs/2026-06-04-recruitment-student-integration-phase2-3-design.md`

---

## 前置

- **後端 worktree**：`~/Desktop/ivy-backend` 從 local main `7685472` 開 `feat/recruit-journey-timeline-be`（`git worktree add .worktrees/recruit-journey-timeline-be -b feat/recruit-journey-timeline-be main`）。python 用 `~/Desktop/ivy-backend/.venv/bin/python`。
- **前端 worktree**：已存在 `~/Desktop/ivy-frontend/.worktrees/recruit-journey-stats-p23-fe`（off `840648da`）。node_modules tracked symlink 在此深度有效，**勿換絕對 symlink**。
- **dev DB**：手動整合測試前須 `alembic upgrade heads`（仍 `studnum01`）。單元測試不需要。

---

# Phase 2 — 小孩歷程

## Task 1（BE）：TimelineEvent/TimelineOut schema 搬到獨立檔

**Files:**
- Create: `ivy-backend/schemas/recruitment_timeline.py`
- Modify: `ivy-backend/schemas/recruitment_funnel.py`（移除 TimelineEvent/TimelineOut 定義，改 re-export）
- Test: `ivy-backend/tests/test_recruitment_timeline_schema.py`

- [ ] **Step 1: 寫失敗測試**

```python
# tests/test_recruitment_timeline_schema.py
"""TimelineEvent/TimelineOut 應可從 recruitment_timeline 與 recruitment_funnel 兩處 import（後者 re-export）。"""


def test_import_from_timeline_module():
    from schemas.recruitment_timeline import TimelineEvent, TimelineOut

    assert TimelineOut.model_fields["events"] is not None
    assert "source" in TimelineEvent.model_fields


def test_reexport_from_funnel_module():
    from schemas.recruitment_funnel import TimelineEvent as TE
    from schemas.recruitment_timeline import TimelineEvent as TE2

    assert TE is TE2  # 同一個 class（re-export 非複製）
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-backend && .venv/bin/python -m pytest tests/test_recruitment_timeline_schema.py -q`
Expected: FAIL（`schemas.recruitment_timeline` 不存在）

- [ ] **Step 3: 建新 schema 檔 + 改 funnel re-export**

`schemas/recruitment_timeline.py`：
```python
"""schemas/recruitment_timeline.py — 招生→學生 歷程時間軸事件。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class TimelineEvent(BaseModel):
    source: Literal["recruitment", "student"]
    event_type: str
    from_stage: Optional[str]
    to_stage: Optional[str]
    actor_user_id: Optional[int]
    reason: Optional[str]
    created_at: datetime


class TimelineOut(BaseModel):
    events: list[TimelineEvent]
```

在 `schemas/recruitment_funnel.py`：刪除 `class TimelineEvent` 與 `class TimelineOut`（行 53-64），改在原處加：
```python
# 歷程 schema 已搬到 recruitment_timeline；此處 re-export 保既有 import 不破
from schemas.recruitment_timeline import TimelineEvent, TimelineOut  # noqa: F401,E402
```
（若 `recruitment_funnel.py` 頂部 import 區可放，移到頂部更佳；放原處亦可。確認 `datetime`/`Literal` 等若僅供已刪 class 用則一併移除避免 unused。）

- [ ] **Step 4: 跑測試確認通過**

Run: `.venv/bin/python -m pytest tests/test_recruitment_timeline_schema.py -q`
Expected: PASS（2 passed）

- [ ] **Step 5: 確認 app 仍可 import（funnel 未破）**

Run: `.venv/bin/python -c "import api.recruitment.funnel; print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be add schemas/recruitment_timeline.py schemas/recruitment_funnel.py tests/test_recruitment_timeline_schema.py
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be commit -m "refactor(recruitment): TimelineEvent/Out 搬到 recruitment_timeline（funnel re-export）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2（BE）：timeline service + 正確路由端點 + funnel 改呼叫 service

**Files:**
- Create: `ivy-backend/services/recruitment_timeline.py`
- Modify: `ivy-backend/api/recruitment/records.py`（加新端點）
- Modify: `ivy-backend/api/recruitment/funnel.py`（`get_timeline` 改呼叫 service）
- Test: `ivy-backend/tests/test_recruitment_timeline_service.py`

- [ ] **Step 1: 寫失敗測試**

```python
# tests/test_recruitment_timeline_service.py
"""build_visit_timeline：union recruitment_event_log + student_change_logs，按時間排序。"""
import pytest
from datetime import datetime, date

from models.base import session_scope
from models.recruitment import RecruitmentVisit, RecruitmentEventLog
from services.recruitment_timeline import build_visit_timeline, TimelineNotFound


def test_not_found_raises():
    with session_scope() as s:
        with pytest.raises(TimelineNotFound):
            build_visit_timeline(s, visit_id=999999)


def test_visit_with_only_recruitment_events(tmp_visit):
    with session_scope() as s:
        s.add(RecruitmentEventLog(
            recruitment_visit_id=tmp_visit, event_type="created",
            from_stage=None, to_stage="visited", actor_user_id=1,
            reason=None, created_at=datetime(2026, 3, 1, 9, 0),
        ))
        s.flush()
        events = build_visit_timeline(s, visit_id=tmp_visit)
    assert len(events) == 1
    assert events[0].source == "recruitment"
    assert events[0].event_type == "created"


@pytest.fixture
def tmp_visit():
    with session_scope() as s:
        v = RecruitmentVisit(month="115.03", child_name="時光童", has_deposit=False)
        s.add(v)
        s.flush()
        vid = v.id
    return vid
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `.venv/bin/python -m pytest tests/test_recruitment_timeline_service.py -q`
Expected: FAIL（`services.recruitment_timeline` 不存在）

- [ ] **Step 3: 建 service（搬 funnel.py:191-242 邏輯）**

`services/recruitment_timeline.py`：
```python
"""services/recruitment_timeline.py — 招生→學生 歷程時間軸（union 招生事件 + 學生異動）。"""

from __future__ import annotations

from datetime import datetime as _dt

from sqlalchemy.orm import Session

from models.classroom import Student
from models.recruitment import RecruitmentVisit, RecruitmentEventLog
from models.student_log import StudentChangeLog
from schemas.recruitment_timeline import TimelineEvent


class TimelineNotFound(Exception):
    """visit 不存在。"""


def build_visit_timeline(session: Session, *, visit_id: int) -> list[TimelineEvent]:
    visit = session.query(RecruitmentVisit).filter_by(id=visit_id).first()
    if visit is None:
        raise TimelineNotFound(f"visit {visit_id} not found")

    rec_events = (
        session.query(RecruitmentEventLog)
        .filter_by(recruitment_visit_id=visit_id)
        .all()
    )
    student = (
        session.query(Student).filter(Student.recruitment_visit_id == visit_id).first()
    )
    student_events = []
    if student is not None:
        student_events = (
            session.query(StudentChangeLog).filter_by(student_id=student.id).all()
        )

    events: list[TimelineEvent] = []
    for e in rec_events:
        events.append(
            TimelineEvent(
                source="recruitment",
                event_type=e.event_type,
                from_stage=e.from_stage,
                to_stage=e.to_stage,
                actor_user_id=e.actor_user_id,
                reason=e.reason,
                created_at=e.created_at,
            )
        )
    for e in student_events:
        ts = (
            e.event_date
            if hasattr(e.event_date, "hour")
            else _dt.combine(e.event_date, _dt.min.time())
        )
        events.append(
            TimelineEvent(
                source="student",
                event_type=e.event_type,
                from_stage=None,
                to_stage=None,
                actor_user_id=e.recorded_by,
                reason=e.reason,
                created_at=ts,
            )
        )

    events.sort(key=lambda x: x.created_at)
    return events
```

- [ ] **Step 4: 跑測試確認通過**

Run: `.venv/bin/python -m pytest tests/test_recruitment_timeline_service.py -q`
Expected: PASS（3 passed）

- [ ] **Step 5: 加正確路由端點到 `api/recruitment/records.py`**

在 records.py 適當位置（import 區加 `from services.recruitment_timeline import build_visit_timeline, TimelineNotFound` 與 `from schemas.recruitment_timeline import TimelineOut`）：
```python
@router.get("/visits/{visit_id}/timeline", response_model=TimelineOut)
def get_visit_timeline(
    visit_id: int,
    _=Depends(require_staff_permission(Permission.RECRUITMENT_READ)),
):
    """小孩參觀→入學歷程（招生事件 + 學生異動 union）。"""
    try:
        with session_scope() as session:
            try:
                events = build_visit_timeline(session, visit_id=visit_id)
            except TimelineNotFound:
                raise HTTPException(status_code=404, detail="訪視記錄不存在")
            out = TimelineOut(events=events)
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise_safe_500(e, context="歷程查詢失敗")
```
（records.py router prefix 為 `/api/recruitment` → real path `/api/recruitment/visits/{id}/timeline`，路由正確。確認 `require_staff_permission`/`Permission`/`session_scope`/`raise_safe_500`/`HTTPException` 已 import，缺則補。）

- [ ] **Step 6: funnel.py `get_timeline` 改呼叫 service（DRY）**

`api/recruitment/funnel.py` 的 `get_timeline`（行 185-242）函式體改為：
```python
    from services.recruitment_timeline import build_visit_timeline, TimelineNotFound

    try:
        events = build_visit_timeline(session, visit_id=visit_id)
    except TimelineNotFound:
        raise HTTPException(404, detail={"code": "VISIT_NOT_FOUND"})
    return TimelineOut(events=events)
```
（移除原本內嵌查詢；funnel 仍 dead route 但不重複邏輯。原檔頂部若有僅供此段用的 import（RecruitmentEventLog/StudentChangeLog/Student/_dt）變 unused 則移除。）

- [ ] **Step 7: 端點測試 + 無回歸**

```python
# 追加到 tests/test_recruitment_timeline_service.py（用既有 client fixture 風格，參考 tests/test_recruitment_intake_api.py）
def test_timeline_endpoint_404(client_admin):
    r = client_admin.get("/api/recruitment/visits/999999/timeline")
    assert r.status_code == 404
```
Run: `.venv/bin/python -m pytest tests/test_recruitment_timeline_service.py tests/test_recruitment_funnel_api_smoke.py -q`
Expected: 全綠（client fixture 名稱對齊既有測試；若無現成 admin client fixture 則省略端點測試、僅留 service 測試）

- [ ] **Step 8: Commit**

```bash
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be add services/recruitment_timeline.py api/recruitment/records.py api/recruitment/funnel.py tests/test_recruitment_timeline_service.py
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be commit -m "feat(recruitment): 歷程 timeline service + 正確路由端點（funnel 改呼叫同 service）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3（BE）：getStudentProfile 回傳補 recruitment_visit_id

**Files:**
- Modify: `ivy-backend/api/students.py`（`/students/{student_id}/profile` 端點，行 1319 附近）
- Test: `ivy-backend/tests/test_student_profile_recruitment_visit_id.py`

- [ ] **Step 1: 先確認 profile 端點組裝**

`grep -nA40 'students/{student_id}/profile' api/students.py` 找到回傳 dict 的組裝處（無 response_model，回 dict）。

- [ ] **Step 2: 寫失敗測試**

```python
# tests/test_student_profile_recruitment_visit_id.py
"""profile 回傳應含 recruitment_visit_id（Phase 2 學生檔案入學前歷程入口用）。"""
# 用既有 student profile 測試的 fixture 風格；若無現成 client 則改成直接呼叫 profile 組裝函式。
# 最小斷言：回傳 dict 含 'recruitment_visit_id' key。
def test_profile_has_recruitment_visit_id(client_admin, seeded_student_id):
    r = client_admin.get(f"/api/students/{seeded_student_id}/profile")
    assert r.status_code == 200
    assert "recruitment_visit_id" in r.json()
```
（fixture 名對齊既有 student 測試；若 profile 端點測試成本高，改為單元測試組裝函式回傳含此 key。）

- [ ] **Step 3: 跑測試確認失敗**

Run: `.venv/bin/python -m pytest tests/test_student_profile_recruitment_visit_id.py -q`
Expected: FAIL（key 不存在）

- [ ] **Step 4: 在 profile 回傳 dict 加 key**

在 profile 端點組裝回傳的 dict 加：
```python
        "recruitment_visit_id": student.recruitment_visit_id,
```
（`student` 為已載入的 Student ORM 物件；欄位本就存在於 model。）

- [ ] **Step 5: 跑測試確認通過 + 無回歸**

Run: `.venv/bin/python -m pytest tests/test_student_profile_recruitment_visit_id.py -q && .venv/bin/python -m pytest tests/ -k "student_profile or students" -q`
Expected: 綠

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be add api/students.py tests/test_student_profile_recruitment_visit_id.py
git -C ~/Desktop/ivy-backend/.worktrees/recruit-journey-timeline-be commit -m "feat(students): profile 回傳補 recruitment_visit_id（入學前歷程入口用）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4（FE）：getVisitTimeline api + JourneyTimeline 元件

**Files:**
- Modify: `src/api/recruitment.ts`（加 getVisitTimeline）
- Create: `src/components/recruitment/JourneyTimeline.vue`
- Test: `tests/components/JourneyTimeline.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/JourneyTimeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'

vi.mock('@/api/recruitment', () => ({
  getVisitTimeline: vi.fn().mockResolvedValue({
    data: { events: [
      { source: 'recruitment', event_type: 'created', from_stage: null, to_stage: 'visited', reason: null, created_at: '2026-03-01T09:00:00' },
      { source: 'student', event_type: '入學', from_stage: null, to_stage: null, reason: '報到', created_at: '2026-04-01T09:00:00' },
    ] },
  }),
}))

function mountJourney(visitId: number | null) {
  return mount(JourneyTimeline, {
    props: { visitId },
    global: { plugins: [ElementPlus] },
  })
}

describe('JourneyTimeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders events with humanized labels', async () => {
    const wrapper = mountJourney(42)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('建立訪視') // EVENT_LABELS['created']
    expect(text).toContain('入學')
  })

  it('empty state when no visitId', async () => {
    const { getVisitTimeline } = await import('@/api/recruitment')
    const wrapper = mountJourney(null)
    await flushPromises()
    expect(getVisitTimeline).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('無招生來源紀錄')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend/.worktrees/recruit-journey-stats-p23-fe && npx vitest run tests/components/JourneyTimeline.test.ts`
Expected: FAIL

- [ ] **Step 3: 加 api wrapper**

在 `src/api/recruitment.ts` 加（檔尾，import 區若無 `Schema`/`AxiosResponse` 則補 `import type { Schema } from './_generated/typed'` + axios 型別）：
```typescript
import api from './index'
import type { Schema } from './_generated/typed'
import type { AxiosResponse } from 'axios'

// GET /recruitment/visits/{visit_id}/timeline — 小孩歷程（回應型別用既有 TimelineOut component）
export const getVisitTimeline = (
  visitId: number,
): Promise<AxiosResponse<Schema<'TimelineOut'>>> =>
  api.get(`/recruitment/visits/${visitId}/timeline`)
```
（注意：recruitment.ts 既有 `import api from './index'` 勿重複；只加缺的 type import 與函式。**不需 codegen**：新端點未進 schema.d.ts，但 `Schema<'TimelineOut'>` component 已存在；路徑字串硬寫，axios baseURL `/api` 補回 → 正確路由。）

- [ ] **Step 4: 建 JourneyTimeline 元件**

```vue
<!-- src/components/recruitment/JourneyTimeline.vue -->
<template>
  <div class="journey-timeline" v-loading="loading">
    <div v-if="visitId == null" class="empty-area">無招生來源紀錄</div>
    <div v-else-if="!loading && events.length === 0" class="empty-area">尚無歷程事件</div>
    <ul v-else class="timeline-list">
      <li v-for="(ev, idx) in events" :key="idx" class="timeline-item">
        <div class="timeline-time">{{ formatTime(ev.created_at) }}</div>
        <div class="timeline-event">
          <el-tag :type="ev.source === 'recruitment' ? 'warning' : 'success'" size="small">
            {{ ev.source === 'recruitment' ? '招生' : '學生' }}
          </el-tag>
          <span class="event-type">{{ humanize(ev.event_type) }}</span>
        </div>
        <div v-if="ev.from_stage || ev.to_stage" class="timeline-stage">
          {{ ev.from_stage ?? '—' }} → {{ ev.to_stage ?? '—' }}
        </div>
        <div v-if="ev.reason" class="timeline-reason">{{ ev.reason }}</div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTag } from 'element-plus'
import { getVisitTimeline } from '@/api/recruitment'
import type { Schema } from '@/api/_generated/typed'

type TimelineEvent = Schema<'TimelineEvent'>

const props = defineProps<{ visitId: number | null }>()
const events = ref<TimelineEvent[]>([])
const loading = ref(false)

const EVENT_LABELS: Record<string, string> = {
  created: '建立訪視',
  deposit_added: '加上預繳',
  deposit_removed: '取消預繳',
  converted: '報到（轉學生）',
  revert_converted: '退回報到（刪學生）',
  activated: '開學',
  revert_activated: '退回開學',
}
const humanize = (t: string): string => EVENT_LABELS[t] ?? t
const formatTime = (iso: string): string => new Date(iso).toLocaleString('zh-TW', { hour12: false })

async function load(): Promise<void> {
  if (props.visitId == null) {
    events.value = []
    return
  }
  loading.value = true
  try {
    const resp = await getVisitTimeline(props.visitId)
    events.value = (resp.data as { events?: TimelineEvent[] }).events ?? []
  } finally {
    loading.value = false
  }
}

watch(() => props.visitId, () => void load(), { immediate: true })
</script>

<style scoped>
.empty-area { text-align: center; color: #999; padding: 32px 0; }
.timeline-list { list-style: none; padding: 0; margin: 0; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.timeline-time { font-size: 12px; color: #999; }
.timeline-event { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.event-type { font-weight: 600; }
.timeline-stage { margin-top: 4px; font-size: 13px; color: #666; }
.timeline-reason { margin-top: 4px; font-size: 13px; color: #555; font-style: italic; }
</style>
```

- [ ] **Step 5: 跑測試 + typecheck**

Run: `npx vitest run tests/components/JourneyTimeline.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/recruitment.ts src/components/recruitment/JourneyTimeline.vue tests/components/JourneyTimeline.test.ts
git commit -m "feat(recruitment): JourneyTimeline 元件 + getVisitTimeline api

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5（FE）：訪視名單「歷程」按鈕 + RecruitmentView 抽屜

**Files:**
- Modify: `src/components/recruitment/RecruitmentDetailTab.vue`（操作欄加按鈕 + emit）
- Modify: `src/views/RecruitmentView.vue`（接 journey + 歷程抽屜）
- Test: `tests/components/RecruitmentDetailTab.journey.test.ts`、`tests/views/RecruitmentView.journey.test.ts`（結構性）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/RecruitmentDetailTab.journey.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/recruitment/RecruitmentDetailTab.vue'), 'utf-8')
describe('RecruitmentDetailTab 歷程', () => {
  it("has journey button + emit", () => {
    expect(src).toContain("$emit('journey', row)")
    expect(src).toMatch(/'journey':\s*\[row: Record<string, unknown>\]/)
  })
})
```
```typescript
// tests/views/RecruitmentView.journey.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')
describe('RecruitmentView 歷程抽屜', () => {
  it('wires @journey + JourneyTimeline drawer', () => {
    expect(src).toMatch(/@journey="openJourney"/)
    expect(src).toContain('JourneyTimeline')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/RecruitmentDetailTab.journey.test.ts tests/views/RecruitmentView.journey.test.ts`
Expected: FAIL

- [ ] **Step 3a: RecruitmentDetailTab 加按鈕 + emit**

操作欄（`label="操作"`）內，「保留座位」按鈕之後加：
```vue
          <el-button size="small" @click="$emit('journey', row)">歷程</el-button>
```
`defineEmits` 加：`'journey': [row: Record<string, unknown>]`（接在 `'reserve'` 後）。

- [ ] **Step 3b: RecruitmentView 接線**

1. import：`import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'`
2. `<RecruitmentDetailTab ...>` 加 `@journey="openJourney"`
3. 模板加（鄰近 ReserveSeatDialog）：
```vue
    <el-drawer v-model="journeyDrawerVisible" title="參觀→入學 歷程" direction="rtl" size="460px">
      <JourneyTimeline :visit-id="journeyVisitId" />
    </el-drawer>
```
4. `<script setup>` 加（`ElDrawer` 為全域元件，無需 import）：
```typescript
const journeyDrawerVisible = ref(false)
const journeyVisitId = ref<number | null>(null)
function openJourney(row: Record<string, unknown>) {
  journeyVisitId.value = (row.id as number) ?? null
  journeyDrawerVisible.value = true
}
```

- [ ] **Step 4: 跑測試 + typecheck**

Run: `npx vitest run tests/components/RecruitmentDetailTab.journey.test.ts tests/views/RecruitmentView.journey.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recruitment/RecruitmentDetailTab.vue src/views/RecruitmentView.vue tests/components/RecruitmentDetailTab.journey.test.ts tests/views/RecruitmentView.journey.test.ts
git commit -m "feat(recruitment): 訪視名單歷程按鈕 + RecruitmentView 歷程抽屜

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6（FE）：學生檔案「入學前歷程」區塊

**Files:**
- Modify: `src/components/student/StudentDetailPanel.vue`
- Test: `tests/components/StudentDetailPanel.journey.test.ts`（結構性 + 條件邏輯）

- [ ] **Step 1: 先確認 profile 載入後的物件名**

`grep -nE "fetchProfile|\\.value =|profile\\.|student\\.value|data" src/components/student/StudentDetailPanel.vue | head` 找到 profile 資料存放的 ref（例 `profile`/`student`）。下方以 `profileData` 代稱，實作時替換為實際名。

- [ ] **Step 2: 寫失敗測試（結構性，避免重元件 mount）**

```typescript
// tests/components/StudentDetailPanel.journey.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/student/StudentDetailPanel.vue'), 'utf-8')
describe('StudentDetailPanel 入學前歷程', () => {
  it('renders JourneyTimeline gated by recruitment_visit_id', () => {
    expect(src).toContain('JourneyTimeline')
    expect(src).toContain('入學前歷程')
    expect(src).toMatch(/recruitment_visit_id/)
  })
})
```

- [ ] **Step 3: 加區塊**

1. import：`import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'`
2. computed（解析 visitId，`profileData` 換實際 ref 名）：
```typescript
const recruitmentVisitId = computed<number | null>(
  () => (profileData.value?.recruitment_visit_id as number | null) ?? null,
)
```
3. 模板適當位置（學生詳情區內）加摺疊區塊：
```vue
      <el-collapse class="journey-section">
        <el-collapse-item title="入學前歷程（招生來源）">
          <JourneyTimeline :visit-id="recruitmentVisitId" />
        </el-collapse-item>
      </el-collapse>
```
（`recruitment_visit_id` 為 null 時 JourneyTimeline 自身顯示「無招生來源紀錄」，無需額外條件。`el-collapse`/`el-collapse-item` 全域元件。）

- [ ] **Step 4: 跑測試 + typecheck + 既有 StudentDetailPanel 測試無回歸**

Run: `npx vitest run tests/components/StudentDetailPanel.journey.test.ts && npm run typecheck && npx vitest run -t "StudentDetailPanel"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/student/StudentDetailPanel.vue tests/components/StudentDetailPanel.journey.test.ts
git commit -m "feat(student): 學生檔案加入學前歷程區塊（招生來源時間軸）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# Phase 3 — 招生統計大彙整

## Task 7（FE）：combineChannels 純函式

**Files:**
- Create: `src/utils/recruitmentChannels.ts`
- Test: `tests/unit/recruitmentChannels.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/unit/recruitmentChannels.test.ts
import { describe, it, expect } from 'vitest'
import { combineChannels } from '@/utils/recruitmentChannels'

describe('combineChannels', () => {
  it('combines internal funnel_snapshot + ivykids totals', () => {
    const r = combineChannels(
      { visit: 10, deposit: 6, enrolled: 3 },
      { total_visit: 4, total_deposit: 2, total_enrolled: 1 },
    )
    expect(r.internal).toEqual({ visit: 10, deposit: 6, enrolled: 3 })
    expect(r.ivykids).toEqual({ visit: 4, deposit: 2, enrolled: 1 })
    expect(r.total).toEqual({ visit: 14, deposit: 8, enrolled: 4 })
  })
  it('defaults missing fields to 0', () => {
    const r = combineChannels(undefined, undefined)
    expect(r.total).toEqual({ visit: 0, deposit: 0, enrolled: 0 })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/recruitmentChannels.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

```typescript
// src/utils/recruitmentChannels.ts
/** 全管道彙整：內部訪視（funnel_snapshot）+ 官網報名（ivykids totals）並列 + 合計。 */
export interface ChannelCounts { visit: number; deposit: number; enrolled: number }
export interface CombinedChannels { internal: ChannelCounts; ivykids: ChannelCounts; total: ChannelCounts }

interface InternalSnapshot { visit?: number; deposit?: number; enrolled?: number }
interface IvykidsStats { total_visit?: number; total_deposit?: number; total_enrolled?: number }

const n = (x: unknown): number => (typeof x === 'number' ? x : 0)

export function combineChannels(
  internal: InternalSnapshot | undefined,
  ivykids: IvykidsStats | undefined,
): CombinedChannels {
  const i: ChannelCounts = { visit: n(internal?.visit), deposit: n(internal?.deposit), enrolled: n(internal?.enrolled) }
  const k: ChannelCounts = { visit: n(ivykids?.total_visit), deposit: n(ivykids?.total_deposit), enrolled: n(ivykids?.total_enrolled) }
  return {
    internal: i,
    ivykids: k,
    total: { visit: i.visit + k.visit, deposit: i.deposit + k.deposit, enrolled: i.enrolled + k.enrolled },
  }
}
```

- [ ] **Step 4: 跑測試 + typecheck**

Run: `npx vitest run tests/unit/recruitmentChannels.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/recruitmentChannels.ts tests/unit/recruitmentChannels.test.ts
git commit -m "feat(recruitment): combineChannels 全管道彙整純函式

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8（FE）：全管道彙整卡

**Files:**
- Create: `src/components/recruitment/AllChannelSummaryCard.vue`
- Modify: `src/views/RecruitmentView.vue`（總覽 tab 加卡，傳 funnel_snapshot）
- Test: `tests/components/AllChannelSummaryCard.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/AllChannelSummaryCard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AllChannelSummaryCard from '@/components/recruitment/AllChannelSummaryCard.vue'

vi.mock('@/api/recruitmentIvykids', () => ({
  getRecruitmentIvykidsStats: vi.fn().mockResolvedValue({
    data: { total_visit: 4, total_deposit: 2, total_enrolled: 1 },
  }),
}))

describe('AllChannelSummaryCard', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows internal + ivykids + combined totals', async () => {
    const wrapper = mount(AllChannelSummaryCard, {
      props: { internalSnapshot: { visit: 10, deposit: 6, enrolled: 3 } },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('全管道彙整')
    expect(text).toContain('14') // 合計 visit 10+4
    expect(text).toContain('官網報名')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/AllChannelSummaryCard.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/recruitment/AllChannelSummaryCard.vue -->
<template>
  <el-card class="all-channel-card" shadow="never">
    <template #header><span>全管道彙整</span></template>
    <!-- 用純 HTML table（el-table 在 jsdom 不渲染 row，且此處不需互動）-->
    <table class="channel-table">
      <thead>
        <tr><th>管道</th><th>參觀/報名</th><th>預繳</th><th>報到</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.channel" :class="{ 'total-row': r.channel === '合計' }">
          <td>{{ r.channel }}</td>
          <td class="num">{{ r.visit }}</td>
          <td class="num">{{ r.deposit }}</td>
          <td class="num">{{ r.enrolled }}</td>
        </tr>
      </tbody>
    </table>
    <p class="scope-note">註：內部為當月快照、官網為回報區間，scope 略有差異，合計為參考值。</p>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElCard } from 'element-plus'
import { getRecruitmentIvykidsStats } from '@/api/recruitmentIvykids'
import { combineChannels, type ChannelCounts } from '@/utils/recruitmentChannels'

const props = defineProps<{ internalSnapshot: { visit?: number; deposit?: number; enrolled?: number } | null }>()
const ivykids = ref<{ total_visit?: number; total_deposit?: number; total_enrolled?: number }>({})

onMounted(async () => {
  const resp = await getRecruitmentIvykidsStats()
  ivykids.value = (resp.data as typeof ivykids.value) ?? {}
})

const combined = computed(() => combineChannels(props.internalSnapshot ?? undefined, ivykids.value))
const mk = (channel: string, c: ChannelCounts) => ({ channel, ...c })
const rows = computed(() => [
  mk('內部訪視', combined.value.internal),
  mk('官網報名', combined.value.ivykids),
  mk('合計', combined.value.total),
])
</script>

<style scoped>
.all-channel-card { margin-bottom: 16px; }
.channel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.channel-table th, .channel-table td { border: 1px solid var(--el-border-color-lighter, #ebeef5); padding: 6px 10px; }
.channel-table th { background: var(--el-fill-color-light, #f5f7fa); font-weight: 600; }
.channel-table .num { text-align: center; }
.channel-table .total-row { font-weight: 700; background: var(--el-fill-color-lighter, #fafafa); }
.scope-note { margin: 8px 0 0; font-size: 12px; color: #909399; }
</style>
```
（確認 `getRecruitmentIvykidsStats` 在 `src/api/recruitmentIvykids.ts` 之 export 名；不符則對齊。）

- [ ] **Step 4: 掛進 RecruitmentView 總覽 tab**

`src/views/RecruitmentView.vue`：
1. import：`import AllChannelSummaryCard from '@/components/recruitment/AllChannelSummaryCard.vue'`
2. 總覽 tab（`name="overview"`）內、`<RecruitmentOverviewTab>` 之前或之後加：
```vue
        <AllChannelSummaryCard :internal-snapshot="statsFunnelSnapshot" />
```
（`statsFunnelSnapshot` 為既有 computed，含 visit/deposit/enrolled。）

- [ ] **Step 5: 跑測試 + typecheck**

Run: `npx vitest run tests/components/AllChannelSummaryCard.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/recruitment/AllChannelSummaryCard.vue src/views/RecruitmentView.vue tests/components/AllChannelSummaryCard.test.ts
git commit -m "feat(recruitment): 總覽加全管道彙整卡（內部+官網合計）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9（FE）：官網報名併入招生統計 tab

**Files:**
- Modify: `src/views/RecruitmentView.vue`（加 ivykids tab，複用既有 Bar）
- Test: `tests/views/RecruitmentView.ivykidsTab.test.ts`（結構性）

- [ ] **Step 1: 先確認既有 Bar 變數名**

`grep -nE "castBarComponent|const Bar|:bar-component" src/views/RecruitmentView.vue | head` 找到 RecruitmentView 既有傳給子 tab 的 bar component（例 `castBarComponent`）。下方以 `castBarComponent` 代稱。

- [ ] **Step 2: 寫失敗測試**

```typescript
// tests/views/RecruitmentView.ivykidsTab.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')
describe('RecruitmentView 官網報名 tab', () => {
  it('has ivykids tab using RecruitmentIvykidsTab', () => {
    expect(src).toMatch(/name="ivykids"/)
    expect(src).toContain('RecruitmentIvykidsTab')
  })
})
```

- [ ] **Step 3: 加 tab + import**

1. import：`import RecruitmentIvykidsTab from '@/components/recruitment/RecruitmentIvykidsTab.vue'`
2. tabs 內（建議放「名額規劃」tab 之後）：
```vue
      <el-tab-pane label="官網報名" name="ivykids" lazy>
        <RecruitmentIvykidsTab :bar-component="castBarComponent" :show-charts="true" :can-write="canWrite" />
      </el-tab-pane>
```
（`castBarComponent` 換實際變數名；`canWrite` 若 RecruitmentView 無此 computed 則加 `const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))`，`hasPermission` 多半已 import。）

- [ ] **Step 4: 跑測試 + typecheck**

Run: `npx vitest run tests/views/RecruitmentView.ivykidsTab.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/RecruitmentView.vue tests/views/RecruitmentView.ivykidsTab.test.ts
git commit -m "feat(recruitment): 官網報名併入招生統計成 tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10（FE）：移除側邊欄獨立項 + route 改 redirect

**Files:**
- Modify: `src/components/layout/AdminSidebar.vue`（移除 ivykids menu item，行 115 附近）
- Modify: `src/router/index.ts`（`/recruitment-ivykids` 改 redirect）
- Test: `tests/unit/router.ivykidsRedirect.test.ts`（結構性）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/unit/router.ivykidsRedirect.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const router = fs.readFileSync(path.resolve(__dirname, '../../src/router/index.ts'), 'utf-8')
const sidebar = fs.readFileSync(path.resolve(__dirname, '../../src/components/layout/AdminSidebar.vue'), 'utf-8')
describe('官網報名選單收進招生統計', () => {
  it('sidebar 無獨立 recruitment-ivykids menu item', () => {
    expect(sidebar).not.toContain('index="/recruitment-ivykids"')
  })
  it('router /recruitment-ivykids 改 redirect 到 /recruitment', () => {
    expect(router).toMatch(/recruitment-ivykids[\s\S]{0,120}redirect:\s*['"]\/recruitment['"]/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/router.ivykidsRedirect.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 sidebar + router**

`AdminSidebar.vue`：刪除 `<el-menu-item v-if="canView.RECRUITMENT_READ" index="/recruitment-ivykids">...</el-menu-item>`（行 115 整個 item，含其 icon/title）。

`router/index.ts`：把 `/recruitment-ivykids` 的 route（行 109-111）由 `component: () => import('../views/RecruitmentIvykidsView.vue')` 改為：
```typescript
          { path: '/recruitment-ivykids', redirect: '/recruitment' },
```
（移除 name/component/meta，僅留 path + redirect；若該 route 有 children/meta 權限，redirect route 不需 meta。）

- [ ] **Step 4: 跑測試 + typecheck**

Run: `npx vitest run tests/unit/router.ivykidsRedirect.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AdminSidebar.vue src/router/index.ts tests/unit/router.ivykidsRedirect.test.ts
git commit -m "refactor(recruitment): 移除官網報名獨立選單項，route 改 redirect 到招生統計

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11：全套件驗證 + 整合 + 收尾

- [ ] **Step 1: 後端套件**

Run: `cd ~/Desktop/ivy-backend && .venv/bin/python -m pytest tests/test_recruitment_timeline_schema.py tests/test_recruitment_timeline_service.py tests/test_student_profile_recruitment_visit_id.py tests/test_recruitment_api.py -q`
Expected: 全綠。

- [ ] **Step 2: 前端套件 + typecheck**

Run: `cd ~/Desktop/ivy-frontend/.worktrees/recruit-journey-stats-p23-fe && npm run typecheck && npm run test`
Expected: typecheck 0；測試相對 main 無新增 fail（既有 bonus-preview/dev drift 與 flaky 不算；用單獨跑 + `git diff --name-only main HEAD` 證不在改檔內）。

- [ ] **Step 3: 手動整合（dev DB upgrade 後 + start.sh）**

1. 招生訪視名單某記錄 →「歷程」→ 抽屜顯示時間軸（招生事件 + 學生異動）。
2. 學生檔案（有招生來源的學生）→「入學前歷程」→ 同時間軸；無來源學生 → 「無招生來源紀錄」。
3. 招生統計內出現「官網報名」tab；側邊欄無獨立項；舊連結 `/recruitment-ivykids` redirect 到招生統計。
4. 總覽「全管道彙整」卡 = 內部 + 官網。

- [ ] **Step 4: finishing-a-development-branch**

BE 先、FE 後，各自 `--no-ff` merge 回各自 local main（在 `.worktrees/merge-main-2026-06-03` 用 `git -C`，**勿移除該 merge-main worktree**），feature worktree 當天 `git worktree remove`。**未授權不 push**。

---

## Self-Review 對照（spec coverage）

- Phase 2 後端 timeline service+端點 → Task 1+2 ✓；funnel re-export/呼叫 service → Task 1+2 ✓
- Phase 2 recruitment_visit_id 曝露 → Task 3 ✓
- Phase 2 前端 JourneyTimeline + api → Task 4 ✓；訪視名單入口 → Task 5 ✓；學生檔案入口 → Task 6 ✓
- Phase 3 combineChannels → Task 7 ✓；全管道卡 → Task 8 ✓；官網報名 tab → Task 9 ✓；移除選單+redirect → Task 10 ✓
- 不需 codegen（Schema<'TimelineOut'> 已存在 / profile 無 response_model / 複用既有 Bar）→ 各 Task 已註明
- 跨 repo 順序 + dev DB + 手測 → Task 11 ✓
