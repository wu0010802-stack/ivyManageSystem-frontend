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
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'
import { nowTaipeiNaiveISO } from '@/utils/format'
import { FUNNEL_STAGES, type FunnelStage } from '@/constants/recruitmentFunnel'

export type Stage = FunnelStage

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

const STAGES: Stage[] = [...FUNNEL_STAGES]

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
        this._applyServerResult(visitId, resp.data, opts.reason ?? null)
        this.invalidateTimeline(visitId)

        const hadStudent = snapshot.card.student_id != null
        const nowStudentId = resp.data.student_id ?? null
        if (!hadStudent && nowStudentId != null) {
          domainBus.emit(STUDENT_EVENTS.CREATED, {
            id: nowStudentId,
            classroom_id: opts.classroomId ?? null,
          })
        } else if (hadStudent && nowStudentId == null) {
          domainBus.emit(STUDENT_EVENTS.DELETED, {
            id: snapshot.card.student_id ?? undefined,
          })
        }

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

    /**
     * 把 server 回來的結果寫回卡片。
     *
     * `TransitionOut` 不含 withdrawn_from / withdraw_reason / withdrawn_at，
     * 成功後也不 reload board，所以這三欄必須由 (from_stage, to_stage, reason)
     * 自行推導 —— 否則：
     *  - 拖進第四欄後卡片不會長出「退預繳／退註冊」danger tag（該 tag 是區分
     *    兩種退費的唯一 UI 依據），也沒有原因列；
     *  - 取消退費後 withdrawn_from 殘留 → 卡片坐在「已預繳」欄卻掛紅色
     *    「退預繳」tag ＋ 舊原因，顯示錯誤資訊。
     * 下一次 loadBoard 會以後端值覆蓋，此處只求樂觀顯示與後端一致。
     */
    _applyServerResult(
      visitId: number,
      result: Schema<'TransitionOut'>,
      reason: string | null = null,
    ): void {
      if (!this.board) return
      const isWithdrawn = result.to_stage === 'withdrawn'
      // withdrawn_from 只可能是 deposited／enrolled（後端 visited→withdrawn 直接拒絕）
      const withdrawnFrom =
        isWithdrawn && (result.from_stage === 'deposited' || result.from_stage === 'enrolled')
          ? result.from_stage
          : null
      // Find the card wherever it ended up after optimistic move
      for (const stage of STAGES) {
        const card = this.board.stages[stage].find(c => c.visit_id === visitId)
        if (card) {
          card.student_id = result.student_id ?? null
          card.current_stage = result.to_stage
          card.withdrawn_from = withdrawnFrom
          card.withdraw_reason = isWithdrawn ? reason : null
          // 後端 recruitment_visits.withdrawn_at 是 Asia/Taipei naive（now_taipei_naive()），
          // 這裡必須產同格式字串。用 new Date().toISOString() 會寫進 UTC 帶 Z 的值，
          // 一旦有元件開始顯示這欄，重載前後就會跳 8 小時。
          card.withdrawn_at = isWithdrawn ? nowTaipeiNaiveISO() : null
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
