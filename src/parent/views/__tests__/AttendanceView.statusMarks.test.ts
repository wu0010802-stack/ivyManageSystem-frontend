// @vitest-environment jsdom
/**
 * 出席月曆不能只靠顏色（PRODUCT.md：純色不可作為唯一狀態指示）。
 * 病假／事假原本同色、紅綠色弱分不出出席／缺席：每格要印狀態字，月曆下方要有圖例。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ monthly: vi.fn() }))
const selectedId = ref<number | null>(1)
vi.mock('@/parent/api/attendance', () => ({ getMonthlyAttendance: h.monthly }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1 }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn() } }))
import AttendanceView from '../AttendanceView.vue'

const wrappers: VueWrapper[] = []
const now = new Date()
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const day = (d: number): string => `${ym}-${String(d).padStart(2, '0')}`

beforeEach(() => {
  h.monthly.mockReset()
  h.monthly.mockResolvedValue({ data: {
    items: [
      { date: day(1), status: '出席' },
      { date: day(2), status: '缺席' },
      { date: day(3), status: '病假' },
      { date: day(4), status: '事假' },
      { date: day(5), status: '遲到' },
      { date: day(6), status: '公假' },
    ],
    counts: { 出席: 1, 缺席: 1, 病假: 1, 事假: 1, 遲到: 1 },
    recorded_days: 6,
  } })
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

async function render(): Promise<VueWrapper> {
  const w = mount(AttendanceView, { global: { stubs: {
    ChildContextHeader: true,
    PullToRefresh: { template: '<div><slot /></div>' },
  } } })
  wrappers.push(w)
  await flushPromises()
  return w
}

describe('AttendanceView 月曆狀態不只靠顏色', () => {
  it.each([
    [1, '出席', '✓'],
    [2, '缺席', '缺'],
    [3, '病假', '病'],
    [4, '事假', '事'],
    [5, '遲到', '遲'],
  ])('%i 日（%s）格內印出記號「%s」', async (d, status, mark) => {
    const w = await render()
    const cell = w.find(`.cell[aria-label="${day(d)} ${status}"]`)
    expect(cell.exists()).toBe(true)
    expect(cell.find('.status-mark').text()).toBe(mark)
    // 記號是視覺輔助，狀態已在格子名稱裡，不重複念
    expect(cell.find('.status-mark').attributes('aria-hidden')).toBe('true')
  })

  it('同色系的病假／事假記號不同', async () => {
    const w = await render()
    const sick = w.find(`.cell[aria-label="${day(3)} 病假"]`)
    const personal = w.find(`.cell[aria-label="${day(4)} 事假"]`)
    expect(sick.classes()).toContain('tone-info')
    expect(personal.classes()).toContain('tone-info')
    expect(sick.find('.status-mark').text()).not.toBe(personal.find('.status-mark').text())
  })

  it('未知狀態退回狀態文字首字，不會只剩顏色', async () => {
    const w = await render()
    expect(w.find(`.cell[aria-label="${day(6)} 公假"] .status-mark`).text()).toBe('公')
  })

  it('沒有紀錄的日子名稱註明「無紀錄」、不印記號', async () => {
    const w = await render()
    const cell = w.find(`.cell[aria-label="${day(7)} 無紀錄"]`)
    expect(cell.exists()).toBe(true)
    expect(cell.find('.status-mark').exists()).toBe(false)
  })

  it('月曆下方有圖例，列出每個記號與對應文字', async () => {
    const w = await render()
    const legend = w.find('.legend')
    expect(legend.attributes('aria-label')).toBe('圖例')
    const items = legend.findAll('.legend-item').map((li) => ({
      mark: li.find('.legend-mark').text(),
      label: li.find('.legend-label').text(),
    }))
    expect(items).toEqual([
      { mark: '✓', label: '出席' },
      { mark: '遲', label: '遲到' },
      { mark: '病', label: '病假' },
      { mark: '事', label: '事假' },
      { mark: '缺', label: '缺席' },
    ])
  })

  it('今天以 aria-current="date" 標示；Space 也能選日', async () => {
    const w = await render()
    const today = w.find('.cell[aria-current="date"]')
    expect(today.exists()).toBe(true)
    const first = w.find(`.cell[aria-label="${day(1)} 出席"]`)
    await first.trigger('keydown', { key: ' ' })
    expect(w.find('.detail').exists()).toBe(true)
  })
})
