/**
 * 行事曆事件表單對話框（FormDialog 殼 + 四組欄位）：
 * - 進階設定預設收合；編輯時已有值才自動展開
 * - 全天事件不顯示時間欄位
 * - 送出內容與改版前 saveEvent 逐字相同（契約鎖定）
 * - 注意：vitest 下 ElForm.validate() 不可信（恆通過），驗證類斷言只看 rules 掛的 is-required
 *   與「送出前最後防線」，不靠 el-form 驗證失敗的路徑
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CalendarEventFormDialog from '../CalendarEventFormDialog.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import { createEmptyEventForm, type CalendarEventFormValues } from '../eventForm'

const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: msg, ElMessageBox: { confirm: vi.fn() } }
})

const STUBS = {
  // el-dialog 就地渲染，並尊重 modelValue（destroy-on-close 的效果）
  'el-dialog': {
    props: ['modelValue'],
    template: '<div class="el-dialog-host"><div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div></div>',
  },
  'el-select': { props: ['modelValue'], template: '<div class="select-stub"><slot /></div>' },
  'el-option': { props: ['label', 'value'], template: '<i class="opt" :data-value="value">{{ label }}</i>' },
  'el-date-picker': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="dp-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-time-picker': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="tp-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-input-number': true,
  RecurrenceEditor: true,
}

function mountDialog(props: Partial<{
  modelValue: boolean
  mode: 'create' | 'edit'
  initial: CalendarEventFormValues
  saving: boolean
  employees: { id: number; name: string; employee_id?: string }[]
  ownerName: string | null
  employeesError: boolean
}> = {}) {
  return mount(CalendarEventFormDialog, {
    props: {
      modelValue: true,
      mode: 'create',
      initial: createEmptyEventForm(),
      ...props,
    },
    global: { plugins: [ElementPlus], stubs: STUBS },
  })
}

// FormSection 收合是 v-show（display: none）；元件未掛進 document 時 isVisible() 不可靠，直接看 style
const bodyHidden = (w: VueWrapper) =>
  (w.find('[data-test="section-advanced"] .form-section__body').attributes('style') ?? '').includes('display: none')

const formItem = (w: VueWrapper, label: string) =>
  w.findAll('.el-form-item').find((i) => i.find('.el-form-item__label').text() === label)

const IMPORTED: CalendarEventFormValues = {
  ...createEmptyEventForm(),
  id: 5,
  title: '主教會議',
  event_date: '2026-07-10',
  event_type: 'meeting',
  visibility: 'staff',
  category: 'teaching',
  academic_year: 115,
  semester: 'first',
  week_no: 3,
  owner_employee_id: 9,
}

describe('CalendarEventFormDialog 欄位分組', () => {
  beforeEach(() => vi.clearAllMocks())

  it('四組標題：基本資訊／時間／公開對象／進階設定', () => {
    const w = mountDialog()
    expect(w.find('[data-test="section-basic"]').text()).toContain('基本資訊')
    expect(w.find('[data-test="section-time"]').text()).toContain('時間')
    expect(w.find('[data-test="section-audience"]').text()).toContain('公開對象')
    expect(w.find('[data-test="section-advanced"]').text()).toContain('進階設定')
  })

  it('標題與開始日期必填（掛 rules 的 is-required），其餘不必填', () => {
    const w = mountDialog()
    const required = w.findAll('.el-form-item.is-required').map((i) => i.find('.el-form-item__label').text())
    expect(required).toEqual(['標題', '開始日期'])
  })

  it('常用欄位在常駐區，少用欄位在進階設定裡', () => {
    const w = mountDialog()
    const inAdvanced = (label: string) =>
      w.find('[data-test="section-advanced"]').findAll('.el-form-item__label').some((l) => l.text() === label)
    for (const label of ['工作分類', '負責人', '學年度', '學期', '週次']) expect(inAdvanced(label)).toBe(true)
    for (const label of ['標題', '類型', '地點', '說明', '開始日期', '結束日期', '可見範圍']) {
      expect(inAdvanced(label)).toBe(false)
    }
  })
})

describe('進階設定收合', () => {
  it('新增：預設收合，摘要「未設定」', () => {
    const w = mountDialog()
    const header = w.find('[data-test="section-advanced"] .form-section__header')
    expect(header.attributes('aria-expanded')).toBe('false')
    expect(bodyHidden(w)).toBe(true)
    expect(w.find('[data-test="section-advanced"] [data-test="section-summary"]').text()).toBe('未設定')
  })

  it('點標頭展開／再點收合', async () => {
    const w = mountDialog()
    const header = w.find('[data-test="section-advanced"] .form-section__header')
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(bodyHidden(w)).toBe(false)
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('false')
  })

  it('編輯：進階欄位已有值（例如分校行事曆匯入）→ 預設展開，不藏起資料', () => {
    const w = mountDialog({ mode: 'edit', initial: IMPORTED })
    const header = w.find('[data-test="section-advanced"] .form-section__header')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(bodyHidden(w)).toBe(false)
  })

  it('編輯：進階欄位全是預設值 → 維持收合', () => {
    const w = mountDialog({ mode: 'edit', initial: { ...IMPORTED, category: 'general', academic_year: null, semester: null, week_no: null, owner_employee_id: null } })
    expect(w.find('[data-test="section-advanced"] .form-section__header').attributes('aria-expanded')).toBe('false')
  })

  it('收合摘要顯示已設定幾項（分類、學年、學期、週次、負責人各算一項）', async () => {
    const w = mountDialog({ mode: 'edit', initial: IMPORTED })
    // 展開狀態下摘要不顯示在標頭外觀，但仍存在於標頭；收合後可見
    await w.find('[data-test="section-advanced"] .form-section__header').trigger('click')
    expect(w.find('[data-test="section-advanced"] [data-test="section-summary"]').text()).toBe('已設定 5 項')
  })
})

describe('條件顯示', () => {
  it('全天事件（預設）不顯示開始／結束時間；取消全天才出現', async () => {
    const w = mountDialog()
    expect(w.find('[data-test="start-time-item"]').exists()).toBe(false)
    expect(w.find('[data-test="end-time-item"]').exists()).toBe(false)

    await w.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(w.find('[data-test="start-time-item"]').exists()).toBe(true)
    expect(w.find('[data-test="end-time-item"]').exists()).toBe(true)
  })

  it('可見範圍＝家長 → 顯示警示；改成教職員 → 警示換成範圍說明（不外露 Portal 等內部名詞）', async () => {
    const w = mountDialog()
    expect(w.find('[data-test="parent-visibility-warning"]').exists()).toBe(true)

    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'staff')
    await flushPromises()
    expect(w.find('[data-test="parent-visibility-warning"]').exists()).toBe(false)
    expect(w.find('.visibility-hint').text()).toBe('管理端＋教師端可見')
    expect(w.text()).not.toContain('Portal')
  })

  it('類型選單不含官方同步專用的「國定假日」「補班日」', () => {
    const w = mountDialog()
    const typeItem = formItem(w, '類型')!
    const labels = typeItem.findAll('.opt').map((o) => o.text())
    expect(labels).toEqual(['會議', '活動', '一般'])
  })
})

describe('負責人下拉', () => {
  it('員工名單沒載到但事件已有負責人 → 仍顯示姓名，不外露員工 id', () => {
    const w = mountDialog({ mode: 'edit', initial: IMPORTED, employees: [], ownerName: '王老師' })
    const opt = formItem(w, '負責人')!.find('.opt[data-value="9"]')
    expect(opt.exists()).toBe(true)
    expect(opt.text()).toBe('王老師')
  })

  it('員工名單載入失敗 → 明確提示，而不是下拉靜默變空', () => {
    const w = mountDialog({ employeesError: true })
    expect(w.find('[data-test="employees-error"]').exists()).toBe(true)
  })

  it('有員工名單時顯示「姓名（工號）」', () => {
    const w = mountDialog({ employees: [{ id: 9, name: '王老師', employee_id: 'E009' }] })
    expect(formItem(w, '負責人')!.find('.opt[data-value="9"]').text()).toBe('王老師（E009）')
  })
})

describe('送出內容（契約鎖定：與改版前 saveEvent 逐字相同）', () => {
  const fill = async (w: VueWrapper, title: string, date: string) => {
    await formItem(w, '標題')!.find('input').setValue(title)
    await formItem(w, '開始日期')!.find('.dp-stub').setValue(date)
  }
  const submit = async (w: VueWrapper) => {
    await w.find('[data-test="form-dialog-submit"]').trigger('click')
    await flushPromises()
  }

  it('新增：只填標題與日期 → 其餘欄位為改版前的預設值與 null', async () => {
    const w = mountDialog()
    await fill(w, '期末教學會議', '2026-07-10')
    await submit(w)

    expect(w.emitted('submit')).toHaveLength(1)
    expect(w.emitted('submit')![0][0]).toEqual({
      title: '期末教學會議',
      description: null,
      event_date: '2026-07-10',
      end_date: null,
      event_type: 'general',
      is_all_day: true,
      start_time: null,
      end_time: null,
      location: null,
      recurrence_rule: null,
      visibility: 'parent',
      category: 'general',
      academic_year: null,
      semester: null,
      week_no: null,
      owner_employee_id: null,
    })
  })

  it('非全天：帶出開始／結束時間；全天：即使表單殘留時間也送 null', async () => {
    const w = mountDialog()
    await fill(w, '家長座談', '2026-07-10')
    const sw = w.findComponent({ name: 'ElSwitch' })
    await sw.vm.$emit('update:modelValue', false)
    await flushPromises()
    await formItem(w, '開始時間')!.find('.tp-stub').setValue('09:00')
    await formItem(w, '結束時間')!.find('.tp-stub').setValue('10:30')
    await submit(w)
    expect(w.emitted('submit')![0][0]).toMatchObject({ is_all_day: false, start_time: '09:00', end_time: '10:30' })

    await sw.vm.$emit('update:modelValue', true)
    await flushPromises()
    await submit(w)
    expect(w.emitted('submit')![1][0]).toMatchObject({ is_all_day: true, start_time: null, end_time: null })
  })

  it('編輯：載入完整資料後原樣送回（進階欄位不被打回預設值），且不含 id 與 requires_acknowledgment', async () => {
    const w = mountDialog({ mode: 'edit', initial: IMPORTED })
    await submit(w)
    const payload = w.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload).toEqual({
      title: '主教會議',
      description: null,
      event_date: '2026-07-10',
      end_date: null,
      event_type: 'meeting',
      is_all_day: true,
      start_time: null,
      end_time: null,
      location: null,
      recurrence_rule: null,
      visibility: 'staff',
      category: 'teaching',
      academic_year: 115,
      semester: 'first',
      week_no: 3,
      owner_employee_id: 9,
    })
    expect('id' in payload).toBe(false)
    expect('requires_acknowledgment' in payload).toBe(false)
  })

  it('最後防線：結束日期早於開始日期 → 不送出並提示（不靠 el-form 的驗證結果）', async () => {
    const w = mountDialog()
    await fill(w, '營隊', '2026-07-10')
    await formItem(w, '結束日期')!.find('.dp-stub').setValue('2026-07-09')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(msg.warning).toHaveBeenCalledWith('結束日期不可早於開始日期')
  })

  it('最後防線：標題只有空白 → 不送出並提示', async () => {
    const w = mountDialog()
    await fill(w, '   ', '2026-07-10')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(msg.warning).toHaveBeenCalledWith('請輸入標題')
  })
})

describe('未儲存保護與重新開啟', () => {
  it('剛開啟不是 dirty；改了標題才是 dirty', async () => {
    const w = mountDialog()
    expect(w.findComponent(FormDialog).props('dirty')).toBe(false)
    await formItem(w, '標題')!.find('input').setValue('新標題')
    expect(w.findComponent(FormDialog).props('dirty')).toBe(true)
  })

  it('關閉後以另一筆資料重新開啟 → 表單換成新資料且回到非 dirty', async () => {
    const w = mountDialog({ modelValue: false, initial: IMPORTED, mode: 'edit' })
    await w.setProps({ modelValue: true })
    expect((formItem(w, '標題')!.find('input').element as HTMLInputElement).value).toBe('主教會議')

    await w.setProps({ modelValue: false })
    await w.setProps({ initial: { ...createEmptyEventForm(), event_date: '2026-08-01' }, mode: 'create' })
    await w.setProps({ modelValue: true })
    expect((formItem(w, '標題')!.find('input').element as HTMLInputElement).value).toBe('')
    expect((formItem(w, '開始日期')!.find('.dp-stub').element as HTMLInputElement).value).toBe('2026-08-01')
    expect(w.findComponent(FormDialog).props('dirty')).toBe(false)
  })

  it('主鈕文案：新增＝「新增事件」、編輯＝「儲存」；儲存中主鈕 loading', () => {
    expect(mountDialog().find('[data-test="form-dialog-submit"]').text()).toBe('新增事件')
    const edit = mountDialog({ mode: 'edit', initial: IMPORTED, saving: true })
    expect(edit.find('[data-test="form-dialog-submit"]').text()).toBe('儲存')
    expect(edit.find('[data-test="form-dialog-submit"]').classes()).toContain('is-loading')
  })
})
