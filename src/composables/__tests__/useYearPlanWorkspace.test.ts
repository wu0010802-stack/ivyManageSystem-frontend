import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: vi.fn(),
  getClassroomYearPlanDetail: vi.fn(),
  generateClassroomYearPlan: vi.fn(),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))

import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
} from '@/api/classroomYearPlan'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'

const mockStatus = getClassroomYearPlanStatus as ReturnType<typeof vi.fn>
const mockDetail = getClassroomYearPlanDetail as ReturnType<typeof vi.fn>
const mockGenerate = generateClassroomYearPlan as ReturnType<typeof vi.fn>

function statusNone() {
  return {
    data: {
      state: 'none' as const,
      target_school_year: 115,
      source_school_year: 114,
      plan_id: null,
      version: null,
      blocking_count: 0,
      warning_count: 0,
      published_at: null,
      applied_at: null,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  }
}

function statusDraft(planId = 5, version = 1) {
  return {
    data: {
      state: 'draft' as const,
      target_school_year: 115,
      source_school_year: 114,
      plan_id: planId,
      version,
      blocking_count: 1,
      warning_count: 2,
      published_at: null,
      applied_at: null,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  }
}

function detailDraft(planId = 5, version = 1) {
  return {
    data: {
      id: planId,
      target_school_year: 115,
      source_school_year: 114,
      status: 'draft',
      version,
      generated_at: '2026-06-01T00:00:00',
      published_at: null,
      applied_at: null,
      classes: [],
      students: [],
      issues: { blocking: [], warnings: [] },
    },
  }
}

describe('useYearPlanWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load(): state=none 時不呼叫 detail，plan 為 null', async () => {
    mockStatus.mockResolvedValue(statusNone())
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.status.value?.state).toBe('none')
    expect(ws.plan.value).toBeNull()
    expect(mockDetail).not.toHaveBeenCalled()
    expect(ws.loading.value).toBe(false)
    expect(ws.error.value).toBeNull()
  })

  it('load(): 有 plan_id 時串接呼叫 detail 並填入 plan', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(mockDetail).toHaveBeenCalledWith(5)
    expect(ws.plan.value?.id).toBe(5)
    expect(ws.version.value).toBe(1)
    expect(ws.state.value).toBe('draft')
  })

  it('generate(): 呼叫 generate API 後重新 load()', async () => {
    mockGenerate.mockResolvedValue({ data: { plan_id: 5, created: true, version: 1 } })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.generate()
    expect(mockGenerate).toHaveBeenCalled()
    expect(mockStatus).toHaveBeenCalled()
    expect(ws.plan.value?.id).toBe(5)
  })

  it('generate(): 帶目標學年時原樣轉送 payload', async () => {
    mockGenerate.mockResolvedValue({ data: { plan_id: 5, created: true, version: 1 } })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.generate(115)
    expect(mockGenerate).toHaveBeenCalledWith({ target_school_year: 115 })
  })

  it('409 version_conflict：設定 versionConflict 與提示重新載入的錯誤訊息，不當一般錯誤處理', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockRejectedValue({
      response: { status: 409 },
      errorDetail: { code: 'version_conflict', message: '此草稿已被其他操作異動', current_version: 2 },
      displayMessage: '此草稿已被其他操作異動',
    })
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.versionConflict.value).toBe(true)
    expect(ws.error.value).toContain('重新載入')
  })

  it('一般錯誤（非 409 version_conflict）：設定 error 訊息、versionConflict 維持 false', async () => {
    mockStatus.mockRejectedValue({
      response: { status: 500 },
      displayMessage: '伺服器錯誤',
    })
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.versionConflict.value).toBe(false)
    expect(ws.error.value).toBe('伺服器錯誤')
  })
})
