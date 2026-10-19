// @vitest-environment jsdom
/**
 * F02（2026-10-19）：後端起，取件碼的重發／取消只限建立者本人；列表中
 * 他人（同學生另一位監護人）建立的 active 授權 `pickup_code` 一律回 null。
 *
 * 後端（sec-round5）起回傳 `created_by_me`：前端以它判定是否為本人建立；
 * false 時隱藏「重發取件碼」「取消授權」兩顆會被 403 的按鈕，改顯示說明。
 * 只有舊後端（回應沒有該欄位）才退回「有無明碼」判定。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({
  persons: vi.fn(), auths: vi.fn(), regenerate: vi.fn(), cancel: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '合成孩子甲' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: h.toastError, success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/parent/api/pickup', () => ({
  listPickupPersons: h.persons, listPickupAuthorizations: h.auths,
  regeneratePickupCode: h.regenerate, cancelPickupAuthorization: h.cancel,
  createPickupPerson: vi.fn(), updatePickupPerson: vi.fn(), deletePickupPerson: vi.fn(),
}))
import PickupView from '../PickupView.vue'

const wrappers: VueWrapper[] = []
const stubs = { ChildContextHeader: true, ParentBottomSheet: true, ConfirmDialog: true, PickupPersonForm: true, PickupCodeCard: true }
function auth(id: number, code: string | null, createdByMe?: boolean) {
  return {
    ...(createdByMe === undefined ? {} : { created_by_me: createdByMe }),
    id, student_id: 1, student_name: '合成孩子甲', person_name: '合成接送人甲', person_relation: '其他',
    person_phone: '0900000000', pickup_date: '2026-10-19', status: 'active', effective_status: 'active',
    batch_key: null, pickup_code: code,
  }
}
async function render() {
  const w = mount(PickupView, { global: { stubs } })
  wrappers.push(w)
  await flushPromises()
  return w
}
function btn(w: VueWrapper, label: string) {
  return w.findAll('button').find((b) => b.text().includes(label))
}
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset())
  h.persons.mockResolvedValue({ data: { items: [] } })
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('PickupView 他人建立的授權（F02）', () => {
  it('created_by_me=false（他人建立）→ 不顯示重發／取消按鈕，改顯示僅建立者可操作的說明', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, null, false)] } })
    const w = await render()
    expect(btn(w, '重發取件碼')).toBeUndefined()
    expect(btn(w, '取消授權')).toBeUndefined()
    const note = w.find('[data-testid="auth-not-owner-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('其他監護人')
  })

  it('created_by_me=true（有明碼）→ 照常顯示重發／取消，不顯示說明', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, '482913', true)] } })
    const w = await render()
    expect(btn(w, '重發取件碼')).toBeDefined()
    expect(btn(w, '取消授權')).toBeDefined()
    expect(w.find('[data-testid="auth-not-owner-note"]').exists()).toBe(false)
  })

  it('created_by_me=true 但 pickup_code 為 null → 仍顯示重發／取消（不以明碼反推），不顯示說明', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, null, true)] } })
    const w = await render()
    expect(btn(w, '重發取件碼')).toBeDefined()
    expect(btn(w, '取消授權')).toBeDefined()
    expect(w.find('[data-testid="auth-not-owner-note"]').exists()).toBe(false)
  })

  it('created_by_me=false 即使帶明碼 → 仍隱藏重發／取消（以欄位為準）', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, '482913', false)] } })
    const w = await render()
    expect(btn(w, '重發取件碼')).toBeUndefined()
    expect(btn(w, '取消授權')).toBeUndefined()
    expect(w.find('[data-testid="auth-not-owner-note"]').exists()).toBe(true)
  })

  it('舊後端（無 created_by_me 欄位）→ 退回以有無明碼判定', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, '482913'), auth(2, null)] } })
    const w = await render()
    expect(w.findAll('button').filter((b) => b.text().includes('重發取件碼'))).toHaveLength(1)
    expect(w.findAll('[data-testid="auth-not-owner-note"]')).toHaveLength(1)
  })

  it('重發被後端 403 擋下 → toast 顯示後端說明', async () => {
    h.auths.mockResolvedValue({ data: { items: [auth(1, '482913', true)] } })
    h.regenerate.mockRejectedValue({
      response: { status: 403, data: { detail: '查無此資料或無權存取' } },
      displayMessage: '查無此資料或無權存取',
      errorDetail: null,
    })
    const w = await render()
    await btn(w, '重發取件碼')!.trigger('click')
    await flushPromises()
    const vm = w.vm as unknown as { doRegenerate: () => Promise<void> }
    await vm.doRegenerate()
    await flushPromises()
    expect(h.toastError).toHaveBeenCalledWith(expect.stringContaining('查無此資料或無權存取'))
  })
})
