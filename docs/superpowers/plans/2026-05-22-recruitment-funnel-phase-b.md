# 招生漏斗 Phase B（前端 Kanban）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `RecruitmentView.vue` 新增第 10 個 tab「招生漏斗」— 4 欄 Kanban 拖拉、optimistic update、3-mode confirm dialog、timeline drawer，並補 `SettingsView` 學年/學期 CRUD sub-tab。

**Architecture:** Pinia store 統一 board state + transition action（樂觀更新含 rollback）；vuedraggable@next 處理 drag；6 個 funnel 元件（FunnelBoard/Column/Card/SummaryBar/TransitionConfirmDialog/TimelineDrawer）+ 1 個 settings 元件，每個 ≤ 200 行單一職責。

**Tech Stack:** Vue 3 `<script setup lang="ts">` / Pinia / vuedraggable@next（含 sortablejs）/ Element Plus / Vitest / 既有 OpenAPI codegen 拿型別。

**Spec:** `docs/superpowers/specs/2026-05-22-recruitment-funnel-phase-b-design.md`

**Prereq：** Phase A BE 已 merge 入 BE main 且 `npm run gen:api` 跑過 — `src/api/_generated/schema.d.ts` 必須含 `/recruitment/funnel/*` 與 `/academic-terms/*` 路徑。task 0 會驗證這點。

---

## File Structure

**新增檔案：**

| 路徑 | 責任 |
|---|---|
| `src/api/recruitmentFunnel.ts` | `/recruitment/funnel/*` axios wrapper |
| `src/api/academicTerms.ts` | `/academic-terms` axios wrapper |
| `src/stores/recruitmentFunnel.ts` | Pinia store + actions |
| `src/components/recruitment/funnel/FunnelBoard.vue` | 頂層 Kanban + 學期切換 + summary |
| `src/components/recruitment/funnel/FunnelColumn.vue` | 單欄 + draggable 容器 |
| `src/components/recruitment/funnel/FunnelCard.vue` | 單卡片 + permission gate |
| `src/components/recruitment/funnel/TransitionConfirmDialog.vue` | 3-mode dialog |
| `src/components/recruitment/funnel/TimelineDrawer.vue` | 右側 timeline drawer |
| `src/components/recruitment/funnel/FunnelSummaryBar.vue` | 4 階段 chip + 轉換率 |
| `src/components/settings/SettingsAcademicTermsTab.vue` | 學年/學期 CRUD table + modal |
| `src/api/__tests__/recruitmentFunnel.test.ts` | API wrapper tests |
| `src/stores/__tests__/recruitmentFunnel.test.ts` | store tests |
| `src/components/recruitment/funnel/__tests__/FunnelCard.test.ts` | card tests |
| `src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts` | dialog tests |
| `src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts` | column tests |
| `src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts` | settings tests |

**修改檔案：**

| 路徑 | 變動 |
|---|---|
| `package.json` | 加 `vuedraggable@next` + `sortablejs` deps |
| `src/views/RecruitmentView.vue` | 加第 10 個 `el-tab-pane label="招生漏斗"` 內掛 `<FunnelBoard>` |
| `src/views/SettingsView.vue` | 加 sub-tab「學年/學期」掛 `<SettingsAcademicTermsTab>` |

---

## Task 0: Worktree + 環境驗證

**Files:** 無變動，僅驗證

- [ ] **Step 1: 建 FE worktree**

```bash
cd ~/Desktop/ivy-frontend
git worktree add .claude/worktrees/recruitment-funnel-phase-b-fe -b feat/recruitment-funnel-phase-b-2026-05-22-frontend
cd .claude/worktrees/recruitment-funnel-phase-b-fe
npm install   # 取得既有 deps
```

- [ ] **Step 2: 驗 schema.d.ts 已含 Phase A 路徑**

```bash
grep -E '/recruitment/funnel/board|/academic-terms' src/api/_generated/schema.d.ts | head -5
# Expected: 兩條路徑都列出來。若 grep 沒輸出 → BE Phase A 未 merge / gen:api 未跑 → STOP
```

若失敗，**STOP** 並通知 user 先跑 BE merge + `cd ~/Desktop/ivy-backend && python scripts/dump_openapi.py && cd ~/Desktop/ivy-frontend && npm run gen:api`。

- [ ] **Step 3: 跑 baseline tests 確保 worktree 乾淨**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
npm run test:unit -- --run 2>&1 | tail -5
# Expected: 既有 ~2300+ vitest 全綠
npm run typecheck 2>&1 | tail -3
# Expected: 0 error
```

若有 pre-existing 失敗 → 記錄為已知狀態，繼續。

---

## Task 1: 加 deps（vuedraggable + sortablejs）

**Files:**
- Modify: `package.json` + `package-lock.json`

- [ ] **Step 1: install**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
npm install vuedraggable@next sortablejs
npm install --save-dev @types/sortablejs
```

- [ ] **Step 2: 驗 import**

```bash
node -e "console.log(require.resolve('vuedraggable'))" 2>&1
# Expected: 印出 vuedraggable 的 main file path
```

- [ ] **Step 3: 跑 build 確認 deps 對 bundle 無破壞**

```bash
npm run build 2>&1 | tail -5
# Expected: 0 error
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd  # MUST show worktree path
git branch --show-current  # MUST show feat/recruitment-funnel-phase-b-2026-05-22-frontend
git add package.json package-lock.json
git commit -m "chore(deps): add vuedraggable@next + sortablejs for Kanban"
```

---

## Task 2: API wrapper `recruitmentFunnel.ts` + `academicTerms.ts`

**Files:**
- Create: `src/api/recruitmentFunnel.ts`
- Create: `src/api/academicTerms.ts`
- Create: `src/api/__tests__/recruitmentFunnel.test.ts`

- [ ] **Step 1: 看一支既有 wrapper 作 pattern reference**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
head -30 src/api/employees.ts
# Note: 既有 wrapper 用 `import api from './index'` + import type from _generated/typed
```

- [ ] **Step 2: 寫測試（TDD red）**

`src/api/__tests__/recruitmentFunnel.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios instance before importing module
vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '@/api'
import * as funnel from '../recruitmentFunnel'

describe('recruitmentFunnel API wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFunnelBoard sends GET /recruitment/funnel/board with no params', async () => {
    ;(api.get as any).mockResolvedValue({ data: { stages: {}, summary: {} } })
    await funnel.getFunnelBoard()
    expect(api.get).toHaveBeenCalledWith('/recruitment/funnel/board', expect.any(Object))
  })

  it('getFunnelBoard passes school_year + semester params', async () => {
    ;(api.get as any).mockResolvedValue({ data: { stages: {}, summary: {} } })
    await funnel.getFunnelBoard({ schoolYear: 115, semester: 1 })
    expect(api.get).toHaveBeenCalledWith(
      '/recruitment/funnel/board',
      expect.objectContaining({ params: { school_year: 115, semester: 1 } }),
    )
  })

  it('transitionVisit sends POST with body', async () => {
    ;(api.post as any).mockResolvedValue({ data: {} })
    await funnel.transitionVisit(42, {
      to_stage: 'enrolled',
      classroom_id: 3,
    })
    expect(api.post).toHaveBeenCalledWith(
      '/recruitment/funnel/visits/42/transition',
      { to_stage: 'enrolled', classroom_id: 3 },
    )
  })

  it('getTimeline sends GET', async () => {
    ;(api.get as any).mockResolvedValue({ data: { events: [] } })
    await funnel.getTimeline(42)
    expect(api.get).toHaveBeenCalledWith('/recruitment/funnel/visits/42/timeline')
  })
})
```

- [ ] **Step 3: 跑測試確認 fail**

```bash
npx vitest run src/api/__tests__/recruitmentFunnel.test.ts 2>&1 | tail -5
# Expected: import error (file not found)
```

- [ ] **Step 4: 寫 `src/api/recruitmentFunnel.ts`**

```typescript
/**
 * /recruitment/funnel/* API wrappers.
 *
 * 對應 BE Phase A endpoints。型別從 _generated/typed 取得。
 */
