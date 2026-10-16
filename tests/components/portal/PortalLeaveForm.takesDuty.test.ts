/**
 * 教師請假表單「代理人接手我的職務」（SPEC-026 §4.2、§4.4 T13／T16）。
 *
 * 預覽端點 GET /portal/substitute-duty-preview 由後端決定「哪幾天可接手、班別是什麼、代理人有沒有衝突」；
 * 表單只負責顯示、預設勾選與送出。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'

vi.mock('@/api/portal', () => ({
  createMyLeave: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  uploadMyLeaveAttachments: vi.fn(),
  getMyQuotas: vi.fn().mockResolvedValue({ data: [] }),
  getMyWorkdayHours: vi.fn().mockResolvedValue({ data: { workday_hours: 8 } }),
  getMySubstituteRequests: vi.fn().mockResolvedValue({ data: [] }),
  getMyLeaveStats: vi.fn().mockResolvedValue({ data: {} }),
  respondToSubstitute: vi.fn(),
}))

vi.mock('@/api/portalLeaveQuotaExpiry', async () => {
  const { vi: viInner } = await import('vitest')
  return {
    getMyLeaveQuotaExpiry: viInner.fn().mockResolvedValue({ data: {} }),
    getMyCompLeaveGrants: viInner.fn(),
    getMyPayoutHistory: viInner.fn(),
  }
})

vi.mock('@/api/portalSubstituteDuty', () => ({ getSubstituteDutyPreview: vi.fn() }))

import { createMyLeave } from '@/api/portal'
import { getSubstituteDutyPreview } from '@/api/portalSubstituteDuty'

const PREVIEW_OK = {
  eligible: true,
  dates: ['2026-09-15'],
  shift_type_id: 3,
  shift_name: '早車',
  work_start: '07:00',
  work_end: '16:30',
  conflict_dates: [] as string[],
  default_checked: true,
}

type SetupState = { leaveMode: string }

async function mountWithSubstitute(preview: Record<string, unknown> = PREVIEW_OK) {
  vi.mocked(getSubstituteDutyPreview).mockResolvedValue({ data: preview } as never)
  const wrapper = mount(PortalLeaveForm, {
    global: { plugins: [ElementPlus] },
    props: { allEmployees: [{ id: 7, name: '王代理' }, { id: 8, name: '李代理' }] },
  })
  const selects = wrapper.findAllComponents({ name: 'ElSelect' })
  await selects[0].setValue('annual')
  const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
  await pickers[0].setValue('2026-09-15')
  await pickers[1].setValue('2026-09-15')
  await flushPromises()
  await selects[1].setValue(7)
  await flushPromises()
  return { wrapper, selects }
}

const takesDutyBox = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent({ name: 'ElCheckbox' })

async function submit(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.el-button--primary').trigger('click')
  await flushPromises()
  return vi.mocked(createMyLeave).mock.calls[0][0] as Record<string, unknown>
}

describe('PortalLeaveForm — 代理人接手我的職務', () => {
  beforeEach(() => {
    vi.mocked(createMyLeave).mockClear()
    vi.mocked(getSubstituteDutyPreview).mockReset()
  })

  it('選了代理人與整天日期後，以日期區間與代理人 id 取預覽', async () => {
    await mountWithSubstitute()
    expect(getSubstituteDutyPreview).toHaveBeenCalledWith({
      start_date: '2026-09-15',
      end_date: '2026-09-15',
      substitute_employee_id: 7,
    })
  })

  it('顯示班別與時段，時段不同（default_checked）時預設勾選', async () => {
    const { wrapper } = await mountWithSubstitute()
    const box = takesDutyBox(wrapper)
    expect(box.exists()).toBe(true)
    expect(wrapper.text()).toContain('代理人接手我的職務（早車 07:00–16:30）')
    expect(box.props('modelValue')).toBe(true)
  })

  it('時段相同（default_checked=false）時顯示但不預設勾選', async () => {
    const { wrapper } = await mountWithSubstitute({ ...PREVIEW_OK, default_checked: false })
    expect(takesDutyBox(wrapper).exists()).toBe(true)
    expect(takesDutyBox(wrapper).props('modelValue')).toBe(false)
  })

  it('勾選狀態隨 payload 送出', async () => {
    const { wrapper } = await mountWithSubstitute()
    const payload = await submit(wrapper)
    expect(payload.substitute_employee_id).toBe(7)
    expect(payload.substitute_takes_duty).toBe(true)
  })

  it('使用者取消勾選後送出 false，且重新取預覽不會再被預設值蓋回去', async () => {
    const { wrapper } = await mountWithSubstitute()
    await takesDutyBox(wrapper).setValue(false)
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    await pickers[1].setValue('2026-09-16')   // 改日期 → 重新預覽（default_checked 仍為 true）
    await flushPromises()
    expect(takesDutyBox(wrapper).props('modelValue')).toBe(false)
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('代理人已有調班：禁用、不勾選、說明哪天衝突，送出 false', async () => {
    const { wrapper } = await mountWithSubstitute({ ...PREVIEW_OK, conflict_dates: ['2026-09-15'], default_checked: false })
    const box = takesDutyBox(wrapper)
    expect(box.props('disabled')).toBe(true)
    expect(box.props('modelValue')).toBe(false)
    expect(wrapper.find('[data-test="takes-duty-conflict"]').text()).toContain('9/15')
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('期間內沒有可交接職務日：不顯示勾選，送出 false', async () => {
    const { wrapper } = await mountWithSubstitute({
      eligible: false, dates: [], shift_type_id: null, shift_name: null, work_start: null,
      work_end: null, conflict_dates: [], default_checked: false,
    })
    expect(takesDutyBox(wrapper).exists()).toBe(false)
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('預覽請求失敗：不顯示勾選，送出 false（不擋請假本身）', async () => {
    vi.mocked(getSubstituteDutyPreview).mockRejectedValue(new Error('boom'))
    const wrapper = mount(PortalLeaveForm, {
      global: { plugins: [ElementPlus] },
      props: { allEmployees: [{ id: 7, name: '王代理' }] },
    })
    const selects = wrapper.findAllComponents({ name: 'ElSelect' })
    await selects[0].setValue('annual')
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    await pickers[0].setValue('2026-09-15')
    await pickers[1].setValue('2026-09-15')
    await selects[1].setValue(7)
    await flushPromises()
    expect(takesDutyBox(wrapper).exists()).toBe(false)
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('沒選代理人：不打預覽、不顯示勾選、送出 false', async () => {
    vi.mocked(getSubstituteDutyPreview).mockResolvedValue({ data: PREVIEW_OK } as never)
    const wrapper = mount(PortalLeaveForm, {
      global: { plugins: [ElementPlus] },
      props: { allEmployees: [{ id: 7, name: '王代理' }] },
    })
    await wrapper.findAllComponents({ name: 'ElSelect' })[0].setValue('annual')
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    await pickers[0].setValue('2026-09-15')
    await pickers[1].setValue('2026-09-15')
    await flushPromises()
    expect(getSubstituteDutyPreview).not.toHaveBeenCalled()
    expect(takesDutyBox(wrapper).exists()).toBe(false)
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('清掉代理人後勾選消失並重設為 false', async () => {
    const { wrapper, selects } = await mountWithSubstitute()
    expect(takesDutyBox(wrapper).props('modelValue')).toBe(true)
    await selects[1].setValue(null)
    await flushPromises()
    expect(takesDutyBox(wrapper).exists()).toBe(false)
    const payload = await submit(wrapper)
    expect(payload.substitute_takes_duty).toBe(false)
  })

  it('切到非「整天」模式：勾選消失（第一版僅全天假可勾，D6）', async () => {
    const { wrapper } = await mountWithSubstitute()
    expect(takesDutyBox(wrapper).exists()).toBe(true)
    ;(wrapper.vm as unknown as { $: { setupState: SetupState } }).$.setupState.leaveMode = 'custom'
    await flushPromises()
    expect(takesDutyBox(wrapper).exists()).toBe(false)
  })
})
