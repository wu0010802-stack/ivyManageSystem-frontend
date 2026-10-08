// @vitest-environment jsdom
/** F06：真實 SignaturePad 按清除後，送出鈕必須回到 disabled。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/parent/api/signDocuments', () => ({
  getMySignRequest: h.get, signMyRequest: h.post, mySignPdfUrl: () => '/synthetic.pdf',
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
import SignDetailView from '../SignDetailView.vue'
import SignaturePad from '../../components/SignaturePad.vue'

const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); vi.restoreAllMocks() })

describe('SignDetailView 清除簽名後不可送出（F06）', () => {
  it('mouseup 先於 click 的真實事件順序下，清除後送出鈕 disabled', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    h.get.mockResolvedValue({ data: {
      id: 7, student_id: 1, student_name: '合成孩子甲', title: '合成測試文件',
      status: 'pending', content_md: '合成短文', signed_at: null,
    } })
    const w = mount(SignDetailView)
    wrappers.push(w)
    await flushPromises()
    await w.find('input[type="checkbox"]').setValue(true)
    const canvas = w.find('canvas')
    await canvas.trigger('mousedown', { clientX: 10, clientY: 10 })
    await canvas.trigger('mousemove', { clientX: 30, clientY: 30 })
    await canvas.trigger('mouseup')
    const submit = () => w.find('.sign-detail-view__submit').element as HTMLButtonElement
    expect(submit().disabled).toBe(false)
    const clear = w.find('.clear-btn')
    await clear.trigger('mouseup')
    await clear.trigger('click')
    const pad = w.findComponent(SignaturePad).vm as unknown as { isEmpty(): boolean }
    expect(pad.isEmpty()).toBe(true)
    expect(submit().disabled).toBe(true)
  })
})