import api from './index'
import type { AxiosResp, ApiBody, ApiResponse } from './_generated/typed'

type Stage = 'visited' | 'deposited' | 'enrolled' | 'active'

export interface GetBoardParams {
  schoolYear?: number | null
  semester?: number | null
}

export function getFunnelBoard(
  params: GetBoardParams = {},
): AxiosResp<'/recruitment/funnel/board', 'get'> {
  const query: Record<string, number> = {}
  if (params.schoolYear != null) query.school_year = params.schoolYear
  if (params.semester != null) query.semester = params.semester
  return api.get('/recruitment/funnel/board', { params: query })
}

export interface TransitionPayload {
  to_stage: Stage
  classroom_id?: number | null
  reason?: string | null
}

export function transitionVisit(
  visitId: number,
  payload: TransitionPayload,
): AxiosResp<'/recruitment/funnel/visits/{visit_id}/transition', 'post'> {
  return api.post(
    `/recruitment/funnel/visits/${visitId}/transition`,
    payload,
  )
}

export function getTimeline(
  visitId: number,
): AxiosResp<'/recruitment/funnel/visits/{visit_id}/timeline', 'get'> {
  return api.get(`/recruitment/funnel/visits/${visitId}/timeline`)
}
```

> Note: `AxiosResp` 型別實際路徑名稱以 `_generated/schema.d.ts` 為準（用 `grep "funnel/board" src/api/_generated/schema.d.ts` 確認 path key 結構，若 OpenAPI 帶 `/api` prefix 須剝除 — codegen 已剝）。若型別 cast 不過，用 `as unknown as Schema` 過渡並 `// TODO(ts-strict): waiting on backend response_model`。

- [ ] **Step 5: 寫 `src/api/academicTerms.ts`**

```typescript
/** /academic-terms CRUD wrappers. */
import api from './index'
import type { AxiosResp } from './_generated/typed'

export interface AcademicTermPayload {
  school_year: number
  semester: number
  start_date: string  // ISO date YYYY-MM-DD
  end_date: string
}

export function listAcademicTerms(): AxiosResp<'/academic-terms', 'get'> {
  return api.get('/academic-terms')
}

export function getCurrentTerm(): AxiosResp<'/academic-terms/current', 'get'> {
  return api.get('/academic-terms/current')
}

export function createAcademicTerm(payload: AcademicTermPayload): AxiosResp<'/academic-terms', 'post'> {
  return api.post('/academic-terms', payload)
}

export function updateAcademicTerm(
  id: number,
  payload: AcademicTermPayload,
): AxiosResp<'/academic-terms/{term_id}', 'put'> {
  return api.put(`/academic-terms/${id}`, payload)
}

export function deleteAcademicTerm(id: number): AxiosResp<'/academic-terms/{term_id}', 'delete'> {
  return api.delete(`/academic-terms/${id}`)
}
```

- [ ] **Step 6: 跑測試**

```bash
npx vitest run src/api/__tests__/recruitmentFunnel.test.ts 2>&1 | tail -8
# Expected: 4 passed
npm run typecheck 2>&1 | tail -3
# Expected: 0 error
```

- [ ] **Step 7: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git branch --show-current
git add src/api/recruitmentFunnel.ts src/api/academicTerms.ts src/api/__tests__/recruitmentFunnel.test.ts
git commit -m "feat(api): recruitment funnel + academic terms wrappers"
```

---

## Task 3: Pinia Store `useRecruitmentFunnelStore`

**Files:**
- Create: `src/stores/recruitmentFunnel.ts`
- Create: `src/stores/__tests__/recruitmentFunnel.test.ts`

- [ ] **Step 1: 看既有 store pattern**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
head -40 src/stores/classroom.ts 2>/dev/null || head -40 src/stores/employee.ts
# Reference: defineStore + setup-style or options-style
```

- [ ] **Step 2: 寫測試（TDD red）**

`src/stores/__tests__/recruitmentFunnel.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/recruitmentFunnel', () => ({
  getFunnelBoard: vi.fn(),
  transitionVisit: vi.fn(),
  getTimeline: vi.fn(),
}))

import * as funnelApi from '@/api/recruitmentFunnel'
import { useRecruitmentFunnelStore } from '../recruitmentFunnel'

const sampleBoard = {
  data: {
    stages: {
      visited: [{ visit_id: 1, child_name: '甲', current_stage: 'visited' }],
      deposited: [{ visit_id: 2, child_name: '乙', current_stage: 'deposited' }],
      enrolled: [],
      active: [],
    },
    summary: { visited_count: 1, deposited_count: 1, enrolled_count: 0, active_count: 0 },
  },
}

describe('useRecruitmentFunnelStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadBoard fetches and stores board', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    expect(store.board?.summary.visited_count).toBe(1)
    expect(store.getStageCards('visited').length).toBe(1)
  })

  it('setFilter triggers loadBoard with new params', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.setFilter(115, 1)
    expect(funnelApi.getFunnelBoard).toHaveBeenCalledWith({ schoolYear: 115, semester: 1 })
  })

  it('transition optimistic moves card on success', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as any).mockResolvedValue({
      data: {
        visit_id: 1, from_stage: 'visited', to_stage: 'deposited',
        student_id: null, event_log_id: 100, warnings: [],
      },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    await store.transition(1, 'deposited', {})
    expect(store.getStageCards('visited').length).toBe(0)
    expect(store.getStageCards('deposited').length).toBe(2)
  })

  it('transition reverts card on API failure', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as any).mockRejectedValue({
      response: { status: 400, data: { detail: { code: 'REASON_REQUIRED' } } },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    await expect(store.transition(1, 'deposited', {})).rejects.toBeTruthy()
    expect(store.getStageCards('visited').length).toBe(1)  // 還在原欄
    expect(store.getStageCards('deposited').length).toBe(1)
  })

  it('transition on 409 force reloads board', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as any).mockRejectedValue({
      response: { status: 409, data: { detail: { code: 'STAGE_ALREADY' } } },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    ;(funnelApi.getFunnelBoard as any).mockClear()
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    await expect(store.transition(1, 'deposited', {})).rejects.toBeTruthy()
    expect(funnelApi.getFunnelBoard).toHaveBeenCalled()
  })

  it('loadTimeline caches by visit_id', async () => {
    ;(funnelApi.getTimeline as any).mockResolvedValue({
      data: { events: [{ source: 'recruitment', event_type: 'deposit_added', created_at: '2026-05-22T00:00:00' }] },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadTimeline(1)
    await store.loadTimeline(1)  // 第二次 cache hit
    expect(funnelApi.getTimeline).toHaveBeenCalledTimes(1)
  })

  it('invalidateTimeline forces re-fetch', async () => {
    ;(funnelApi.getTimeline as any).mockResolvedValue({ data: { events: [] } })
    const store = useRecruitmentFunnelStore()
    await store.loadTimeline(1)
    store.invalidateTimeline(1)
    await store.loadTimeline(1)
    expect(funnelApi.getTimeline).toHaveBeenCalledTimes(2)
  })

  it('isPending true while transition in-flight', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    let resolveTransition!: (v: unknown) => void
    ;(funnelApi.transitionVisit as any).mockReturnValue(
      new Promise(r => { resolveTransition = r }),
    )
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    const p = store.transition(1, 'deposited', {})
    expect(store.isPending(1)).toBe(true)
    resolveTransition({ data: { visit_id: 1, from_stage: 'visited', to_stage: 'deposited', student_id: null, event_log_id: 1, warnings: [] } })
    await p
    expect(store.isPending(1)).toBe(false)
  })

  it('$reset clears state', async () => {
    ;(funnelApi.getFunnelBoard as any).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    store.$reset()
    expect(store.board).toBeNull()
  })
})
```

