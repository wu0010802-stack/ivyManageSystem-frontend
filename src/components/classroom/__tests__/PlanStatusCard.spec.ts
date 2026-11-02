/**
 * PlanStatusCard.spec.ts
 *
 * 「新學年預編班」狀態橫幅：涵蓋 StatusOut 五態渲染（none/draft/published/applied +
 * apply_overdue 疊加樣式）與「前往預編班」連結導向。
 * 2026-08-25 改版：el-card+el-alert → 單列橫幅，樣式斷言改看 .plan-banner--<type>
 * class、連結改 el-button link（.plan-banner__link）；狀態文案語意不變。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it('draft 態：顯示草稿阻擋數（用詞「阻擋」）', async () => {
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

    expect(wrapper.text()).toContain('草稿編輯中，有 3 項阻擋')
    expect(wrapper.text()).not.toContain('項提醒')
  })

  it('draft 態 + 有 warning：阻擋數之後附加「（另 M 項提醒）」', async () => {
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

    expect(wrapper.text()).toContain('草稿編輯中，有 3 項阻擋（另 2 項提醒）')
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
    expect(wrapper.text()).not.toContain('項阻擋')
    // 提醒不升級樣式：無 blocking 時維持 info
    expect(wrapper.find('.plan-banner').classes()).toContain('plan-banner--info')
  })

  it('draft 態 + blocking_count=0：不顯示「有 0 項阻擋」，僅顯示「草稿編輯中」', async () => {
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
    expect(wrapper.text()).not.toContain('阻擋')
  })

  it('published 態（未逾期、排程啟用）：已發布，將於套用日自動套用', async () => {
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
        apply_date: '2026-08-01',
        applies_immediately: false,
        scheduler_enabled: true,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('已發布，將於 2026/08/01 自動套用')
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
        scheduler_enabled: true,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('已發布但尚未套用，排程器重試中')
    expect(wrapper.find('.plan-banner').classes()).toContain('plan-banner--warning')
  })

  it('draft 態 + 補救模式（已開學）：提醒發布後約一小時內就套用', async () => {
    getClassroomYearPlanStatus.mockResolvedValue({
      data: {
        state: 'draft',
        target_school_year: 115,
        source_school_year: 114,
        plan_id: 1,
        version: 3,
        blocking_count: 0,
        warning_count: 0,
        prep_start_date: '2026-06-01',
        apply_overdue: false,
        apply_date: '2026-08-01',
        applies_immediately: true,
      },
    })
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.text()).toContain('已開學，發布後約一小時內套用')
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
  // ── FE-C：排程關閉、套用失敗、已發布有阻擋、發布截止、準備期前 ──

  describe('FE-C 狀態', () => {
    const base = {
      target_school_year: 116,
      source_school_year: 115,
      plan_id: 1,
      version: 3,
      blocking_count: 0,
      warning_count: 0,
      prep_start_date: '2027-06-01',
      apply_date: '2027-08-01',
      applies_immediately: false,
      apply_overdue: false,
      scheduler_enabled: true,
      graduation_date: '2027-07-31',
      retain_pending_count: 0,
      pending_new_student_count: 0,
      apply_failure: null,
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2027-07-20T04:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function cardWith(data: Record<string, unknown>) {
      getClassroomYearPlanStatus.mockResolvedValue({ data: { ...base, ...data } })
      const wrapper = mountCard()
      await flushPromises()
      return wrapper
    }

    it('已發布但自動套用未啟用：error，明講不會套用', async () => {
      const w = await cardWith({ state: 'published', scheduler_enabled: false })
      expect(w.find('.plan-banner').classes()).toContain('plan-banner--error')
      expect(w.text()).toContain('已發布，但自動套用未啟用：請聯絡系統管理員開啟，否則不會套用')
      expect(w.text()).not.toContain('自動套用（')
    })

    it('已發布且有套用失敗原因：error 顯示原因', async () => {
      const w = await cardWith({ state: 'published', apply_failure: '有 2 項阻擋：A；B' })
      expect(w.find('.plan-banner').classes()).toContain('plan-banner--error')
      expect(w.text()).toContain('已發布，但套用失敗：有 2 項阻擋：A；B')
      expect(w.find('.plan-banner__link').text()).toContain('前往處理')
    })

    it('已發布但有阻擋：error「套用會失敗」＋前往處理', async () => {
      const w = await cardWith({ state: 'published', blocking_count: 2 })
      expect(w.find('.plan-banner').classes()).toContain('plan-banner--error')
      expect(w.text()).toContain('已發布但有 2 項阻擋，套用會失敗')
      expect(w.find('.plan-banner__link').text()).toContain('前往處理')
    })

    it('草稿：加發布截止日', async () => {
      const w = await cardWith({ state: 'draft' })
      expect(w.text()).toContain('草稿編輯中；請在 2027/08/01 前發布')
    })

    it('草稿有畢業年級留級生且 14 天內到畢業日：warning 寫出須在畢業日前發布', async () => {
      const w = await cardWith({ state: 'draft', retain_pending_count: 3 })
      expect(w.find('.plan-banner').classes()).toContain('plan-banner--warning')
      expect(w.text()).toContain('有 3 位畢業年級留級生須在 2027/07/31 前發布')
    })

    it('自動畢業未開啟：留級生不提畢業日，改說要在套用前發布、不升 warning', async () => {
      const w = await cardWith({ state: 'draft', retain_pending_count: 3, auto_graduation_enabled: false })
      expect(w.text()).toContain('有 3 位畢業年級留級生，留級要在套用前發布才會生效')
      expect(w.text()).not.toContain('自動畢業')
      expect(w.text()).not.toContain('2027/07/31')
      expect(w.find('.plan-banner').classes()).toContain('plan-banner--info')
    })

    it('草稿但自動套用未啟用：不寫「請在套用日前發布」，改提醒未啟用', async () => {
      const w = await cardWith({ state: 'draft', scheduler_enabled: false })
      expect(w.text()).toContain('草稿編輯中；自動套用未啟用')
      expect(w.text()).not.toContain('前發布')
    })

    it('還沒有草稿、也還沒到準備期：寫出準備期起日，不顯示「前往建立」', async () => {
      vi.setSystemTime(new Date('2027-03-01T04:00:00Z'))
      const w = await cardWith({ state: 'none', plan_id: null, version: null })
      expect(w.text()).toContain('2027/06/01 起進入準備期')
      expect(w.text()).not.toContain('前往建立')
      expect(w.text()).toContain('前往預編班')
    })
  })
})
