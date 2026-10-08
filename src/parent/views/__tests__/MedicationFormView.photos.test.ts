import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MedicationFormView from '../MedicationFormView.vue'
const mocks = vi.hoisted(() => ({ create: vi.fn(), upload: vi.fn(), replace: vi.fn(), success: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: mocks.replace, back: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({ useChildrenStore: () => ({ items: [{ student_id: 1, name: '測試孩子' }], load: vi.fn() }) }))
vi.mock('@/parent/api/medications', () => ({ createMedicationOrder: mocks.create, uploadMedicationPhoto: mocks.upload }))
vi.mock('@/parent/utils/toast', () => ({ toast: { success: mocks.success, warn: vi.fn(), error: vi.fn() } }))
beforeEach(() => { mocks.create.mockReset().mockResolvedValue({ data: { id: 9 } }); mocks.upload.mockReset(); mocks.replace.mockClear(); mocks.success.mockClear() })
describe('用藥照片部分失敗', () => {
 it('保留失敗照片並重試，不重建用藥單或重傳成功照片', async () => {
   mocks.upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('測試失敗')).mockResolvedValueOnce({})
   const w = mount(MedicationFormView, { global: { stubs: { AppModal: true } } })
   await flushPromises()
   await w.get('#med-name').setValue('測試藥品')
   await w.get('#med-dose').setValue('測試劑量')
   const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png')]
   Object.defineProperty(w.get('#med-files').element, 'files', { value: files })
   await w.get('#med-files').trigger('change')
   await w.get('.submit-btn').trigger('click')
   await flushPromises()
   expect(mocks.replace).not.toHaveBeenCalled()
   expect(mocks.success).not.toHaveBeenCalled()
   expect(w.text()).toContain('用藥單已成立，1 張照片未上傳')
   await w.get('[data-testid="retry-photos"]').trigger('click')
   await flushPromises()
   expect(mocks.create).toHaveBeenCalledTimes(1)
   expect(mocks.upload).toHaveBeenCalledTimes(3)
   expect(mocks.upload).toHaveBeenLastCalledWith(9, files[1])
   expect(mocks.replace).toHaveBeenCalledWith({ path: '/medications/9' })
   w.unmount()
 })
})