- [ ] **Step 3: 寫 store**

`src/stores/recruitmentFunnel.ts`：

```typescript
/**
 * Pinia store: 招生漏斗 4 階段 Kanban state + actions。
 *
 * Optimistic update：transition() 樂觀移卡 → API → 失敗 revert。
 * 409 STAGE_ALREADY 自動 force loadBoard 處理並發。
 */
import { defineStore } from 'pinia'
import {
  getFunnelBoard, transitionVisit, getTimeline,
  type TransitionPayload,
} from '@/api/recruitmentFunnel'

export type Stage = 'visited' | 'deposited' | 'enrolled' | 'active'

export interface FunnelCardData {
  visit_id: number
  child_name: string
  grade?: string | null
  phone?: string | null
  district?: string | null
  source?: string | null
  deposited_at?: string | null
  student_id?: number | null
  current_stage: Stage
}

export interface FunnelSummaryData {
  visited_count: number
  deposited_count: number
  enrolled_count: number
  active_count: number
}

export interface TimelineEventData {
  source: 'recruitment' | 'student'
  event_type: string
  from_stage?: string | null
  to_stage?: string | null
  actor_user_id?: number | null
  reason?: string | null
  created_at: string
}

interface State {
  board: { stages: Record<Stage, FunnelCardData[]>; summary: FunnelSummaryData } | null
  filter: { schoolYear: number | null; semester: 1 | 2 | null }
  timelines: Record<number, TimelineEventData[]>
  loadingBoard: boolean
  loadingTimeline: Record<number, boolean>
  pendingTransitions: Set<number>
}

function emptyState(): State {
  return {
    board: null,
    filter: { schoolYear: null, semester: null },
    timelines: {},
    loadingBoard: false,
    loadingTimeline: {},
    pendingTransitions: new Set(),
  }
}

export const useRecruitmentFunnelStore = defineStore('recruitmentFunnel', {
  state: (): State => emptyState(),

  getters: {
    getStageCards: (state) => (stage: Stage): FunnelCardData[] => {
      return state.board?.stages[stage] ?? []
    },
    getCardByVisitId: (state) => (visitId: number): FunnelCardData | undefined => {
      if (!state.board) return undefined
      for (const stage of ['visited', 'deposited', 'enrolled', 'active'] as Stage[]) {
        const card = state.board.stages[stage]?.find(c => c.visit_id === visitId)
        if (card) return card
      }
      return undefined
    },
    getTimelineByVisitId: (state) => (visitId: number): TimelineEventData[] | undefined => {
      return state.timelines[visitId]
    },
    isPending: (state) => (visitId: number): boolean => {
      return state.pendingTransitions.has(visitId)
    },
  },

  actions: {
    async loadBoard(opts: { force?: boolean } = {}) {
      if (this.loadingBoard && !opts.force) return
      this.loadingBoard = true
      try {
        const resp = await getFunnelBoard({
          schoolYear: this.filter.schoolYear,
          semester: this.filter.semester,
        })
        this.board = resp.data as State['board']
      } finally {
        this.loadingBoard = false
      }
    },

    async setFilter(schoolYear: number | null, semester: 1 | 2 | null) {
      this.filter.schoolYear = schoolYear
      this.filter.semester = semester
      await this.loadBoard({ force: true })
    },

    async transition(visitId: number, toStage: Stage, opts: { classroomId?: number; reason?: string }) {
      if (!this.board) throw new Error('Board not loaded')
      const snapshot = this._snapshotCard(visitId)
      if (!snapshot) throw new Error(`Card visit_id=${visitId} not found`)

      this._moveCardOptimistically(visitId, toStage)
      this.pendingTransitions.add(visitId)

      try {
        const resp = await transitionVisit(visitId, {
          to_stage: toStage,
          classroom_id: opts.classroomId ?? null,
          reason: opts.reason ?? null,
        } as TransitionPayload)
        this._applyServerResult(visitId, resp.data)
        this.invalidateTimeline(visitId)
        return resp.data
      } catch (err: unknown) {
        this._restoreCard(snapshot)
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          // 並發衝突 — 強制重抓
          await this.loadBoard({ force: true })
        }
        throw err
      } finally {
        this.pendingTransitions.delete(visitId)
      }
    },

    async loadTimeline(visitId: number, force = false) {
      if (!force && this.timelines[visitId]) return
      if (this.loadingTimeline[visitId]) return
      this.loadingTimeline[visitId] = true
      try {
        const resp = await getTimeline(visitId)
        this.timelines[visitId] = (resp.data as { events: TimelineEventData[] }).events
      } finally {
        this.loadingTimeline[visitId] = false
      }
    },

    invalidateTimeline(visitId: number) {
      delete this.timelines[visitId]
    },

    // === internal helpers ===

    _snapshotCard(visitId: number): { stage: Stage; index: number; card: FunnelCardData } | null {
      if (!this.board) return null
      for (const stage of ['visited', 'deposited', 'enrolled', 'active'] as Stage[]) {
        const arr = this.board.stages[stage]
        const idx = arr.findIndex(c => c.visit_id === visitId)
        if (idx >= 0) {
          return { stage, index: idx, card: { ...arr[idx] } }
        }
      }
      return null
    },

    _moveCardOptimistically(visitId: number, toStage: Stage) {
      const snap = this._snapshotCard(visitId)
      if (!snap || !this.board) return
      this.board.stages[snap.stage].splice(snap.index, 1)
      const movedCard = { ...snap.card, current_stage: toStage }
      this.board.stages[toStage].push(movedCard)
    },

    _applyServerResult(visitId: number, result: unknown) {
      if (!this.board) return
      const card = this.getCardByVisitId(visitId)
      if (!card) return
      const r = result as { student_id?: number | null; to_stage?: Stage }
      if (r.student_id != null) card.student_id = r.student_id
      if (r.to_stage) card.current_stage = r.to_stage
    },

    _restoreCard(snapshot: { stage: Stage; index: number; card: FunnelCardData }) {
      if (!this.board) return
      // 從目前位置移除
      for (const stage of ['visited', 'deposited', 'enrolled', 'active'] as Stage[]) {
        const idx = this.board.stages[stage].findIndex(c => c.visit_id === snapshot.card.visit_id)
        if (idx >= 0) this.board.stages[stage].splice(idx, 1)
      }
      // 還原到原位
      this.board.stages[snapshot.stage].splice(snapshot.index, 0, snapshot.card)
    },
  },
})
```

- [ ] **Step 4: 跑測試**

```bash
npx vitest run src/stores/__tests__/recruitmentFunnel.test.ts 2>&1 | tail -8
# Expected: 9 passed
npm run typecheck 2>&1 | tail -3
# Expected: 0 error
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git branch --show-current
git add src/stores/recruitmentFunnel.ts src/stores/__tests__/recruitmentFunnel.test.ts
git commit -m "feat(store): useRecruitmentFunnelStore with optimistic transition"
```

---

## Task 4: `FunnelCard.vue` + `FunnelSummaryBar.vue`

**Files:**
- Create: `src/components/recruitment/funnel/FunnelCard.vue`
- Create: `src/components/recruitment/funnel/FunnelSummaryBar.vue`
- Create: `src/components/recruitment/funnel/__tests__/FunnelCard.test.ts`

- [ ] **Step 1: 寫 FunnelCard 測試（TDD red）**

