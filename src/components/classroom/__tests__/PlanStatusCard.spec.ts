/**
 * PlanStatusCard.spec.ts
 *
 * 「新學年預編班」狀態橫幅：涵蓋 StatusOut 五態渲染（none/draft/published/applied +
 * apply_overdue 疊加樣式）與「前往預編班」連結導向。
 * 2026-08-25 改版：el-card+el-alert → 單列橫幅，樣式斷言改看 .plan-banner--<type>
 * class、連結改 el-button link（.plan-banner__link）；狀態文案語意不變。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const push = vi.fn(() => Promise.resolve())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const getClassroomYearPlanStatus = vi.fn()
vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: (...args: unknown[]) => getClassroomYearPlanStatus(...args),
}))

let hasPermissionReturn = true
vi.mock('@/utils/auth', () => ({
  hasPermission: () => hasPermissionReturn,
}))

import PlanStatusCard from '../PlanStatusCard.vue'

function mountCard() {
  return mount(PlanStatusCard, {
    global: { plugins: [ElementPlus] },
  })
}

describe('PlanStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionReturn = true
  })

  it('none 態 + 可寫權限：顯示「尚未產生新學年草稿」與「前往建立」連結', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'none',
        target_school_year: 115,
        source_school_year: 114,
        blocking_count: 0,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('尚未產生新學年草稿')
    expect(wrapper.text()).toContain('前往建立')
  })

  it('none 態 + 無寫入權限：不顯示「前往建立」，改顯示通用連結文字', async () => {
    hasPermissionReturn = false
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'none',
        target_school_year: 115,
        source_school_year: 114,
        blocking_count: 0,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).not.toContain('前往建立')
    expect(wrapper.text()).toContain('前往預編班')
  })

  it('draft 態：顯示草稿問題數', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 2,
        blocking_count: 3,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('草稿編輯中，尚有 3 項問題')
    expect(wrapper.text()).not.toContain('項提醒')
  })

  it('draft 態 + 有 warning：問題數之後附加「（另 M 項提醒）」', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 2,
        blocking_count: 3,
        warning_count: 2,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('草稿編輯中，尚有 3 項問題（另 2 項提醒）')
  })

  it('draft 態 + blocking=0 且 warning>0：仍顯示提醒計數（不被問題計數閘死），且維持 info 樣式', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 2,
        blocking_count: 0,
        warning_count: 4,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('草稿編輯中，有 4 項提醒')
    expect(wrapper.text()).not.toContain('項問題')
    // 提醒不升級樣式：無 blocking 時維持 info
    expect(wrapper.find('.plan-banner').classes()).toContain('plan-banner--info')
  })

  it('draft 態 + blocking_count=0：不顯示「尚有 0 項問題」，僅顯示「草稿編輯中」', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 2,
        blocking_count: 0,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('草稿編輯中')
    expect(wrapper.text()).not.toContain('尚有')
  })

  it('published 態（未逾期）：顯示等待學年切換文字', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'published',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 3,
        blocking_count: 0,
        warning_count: 0,
        published_at: '2026-06-15T10:00:00+08:00',
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('已確認，等待學年切換（預計 8/1 套用）')
    expect(wrapper.text()).not.toContain('排程器重試中')
  })

  it('published 態 + apply_overdue：warning 樣式顯示排程器重試中', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'published',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 3,
        blocking_count: 0,
        warning_count: 0,
        published_at: '2026-06-15T10:00:00+08:00',
        prep_start_date: '2026-06-01',
        apply_overdue: true,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('計畫尚未套用，排程器重試中')
    expect(wrapper.find('.plan-banner').classes()).toContain('plan-banner--warning')
  })

  it('applied 態：顯示套用時間', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'applied',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 4,
        blocking_count: 0,
        warning_count: 0,
        published_at: '2026-06-15T10:00:00+08:00',
        applied_at: '2026-08-01T00:05:00+08:00',
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('已於')
    expect(wrapper.text()).toContain('套用')
  })

  it('點擊連結會導向 /students/year-plan', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        blocking_count: 0,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('.plan-banner__link').trigger('click')
    expect(push).toHaveBeenCalledWith('/students/year-plan')
  })

  it('API 失敗：顯示錯誤訊息且不拋出未捕捉例外', async () => {
    getClassroomYearPlanStatus.mockRejectedValue({
      response: { data: { detail: '載入失敗測試' } },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('載入失敗測試')
  })
})
