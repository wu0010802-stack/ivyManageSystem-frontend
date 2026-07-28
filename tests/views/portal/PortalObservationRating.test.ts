/**
 * 課堂觀察評分送出後端不接受的值（bug-hunt 2026-07-27，P0）。
 *
 * 後端 api/portfolio/observations.py 的 ObservationCreate 是
 * `rating: Optional[int] = Field(default=None, ge=1, le=5)`，但教師端的 el-rate
 * 開了 `allow-half`（可選 2.5）且 rating 原樣送出（clearable 清空後為 0）：
 *   - 2.5 → Pydantic 拒絕帶小數的 int
 *   - 0   → 違反 ge=1
 * 兩者都回 422「輸入資料驗證失敗」，整篇觀察內容存不進去，
 * 「近 7 天觀察」也不會出現，老師看不出是哪個欄位有問題。
 *
 * 管理端 src/components/portfolio/PortfolioTab.vue 沒開 allow-half 且送 `|| null`，
 * 是正確寫法。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn().mockResolvedValue({
    data: {
      classrooms: [
        { classroom_name: '小班', students: [{ id: 5, name: '王小明' }] },
      ],
    },
  }),
}))

vi.mock('@/api/portalObservations', () => ({
  listObservations: vi.fn().mockResolvedValue({ data: { items: [] } }),
  createObservation: vi.fn().mockResolvedValue({ data: { id: 1 } }),
}))

import { createObservation } from '@/api/portalObservations'
import PortalObservationView from '@/views/portal/PortalObservationView.vue'

async function mountView() {
  const wrapper = mount(PortalObservationView, {
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

describe('教師端課堂觀察評分', () => {
  beforeEach(() => {
    vi.mocked(createObservation).mockClear()
  })

  it('評分元件不得允許半星（後端只收 1–5 整數）', async () => {
    const wrapper = await mountView()

    const rate = wrapper.findComponent({ name: 'ElRate' })
    expect(rate.exists()).toBe(true)
    expect(rate.props('allowHalf')).toBe(false)
  })

  it('清空評分後送出的是 null，不是後端會拒絕的 0', async () => {
    const wrapper = await mountView()

    await wrapper.findComponent({ name: 'ElSelect' }).setValue(5)
    await wrapper.find('.chip-btn').trigger('click')
    // 注意：不能用 findComponent({name:'ElInput'})，那會先抓到 el-select 內部的 input
    await wrapper.find('textarea').setValue('今天很專注')
    // clearable：再點一次同一顆星會把值清成 0
    await wrapper.findComponent({ name: 'ElRate' }).setValue(0)
    await flushPromises()

    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()

    expect(createObservation).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createObservation).mock.calls[0][1] as Record<string, unknown>
    expect(payload.rating).toBeNull()
  })
})