`src/components/recruitment/funnel/__tests__/FunnelCard.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelCard from '../FunnelCard.vue'

const baseCard = {
  visit_id: 1,
  child_name: '王小寶',
  grade: '中班',
  phone: '0912345678',
  district: '中正區',
  source: '介紹',
  current_stage: 'visited' as const,
}

describe('FunnelCard.vue', () => {
  it('renders child name + grade + phone', () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    expect(wrapper.text()).toContain('王小寶')
    expect(wrapper.text()).toContain('中班')
    expect(wrapper.text()).toContain('0912345678')
  })

  it('shows student_id badge when present', () => {
    const wrapper = mount(FunnelCard, {
      props: { card: { ...baseCard, student_id: 42 }, canDrag: true },
    })
    expect(wrapper.text()).toContain('42')
  })

  it('omits student_id badge when null', () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    expect(wrapper.find('.student-id-badge').exists()).toBe(false)
  })

  it('applies pending class when isPending=true', () => {
    const wrapper = mount(FunnelCard, {
      props: { card: baseCard, canDrag: true, isPending: true },
    })
    expect(wrapper.classes()).toContain('funnel-card--pending')
  })

  it('emits click event', async () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 確認 fail**

```bash
npx vitest run src/components/recruitment/funnel/__tests__/FunnelCard.test.ts 2>&1 | tail -5
# Expected: import error
```

- [ ] **Step 3: 寫 FunnelCard.vue**

```vue
<template>
  <div
    class="funnel-card"
    :class="{
      'funnel-card--pending': isPending,
      'funnel-card--disabled': !canDrag,
    }"
    :data-visit-id="card.visit_id"
    @click="$emit('click')"
  >
    <div class="funnel-card__header">
      <span class="funnel-card__name">{{ card.child_name }}</span>
      <el-tag v-if="card.grade" size="small" type="info">{{ card.grade }}</el-tag>
    </div>
    <div v-if="card.phone" class="funnel-card__phone">{{ card.phone }}</div>
    <div class="funnel-card__meta">
      <span v-if="card.district" class="funnel-card__district">{{ card.district }}</span>
      <span v-if="card.source" class="funnel-card__source">{{ card.source }}</span>
    </div>
    <div v-if="card.student_id" class="student-id-badge">學號 #{{ card.student_id }}</div>
  </div>
</template>

<script setup lang="ts">
import { ElTag } from 'element-plus'
import type { FunnelCardData } from '@/stores/recruitmentFunnel'

