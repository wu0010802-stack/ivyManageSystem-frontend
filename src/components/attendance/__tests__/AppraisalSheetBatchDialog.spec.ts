import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AppraisalSheetBatchDialog from '../AppraisalSheetBatchDialog.vue'

const api = vi.hoisted(() => ({ candidates: vi.fn(), pdf: vi.fn() }))
vi.mock('@/api/attendance', () => ({
  getAppraisalSheetCandidates: api.candidates,
  getAppraisalSheetsPdf: api.pdf,
}))
const printWindow = vi.hoisted(() => ({ openPdfInNewTab: vi.fn() }))
vi.mock('@/utils/printPdfWindow', () => ({ openPdfInNewTab: printWindow.openPdfInNewTab }))
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message }))

type OpenArgs = {
  fetchBlob?: () => Promise<Blob>
  loadingText?: string
  onError?: (err: unknown) => void
}

const fakeWindow = {} as Window

/** 2 組 3 人：甲班（1、2）、乙班（3）；員工 id 刻意不照字典序，驗證「依名單顯示順序」 */
const GROUPS = [
  {
    key: 'c1', label: '甲班',
    employees: [
      { employee_id: 1, name: '王小明', title_name: '教師', role_label: '班導' },
      { employee_id: 2, name: '李小華', title_name: '教師', role_label: '副班導' },
    ],
  },
  {
    key: 'c2', label: '乙班',
    employees: [{ employee_id: 3, name: '陳美玲', title_name: '園長', role_label: null }],
  },
]

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(AppraisalSheetBatchDialog, {
    props: { modelValue: true, year: 2026, month: 9, ...props },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          name: 'ElDialog',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>',
        },
      },
    },
  })
}

const groupBox = (w: VueWrapper, key: string) => w.get(`[data-test="appraisal-group-${key}"]`)
const groupInput = (w: VueWrapper, key: string) => groupBox(w, key).get('input[type="checkbox"]')
// Element Plus 的「部分勾選」標記在內層 .el-checkbox__input，根節點同時設 aria-checked="mixed"
const isIndeterminate = (w: VueWrapper, key: string) =>
  groupBox(w, key).find('.el-checkbox__input.is-indeterminate').exists()
const empBox = (w: VueWrapper, id: number) => w.get(`[data-test="appraisal-emp-${id}"] input[type="checkbox"]`)
const generateBtn = (w: VueWrapper) => w.get('[data-test="appraisal-generate"]')
const countText = (w: VueWrapper) => w.get('[data-test="appraisal-count"]').text()

async function mountLoaded(props: Record<string, unknown> = {}) {
  const wrapper = mountDialog(props)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  api.candidates.mockResolvedValue({ data: { groups: GROUPS } })
  api.pdf.mockResolvedValue({ data: new Blob(['pdf']) })
  // 預設行為：照真實 helper 的順序——先同步開視窗，再 await fetchBlob，成功回 window
  printWindow.openPdfInNewTab.mockImplementation(async ({ fetchBlob }: OpenArgs) => {
    await fetchBlob?.()
    return fakeWindow
  })
})

