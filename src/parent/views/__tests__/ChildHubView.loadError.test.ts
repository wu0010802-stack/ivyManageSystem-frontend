// @vitest-environment jsdom
/** S07：子女清單冷啟動載入失敗時，不得只顯示全 disabled 的入口，要有可重試的錯誤態。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ children: vi.fn() }))
vi.mock('@/parent/api/profile', () => ({ getMyChildren: h.children }))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(null), ensureSelected: vi.fn() }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import ChildHubView from '../ChildHubView.vue'

const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); h.children.mockReset() })

describe('ChildHubView 子女清單載入失敗（S07）', () => {
  it('失敗時顯示錯誤重試，重試成功後入口可用', async () => {
    setActivePinia(createPinia())
    h.children.mockRejectedValueOnce(Object.assign(new Error('x'), { displayMessage: '載入失敗' }))
    const w = mount(ChildHubView)
    wrappers.push(w)
    await flushPromises()
    const retry = w.find('.mobile-error-retry__btn')
    expect(retry.exists()).toBe(true)
    h.children.mockResolvedValue({ data: { items: [{ student_id: 1, name: '合成甲' }] } })
    await retry.trigger('click')
    await flushPromises()
    expect(w.find('.mobile-error-retry__btn').exists()).toBe(false)
    expect(w.text()).toContain('今日聯絡簿')
  })
})