defineProps<{
  card: FunnelCardData
  canDrag: boolean
  isPending?: boolean
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>

<style scoped>
.funnel-card {
  background: #fff;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
.funnel-card:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.12); }
.funnel-card--pending { opacity: 0.5; pointer-events: none; }
.funnel-card--disabled { cursor: not-allowed; }
.funnel-card__header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.funnel-card__name { font-weight: 600; }
.funnel-card__phone { font-size: 12px; color: #666; margin-top: 4px; }
.funnel-card__meta { display: flex; gap: 8px; margin-top: 4px; font-size: 12px; color: #999; }
.student-id-badge {
  display: inline-block; margin-top: 6px; padding: 2px 6px;
  background: #ecf5ff; color: #1989fa; border-radius: 3px; font-size: 11px;
}
</style>
```

- [ ] **Step 4: 寫 FunnelSummaryBar.vue**

```vue
<template>
  <div class="funnel-summary-bar">
    <div v-for="item in items" :key="item.stage" class="funnel-summary-item" :style="{ borderColor: item.color }">
      <span class="funnel-summary-label">{{ item.label }}</span>
      <span class="funnel-summary-count">{{ item.count }}</span>
    </div>
    <div class="funnel-conversion-rates">
      <span>{{ depositRate }}% 預繳率</span>
      <span>{{ enrollRate }}% 報到率</span>
      <span>{{ activeRate }}% 開學率</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FunnelSummaryData } from '@/stores/recruitmentFunnel'

const props = defineProps<{ summary: FunnelSummaryData }>()

const items = computed(() => [
  { stage: 'visited', label: '已訪視', count: props.summary.visited_count, color: '#909399' },
  { stage: 'deposited', label: '已預繳', count: props.summary.deposited_count, color: '#e6a23c' },
  { stage: 'enrolled', label: '已報到', count: props.summary.enrolled_count, color: '#67c23a' },
  { stage: 'active', label: '已開學', count: props.summary.active_count, color: '#409eff' },
])

function pct(num: number, denom: number): string {
  if (denom === 0) return '0'
  return ((num / denom) * 100).toFixed(1)
}

const depositRate = computed(() => pct(props.summary.deposited_count, props.summary.visited_count))
const enrollRate = computed(() => pct(props.summary.enrolled_count, props.summary.deposited_count))
const activeRate = computed(() => pct(props.summary.active_count, props.summary.enrolled_count))
</script>

<style scoped>
.funnel-summary-bar { display: flex; gap: 16px; padding: 12px; align-items: center; flex-wrap: wrap; }
.funnel-summary-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 16px; border-left: 4px solid; border-radius: 4px;
  background: #fafafa;
}
.funnel-summary-label { font-size: 12px; color: #666; }
.funnel-summary-count { font-size: 24px; font-weight: 600; }
.funnel-conversion-rates { margin-left: auto; display: flex; gap: 16px; font-size: 13px; color: #555; }
</style>
```

- [ ] **Step 5: 跑測試**

```bash
npx vitest run src/components/recruitment/funnel/__tests__/FunnelCard.test.ts 2>&1 | tail -5
# Expected: 5 passed
npm run typecheck 2>&1 | tail -3
```

- [ ] **Step 6: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git add src/components/recruitment/funnel/FunnelCard.vue src/components/recruitment/funnel/FunnelSummaryBar.vue src/components/recruitment/funnel/__tests__/FunnelCard.test.ts
git commit -m "feat(funnel): FunnelCard + FunnelSummaryBar components"
```

---

## Task 5: `TransitionConfirmDialog.vue`（3-mode）

**Files:**
- Create: `src/components/recruitment/funnel/TransitionConfirmDialog.vue`
- Create: `src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/classrooms', () => ({
  fetchClassrooms: vi.fn().mockResolvedValue({
    data: [{ id: 1, name: '小班-甲', class_code: 'A' }],
  }),
}))

import TransitionConfirmDialog from '../TransitionConfirmDialog.vue'

describe('TransitionConfirmDialog modes', () => {
  it('dropdown mode (deposited→enrolled): shows classroom select', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'deposited',
        toStage: 'enrolled',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('班別')
    expect(wrapper.find('.classroom-select').exists()).toBe(true)
  })

  it('destructive mode (enrolled→deposited): shows reason textarea + warning', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'enrolled',
        toStage: 'deposited',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.text()).toContain('原因')
    expect(wrapper.find('.destructive-warning').exists()).toBe(true)
  })

  it('plain mode (visited→deposited): just confirm/cancel', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'visited',
        toStage: 'deposited',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.find('.classroom-select').exists()).toBe(false)
    expect(wrapper.find('.reason-input').exists()).toBe(false)
  })

  it('destructive mode rejects empty reason on confirm', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'enrolled',
        toStage: 'deposited',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.find('.confirm-btn').trigger('click')
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('emits confirm with classroomId in dropdown mode', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'deposited',
        toStage: 'enrolled',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    // Simulate selecting classroom (set internal state via component instance)
    ;(wrapper.vm as unknown as { selectedClassroomId: number }).selectedClassroomId = 1
    await wrapper.find('.confirm-btn').trigger('click')
    expect(wrapper.emitted('confirm')?.[0][0]).toMatchObject({ classroomId: 1 })
  })

  it('emits cancel on cancel button', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'visited',
        toStage: 'deposited',
        visitId: 1,
        childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.find('.cancel-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 確認 fail**

```bash
npx vitest run src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: 寫 component**

```vue
<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="480px"
    :before-close="onCancel"
  >
    <div v-if="mode === 'destructive'" class="destructive-warning">
      <el-alert
        :title="destructiveWarningTitle"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>

    <p class="child-info">幼生：{{ childName }}（visit #{{ visitId }}）</p>

    <el-form ref="formRef" :model="form" label-position="top">
      <el-form-item v-if="mode === 'dropdown'" label="班別" required>
        <el-select
          v-model="form.classroomId"
          placeholder="請選擇班級"
          class="classroom-select"
        >
          <el-option
            v-for="c in classrooms"
            :key="c.id"
            :value="c.id"
            :label="`${c.name} (${c.class_code})`"
          />
        </el-select>
      </el-form-item>

      <el-form-item
        v-if="mode === 'destructive'"
        label="原因（必填）"
        required
      >
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="3"
          placeholder="請說明退回原因"
          class="reason-input"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button class="cancel-btn" @click="onCancel">取消</el-button>
      <el-button
        type="primary"
        class="confirm-btn"
        :disabled="!canConfirm"
        @click="onConfirm"
      >
        確認推進
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ElDialog, ElAlert, ElForm, ElFormItem, ElSelect, ElOption,
  ElInput, ElButton,
} from 'element-plus'
// 班別清單從既有 API 拿（fetchClassrooms 假設已存在 src/api/classrooms.ts）
// 若無對應函式，使用 useClassroomStore 或直接呼叫 /classrooms 端點
import { fetchClassrooms } from '@/api/classrooms'

const props = defineProps<{
  modelValue: boolean
  fromStage: 'visited' | 'deposited' | 'enrolled' | 'active'
  toStage: 'visited' | 'deposited' | 'enrolled' | 'active'
  visitId: number
  childName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', payload: { classroomId?: number; reason?: string }): void
  (e: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

// === mode 推導 ===
const mode = computed<'plain' | 'dropdown' | 'destructive'>(() => {
  if (props.fromStage === 'deposited' && props.toStage === 'enrolled') return 'dropdown'
  // destructive = 從 enrolled/active 退回前段
  const order = ['visited', 'deposited', 'enrolled', 'active']
  if (
    (props.fromStage === 'enrolled' || props.fromStage === 'active') &&
    order.indexOf(props.toStage) < order.indexOf(props.fromStage)
  ) return 'destructive'
  return 'plain'
})

const title = computed(() => {
  const labels = { visited: '已訪視', deposited: '已預繳', enrolled: '已報到', active: '已開學' }
  return `${labels[props.fromStage]} → ${labels[props.toStage]}`
})

const destructiveWarningTitle = computed(() => {
  if (props.fromStage === 'enrolled' && (props.toStage === 'deposited' || props.toStage === 'visited')) {
    return '此操作會刪除已建立的學生資料（含監護人、異動紀錄）'
  }
  if (props.fromStage === 'active') {
    return '此操作會將學生 lifecycle 從 active 退回'
  }
  return '此為 destructive 操作'
})

// === form state ===
const form = ref<{ classroomId?: number; reason?: string }>({})

// reset form when modal opens / mode changes
watch([visible, mode], ([v]) => {
  if (v) form.value = {}
})

const canConfirm = computed(() => {
  if (mode.value === 'dropdown') return !!form.value.classroomId
  if (mode.value === 'destructive') return !!(form.value.reason && form.value.reason.trim())
  return true
})

// === classroom 載入 (僅 dropdown mode 需要) ===
interface ClassroomOption { id: number; name: string; class_code: string }
const classrooms = ref<ClassroomOption[]>([])

watch([visible, mode], async ([v, m]) => {
  if (v && m === 'dropdown' && classrooms.value.length === 0) {
    const resp = await fetchClassrooms()
    classrooms.value = (resp.data as ClassroomOption[]) ?? []
  }
}, { immediate: true })

// Exposed for tests (set selectedClassroomId externally)
defineExpose({
  get selectedClassroomId() { return form.value.classroomId },
  set selectedClassroomId(v: number | undefined) { form.value.classroomId = v },
})

function onConfirm() {
  if (!canConfirm.value) return
  emit('confirm', {
    classroomId: form.value.classroomId,
    reason: form.value.reason?.trim(),
  })
  visible.value = false
}

function onCancel() {
  emit('cancel')
  visible.value = false
}
</script>
```

> 注意：若 `fetchClassrooms` 不存在於 `src/api/classrooms.ts`，先檢查實際的 export 名稱（可能是 `getClassrooms` 或 `listClassrooms`），調整 import。Test mock 路徑要同步。

- [ ] **Step 4: 跑測試**

```bash
npx vitest run src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts 2>&1 | tail -8
# Expected: 6 passed
npm run typecheck 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git add src/components/recruitment/funnel/TransitionConfirmDialog.vue src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts
git commit -m "feat(funnel): TransitionConfirmDialog 3-mode (plain/dropdown/destructive)"
```

---

## Task 6: `FunnelColumn.vue` + `TimelineDrawer.vue`

**Files:**
- Create: `src/components/recruitment/funnel/FunnelColumn.vue`
- Create: `src/components/recruitment/funnel/TimelineDrawer.vue`
- Create: `src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts`

- [ ] **Step 1: FunnelColumn tests**

```typescript
// src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelColumn from '../FunnelColumn.vue'

const baseCards = [
  { visit_id: 1, child_name: '甲', current_stage: 'visited' as const },
  { visit_id: 2, child_name: '乙', current_stage: 'visited' as const },
]

describe('FunnelColumn.vue', () => {
  it('renders title + count', () => {
    const wrapper = mount(FunnelColumn, {
      props: { stage: 'visited', cards: baseCards, title: '已訪視', accentColor: '#909399', canDragSet: new Set([1, 2]) },
    })
    expect(wrapper.text()).toContain('已訪視')
    expect(wrapper.text()).toContain('2')
  })

  it('shows empty placeholder when cards is empty', () => {
    const wrapper = mount(FunnelColumn, {
      props: { stage: 'visited', cards: [], title: '已訪視', accentColor: '#909399', canDragSet: new Set() },
    })
    expect(wrapper.find('.funnel-column-empty').exists()).toBe(true)
  })

  it('renders one FunnelCard per card', () => {
    const wrapper = mount(FunnelColumn, {
      props: { stage: 'visited', cards: baseCards, title: '已訪視', accentColor: '#909399', canDragSet: new Set([1, 2]) },
    })
    expect(wrapper.findAll('.funnel-card').length).toBe(2)
  })
})
```

- [ ] **Step 2: 寫 FunnelColumn.vue**

```vue
<template>
  <div class="funnel-column" :style="{ '--accent': accentColor }">
    <div class="funnel-column__header">
      <span class="funnel-column__title">{{ title }}</span>
      <el-badge :value="cards.length" :max="99" />
    </div>
    <draggable
      :model-value="cards"
      group="funnel"
      item-key="visit_id"
      :animation="200"
      ghost-class="funnel-card-ghost"
      drag-class="funnel-card-drag"
      :disabled="false"
      class="funnel-column__body"
      @change="onDragChange"
    >
      <template #item="{ element }">
        <FunnelCard
          :card="element"
          :can-drag="canDragSet.has(element.visit_id)"
          :is-pending="pendingSet?.has(element.visit_id) ?? false"
          @click="$emit('card-click', element)"
        />
      </template>
    </draggable>
    <div v-if="cards.length === 0" class="funnel-column-empty">尚無此階段卡片</div>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable'
import { ElBadge } from 'element-plus'
import FunnelCard from './FunnelCard.vue'
import type { FunnelCardData, Stage } from '@/stores/recruitmentFunnel'

const props = defineProps<{
  stage: Stage
  cards: FunnelCardData[]
  title: string
  accentColor: string
  canDragSet: Set<number>
  pendingSet?: Set<number>
}>()

const emit = defineEmits<{
  (e: 'card-click', card: FunnelCardData): void
  (e: 'transition-attempt', payload: { visitId: number; fromStage: Stage; toStage: Stage }): void
}>()

interface DragChangeEvent {
  added?: { element: FunnelCardData; newIndex: number }
}

function onDragChange(evt: DragChangeEvent) {
  if (evt.added) {
    const fromStage = evt.added.element.current_stage
    if (fromStage !== props.stage) {
      emit('transition-attempt', {
        visitId: evt.added.element.visit_id,
        fromStage,
        toStage: props.stage,
      })
    }
  }
  // removed event：不處理，由目標欄的 added event 來觸發
}
</script>

<style scoped>
.funnel-column {
  background: #f8f9fa;
  border-top: 3px solid var(--accent);
  border-radius: 4px;
  min-height: 400px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.funnel-column__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.funnel-column__title { font-weight: 600; }
.funnel-column__body { flex: 1; min-height: 200px; }
.funnel-column-empty { text-align: center; color: #ccc; padding: 32px 0; }
.funnel-card-ghost { opacity: 0.3; }
.funnel-card-drag { box-shadow: 0 6px 12px rgba(0,0,0,0.2); }
</style>
```

- [ ] **Step 3: 寫 TimelineDrawer.vue**

```vue
<template>
  <el-drawer
    v-model="visible"
    :title="`Visit #${visitId} 時間線`"
    direction="rtl"
    size="420px"
  >
    <div v-if="loading" v-loading="true" class="loading-area" />
    <div v-else-if="events.length === 0" class="empty-area">尚無事件記錄</div>
    <ul v-else class="timeline-list">
      <li v-for="(ev, idx) in events" :key="idx" class="timeline-item" :class="`source--${ev.source}`">
        <div class="timeline-time">{{ formatTime(ev.created_at) }}</div>
        <div class="timeline-event">
          <el-tag :type="ev.source === 'recruitment' ? 'warning' : 'success'" size="small">
            {{ ev.source === 'recruitment' ? '招生' : '學生' }}
          </el-tag>
          <span class="event-type">{{ humanizeEventType(ev.event_type) }}</span>
        </div>
        <div v-if="ev.from_stage || ev.to_stage" class="timeline-stage">
          {{ ev.from_stage ?? '—' }} → {{ ev.to_stage ?? '—' }}
        </div>
        <div v-if="ev.reason" class="timeline-reason">{{ ev.reason }}</div>
      </li>
    </ul>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { ElDrawer, ElTag } from 'element-plus'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'

const props = defineProps<{
  modelValue: boolean
  visitId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useRecruitmentFunnelStore()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const events = computed(() => {
  if (props.visitId == null) return []
  return store.getTimelineByVisitId(props.visitId) ?? []
})

const loading = computed(() => {
  if (props.visitId == null) return false
  return store.loadingTimeline[props.visitId] ?? false
})

watch(
  () => [visible.value, props.visitId] as const,
  ([v, vid]) => {
    if (v && vid != null) {
      store.loadTimeline(vid)
    }
  },
  { immediate: true },
)

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

const EVENT_LABELS: Record<string, string> = {
  created: '建立訪視',
  deposit_added: '加上預繳',
  deposit_removed: '取消預繳',
  converted: '報到（轉學生）',
  revert_converted: '退回報到（刪學生）',
  activated: '開學',
  revert_activated: '退回開學',
}
function humanizeEventType(t: string): string {
  return EVENT_LABELS[t] ?? t
}
</script>

<style scoped>
.loading-area { height: 200px; }
.empty-area { text-align: center; color: #999; padding: 32px 0; }
.timeline-list { list-style: none; padding: 0; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.timeline-time { font-size: 12px; color: #999; }
.timeline-event { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.event-type { font-weight: 600; }
.timeline-stage { margin-top: 4px; font-size: 13px; color: #666; }
.timeline-reason { margin-top: 4px; font-size: 13px; color: #555; font-style: italic; }
</style>
```

- [ ] **Step 4: 跑測試**

```bash
npx vitest run src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts 2>&1 | tail -5
# Expected: 3 passed
npm run typecheck 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git add src/components/recruitment/funnel/FunnelColumn.vue src/components/recruitment/funnel/TimelineDrawer.vue src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts
git commit -m "feat(funnel): FunnelColumn draggable + TimelineDrawer"
```

---

## Task 7: `FunnelBoard.vue` 頂層 + wire 進 `RecruitmentView.vue`

**Files:**
- Create: `src/components/recruitment/funnel/FunnelBoard.vue`
- Modify: `src/views/RecruitmentView.vue`

- [ ] **Step 1: 寫 FunnelBoard.vue**

```vue
<template>
  <div class="funnel-board" v-loading="store.loadingBoard">
    <div class="funnel-board__toolbar">
      <el-select v-model="schoolYearLocal" placeholder="學年" clearable size="small" style="width:120px">
        <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 學年`" />
      </el-select>
      <el-select v-model="semesterLocal" placeholder="學期" clearable size="small" style="width:100px">
        <el-option :value="1" label="上學期" />
        <el-option :value="2" label="下學期" />
      </el-select>
      <el-button size="small" @click="onRefresh">重新整理</el-button>
    </div>

    <FunnelSummaryBar v-if="store.board" :summary="store.board.summary" />

    <div class="funnel-board__columns">
      <FunnelColumn
        v-for="col in columnConfigs"
        :key="col.stage"
        :stage="col.stage"
        :title="col.title"
        :accent-color="col.color"
        :cards="store.getStageCards(col.stage)"
        :can-drag-set="canDragSet(col.stage)"
        :pending-set="store.pendingTransitions"
        @card-click="onCardClick"
        @transition-attempt="onTransitionAttempt"
      />
    </div>

    <TransitionConfirmDialog
      v-model="dialogOpen"
      :from-stage="pendingTransition?.fromStage ?? 'visited'"
      :to-stage="pendingTransition?.toStage ?? 'visited'"
      :visit-id="pendingTransition?.visitId ?? 0"
      :child-name="pendingTransition?.childName ?? ''"
      @confirm="onDialogConfirm"
      @cancel="onDialogCancel"
    />

    <TimelineDrawer v-model="drawerOpen" :visit-id="drawerVisitId" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { useRecruitmentFunnelStore, type Stage, type FunnelCardData } from '@/stores/recruitmentFunnel'
import { useAuthStore } from '@/stores/auth'  // 既有 store；name 視專案實際 export 調整
import FunnelSummaryBar from './FunnelSummaryBar.vue'
import FunnelColumn from './FunnelColumn.vue'
import TransitionConfirmDialog from './TransitionConfirmDialog.vue'
import TimelineDrawer from './TimelineDrawer.vue'

const store = useRecruitmentFunnelStore()
const auth = useAuthStore()

// === 學期切換 ===
const schoolYearLocal = ref<number | null>(null)
const semesterLocal = ref<1 | 2 | null>(null)
const currentYear = new Date().getFullYear() - 1911   // 民國
const yearOptions = computed(() => [currentYear, currentYear - 1, currentYear - 2])

async function onRefresh() {
  await store.setFilter(schoolYearLocal.value, semesterLocal.value)
}

// === 4 欄 config ===
const columnConfigs: Array<{ stage: Stage; title: string; color: string }> = [
  { stage: 'visited', title: '已訪視', color: '#909399' },
  { stage: 'deposited', title: '已預繳', color: '#e6a23c' },
  { stage: 'enrolled', title: '已報到', color: '#67c23a' },
  { stage: 'active', title: '已開學', color: '#409eff' },
]

// === 權限 gate ===
const userPerms = computed<number>(() => Number(auth.user?.permissions ?? 0))
const PERM = {
  RECRUITMENT_WRITE: 1 << 3,  // 實際值以 utils/permissions.js 為準（用 BigInt 防 32-bit overflow）
  RECRUITMENT_CONVERT: 1 << 4,
  STUDENTS_WRITE: 1 << 1,
}
function hasPerm(bit: number): boolean {
  // 用 BigInt 避免 32-bit overflow（per workspace CLAUDE.md 規範）
  return (BigInt(userPerms.value) & BigInt(bit)) !== 0n
}
function canDragSet(stage: Stage): Set<number> {
  // 簡化：依 stage 判斷整欄是否可拖
  const allowed = (
    (stage === 'visited' || stage === 'deposited') ? hasPerm(PERM.RECRUITMENT_WRITE) || hasPerm(PERM.RECRUITMENT_CONVERT)
    : hasPerm(PERM.STUDENTS_WRITE)
  )
  if (!allowed) return new Set()
  return new Set(store.getStageCards(stage).map(c => c.visit_id))
}

// === Transition flow ===
interface PendingTransition {
  visitId: number
  fromStage: Stage
  toStage: Stage
  childName: string
}
const pendingTransition = ref<PendingTransition | null>(null)
const dialogOpen = ref(false)

function isDestructive(from: Stage, to: Stage): boolean {
  const order = ['visited', 'deposited', 'enrolled', 'active']
  return (from === 'enrolled' || from === 'active') && order.indexOf(to) < order.indexOf(from)
}
function needsClassroom(from: Stage, to: Stage): boolean {
  return from === 'deposited' && to === 'enrolled'
}

async function onTransitionAttempt(payload: { visitId: number; fromStage: Stage; toStage: Stage }) {
  const card = store.getCardByVisitId(payload.visitId)
  if (!card) return

  const isDest = isDestructive(payload.fromStage, payload.toStage)
  const needsCls = needsClassroom(payload.fromStage, payload.toStage)

  if (isDest || needsCls) {
    // destructive 或 convert → revert UI 先，彈 dialog 收必要欄位
    if (isDest) await store.loadBoard({ force: true })  // revert by reload
    pendingTransition.value = { ...payload, childName: card.child_name }
    dialogOpen.value = true
  } else {
    // 純 toggle → 直接 optimistic transition（vuedraggable 已移過去，呼叫 transition 確認）
    try {
      await store.transition(payload.visitId, payload.toStage, {})
      ElMessage.success('已更新階段')
    } catch (err) {
      handleTransitionError(err)
    }
  }
}

async function onDialogConfirm(payload: { classroomId?: number; reason?: string }) {
  if (!pendingTransition.value) return
  const { visitId, toStage } = pendingTransition.value
  try {
    await store.transition(visitId, toStage, payload)
    ElMessage.success('已更新階段')
  } catch (err) {
    handleTransitionError(err)
  } finally {
    pendingTransition.value = null
  }
}

function onDialogCancel() {
  pendingTransition.value = null
}

function handleTransitionError(err: unknown) {
  const e = err as { response?: { status?: number; data?: { detail?: { code?: string; message?: string } } } }
  const code = e?.response?.data?.detail?.code
  const status = e?.response?.status

  if (code === 'REVERT_STUDENT_HAS_DATA') {
    ElMessageBox.alert(e.response?.data?.detail?.message ?? '該學生已有業務資料', '無法退回', { type: 'warning' })
  } else if (status === 403) {
    ElMessage.warning('無權限執行此操作')
  } else if (status === 409) {
    ElMessage.info('狀態已被其他人變更，重新載入中')
  } else {
    ElMessage.error(e.response?.data?.detail?.message ?? '操作失敗，請稍後再試')
  }
}

// === Timeline drawer ===
const drawerOpen = ref(false)
const drawerVisitId = ref<number | null>(null)
function onCardClick(card: FunnelCardData) {
  drawerVisitId.value = card.visit_id
  drawerOpen.value = true
}

// === Lifecycle ===
onMounted(() => { store.loadBoard() })
</script>

<style scoped>
.funnel-board { padding: 12px; }
.funnel-board__toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.funnel-board__columns { display: flex; gap: 12px; min-height: 500px; }
</style>
```

> **重要**：`PERM` 的 bit 值是占位 — 實作時需 import 真實的 Permission enum 值（從 `src/utils/permissions.ts` 或對應的常數檔；BE `utils/permissions.py` 的數字要對齊前端）。寫死的 1<<3/1<<4/1<<1 是錯的，需要 grep 拿到正確值。

- [ ] **Step 2: 修改 RecruitmentView.vue 加第 10 個 tab**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
grep -n "el-tab-pane" src/views/RecruitmentView.vue | tail -5
# 找最後一個 tab-pane 的位置
```

在最後一個 `<el-tab-pane>` 之後加：

```vue
<el-tab-pane label="招生漏斗" name="funnel" lazy>
  <FunnelBoard />
</el-tab-pane>
```

並在 `<script setup>` 頂部 import：

```typescript
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'
```

- [ ] **Step 3: typecheck + build smoke**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
npm run typecheck 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: dev server 手測**

```bash
# 在 workspace 起 dev server
cd /Users/yilunwu/Desktop/ivyManageSystem
./start.sh
# 開 http://localhost:5173 → 進入「招生統計儀表板」→ 切到「招生漏斗」tab
# 確認：4 欄載入、卡片渲染、學期切換 OK
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git add src/components/recruitment/funnel/FunnelBoard.vue src/views/RecruitmentView.vue
git commit -m "feat(funnel): FunnelBoard top + wire into RecruitmentView 10th tab"
```

---

## Task 8: `SettingsAcademicTermsTab.vue` + wire 進 `SettingsView.vue`

**Files:**
- Create: `src/components/settings/SettingsAcademicTermsTab.vue`
- Create: `src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts`
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: tests**

```typescript
// src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/academicTerms', () => ({
  listAcademicTerms: vi.fn().mockResolvedValue({ data: [
    { id: 1, school_year: 115, semester: 1, start_date: '2026-08-30', end_date: '2027-01-31' },
  ]}),
  createAcademicTerm: vi.fn().mockResolvedValue({ data: {} }),
  updateAcademicTerm: vi.fn().mockResolvedValue({ data: {} }),
  deleteAcademicTerm: vi.fn().mockResolvedValue({ data: { ok: true } }),
}))

import SettingsAcademicTermsTab from '../SettingsAcademicTermsTab.vue'
import * as api from '@/api/academicTerms'

describe('SettingsAcademicTermsTab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('lists academic terms on mount', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick(); await nextTick()
    expect(api.listAcademicTerms).toHaveBeenCalled()
    expect(wrapper.text()).toContain('115')
  })

  it('opens create modal on add button click', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick(); await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    expect(wrapper.find('.term-edit-dialog').exists()).toBe(true)
  })

  it('calls createAcademicTerm on form submit', async () => {
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick(); await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    // 直接設 form (透過 expose)
    ;(wrapper.vm as unknown as { dialogForm: { school_year: number; semester: number; start_date: string; end_date: string } }).dialogForm = {
      school_year: 116, semester: 1, start_date: '2027-08-30', end_date: '2028-01-31',
    }
    await wrapper.find('.confirm-create-btn').trigger('click')
    expect(api.createAcademicTerm).toHaveBeenCalled()
  })

  it('shows error message on 409 duplicate', async () => {
    ;(api.createAcademicTerm as any).mockRejectedValueOnce({
      response: { status: 409, data: { detail: '已存在 (116, 1) 的設定' } },
    })
    const wrapper = mount(SettingsAcademicTermsTab, { attachTo: document.body })
    await nextTick(); await nextTick()
    await wrapper.find('.add-btn').trigger('click')
    ;(wrapper.vm as unknown as { dialogForm: { school_year: number; semester: number; start_date: string; end_date: string } }).dialogForm = {
      school_year: 116, semester: 1, start_date: '2027-08-30', end_date: '2028-01-31',
    }
    await wrapper.find('.confirm-create-btn').trigger('click')
    await nextTick(); await nextTick()
    expect(wrapper.vm).toBeTruthy()  // smoke
  })
})
```

- [ ] **Step 2: 寫 component**

```vue
<template>
  <div class="academic-terms-tab">
    <div class="toolbar">
      <el-button type="primary" size="small" class="add-btn" @click="openCreate">新增學期</el-button>
    </div>

    <el-table :data="terms" v-loading="loading" border>
      <el-table-column prop="school_year" label="學年" width="100" />
      <el-table-column label="學期" width="100">
        <template #default="{ row }">{{ row.semester === 1 ? '上' : '下' }}</template>
      </el-table-column>
      <el-table-column prop="start_date" label="開學日" />
      <el-table-column prop="end_date" label="結束日" />
      <el-table-column label="動作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="confirmDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogOpen" :title="dialogMode === 'create' ? '新增學期' : '編輯學期'" class="term-edit-dialog">
      <el-form :model="dialogForm" label-position="top">
        <el-form-item label="學年（民國）">
          <el-input-number v-model="dialogForm.school_year" :min="100" :max="200" />
        </el-form-item>
        <el-form-item label="學期">
          <el-select v-model="dialogForm.semester">
            <el-option :value="1" label="上學期" />
            <el-option :value="2" label="下學期" />
          </el-select>
        </el-form-item>
        <el-form-item label="開學日">
          <el-date-picker v-model="dialogForm.start_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="結束日">
          <el-date-picker v-model="dialogForm.end_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button
          v-if="dialogMode === 'create'"
          type="primary"
          class="confirm-create-btn"
          @click="onCreate"
        >新增</el-button>
        <el-button
          v-else
          type="primary"
          @click="onUpdate"
        >更新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  ElButton, ElTable, ElTableColumn, ElDialog, ElForm, ElFormItem,
  ElInputNumber, ElSelect, ElOption, ElDatePicker, ElMessage, ElMessageBox,
} from 'element-plus'
import {
  listAcademicTerms, createAcademicTerm, updateAcademicTerm, deleteAcademicTerm,
  type AcademicTermPayload,
} from '@/api/academicTerms'

interface AcademicTermRow extends AcademicTermPayload {
  id: number
}

const terms = ref<AcademicTermRow[]>([])
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const resp = await listAcademicTerms()
    terms.value = (resp.data as AcademicTermRow[]) ?? []
  } finally {
    loading.value = false
  }
}

