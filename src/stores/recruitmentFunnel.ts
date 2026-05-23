/**
 * Pinia store: 招生漏斗 4 階段 Kanban state + actions。
 *
 * Optimistic update：transition() 樂觀移卡 → API → 失敗 revert。
 * 409 STAGE_ALREADY 自動 force loadBoard 處理並發。
 */
import { defineStore } from 'pinia'
import {
  getFunnelBoard,
  transitionVisit,
  getTimeline,
} from '@/api/recruitmentFunnel'
import type { Schema } from '@/api/_generated/typed'

export type Stage = 'visited' | 'deposited' | 'enrolled' | 'active'

export type FunnelCardData = Schema<'FunnelCard'>
export type FunnelSummaryData = Schema<'FunnelSummary'>
export type TimelineEventData = Schema<'TimelineEvent'>

interface FunnelBoard {
  stages: Record<Stage, FunnelCardData[]>
  summary: FunnelSummaryData
}

interface CardSnapshot {
  stage: Stage
  index: number
  card: FunnelCardData
}

interface State {
  board: FunnelBoard | null
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

const STAGES: Stage[] = ['visited', 'deposited', 'enrolled', 'active']

export const useRecruitmentFunnelStore = defineStore('recruitmentFunnel', {
  state: (): State => emptyState(),

  getters: {
    getStageCards:
      (state) =>
      (stage: Stage): FunnelCardData[] =>
        state.board?.stages[stage] ?? [],

    getCardByVisitId:
      (state) =>
      (visitId: number): FunnelCardData | undefined => {
        if (!state.board) return undefined
        for (const stage of STAGES) {
          const card = state.board.stages[stage]?.find(c => c.visit_id === visitId)
          if (card) return card
        }
        return undefined
      },

    getTimelineByVisitId:
      (state) =>
      (visitId: number): TimelineEventData[] | undefined =>
        state.timelines[visitId],

    isPending:
      (state) =>
      (visitId: number): boolean =>
        state.pendingTransitions.has(visitId),
  },

  actions: {
    async loadBoard(opts: { force?: boolean } = {}): Promise<void> {
      if (this.loadingBoard && !opts.force) return
      this.loadingBoard = true
      try {
        const resp = await getFunnelBoard({
          schoolYear: this.filter.schoolYear,
          semester: this.filter.semester,
        })
        // Deep-clone to avoid holding a reference to the axios response object
        this.board = JSON.parse(JSON.stringify(resp.data)) as FunnelBoard
      } finally {
        this.loadingBoard = false
      }
    },

    async setFilter(schoolYear: number | null, semester: 1 | 2 | null): Promise<void> {
      this.filter.schoolYear = schoolYear
      this.filter.semester = semester
      await this.loadBoard({ force: true })
    },

    async transition(
      visitId: number,
      toStage: Stage,
      opts: { classroomId?: number; reason?: string },
    ): Promise<Schema<'TransitionOut'>> {
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
        })
        this._applyServerResult(visitId, resp.data)
        this.invalidateTimeline(visitId)
        return resp.data
      } catch (err: unknown) {
        this._restoreCard(snapshot)
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          await this.loadBoard({ force: true })
        }
        throw err
      } finally {
        this.pendingTransitions.delete(visitId)
      }
    },

    async loadTimeline(visitId: number, force = false): Promise<void> {
      if (!force && this.timelines[visitId]) return
      if (this.loadingTimeline[visitId]) return
      this.loadingTimeline[visitId] = true
      try {
        const resp = await getTimeline(visitId)
        this.timelines[visitId] = (resp.data as Schema<'TimelineOut'>).events
      } finally {
        this.loadingTimeline[visitId] = false
      }
    },

    invalidateTimeline(visitId: number): void {
      delete this.timelines[visitId]
    },

    // --- private helpers ---

    _snapshotCard(visitId: number): CardSnapshot | null {
      if (!this.board) return null
      for (const stage of STAGES) {
        const arr = this.board.stages[stage]
        const idx = arr.findIndex(c => c.visit_id === visitId)
        if (idx >= 0) {
          return { stage, index: idx, card: { ...arr[idx] } }
        }
      }
      return null
    },

    _moveCardOptimistically(visitId: number, toStage: Stage): void {
      const snap = this._snapshotCard(visitId)
      if (!snap || !this.board) return
      this.board.stages[snap.stage].splice(snap.index, 1)
      const movedCard: FunnelCardData = { ...snap.card, current_stage: toStage }
      this.board.stages[toStage].push(movedCard)
    },

    _applyServerResult(visitId: number, result: Schema<'TransitionOut'>): void {
      if (!this.board) return
      // Find the card wherever it ended up after optimistic move
      for (const stage of STAGES) {
        const card = this.board.stages[stage].find(c => c.visit_id === visitId)
        if (card) {
          if (result.student_id != null) card.student_id = result.student_id
          card.current_stage = result.to_stage
          break
        }
      }
    },

    _restoreCard(snapshot: CardSnapshot): void {
      if (!this.board) return
      // Remove from wherever the optimistic move placed it
      for (const stage of STAGES) {
        const idx = this.board.stages[stage].findIndex(c => c.visit_id === snapshot.card.visit_id)
        if (idx >= 0) {
          this.board.stages[stage].splice(idx, 1)
          break
        }
      }
      // Restore to original position
      this.board.stages[snapshot.stage].splice(snapshot.index, 0, snapshot.card)
    },
  },
})
