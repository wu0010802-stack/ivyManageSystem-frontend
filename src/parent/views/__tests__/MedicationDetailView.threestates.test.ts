/**
 * MedicationDetailView 三態：骨架 → 可重試錯誤態（斷線／5xx）／找不到（404）→ 內容。
 * 先前失敗時整頁空白，家長不知道該等還是該重試。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
const getOrder = vi.fn()
vi.mock('@/parent/api/medications', () => ({
  getMedicationOrder: (...a: unknown[]) => getOrder(...a),
  uploadMedicationPhoto: vi.fn(),
  deleteMedicationPhoto: vi.fn(),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import MedicationDetailView from '@/parent/views/MedicationDetailView.vue'

const order = {
  id: 5, medication_name: '退燒藥水', order_date: '2026-10-14', dose: '5ml', logs: [], photos: [],
}

beforeEach(() => getOrder.mockReset())

describe('MedicationDetailView 三態', () => {
  it('載入中顯示骨架', async () => {
    let resolve!: (v: unknown) => void
    getOrder.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const w = mount(MedicationDetailView, { global: { stubs: { SkeletonBlock: { template: '<div class="sk" />' } } } })
    await flushPromises()
    expect(w.find('.sk').exists()).toBe(true)
    resolve({ data: order })
    await flushPromises()
    expect(w.find('.sk').exists()).toBe(false)
    expect(w.text()).toContain('退燒藥水')
  })

  it('連線失敗 → 可重試錯誤態；重試成功顯示用藥單', async () => {
    getOrder.mockRejectedValueOnce({ displayMessage: '網路連線異常' })
    const w = mount(MedicationDetailView)
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toContain('網路連線異常')
    expect(w.text()).not.toContain('找不到')

    getOrder.mockResolvedValueOnce({ data: order })
    await w.find('.mobile-error-retry__btn').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('退燒藥水')
  })

  it('後端 404 → 「找不到這張用藥單」', async () => {
    getOrder.mockRejectedValueOnce({ response: { status: 404 } })
    const w = mount(MedicationDetailView)
    await flushPromises()
    expect(w.text()).toContain('找不到這張用藥單')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})
