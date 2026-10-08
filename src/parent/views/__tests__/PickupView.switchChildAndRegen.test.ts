// @vitest-environment jsdom
/** F09 頁首換孩子重載常用接送人；F10 重發取件碼後畫面上的授權卡換成新碼。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ persons: vi.fn(), auths: vi.fn(), regenerate: vi.fn() }))
const selectedId = ref<number | null>(1)
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '合成孩子甲' }, { student_id: 2, name: '合成孩子乙' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/parent/api/pickup', () => ({
  listPickupPersons: h.persons, listPickupAuthorizations: h.auths, regeneratePickupCode: h.regenerate,
  createPickupPerson: vi.fn(), updatePickupPerson: vi.fn(), deletePickupPerson: vi.fn(), cancelPickupAuthorization: vi.fn(),
}))
import PickupView from '../PickupView.vue'

const wrappers: VueWrapper[] = []
const stubs = { ChildContextHeader: true, ParentBottomSheet: true, ConfirmDialog: true, PickupPersonForm: true, PickupCodeCard: true }
function person(sid: number) {
  return { id: sid * 10, student_id: sid, person_name: sid === 1 ? '合成接送人甲' : '合成接送人乙', person_relation: '其他', person_phone: '0900000000', is_active: true }
}
function auth(id: number, code: string) {
  return {
    id, student_id: 1, student_name: '合成孩子甲', person_name: '合成接送人甲', person_relation: '其他',
    person_phone: '0900000000', pickup_date: '2026-10-04', status: 'active', effective_status: 'active',
    batch_key: 'synthetic-batch', pickup_code: code,
  }
}
async function render() {
  const w = mount(PickupView, { global: { stubs } })
  wrappers.push(w)
  await flushPromises()
  return w
}
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset())
  selectedId.value = 1
  h.persons.mockImplementation((sid: number) => Promise.resolve({ data: { items: [person(sid)] } }))
  h.auths.mockResolvedValue({ data: { items: [] } })
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('PickupView 換孩子重載常用接送人（F09）', () => {
  it('頁首改選孩子後常用接送人依新孩子重載，舊清單不殘留', async () => {
    const w = await render()
    expect(w.text()).toContain('合成接送人甲')
    expect(h.persons).toHaveBeenCalledTimes(1)
    selectedId.value = 2
    await flushPromises()
    expect(h.persons).toHaveBeenCalledWith(2)
    expect(w.text()).not.toContain('合成接送人甲')
    expect(w.text()).toContain('合成接送人乙')
  })

  it('較舊孩子的晚到回應不得覆寫新孩子的清單', async () => {
    let resolveOld!: (v: unknown) => void
    h.persons.mockImplementation((sid: number) => sid === 1
      ? new Promise((r) => { resolveOld = r })
      : Promise.resolve({ data: { items: [person(2)] } }))
    const w = mount(PickupView, { global: { stubs } })
    wrappers.push(w)
    await flushPromises()
    selectedId.value = 2
    await flushPromises()
    resolveOld({ data: { items: [person(1)] } })
    await flushPromises()
    expect(w.text()).toContain('合成接送人乙')
    expect(w.text()).not.toContain('合成接送人甲')
  })
})

describe('PickupView 重發取件碼更新授權卡（F10）', () => {
  it('重發成功後同批授權卡顯示新碼', async () => {
    h.auths.mockResolvedValueOnce({ data: { items: [auth(31, '123456'), auth(32, '123456')] } })
    h.auths.mockResolvedValue({ data: { items: [auth(31, '654321'), auth(32, '654321')] } })
    h.regenerate.mockResolvedValue({ data: { code: '654321' } })
    const w = await render()
    const codes = () => w.findAll('[data-testid="active-pickup-code"]').map((c) => c.text())
    expect(codes()).toEqual(['取件碼：123456', '取件碼：123456'])
    await w.findAll('button').find((b) => b.text().includes('重發取件碼'))!.trigger('click')
    await flushPromises()
    expect(h.regenerate).toHaveBeenCalledWith(31)
    expect(codes()).toEqual(['取件碼：654321', '取件碼：654321'])
  })

  it('背景重載失敗時仍已就地換成新碼，不保留舊碼', async () => {
    h.auths.mockResolvedValueOnce({ data: { items: [auth(31, '123456'), auth(32, '123456')] } })
    h.auths.mockRejectedValue(new Error('synthetic'))
    h.regenerate.mockResolvedValue({ data: { code: '654321' } })
    const w = await render()
    await w.findAll('button').find((b) => b.text().includes('重發取件碼'))!.trigger('click')
    await flushPromises()
    expect(w.findAll('[data-testid="active-pickup-code"]').map((c) => c.text())).toEqual(['取件碼：654321', '取件碼：654321'])
  })
})
