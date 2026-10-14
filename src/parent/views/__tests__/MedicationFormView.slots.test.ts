/** 用藥單表單：新增時段依上一個推算；照片上限與詳情頁共用同一常數。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MedicationFormView from '../MedicationFormView.vue'
import { MEDICATION_PHOTO_MAX } from '../../utils/medicationForm'

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('@/parent/stores/children', () => ({ useChildrenStore: () => ({ items: [{ student_id: 1, name: '測試孩子' }], load: vi.fn() }) }))
vi.mock('@/parent/api/medications', () => ({ createMedicationOrder: vi.fn(), uploadMedicationPhoto: vi.fn() }))
vi.mock('@/parent/utils/toast', () => ({ toast: { success: vi.fn(), warn: mocks.warn, error: vi.fn() } }))

beforeEach(() => mocks.warn.mockReset())

describe('MedicationFormView 時段與照片', () => {
  it('「新增時段」依上一個時段 +4 小時，而不是每次都 12:00', async () => {
    const w = mount(MedicationFormView, { global: { stubs: { AppModal: true } } })
    await flushPromises()
    await w.get('.add-slot').trigger('click')
    await w.get('.add-slot').trigger('click')
    const times = w.findAll('input[type="time"]').map((i) => (i.element as HTMLInputElement).value)
    expect(times).toEqual(['08:00', '12:00', '16:00'])
  })

  it(`照片上限為 ${MEDICATION_PHOTO_MAX} 張，超過時提示已略過幾張`, async () => {
    const w = mount(MedicationFormView, { global: { stubs: { AppModal: true } } })
    await flushPromises()
    expect(w.text()).toContain(`最多 ${MEDICATION_PHOTO_MAX} 張`)
    const files = Array.from({ length: MEDICATION_PHOTO_MAX + 2 }, (_, i) => new File(['x'], `p${i}.png`))
    Object.defineProperty(w.get('#med-files').element, 'files', { value: files })
    await w.get('#med-files').trigger('change')
    expect(w.findAll('.files li')).toHaveLength(MEDICATION_PHOTO_MAX)
    expect(mocks.warn).toHaveBeenCalledWith(`最多 ${MEDICATION_PHOTO_MAX} 張，已略過 2 張`)
  })
})
