import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import EnrollmentRosterDialog from '../EnrollmentRosterDialog.vue'

const getEnrollmentOptionsMock = vi.fn()
const getEnrollmentRosterMock = vi.fn()
const getEnrollmentRosterPdfMock = vi.fn()
vi.mock('@/api/studentEnrollment', () => ({
  getEnrollmentOptions: (...args: unknown[]) => getEnrollmentOptionsMock(...args),
  getEnrollmentRoster: (...args: unknown[]) => getEnrollmentRosterMock(...args),
  getEnrollmentRosterPdf: (...args: unknown[]) => getEnrollmentRosterPdfMock(...args),
}))

// 全域學期 store：dialog 只能「讀」，任何寫入（setTerm）都會連動班級管理頁的學期
const setTermSpy = vi.fn()
const termStoreState = { school_year: 114, semester: 2, setTerm: setTermSpy }
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => termStoreState,
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: ref(false) }),
}))

const downloadFileMock = vi.fn()
vi.mock('@/utils/download', () => ({
  downloadFile: (...args: unknown[]) => downloadFileMock(...args),
}))

// 模擬 openPdfInNewTab：直接呼叫 fetchBlob，讓測試能觀察 PDF 請求的學期參數
vi.mock('@/utils/printPdfWindow', () => ({
  openPdfInNewTab: async ({ fetchBlob }: { fetchBlob: () => Promise<unknown> }) => {
    await fetchBlob()
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }
})

const TERM_OPTIONS = [
  { school_year: 115, semester: 1, label: '115學年度 上學期' },
  { school_year: 114, semester: 2, label: '114學年度 下學期' },
  { school_year: 114, semester: 1, label: '114學年度 上學期' },
  { school_year: 113, semester: 2, label: '113學年度 下學期' },
]

const emptyRoster = (school_year: number, semester: number) => ({
  school_year,
  semester,
  generated_date: '1141008',
  classes: [],
  grade_summaries: [],
  grand_total: 0,
  old_grand_total: 0,
  new_grand_total: 0,
  staff_by_role: {},
})

// el-dialog 以 stub 取代：掛載即視為開啟（發 open），並把 title 渲染出來供斷言；
// el-select 以原生 select 取代，行為對齊真實元件——使用者選取時先 update:modelValue 再 change。
const STUBS = {
  'el-dialog': {
    name: 'ElDialogStub',
    props: ['modelValue', 'title'],
    emits: ['open', 'update:modelValue'],
    mounted() {
      this.$emit('open')
    },
    template: '<div class="dialog-stub"><h2 class="dialog-title">{{ title }}</h2><slot /></div>',
  },
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)"><slot /></select>',
  },
  'el-option': {
    props: ['label', 'value'],
    template: '<option :value="value">{{ label }}</option>',
  },
  'el-input': true,
  'el-button': { template: '<button type="button"><slot /></button>' },
  'el-empty': true,
  EnrollmentRosterTable: true,
}

const mountDialog = () =>
  mount(EnrollmentRosterDialog, {
    props: { visible: true },
    global: {
      stubs: STUBS,
      directives: { loading: {} },
    },
  })

const termSelect = (w: ReturnType<typeof mountDialog>) =>
  w.find('select[placeholder="選擇學年學期"]')

beforeEach(() => {
  vi.clearAllMocks()
  termStoreState.school_year = 114
  termStoreState.semester = 2
  getEnrollmentOptionsMock.mockResolvedValue({ data: TERM_OPTIONS })
  getEnrollmentRosterMock.mockImplementation(async (params: { school_year: number; semester: number }) => ({
    data: emptyRoster(params.school_year, params.semester),
  }))
  getEnrollmentRosterPdfMock.mockResolvedValue({ data: new Blob() })
  downloadFileMock.mockResolvedValue(undefined)
})

describe('EnrollmentRosterDialog', () => {
  it('對話框標題為「在籍記錄表」', async () => {
    const w = mountDialog()
    await flushPromises()
    expect(w.find('.dialog-title').text()).toBe('在籍記錄表')
  })

  it('開啟時以全域學期為初值載入名冊', async () => {
    mountDialog()
    await flushPromises()
    expect(getEnrollmentRosterMock).toHaveBeenCalledTimes(1)
    expect(getEnrollmentRosterMock).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
  })

  it('學期選單旁有說明：只套用在這張表、不改變班級管理頁學期', async () => {
    const w = mountDialog()
    await flushPromises()
    const hint = w.find('.form-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('只套用在這張表，不會改變班級管理頁的學期')
  })

  it('改學期 → 以新學期重抓名冊，且不寫回全域學期 store', async () => {
    const w = mountDialog()
    await flushPromises()
    getEnrollmentRosterMock.mockClear()

    await termSelect(w).setValue('113-2')
    await flushPromises()

    expect(getEnrollmentRosterMock).toHaveBeenCalledTimes(1)
    expect(getEnrollmentRosterMock).toHaveBeenLastCalledWith({ school_year: 113, semester: 2 })
    expect(setTermSpy).not.toHaveBeenCalled()
    expect(termStoreState.school_year).toBe(114)
    expect(termStoreState.semester).toBe(2)
  })

  it('匯出 Excel 與列印 PDF 都使用本地選的學期', async () => {
    const w = mountDialog()
    await flushPromises()
    await termSelect(w).setValue('114-1')
    await flushPromises()

    const buttons = w.findAll('button')
    const excelBtn = buttons.find(b => b.text().includes('匯出 Excel'))
    const printBtn = buttons.find(b => b.text().includes('列印'))
    expect(excelBtn).toBeTruthy()
    expect(printBtn).toBeTruthy()

    await excelBtn!.trigger('click')
    await flushPromises()
    expect(downloadFileMock).toHaveBeenCalledWith(
      '/student-enrollment/roster.xlsx',
      expect.any(String),
      { school_year: 114, semester: 1 },
    )

    await printBtn!.trigger('click')
    await flushPromises()
    expect(getEnrollmentRosterPdfMock).toHaveBeenLastCalledWith({ school_year: 114, semester: 1 })
    expect(setTermSpy).not.toHaveBeenCalled()
  })

  it('再次開啟時重新從全域學期取初值（本地選擇不殘留）', async () => {
    const w = mountDialog()
    await flushPromises()
    await termSelect(w).setValue('113-2')
    await flushPromises()
    getEnrollmentRosterMock.mockClear()

    // 班級管理頁切到別的學期後再開啟統計表
    termStoreState.school_year = 115
    termStoreState.semester = 1
    w.findComponent({ name: 'ElDialogStub' }).vm.$emit('open')
    await flushPromises()

    expect(getEnrollmentRosterMock).toHaveBeenCalledTimes(1)
    expect(getEnrollmentRosterMock).toHaveBeenLastCalledWith({ school_year: 115, semester: 1 })
    expect((termSelect(w).element as HTMLSelectElement).value).toBe('115-1')
    expect(setTermSpy).not.toHaveBeenCalled()
  })
})
