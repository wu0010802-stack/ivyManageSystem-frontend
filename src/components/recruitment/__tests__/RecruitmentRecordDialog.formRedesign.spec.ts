// 招生「新增訪視紀錄」表單改版（2026-08-28 業主要求）：
// ① 序號改由後端依當月順序自動產生，表單只讀不寫；
// ② 生日改必填（招生階段就決定適讀班級與入學學期，事後補填成本高）；
// ③ 移除「行政區」（後端已能從 address 解析，區位分析不靠這欄手填）；
// ④ 新增「是否搭乘娃娃車」。
//
// ⚠ 必填以 el-form-item 的 `.is-required` 斷言，不用「點儲存看有沒有 emit」：
// 此測試環境（happy-dom + element-plus）下 ElForm.validate() 對空值一律回 true，
// 連既有的 month／child_name 必填也擋不住，用它斷言會得到假綠。`.is-required`
// 由 element-plus 從 normalizedRules 推導，能真正證明規則有接上該欄位。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'

// el-dialog 會 teleport 到 body，footer slot 抓不到；以最小 stub 攤平在 wrapper 內。
const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }

// el-form-item 的 <label> 要等一次 tick 才進 DOM，否則 `.is-required` 抓得到、
// 標籤文字卻是空字串。
async function mountDialog(overrides: Partial<VisitFormState> = {}, mode = 'add') {
  const form = reactive({ ...emptyVisitForm(), ...overrides })
  const wrapper = mount(RecruitmentRecordDialog, {
    props: { visible: true, mode, form },
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': ElDialogStub } },
  })
  await nextTick()
  return { wrapper, form }
}

type DialogWrapper = Awaited<ReturnType<typeof mountDialog>>['wrapper']

function requiredLabels(wrapper: DialogWrapper): string[] {
  return wrapper.findAll('.el-form-item.is-required').map((w) => {
    const label = w.find('label')
    return label.exists() ? label.text() : ''
  })
}

describe('RecruitmentRecordDialog 序號自動產生', () => {
  it('新增模式：序號欄唯讀並提示將自動產生', async () => {
    const { wrapper } = await mountDialog()
    const input = wrapper.find('input[data-test="seq-no-display"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('儲存後自動產生')
    expect((input.element as HTMLInputElement).disabled).toBe(true)
  })

  it('編輯模式：顯示既有序號且仍不可編輯', async () => {
    const { wrapper } = await mountDialog({ seq_no: '60' }, 'edit')
    const input = wrapper.find('input[data-test="seq-no-display"]')
    expect((input.element as HTMLInputElement).value).toBe('60')
    expect((input.element as HTMLInputElement).disabled).toBe(true)
  })

  it('序號不是必填欄（由後端產生，不該擋住送出）', async () => {
    const { wrapper } = await mountDialog()
    expect(requiredLabels(wrapper)).not.toContain('序號')
  })
})

describe('RecruitmentRecordDialog 生日必填', () => {
  it('生日標記為必填', async () => {
    const { wrapper } = await mountDialog()
    expect(requiredLabels(wrapper)).toContain('生日')
  })

  it('參觀日期與幼生姓名維持必填（不因改版被洗掉）', async () => {
    const { wrapper } = await mountDialog()
    const labels = requiredLabels(wrapper)
    expect(labels).toContain('參觀日期')
    expect(labels).toContain('幼生姓名')
  })
})

describe('RecruitmentRecordDialog 行政區移除', () => {
  it('表單不再有「行政區」欄位（收合區段為 v-show，內容仍在 DOM）', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.text()).toContain('地址')
    expect(wrapper.text()).not.toContain('行政區')
  })
})

describe('RecruitmentRecordDialog 是否搭乘娃娃車', () => {
  it('開關在常駐的基本資料區，預設不搭乘', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.text()).toContain('是否搭乘娃娃車')
    expect(wrapper.find('[data-test="rides-bus-switch"]').exists()).toBe(true)
  })

  it('切換後寫回 form.rides_bus', async () => {
    const { wrapper, form } = await mountDialog()
    expect(form.rides_bus).toBe(false)

    await wrapper.find('[data-test="rides-bus-switch"]').trigger('click')
    await nextTick()

    expect(form.rides_bus).toBe(true)
  })
})
