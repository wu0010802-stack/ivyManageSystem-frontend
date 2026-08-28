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
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'

// el-dialog 會 teleport 到 body，footer slot 抓不到；以最小 stub 攤平在 wrapper 內。
const ElDialogStub = { template: '<div><slot name="header" /><slot /><slot name="footer" /></div>' }

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

describe('RecruitmentRecordDialog 序號（標題旁 chip，2026-08-28 UX 移出表單）', () => {
  it('新增模式：chip 顯示「自動產生」，表單內不再有序號輸入欄', async () => {
    const { wrapper } = await mountDialog()
    const chip = wrapper.find('[data-test="seq-no-chip"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('自動產生')
    expect(wrapper.find('input[data-test="seq-no-display"]').exists()).toBe(false)
  })

  it('編輯模式：chip 顯示既有序號', async () => {
    const { wrapper } = await mountDialog({ seq_no: '60' }, 'edit')
    expect(wrapper.find('[data-test="seq-no-chip"]').text()).toContain('60')
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

describe('RecruitmentRecordDialog 適讀班級自動判定', () => {
  it('填生日後依目標學年自動帶入班級並顯示提示', async () => {
    const { wrapper, form } = await mountDialog({ target_school_year: 115 })
    form.birthday = '2022-03-15' // 115 學年（2026-09-01 切齡）→ 4 歲 → 中班
    await nextTick()
    expect(form.grade).toBe('中班')
    expect(wrapper.find('[data-test="grade-auto-hint"]').exists()).toBe(true)
  })

  it('不覆蓋使用者已手選的班級', async () => {
    const { wrapper, form } = await mountDialog({ target_school_year: 115, grade: '大班' })
    form.birthday = '2022-03-15'
    await nextTick()
    expect(form.grade).toBe('大班')
    expect(wrapper.find('[data-test="grade-auto-hint"]').exists()).toBe(false)
  })

  it('自動帶入後改生日會跟著更新（仍屬自動狀態）', async () => {
    const { form } = await mountDialog({ target_school_year: 115 })
    form.birthday = '2022-03-15'
    await nextTick()
    expect(form.grade).toBe('中班')
    form.birthday = '2021-03-15'
    await nextTick()
    expect(form.grade).toBe('大班')
  })

  it('範圍外生日不強行帶入', async () => {
    const { form } = await mountDialog({ target_school_year: 115 })
    form.birthday = '2025-06-01' // 未滿 2 歲
    await nextTick()
    expect(form.grade).toBeNull()
  })
})

describe('RecruitmentRecordDialog 儲存並新增下一筆', () => {
  it('新增模式有按鈕，驗證通過後 emit save-next', async () => {
    const { wrapper } = await mountDialog({
      month: '115.04', child_name: '王小寶', birthday: '2022-03-15',
    })
    const btn = wrapper.find('[data-test="save-next-btn"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('save-next')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('編輯模式不顯示（連續新增只對新增有意義）', async () => {
    const { wrapper } = await mountDialog({ seq_no: '60' }, 'edit')
    expect(wrapper.find('[data-test="save-next-btn"]').exists()).toBe(false)
  })
})

describe('RecruitmentRecordDialog 地址分析同意（單行動態 hint）', () => {
  it('未勾選：顯示「不會進入區位分析」提示、無舊版 el-alert', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.find('[data-test="consent-hint-off"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="consent-hint-ok"]').exists()).toBe(false)
    expect(wrapper.find('.el-alert').exists()).toBe(false)
  })

  it('勾選後切換為綠色確認文字', async () => {
    const { wrapper, form } = await mountDialog()
    form.geocoding_consent = true
    await nextTick()
    expect(wrapper.find('[data-test="consent-hint-ok"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="consent-hint-off"]').exists()).toBe(false)
  })
})

describe('RecruitmentRecordDialog 收合區摘要', () => {
  it('未填時顯示「未填」，有內容顯示「已填 n 項」', async () => {
    const { wrapper } = await mountDialog({ address: '高雄市三民區建工路 415 號', source: '自行蒞園' })
    const summaries = wrapper.findAll('[data-test="section-summary"]').map((w) => w.text())
    expect(summaries).toContain('已填 2 項') // 聯絡與來源
    expect(summaries.filter((t) => t === '未填').length).toBe(2) // 預繳、備註
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
