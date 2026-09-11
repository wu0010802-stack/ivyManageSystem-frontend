import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

async function mountCard() {
  const wrapper = mount(QuickLinksCard, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('QuickLinksCard（SPEC-024 收斂後）', () => {
  it('只剩非班級功能三格', async () => {
    const wrapper = await mountCard()
    const labels = wrapper.findAll('.tile-label').map((n) => n.text())
    expect(labels).toEqual(['成長軌跡', '才藝點名', '活動調查'])
  })

  it('班級類功能全數移除（已在「班級」tab）', async () => {
    const wrapper = await mountCard()
    const text = wrapper.text()
    for (const gone of [
      '班級學生',
      '課堂觀察',
      '作品上傳',
      '用藥執行',
      '事件紀錄',
      '學期評量',
      '接送授權',
    ]) {
      expect(text).not.toContain(gone)
    }
  })
})
