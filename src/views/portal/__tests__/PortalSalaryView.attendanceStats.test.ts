import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * PortalSalaryView「出勤統計」六格的警示色契約（2026-10-12 UI/UX 審查）。
 *
 * 原本遲到／早退用橘、缺卡用紅，數值為 0 時仍是大字橘紅，看起來像在警告老師。
 * 規則：值為 0 時一律中性色（is-zero），大於 0 才保留語意色。
 */

const { mockPreview } = vi.hoisted(() => ({ mockPreview: vi.fn() }))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, getSalaryPreview: mockPreview }
})

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

import PortalSalaryView from '@/views/portal/PortalSalaryView.vue'

function response(stats: Record<string, number>) {
  return {
    year: 2026,
    month: 7,
    attendance_stats: {
      work_days: 22,
      late_count: 0,
      early_leave_count: 0,
      missing_punch_count: 0,
      leave_hours: 0,
      leave_days: 0,
      ...stats,
    },
    salary_status: 'draft',
    salary: null,
  }
}

async function mountView() {
  const wrapper = mount(PortalSalaryView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

/** 依標籤文字找到該格的數值節點。 */
function valueOf(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  const item = wrapper
    .findAll('.stat-item')
    .find((n) => n.find('.stat-label').text() === label)
  expect(item, `找不到統計格「${label}」`).toBeTruthy()
  return item!.find('.stat-value')
}

describe('PortalSalaryView 出勤統計：0 值不使用警示色', () => {
  beforeEach(() => {
    mockPreview.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('遲到、早退、缺卡為 0 時，數值節點帶 is-zero（中性色）', async () => {
    mockPreview.mockResolvedValue({ data: response({}) })
    const wrapper = await mountView()

    for (const label of ['遲到次數', '早退次數', '缺卡次數']) {
      const v = valueOf(wrapper, label)
      expect(v.text()).toBe('0')
      expect(v.classes(), label).toContain('is-zero')
    }
  })

  it('六格中任一數值為 0 皆為中性色，包含出勤天數、請假天數、請假時數', async () => {
    mockPreview.mockResolvedValue({ data: response({ work_days: 0 }) })
    const wrapper = await mountView()

    for (const label of ['出勤天數', '請假天數', '請假時數']) {
      expect(valueOf(wrapper, label).classes(), label).toContain('is-zero')
    }
  })

  it('大於 0 時不帶 is-zero，保留原本語意色（遲到橘、缺卡紅）', async () => {
    mockPreview.mockResolvedValue({
      data: response({ late_count: 2, early_leave_count: 1, missing_punch_count: 3, leave_days: 1, leave_hours: 8 }),
    })
    const wrapper = await mountView()

    const late = valueOf(wrapper, '遲到次數')
    expect(late.classes()).not.toContain('is-zero')
    expect(late.classes()).toContain('orange')

    const early = valueOf(wrapper, '早退次數')
    expect(early.classes()).not.toContain('is-zero')
    expect(early.classes()).toContain('orange')

    const missing = valueOf(wrapper, '缺卡次數')
    expect(missing.classes()).not.toContain('is-zero')
    expect(missing.classes()).toContain('red')

    expect(valueOf(wrapper, '出勤天數').classes()).not.toContain('is-zero')
    expect(valueOf(wrapper, '請假天數').classes()).not.toContain('is-zero')
    expect(valueOf(wrapper, '請假時數').classes()).not.toContain('is-zero')
  })
})
