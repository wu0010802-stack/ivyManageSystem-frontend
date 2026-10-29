/**
 * PasswordChangeForm — 後台改密碼共用表單。
 *
 * ⚠ vitest 下 ElForm.validate() 恆回 true，所以「不合規不得送出」的斷言驗的是元件自己的
 * isFormValid 後備閘門（不是 el-form）；即時錯誤文字則直接斷言 DOM。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockChangePassword = vi.fn()
vi.mock('@/api/auth', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}))

import PasswordChangeForm from '../PasswordChangeForm.vue'
import { PASSWORD_RULES } from '@/utils/passwordRules'

const VALID_OLD = 'OldPass123'
const VALID_NEW = 'NewPass456'

function mountForm(props: Record<string, unknown> = {}) {
  return mount(PasswordChangeForm, {
    attachTo: document.body,
    props,
    global: { plugins: [ElementPlus] },
  })
}

async function fill(
  wrapper: ReturnType<typeof mountForm>,
  values: { old?: string; next?: string; confirm?: string },
) {
  const inputs = wrapper.findAll('input')
  if (values.old !== undefined) await inputs[0].setValue(values.old)
  if (values.next !== undefined) await inputs[1].setValue(values.next)
  if (values.confirm !== undefined) await inputs[2].setValue(values.confirm)
  await flushPromises()
}

// Element Plus 的表單錯誤訊息有 100ms 顯示去抖（form-item 內 refDebounced(validateState, 100)），
// 斷言「錯誤文字出現／消失」前要多等一拍，否則會把「還沒顯示」誤判成「沒有錯誤」。
const EP_ERROR_DEBOUNCE_MS = 120
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, EP_ERROR_DEBOUNCE_MS))
  await flushPromises()
}

const submit = async (wrapper: ReturnType<typeof mountForm>) => {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  mockChangePassword.mockReset()
})

describe('即時規則清單', () => {
  it('列出的規則文案與 passwordRules（對齊後端）完全一致', () => {
    const wrapper = mountForm()
    const labels = wrapper.findAll('[data-test="password-rules"] li').map((li) => li.text())
    expect(labels).toHaveLength(PASSWORD_RULES.length)
    PASSWORD_RULES.forEach((rule, i) => expect(labels[i]).toContain(rule))
  })

  it('尚未輸入時全部「尚未符合」', () => {
    const wrapper = mountForm()
    const states = wrapper.findAll('[data-test="password-rules"] li').map((li) => li.attributes('data-met'))
    expect(states).toEqual(['false', 'false', 'false', 'false'])
  })

  it('邊輸入邊更新：只有小寫 → 僅「小寫」符合', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: 'abc' })
    const states = wrapper.findAll('[data-test="password-rules"] li').map((li) => li.attributes('data-met'))
    // 順序：長度 / 大寫 / 小寫 / 數字
    expect(states).toEqual(['false', 'false', 'true', 'false'])
  })

  it('完整合規 → 四條全符合', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW })
    const states = wrapper.findAll('[data-test="password-rules"] li').map((li) => li.attributes('data-met'))
    expect(states).toEqual(['true', 'true', 'true', 'true'])
  })
})

describe('確認密碼即時比對', () => {
  const MISMATCH = '兩次輸入的密碼不一致'

  it('打歪了（與新密碼前段不符）→ 打字當下就提示，不必等到送出', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: 'Different1' })
    await settle()
    expect(wrapper.find('.el-form-item__error').text()).toBe(MISMATCH)
  })

  it('還在輸入、內容仍是新密碼前段 → 先不吵人；離開欄位仍不完整才提示', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: 'NewPa' })
    await settle()
    expect(wrapper.text()).not.toContain(MISMATCH)

    await wrapper.findAll('input')[2].trigger('blur')
    await settle()
    expect(wrapper.text()).toContain(MISMATCH)
  })

  it('輸入超過新密碼長度 → 立即提示', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: `${VALID_NEW}x` })
    await settle()
    expect(wrapper.text()).toContain(MISMATCH)
  })

  it('改回一致後提示消失', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: 'Different1' })
    await settle()
    expect(wrapper.text()).toContain(MISMATCH)
    await fill(wrapper, { confirm: VALID_NEW })
    await settle()
    expect(wrapper.text()).not.toContain(MISMATCH)
  })

  it('先填確認、後改新密碼造成不一致時，同樣即時提示', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: VALID_NEW })
    await settle()
    expect(wrapper.text()).not.toContain(MISMATCH)
    await fill(wrapper, { next: 'Another789' })
    await settle()
    expect(wrapper.text()).toContain(MISMATCH)
  })
})

describe('送出閘門（不依賴 el-form）', () => {
  it('新密碼不符規則 → 不呼叫 API', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: 'abc', confirm: 'abc' })
    await submit(wrapper)
    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(wrapper.emitted('success')).toBeFalsy()
  })

  it('兩次輸入不一致 → 不呼叫 API', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: 'Mismatch123' })
    await submit(wrapper)
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('沒填目前密碼 → 不呼叫 API', async () => {
    const wrapper = mountForm()
    await fill(wrapper, { next: VALID_NEW, confirm: VALID_NEW })
    await submit(wrapper)
    expect(mockChangePassword).not.toHaveBeenCalled()
  })
})

describe('送出成功', () => {
  it('只送 old_password / new_password（不帶 confirm），emit success，並清空欄位', async () => {
    mockChangePassword.mockResolvedValue({ data: { message: '密碼修改成功' } })
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: VALID_NEW })

    await submit(wrapper)

    expect(mockChangePassword).toHaveBeenCalledTimes(1)
    expect(mockChangePassword).toHaveBeenCalledWith({
      old_password: VALID_OLD,
      new_password: VALID_NEW,
    })
    expect(wrapper.emitted('success')).toHaveLength(1)
    // 明文密碼不留在畫面／記憶體
    const values = wrapper.findAll('input').map((i) => (i.element as HTMLInputElement).value)
    expect(values).toEqual(['', '', ''])
  })
})

describe('送出防連點', () => {
  it('請求進行中再按送出只會打一次 API，並對外回報 submitting 狀態', async () => {
    let resolveRequest: (value: unknown) => void = () => {}
    mockChangePassword.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: VALID_NEW })

    await submit(wrapper)
    await submit(wrapper)
    await submit(wrapper)

    expect(mockChangePassword).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:submitting')?.at(-1)).toEqual([true])
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    resolveRequest({ data: {} })
    await flushPromises()

    expect(wrapper.emitted('update:submitting')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('success')).toHaveLength(1)
  })
})

describe('送出失敗', () => {
  it('錯誤訊息常駐顯示在表單內，且「舊密碼」統一成畫面上的「目前密碼」', async () => {
    mockChangePassword.mockRejectedValue({ displayMessage: '舊密碼錯誤' })
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: VALID_NEW })

    await submit(wrapper)

    const alert = wrapper.find('[data-test="password-submit-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('目前密碼錯誤')
    expect(alert.text()).not.toContain('舊密碼')
    expect(wrapper.emitted('success')).toBeFalsy()
    // 失敗後可重試：欄位內容保留、按鈕恢復可按
    expect((wrapper.findAll('input')[1].element as HTMLInputElement).value).toBe(VALID_NEW)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('沒有後端訊息時顯示友善預設文案，不外露技術字串', async () => {
    mockChangePassword.mockRejectedValue(new Error('boom'))
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: VALID_NEW })

    await submit(wrapper)

    const text = wrapper.find('[data-test="password-submit-error"]').text()
    expect(text).toContain('密碼更新失敗')
    expect(text).not.toContain('boom')
  })

  it('開始修改輸入後，上一次的錯誤訊息收掉', async () => {
    mockChangePassword.mockRejectedValue({ displayMessage: '舊密碼錯誤' })
    const wrapper = mountForm()
    await fill(wrapper, { old: VALID_OLD, next: VALID_NEW, confirm: VALID_NEW })
    await submit(wrapper)
    expect(wrapper.find('[data-test="password-submit-error"]').exists()).toBe(true)

    await fill(wrapper, { old: 'OtherOld123' })

    expect(wrapper.find('[data-test="password-submit-error"]').exists()).toBe(false)
  })
})

describe('無障礙與密碼管理員', () => {
  it('autocomplete 屬性正確（目前密碼 current-password、新密碼 new-password）', () => {
    const wrapper = mountForm()
    const inputs = wrapper.findAll('input')
    expect(inputs.map((i) => i.attributes('autocomplete'))).toEqual([
      'current-password',
      'new-password',
      'new-password',
    ])
  })

  it('autofocus 時游標落在「目前密碼」', async () => {
    const wrapper = mountForm({ autofocus: true })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.findAll('input')[0].element)
  })

  it('送出鈕是 submit：在任一欄位按 Enter 走表單原生送出', () => {
    const wrapper = mountForm()
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })
})
