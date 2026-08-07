// 回歸測試：2026-08-03 業主決策移除公開報名的生日欄後，新報名的 birthday 恆為 NULL，
// 但後台「編輯基本資料」仍把生日當必填 → 儲存鈕永遠 disabled，承辦連姓名／班級／Email
// 都改不了（也廢掉「改班級觸發重新比對」的救援路徑）。
//
// 修法有陷阱：後端無條件寫回 birthday，而缺 STUDENTS_READ 的員工看到的生日空白是
// 後端遮罩（回 None）不是真的沒資料。單純解掉必填，這種員工按儲存就會把真實生日
// 靜默清成 NULL。故契約為 partial-update：payload 沒有 birthday key ＝ 不變更，
// 有 key 但為 null ＝ 明確清空。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/activity', () => ({
  updateRegistrationBasic: vi.fn(),
  createRegistration: vi.fn(),
  getSupplies: vi.fn(() => Promise.resolve({ data: { supplies: [] } })),
}))

import { updateRegistrationBasic, createRegistration } from '@/api/activity'
import RegistrationEditBasicDialog from '../RegistrationEditBasicDialog.vue'
import RegistrationCreateDialog from '../RegistrationCreateDialog.vue'

// el-dialog 會 teleport 到 body，footer slot 抓不到；以最小 stub 攤平在 wrapper 內。
const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = { 'el-dialog': ElDialogStub, 'el-select': true, 'el-option': true, 'el-date-picker': true } as const

// 兩支對話框的 wrapper 型別不同，helper 以最小結構型別接收即可。
interface MinimalWrapper {
  vm: unknown
  findAll(selector: string): Array<{
    text(): string
    element: Element
    trigger(event: string): Promise<void>
  }>
}

function formOf(wrapper: MinimalWrapper): Record<string, unknown> {
  return (wrapper.vm as { form: Record<string, unknown> }).form
}

function buttonByText(wrapper: MinimalWrapper, text: string): HTMLButtonElement {
  const btn = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!btn) throw new Error(`找不到「${text}」按鈕`)
  return btn.element as HTMLButtonElement
}

async function clickButton(wrapper: MinimalWrapper, text: string) {
  const btn = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!btn) throw new Error(`找不到「${text}」按鈕`)
  await btn.trigger('click')
  await flushPromises()
}

// 公開報名比對失敗的列在 production 的真實形狀：student_id / classroom_id 皆為 NULL，
// 且 2026-08-03 起 birthday 一律沒有值（公開端 payload 不再帶生日）。
const UNMATCHED_PUBLIC_REGISTRATION = {
  id: 7,
  student_id: null,
  classroom_id: null,
  student_name: '王小明',
  birthday: null,
  class_name: '天堂鳥',
  email: 'a@b.co',
} as const

function mountEditDialog(initial: Record<string, unknown>) {
  // v-if 懶掛載的真實情境：元件建立時 modelValue 已是 true。
  return mount(RegistrationEditBasicDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: {
      modelValue: true,
      registrationId: 7,
      initial,
      classroomOptions: ['天堂鳥', '向日葵'],
    },
  })
}

describe('RegistrationEditBasicDialog — 生日選填且不誤清', () => {
  beforeEach(() => {
    vi.mocked(updateRegistrationBasic).mockReset()
    vi.mocked(updateRegistrationBasic).mockResolvedValue({
      data: {},
    } as unknown as Awaited<ReturnType<typeof updateRegistrationBasic>>)
  })

  it('生日欄不再標示必填，並提示可留空', () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION })
    expect(wrapper.find('[data-test="birthday-hint"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="birthday-hint"]').text()).toContain('可留空')
  })

  it('initial 沒有生日（公開報名新資料）時，儲存鈕仍可按', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION })
    await flushPromises()
    expect(buttonByText(wrapper, '儲存').disabled).toBe(false)
  })

  it('姓名或班級為空時，儲存鈕仍 disabled', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION, student_name: '' })
    await flushPromises()
    expect(buttonByText(wrapper, '儲存').disabled).toBe(true)
  })

  it('生日載入為空且未動過 → payload 不含 birthday key（避免把遮罩後的真實生日清成 NULL）', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION })
    await flushPromises()
    const form = formOf(wrapper)
    form.class_ = '向日葵' // 承辦改班級以觸發後端重新比對
    await wrapper.vm.$nextTick()

    await clickButton(wrapper, '儲存')

    expect(updateRegistrationBasic).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(updateRegistrationBasic).mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('birthday')
    expect(payload).toMatchObject({ name: '王小明', class: '向日葵', email: 'a@b.co' })
  })

  it('使用者主動填了生日 → payload 帶上該值', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION })
    await flushPromises()
    formOf(wrapper).birthday = '2020-01-01'
    await wrapper.vm.$nextTick()

    await clickButton(wrapper, '儲存')

    const payload = vi.mocked(updateRegistrationBasic).mock.calls[0][1] as Record<string, unknown>
    expect(payload.birthday).toBe('2020-01-01')
  })

  it('initial 有生日且未動過 → payload 仍帶原值（不會被無聲清掉）', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION, birthday: '2019-05-05' })
    await flushPromises()

    await clickButton(wrapper, '儲存')

    const payload = vi.mocked(updateRegistrationBasic).mock.calls[0][1] as Record<string, unknown>
    expect(payload.birthday).toBe('2019-05-05')
  })

  it('使用者把原有生日清空 → payload 明確帶 birthday: null', async () => {
    const wrapper = mountEditDialog({ ...UNMATCHED_PUBLIC_REGISTRATION, birthday: '2019-05-05' })
    await flushPromises()
    formOf(wrapper).birthday = ''
    await wrapper.vm.$nextTick()

    await clickButton(wrapper, '儲存')

    const payload = vi.mocked(updateRegistrationBasic).mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload)).toContain('birthday')
    expect(payload.birthday).toBeNull()
  })
})

describe('RegistrationCreateDialog — 後台手動新增的生日改為選填', () => {
  beforeEach(() => {
    vi.mocked(createRegistration).mockReset()
    vi.mocked(createRegistration).mockResolvedValue({
      data: { message: '新增成功' },
    } as unknown as Awaited<ReturnType<typeof createRegistration>>)
  })

  it('未填生日但有姓名／班級／課程 → 可送出，且 payload 的 birthday 為 null（非空字串）', async () => {
    const wrapper = mount(RegistrationCreateDialog, {
      global: { plugins: [ElementPlus], stubs: STUBS },
      props: { modelValue: true, schoolYear: 115, semester: 1 },
    })
    await flushPromises()
    const form = formOf(wrapper)
    form.name = '王小明'
    form.class_ = '天堂鳥'
    form.courseNames = ['美術']
    await wrapper.vm.$nextTick()

    expect(buttonByText(wrapper, '確認新增').disabled).toBe(false)

    await clickButton(wrapper, '確認新增')

    expect(createRegistration).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createRegistration).mock.calls[0][0] as Record<string, unknown>
    expect(payload.birthday).toBeNull()
  })
})