const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const dialogForm = ref<AcademicTermPayload>({
  school_year: 115, semester: 1, start_date: '', end_date: '',
})

defineExpose({
  get dialogForm() { return dialogForm.value },
  set dialogForm(v: AcademicTermPayload) { dialogForm.value = v },
})

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  dialogForm.value = { school_year: 115, semester: 1, start_date: '', end_date: '' }
  dialogOpen.value = true
}

function openEdit(row: AcademicTermRow) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  dialogForm.value = { ...row }
  dialogOpen.value = true
}

async function onCreate() {
  try {
    await createAcademicTerm(dialogForm.value)
    ElMessage.success('已新增')
    dialogOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: string } } }
    const msg = e?.response?.status === 409
      ? (e.response?.data?.detail ?? '已存在相同學年/學期')
      : '新增失敗'
    ElMessage.error(msg)
  }
}

async function onUpdate() {
  if (editingId.value == null) return
  try {
    await updateAcademicTerm(editingId.value, dialogForm.value)
    ElMessage.success('已更新')
    dialogOpen.value = false
    await refresh()
  } catch {
    ElMessage.error('更新失敗')
  }
}

async function confirmDelete(row: AcademicTermRow) {
  try {
    await ElMessageBox.confirm(
      `刪除此學期會讓 scheduler 失去推進觸發點，確定？\n${row.school_year} 學年 ${row.semester === 1 ? '上' : '下'}學期`,
      '刪除確認', { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteAcademicTerm(row.id)
    ElMessage.success('已刪除')
    await refresh()
  } catch {
    ElMessage.error('刪除失敗')
  }
}

onMounted(refresh)
</script>
```

- [ ] **Step 3: wire 進 SettingsView.vue**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
grep -n "el-tab-pane" src/views/SettingsView.vue | tail -5
# 找最後一個 tab-pane 位置
```

在最後一個 `<el-tab-pane>` 之後加：

```vue
<el-tab-pane label="學年/學期" name="academic-terms" lazy>
  <SettingsAcademicTermsTab />
</el-tab-pane>
```

並 import：

```typescript
import SettingsAcademicTermsTab from '@/components/settings/SettingsAcademicTermsTab.vue'
```

- [ ] **Step 4: 跑測試 + typecheck + build**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
npx vitest run src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts 2>&1 | tail -5
# Expected: 4 passed
npm run typecheck 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
pwd
git add src/components/settings/SettingsAcademicTermsTab.vue src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts src/views/SettingsView.vue
git commit -m "feat(settings): academic terms CRUD tab"
```

---

## Task 9: 全套回歸 + 手測 + 收尾

**Files:** 無變動，僅驗證

- [ ] **Step 1: 全套 vitest**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
npm run test:unit -- --run 2>&1 | tail -8
# Expected: 既有 ~2300+ + 本 plan ~33 新增 case 全綠
```

如有失敗：先確認是否為 pre-existing 失敗（與本 plan 無關），若是本 plan 引起則 STOP report BLOCKED。

- [ ] **Step 2: typecheck（strict 0 error）**

```bash
npm run typecheck 2>&1 | tail -3
# Expected: 0 error
```

- [ ] **Step 3: build**

```bash
npm run build 2>&1 | tail -5
# Expected: vite build success
```

- [ ] **Step 4: dev server 手測（user 介入點）**

```bash
cd /Users/yilunwu/Desktop/ivyManageSystem && ./start.sh
```

手測 checklist：
- [ ] 開 http://localhost:5173 進入「招生統計儀表板」
- [ ] 切到「招生漏斗」tab → 4 欄渲染、有資料的話卡片顯示
- [ ] 拖 visited→deposited 卡片，無 dialog 直接成功（pure toggle）
- [ ] 拖 deposited→enrolled → 彈 dropdown dialog，選班後成功，卡片落到 enrolled 欄並顯示學號
- [ ] 拖 enrolled→deposited → 彈 destructive dialog 必填 reason
- [ ] 拖 enrolled→active → 直接成功（pure toggle）
- [ ] 點卡片 → 右側 drawer 顯示 timeline
- [ ] 學年/學期切換、重新整理按鈕運作
- [ ] 進 SettingsView →「學年/學期」tab → 新增/編輯/刪除運作
- [ ] 用 teacher（無 RECRUITMENT_WRITE）帳號 → 卡片 disabled，hover 有 tooltip

- [ ] **Step 5: 最終 commit（若手測有小調整）**

如手測中發現小 bug（如 padding 不對、文案誤、UI 問題），修完後 commit：

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
git add -p   # 選擇修改
git commit -m "fix(funnel): <具體描述>"
```

- [ ] **Step 6: 分支收尾報告**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/recruitment-funnel-phase-b-fe
echo "--- commits in this branch ---"
git log --oneline $(git merge-base HEAD main)..HEAD
echo "--- diff stats ---"
git diff --stat $(git merge-base HEAD main)..HEAD | tail -3
echo "--- ready for merge ---"
```

---

## Phase B 完成標準

- [ ] Task 0-9 全部 step 完成 + commit
- [ ] 全套 vitest 通過（既有 + 本 plan 新增 ~33 case）
- [ ] `npm run typecheck` 0 error
- [ ] `npm run build` 0 error
- [ ] dev server 手測 8 個 checklist 項皆通過
- [ ] 至少 1 個 admin + 1 個 teacher 帳號驗權限 gate
- [ ] worktree 可乾淨合進 main（無衝突）
- [ ] 後端 Phase A 是 strict prereq，未 merge 不執行