describe('AppraisalSheetBatchDialog', () => {
  it('開啟時以年月載入候選名單，依班級分組列出每位員工', async () => {
    const wrapper = await mountLoaded()
    expect(api.candidates).toHaveBeenCalledWith({ year: 2026, month: 9 })
    expect(wrapper.get('[data-test="appraisal-group-c1"]').text()).toContain('甲班')
    expect(wrapper.get('[data-test="appraisal-emp-1"]').text()).toContain('王小明')
    expect(wrapper.get('[data-test="appraisal-emp-1"]').text()).toContain('班導')
    expect(wrapper.get('[data-test="appraisal-emp-2"]').text()).toContain('副班導')
    // 沒有班別角色的人退回顯示職稱
    expect(wrapper.get('[data-test="appraisal-emp-3"]').text()).toContain('園長')
    expect(wrapper.get('[data-test="appraisal-group-c2"]').text()).toContain('乙班')
  })

  it('開啟後預設全選', async () => {
    const wrapper = await mountLoaded()
    expect(countText(wrapper)).toBe('已選 3 人')
    for (const id of [1, 2, 3]) {
      expect((empBox(wrapper, id).element as HTMLInputElement).checked).toBe(true)
    }
    expect((groupInput(wrapper, 'c1').element as HTMLInputElement).checked).toBe(true)
    expect(isIndeterminate(wrapper, 'c1')).toBe(false)
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('取消整組勾選只影響該組', async () => {
    const wrapper = await mountLoaded()
    await groupInput(wrapper, 'c1').setValue(false)
    expect(countText(wrapper)).toBe('已選 1 人')
    expect((empBox(wrapper, 1).element as HTMLInputElement).checked).toBe(false)
    expect((empBox(wrapper, 2).element as HTMLInputElement).checked).toBe(false)
    expect((empBox(wrapper, 3).element as HTMLInputElement).checked).toBe(true)
    expect((groupInput(wrapper, 'c1').element as HTMLInputElement).checked).toBe(false)
    expect(isIndeterminate(wrapper, 'c1')).toBe(false)
    expect(groupBox(wrapper, 'c1').classes()).not.toContain('is-checked')
    // 另一組仍是全勾
    expect((groupInput(wrapper, 'c2').element as HTMLInputElement).checked).toBe(true)
  })

  it('組內只取消一人時，該組為部分勾選（indeterminate）', async () => {
    const wrapper = await mountLoaded()
    await empBox(wrapper, 2).setValue(false)
    expect(countText(wrapper)).toBe('已選 2 人')
    expect(isIndeterminate(wrapper, 'c1')).toBe(true)
    expect(groupBox(wrapper, 'c1').attributes('aria-checked')).toBe('mixed')
    expect((groupInput(wrapper, 'c1').element as HTMLInputElement).checked).toBe(false)
    // 部分勾選的組標題再按一次＝整組勾回來
    await groupInput(wrapper, 'c1').setValue(true)
    expect(countText(wrapper)).toBe('已選 3 人')
    expect(isIndeterminate(wrapper, 'c1')).toBe(false)
  })

  it('全選 checkbox 可一次全不選／全選', async () => {
    const wrapper = await mountLoaded()
    const all = wrapper.get('[data-test="appraisal-select-all"] input[type="checkbox"]')
    await all.setValue(false)
    expect(countText(wrapper)).toBe('已選 0 人')
    await all.setValue(true)
    expect(countText(wrapper)).toBe('已選 3 人')
  })

  it('0 人時產生按鈕 disabled，且不會呼叫產生', async () => {
    const wrapper = await mountLoaded()
    await wrapper.get('[data-test="appraisal-select-all"] input[type="checkbox"]').setValue(false)
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    await generateBtn(wrapper).trigger('click')
    expect(printWindow.openPdfInNewTab).not.toHaveBeenCalled()
  })

  it('產生 PDF 以名單順序帶 employee_ids', async () => {
    const wrapper = await mountLoaded()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(printWindow.openPdfInNewTab).toHaveBeenCalledTimes(1)
    expect(api.pdf).toHaveBeenCalledWith({ year: 2026, month: 9, employee_ids: [1, 2, 3] })
    expect(printWindow.openPdfInNewTab.mock.calls[0][0].loadingText).toBe('考核表產生中…')
  })

  it('只帶有勾選的人，且保持名單顯示順序', async () => {
    const wrapper = await mountLoaded()
    await empBox(wrapper, 2).setValue(false)
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(api.pdf).toHaveBeenCalledWith({ year: 2026, month: 9, employee_ids: [1, 3] })
  })

  it('點擊當下就同步呼叫 openPdfInNewTab（否則瀏覽器會擋彈出視窗）', async () => {
    const wrapper = await mountLoaded()
    ;(generateBtn(wrapper).element as HTMLButtonElement).click()
    // 不 await 任何東西：同一個 tick 內必須已呼叫
    expect(printWindow.openPdfInNewTab).toHaveBeenCalledTimes(1)
    await flushPromises()
  })

  it('成功開出視窗後關閉對話框', async () => {
    const wrapper = await mountLoaded()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('視窗被擋（回 null）時對話框不關閉，保留勾選供重試', async () => {
    printWindow.openPdfInNewTab.mockResolvedValue(null)
    const wrapper = await mountLoaded()
    await empBox(wrapper, 3).setValue(false)
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(countText(wrapper)).toBe('已選 2 人')
    // 產生結束後按鈕恢復可按
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('產生失敗走 onError，用 apiError 顯示後端訊息並保留對話框', async () => {
    printWindow.openPdfInNewTab.mockImplementation(async ({ onError }: OpenArgs) => {
      onError?.({ response: { data: { detail: '沒有權限' } } })
      return null
    })
    const wrapper = await mountLoaded()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(message.error).toHaveBeenCalledTimes(1)
    expect(String(message.error.mock.calls[0][0])).toContain('沒有權限')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  describe('人數多時的提示與逾時（Ruling 14）', () => {
    const LARGE_HINT = '人數較多時產生需要較久（約 1 分鐘內）；若逾時請分班列印。'
    const TIMEOUT_MESSAGE = '產生逾時，請減少人數（例如分班）後再試'
    /** 一組 31 人（id 101–131） */
    const BIG_GROUPS = [
      {
        key: 'big', label: '大班',
        employees: Array.from({ length: 31 }, (_, i) => ({
          employee_id: 101 + i, name: `老師${i + 1}`, title_name: '教師', role_label: null,
        })),
      },
    ]
    const hint = (w: VueWrapper) => w.find('[data-test="appraisal-large-hint"]')

    it('勾選超過 30 人時在人數下方提示可能較久、逾時請分班', async () => {
      api.candidates.mockResolvedValue({ data: { groups: BIG_GROUPS } })
      const wrapper = await mountLoaded()
      expect(countText(wrapper)).toBe('已選 31 人')
      expect(hint(wrapper).exists()).toBe(true)
      expect(hint(wrapper).text()).toBe(LARGE_HINT)
      // 剛好 30 人不提示
      await empBox(wrapper, 101).setValue(false)
      expect(countText(wrapper)).toBe('已選 30 人')
      expect(hint(wrapper).exists()).toBe(false)
    })

    it('30 人以下不提示', async () => {
      const wrapper = await mountLoaded()
      expect(hint(wrapper).exists()).toBe(false)
    })

    it.each([
      ['axios 逾時（ECONNABORTED）', { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 60000ms exceeded', displayMessage: '伺服器回應逾時，請稍後再試' }],
      ['nginx 504', { isAxiosError: true, response: { status: 504, data: {} }, displayMessage: '服務暫時無法使用，請稍後再試。若持續發生請聯絡園所' }],
    ])('%s：改顯示「減少人數（例如分班）」的具體建議', async (_label, err) => {
      printWindow.openPdfInNewTab.mockImplementation(async ({ onError }: OpenArgs) => {
        onError?.(err)
        return null
      })
      const wrapper = await mountLoaded()
      await generateBtn(wrapper).trigger('click')
      await flushPromises()
      expect(message.error).toHaveBeenCalledTimes(1)
      expect(message.error).toHaveBeenCalledWith(TIMEOUT_MESSAGE)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  it('產生中顯示 loading 並擋住重複點擊', async () => {
    let release: (w: Window | null) => void = () => {}
    printWindow.openPdfInNewTab.mockImplementation(() => new Promise<Window | null>((res) => { release = res }))
    const wrapper = await mountLoaded()
    await generateBtn(wrapper).trigger('click')
    await generateBtn(wrapper).trigger('click')
    expect(printWindow.openPdfInNewTab).toHaveBeenCalledTimes(1)
    expect(generateBtn(wrapper).classes()).toContain('is-loading')
    release(fakeWindow)
    await flushPromises()
    expect(generateBtn(wrapper).classes()).not.toContain('is-loading')
  })

  it('名單載入失敗顯示錯誤與重試，期間不可產生；重試成功後恢復', async () => {
    api.candidates.mockRejectedValueOnce({ response: { data: { detail: '載入失敗了' } } })
    const wrapper = await mountLoaded()
    expect(wrapper.get('[data-test="appraisal-load-error"]').text()).toContain('載入失敗了')
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="appraisal-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="appraisal-load-error"]').exists()).toBe(false)
    expect(countText(wrapper)).toBe('已選 3 人')
  })

  it('當月沒有可列印的員工時顯示空狀態，產生按鈕 disabled', async () => {
    api.candidates.mockResolvedValue({ data: { groups: [] } })
    const wrapper = await mountLoaded()
    expect(wrapper.get('[data-test="appraisal-empty"]').text()).toContain('9 月沒有可列印的教職員')
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
  })

  it('每次重新開啟都重新載入並回到預設全勾', async () => {
    const wrapper = await mountLoaded()
    await groupInput(wrapper, 'c1').setValue(false)
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(api.candidates).toHaveBeenCalledTimes(2)
    expect(countText(wrapper)).toBe('已選 3 人')
  })

  it('對話框關閉時不載入名單', async () => {
    mountDialog({ modelValue: false })
    await flushPromises()
    expect(api.candidates).not.toHaveBeenCalled()
  })

  it('舊請求晚於新請求回來時不覆蓋（換月份）', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    api.candidates
      .mockImplementationOnce(() => new Promise((res) => { resolveOld = res }))
      .mockResolvedValueOnce({ data: { groups: [GROUPS[1]] } })
    const wrapper = mountDialog()
    await wrapper.setProps({ month: 10 })
    await flushPromises()
    expect(countText(wrapper)).toBe('已選 1 人')
    resolveOld({ data: { groups: GROUPS } })
    await flushPromises()
    expect(countText(wrapper)).toBe('已選 1 人')
  })

  it('按取消關閉對話框', async () => {
    const wrapper = await mountLoaded()
    await wrapper.get('[data-test="appraisal-cancel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
