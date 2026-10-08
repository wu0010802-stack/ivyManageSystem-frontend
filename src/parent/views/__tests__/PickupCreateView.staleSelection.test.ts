// @vitest-environment jsdom
/** F05：換孩子後，已從畫面消失的舊接送人不得仍可送出。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({ persons: vi.fn(), create: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '合成孩子甲' }, { student_id: 2, name: '合成孩子乙' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/parent/api/pickup', () => ({
  listPickupPersons: h.persons, createPickupAuthorizations: h.create,
}))
import PickupCreateView from '../PickupCreateView.vue'

const wrappers: VueWrapper[] = []
function person(id: number, student: number, name: string) {
  return { id, student_id: student, person_name: name, person_relation: '其他', person_phone: '0900000000', is_active: true }
}
beforeEach(() => {
  h.persons.mockReset()
  h.persons.mockImplementation((sid: number) => Promise.resolve({ data: { items: [person(sid * 10, sid, sid === 1 ? '合成接送人甲' : '合成接送人乙')] } }))
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('PickupCreateView 換孩子清除已選接送人（F05）', () => {
  it('首位孩子改變後，舊接送人選擇被清除，送出鈕需重新選擇才啟用', async () => {
    const w = mount(PickupCreateView, { global: { stubs: { PickupPersonForm: true, PickupCodeCard: true } } })
    wrappers.push(w)
    await flushPromises()
    const children = w.findAll('.child-row')
    await children[0].trigger('click')
    await flushPromises()
    await w.find('.person-option').trigger('click')
    const submit = () => w.findAll('button').find((b) => b.text().includes('確認建立授權'))!
    expect((submit().element as HTMLButtonElement).disabled).toBe(false)
    await children[1].trigger('click')
    await children[0].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('合成接送人乙')
    expect(w.text()).not.toContain('合成接送人甲')
    expect((submit().element as HTMLButtonElement).disabled).toBe(true)
    await w.find('.person-option').trigger('click')
    expect((submit().element as HTMLButtonElement).disabled).toBe(false)
  })
})
