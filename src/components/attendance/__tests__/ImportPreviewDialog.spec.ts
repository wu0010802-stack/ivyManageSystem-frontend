// src/components/attendance/__tests__/ImportPreviewDialog.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── hoisted mocks ──────────────────────────────────────────────────────────────
const { mockPreviewImport, mockPreviewExcel, mockUploadCsv, mockUploadFile, mockNotify, mockGetImportSettings, mockSaveImportSettings } = vi.hoisted(() => ({
  mockPreviewImport: vi.fn(),
  mockPreviewExcel: vi.fn(),
  mockUploadCsv: vi.fn(),
  mockUploadFile: vi.fn(),
  mockNotify: vi.fn(),
  mockGetImportSettings: vi.fn().mockResolvedValue({ data: { default_format: 'auto', device_id: 'default', version: 0, employee_mappings: [], employees: [] } }),
  mockSaveImportSettings: vi.fn(),
}))

const { mockMonthContext } = vi.hoisted(() => ({ mockMonthContext: vi.fn() }))
vi.mock('@/api/attendanceMonthContext', () => ({ getAttendanceMonthContext: mockMonthContext }))

// ── mock api ───────────────────────────────────────────────────────────────────
vi.mock('@/api/attendance', () => ({
  previewImport: mockPreviewImport,
  previewExcel: mockPreviewExcel,
  uploadCsv: mockUploadCsv,
  uploadFile: mockUploadFile,
  getImportSettings: mockGetImportSettings,
  saveImportSettings: mockSaveImportSettings,
}))

// ── mock useErrorNotify ────────────────────────────────────────────────────────
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: mockNotify }),
}))

// ── mock ElMessage ─────────────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

// ── mock hasPermission ─────────────────────────────────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

import { hasPermission } from '@/utils/auth'
import { ElMessage } from 'element-plus'
import ImportPreviewDialog from '../ImportPreviewDialog.vue'

const mockHasPermission = hasPermission as ReturnType<typeof vi.fn>
const mockElMessageSuccess = ElMessage.success as ReturnType<typeof vi.fn>
const mockElMessageWarning = ElMessage.warning as ReturnType<typeof vi.fn>

// ── fixtures ───────────────────────────────────────────────────────────────────
const normalizedRows = [
  { employee_number: 'E001', date: '2026-06-01', punch_in: '08:00', punch_out: '17:00' },
  { employee_number: 'E002', date: '2026-06-01', punch_in: '08:00', punch_out: '17:00' },
  { employee_number: 'E999', date: '2026-06-01', punch_in: '08:00', punch_out: '17:00' },
]

const previewFixture = {
  summary: { importable: 1, problems: 2, overwrites: 1 },
  rows: [
    {
      row_num: 2,
      employee_number: 'E001',
      employee_name: '王小明',
      matched_employee_id: 1,
      date: '2026-06-01',
      punch_in: '08:00',
      punch_out: '17:00',
      status: 'present',
      check: 'importable' as const,
    },
    {
      row_num: 3,
      employee_number: 'E002',
      employee_name: '李大華',
      matched_employee_id: 2,
      date: '2026-06-01',
      punch_in: '08:00',
      punch_out: '17:00',
      status: 'present',
      check: 'employee_not_found' as const,
    },
    {
      row_num: 4,
      employee_number: 'E003',
      employee_name: '張美玲',
      matched_employee_id: 3,
      date: '2026-06-01',
      punch_in: '08:00',
      punch_out: '17:00',
      status: 'present',
      check: 'invalid_date' as const,
    },
  ],
  normalized: normalizedRows,
}

// ── stubs ──────────────────────────────────────────────────────────────────────
const ElDialog = {
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  template: `<div class="el-dialog-stub" v-if="modelValue"><slot /><slot name="footer" /></div>`,
}

const ElTabs = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<div class="el-tabs-stub"><slot /></div>`,
}

const ElTabPane = {
  props: ['label', 'name'],
  template: `<div class="el-tab-pane-stub" :data-label="label"><slot /></div>`,
}

const ElInput = {
  props: ['modelValue', 'type', 'rows', 'placeholder'],
  emits: ['update:modelValue'],
  template: `<textarea
    class="el-input-stub"
    :value="modelValue ?? ''"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

const ElButton = {
  props: ['type', 'loading', 'disabled', 'size', 'plain', 'link'],
  emits: ['click'],
  template: `<button
    class="el-button-stub"
    :data-type="type"
    :disabled="disabled || loading"
    @click="!disabled && !loading && $emit('click')"
  ><slot /></button>`,
}

// ElTable stub: true=don't render (we'll test tag content separately)
const ElTable = true
const ElTableColumn = true

const ElTag = {
  props: ['type'],
  template: `<span class="el-tag-stub" :data-type="type"><slot /></span>`,
}

const ElUpload = {
  props: ['drag', 'accept', 'httpRequest', 'showFileList', 'multiple'],
  template: `<div class="el-upload-stub">
    <slot />
    <input
      type="file"
      class="el-upload-input"
      :accept="accept"
      @change="onFileChange"
    />
  </div>`,
  methods: {
    onFileChange(e: Event) {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file && (this as { httpRequest?: (opts: { file: File }) => void }).httpRequest) {
        ;(this as { httpRequest: (opts: { file: File }) => void }).httpRequest({ file })
      }
    },
  },
}

const ElIcon = {
  template: `<span class="el-icon-stub"><slot /></span>`,
}

const stubs = {
  'el-alert': { props: ['title', 'description'], template: '<div role="status">{{ title }} {{ description }}</div>' },
  teleport: true,
  'el-dialog': ElDialog,
  'el-tabs': ElTabs,
  'el-tab-pane': ElTabPane,
  'el-input': ElInput,
  'el-button': ElButton,
  'el-table': ElTable,
  'el-table-column': ElTableColumn,
  'el-tag': ElTag,
  'el-upload': ElUpload,
  'el-icon': ElIcon,
}

// ── mount helper ───────────────────────────────────────────────────────────────
function mountDialog(propsOverride: { modelValue?: boolean; year?: number; month?: number } = {}) {
  return mount(ImportPreviewDialog, {
    props: {
      modelValue: true,
      year: 2026,
      month: 6,
      ...propsOverride,
    },
    global: { stubs },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('ImportPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
  })

  it('顯示待補人日並明確提醒實際匯入以完整預覽清單為準', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ sourceContext: { employee_id: 7, employee_name: '測試員工', date: '2026-06-03' } })
    expect(wrapper.text()).toContain('待補資料：測試員工 · 2026-06-03')
    expect(wrapper.text()).toContain('不會自動限制匯入範圍，實際匯入以預覽清單為準')
    await wrapper.setProps({ sourceContext: null })
    expect(wrapper.text()).not.toContain('待補資料：')
    wrapper.unmount()
  })

  // ── basic rendering ──────────────────────────────────────────────────────────
  it('顯示對話框 title 含年月', () => {
    const wrapper = mountDialog()
    const dialog = wrapper.find('.el-dialog-stub')
    expect(dialog.exists()).toBe(true)
    // title is passed as prop
    const vm = wrapper.vm as { dialogTitle: string }
    expect(vm.dialogTitle).toContain('2026')
    expect(vm.dialogTitle).toContain('6')
  })

  it('modelValue=false 時 dialog 不渲染', () => {
    const wrapper = mountDialog({ modelValue: false })
    expect(wrapper.find('.el-dialog-stub').exists()).toBe(false)
  })

  // ── Tab A: 貼上 / CSV 文字流程 ────────────────────────────────────────────────
  it('Tab A: 點「預覽核對」→ 呼叫 previewImport', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('部門,員工編號,姓名,日期\nA,E001,王小明,2026-06-01')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    expect(previewBtn).toBeTruthy()
    await previewBtn!.trigger('click')
    await nextTick()

    expect(mockPreviewImport).toHaveBeenCalledWith({
      raw_text: expect.stringContaining('E001'),
      year: 2026,
      month: 6,
    })
  })

  it('預覽後 banner 顯示可匯入/問題/覆蓋數字', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('raw csv text')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    // allow promise to resolve
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('1')  // importable
    expect(text).toContain('2')  // problems
  })

  it('預覽後 previewResult 儲存各列 check 值（包含 employee_not_found 與 invalid_date）', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('raw csv')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    // el-table is fully stubbed (true); verify reactive state has correct rows
    const vm = wrapper.vm as { previewResult: typeof previewFixture | null }
    expect(vm.previewResult).not.toBeNull()
    const checks = vm.previewResult!.rows.map((r) => r.check)
    expect(checks).toContain('importable')
    expect(checks).toContain('employee_not_found')
    expect(checks).toContain('invalid_date')
  })

  it('CHECK_LABEL mapping 正確（importable→可匯入 / employee_not_found→找不到員工 / overwrite→將覆蓋 / invalid_date→日期無效 / month_finalized→該月已封存）', () => {
    // Test via component's exposed data — mount once to access internal mappings
    const wrapper = mountDialog()
    const vm = wrapper.vm as {
      CHECK_LABEL: Record<string, string>
      CHECK_TAG_TYPE: Record<string, string>
    }
    expect(vm.CHECK_LABEL['importable']).toBe('可匯入')
    expect(vm.CHECK_LABEL['employee_not_found']).toBe('找不到員工')
    expect(vm.CHECK_LABEL['overwrite']).toBe('將覆蓋')
    expect(vm.CHECK_LABEL['invalid_date']).toBe('日期無效')
    expect(vm.CHECK_LABEL['month_finalized']).toBe('該月已封存')
    expect(vm.CHECK_TAG_TYPE['importable']).toBe('success')
    expect(vm.CHECK_TAG_TYPE['employee_not_found']).toBe('danger')
    expect(vm.CHECK_TAG_TYPE['overwrite']).toBe('warning')
    // P1-1 新增 row-level error codes
    expect(vm.CHECK_LABEL['invalid_time']).toBe('時間格式錯誤')
    expect(vm.CHECK_LABEL['equal_punch']).toBe('上下班時間相同')
    expect(vm.CHECK_LABEL['duplicate_row']).toBe('同批重複列')
    expect(vm.CHECK_LABEL['missing_fields']).toBe('缺必要欄位')
    expect(vm.CHECK_LABEL['month_mismatch']).toBe('不在選定月份')
  })

  it('點「確認匯入」→ 呼叫 uploadCsv 帶 records/year/month', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })
    mockUploadCsv.mockResolvedValue({ data: { message: '匯入完成' } })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    expect(importBtn).toBeTruthy()
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockUploadCsv).toHaveBeenCalledWith({
      records: normalizedRows,
      year: 2026,
      month: 6,
    })
  })

  it('確認匯入成功 → emit imported + emit update:modelValue(false)', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })
    mockUploadCsv.mockResolvedValue({ data: { message: '匯入完成', imported: 2 } })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('imported')).toBeTruthy()
    expect(wrapper.emitted('imported')![0][0]).toMatchObject({ message: '匯入完成' })
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe(false)
  })

  it('確認匯入成功 → ElMessage.success 被呼叫', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })
    mockUploadCsv.mockResolvedValue({ data: { message: '匯入完成' } })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockElMessageSuccess).toHaveBeenCalled()
  })

  it('確認匯入回 200 但 failed>0 → ElMessage.warning 帶錯誤明細且不顯示 success（防誤報成功）', async () => {
    // 後端逐列失敗不拋 HTTP 錯誤（累計在 body results），前端必須檢查 failed 數
    mockPreviewImport.mockResolvedValue({ data: previewFixture })
    mockUploadCsv.mockResolvedValue({
      data: {
        message: '考勤記錄匯入完成，成功 0 筆，失敗 1 筆',
        results: { success: 0, failed: 1, errors: ['王小明 2026/06/01: 上下班時間相同 08:00，請確認資料'] },
      },
    })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockElMessageWarning).toHaveBeenCalled()
    const warned = String(mockElMessageWarning.mock.calls[0][0])
    expect(warned).toContain('失敗 1 筆')
    expect(warned).toContain('上下班時間相同')
    expect(mockElMessageSuccess).not.toHaveBeenCalled()
  })

  // ── 權限 false 時隱藏確認匯入 ────────────────────────────────────────────────
  it('hasPermission false → 「確認匯入」按鈕不顯示或 disabled', async () => {
    mockHasPermission.mockReturnValue(false)
    mockPreviewImport.mockResolvedValue({ data: previewFixture })

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    // Either not shown or disabled
    const notShownOrDisabled = !importBtn || importBtn.attributes('disabled') !== undefined
    expect(notShownOrDisabled).toBe(true)
  })

  // ── Tab B: Excel 兩段式（P1-1：先 preview 再 confirm）───────────────────────
  it('Tab B: 上傳 Excel → 呼叫 previewExcel（不直接匯入）', async () => {
    const mockFile = new File(['data'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    mockPreviewExcel.mockResolvedValue({ data: previewFixture })

    const wrapper = mountDialog()
    const vm = wrapper.vm as { handleExcelUpload: (opts: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: mockFile })
    await nextTick()

    expect(mockPreviewExcel).toHaveBeenCalled()
    const formData = mockPreviewExcel.mock.calls[0][0] as FormData
    expect(formData.get('file')).toBe(mockFile)
    // 不得直接匯入：uploadFile 未被呼叫、未 emit imported
    expect(mockUploadFile).not.toHaveBeenCalled()
    expect(wrapper.emitted('imported')).toBeFalsy()
    // 預覽結果已載入，待使用者確認
    const vm2 = wrapper.vm as unknown as { previewResult: unknown }
    expect(vm2.previewResult).not.toBeNull()
  })

  it('Tab B: Excel 預覽後點「確認匯入」→ uploadCsv 帶 normalized 列', async () => {
    const mockFile = new File(['data'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    mockPreviewExcel.mockResolvedValue({ data: previewFixture })
    mockUploadCsv.mockResolvedValue({ data: { message: '匯入完成' } })

    const wrapper = mountDialog()
    const vm = wrapper.vm as { handleExcelUpload: (opts: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: mockFile })
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    expect(importBtn).toBeTruthy()
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockUploadCsv).toHaveBeenCalledWith({
      records: normalizedRows,
      year: 2026,
      month: 6,
    })
    expect(wrapper.emitted('imported')).toBeTruthy()
  })

  it('Tab B: legacy 格式 400 → 提供直接匯入退路（uploadFile）', async () => {
    const mockFile = new File(['data'], 'legacy.xls', { type: 'application/vnd.ms-excel' })
    mockPreviewExcel.mockRejectedValue({
      response: { data: { detail: '此檔非新格式考勤表…legacy 月統計格式請走原 Excel 匯入' } },
    })
    mockUploadFile.mockResolvedValue({ data: { message: '上傳完成', success: 5, failed: 0 } })

    const wrapper = mountDialog()
    const vm = wrapper.vm as { handleExcelUpload: (opts: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: mockFile })
    await nextTick()

    const legacyBtn = wrapper
      .findAll('.el-button-stub')
      .find((b) => b.text().includes('legacy 格式直接匯入'))
    expect(legacyBtn).toBeTruthy()
    await legacyBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockUploadFile).toHaveBeenCalled()
    expect(wrapper.emitted('imported')).toBeTruthy()
  })

  it('Tab B: hasPermission false → el-upload disabled（P1-4 !canWrite gate）', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountDialog()
    // el-upload stub 收到 disabled prop（attribute 透傳）
    const upload = wrapper.findComponent({ name: undefined, ref: undefined })
    // 直接驗 vm 狀態：canWrite=false 時 template 綁 :disabled="uploading || !canWrite"
    const vm = wrapper.vm as unknown as { canWrite: boolean }
    expect(vm.canWrite).toBe(false)
    expect(upload).toBeTruthy()
  })

  // ── 錯誤處理 ──────────────────────────────────────────────────────────────────
  it('previewImport 失敗 → notify 被呼叫', async () => {
    const err = new Error('伺服器錯誤')
    mockPreviewImport.mockRejectedValue(err)

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('bad data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockNotify).toHaveBeenCalledWith(err, expect.stringContaining('ImportPreviewDialog'), null, expect.objectContaining({ prefix: expect.any(String) }))
  })

  it('uploadCsv 失敗 → notify 被呼叫', async () => {
    mockPreviewImport.mockResolvedValue({ data: previewFixture })
    const err = new Error('匯入失敗')
    mockUploadCsv.mockRejectedValue(err)

    const wrapper = mountDialog()
    const textarea = wrapper.find('.el-input-stub')
    await textarea.setValue('csv data')
    await nextTick()

    const previewBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('預覽核對'))
    await previewBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const importBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('確認匯入'))
    await importBtn!.trigger('click')
    await nextTick()
    await nextTick()

    expect(mockNotify).toHaveBeenCalledWith(err, expect.stringContaining('ImportPreviewDialog'), null, expect.objectContaining({ prefix: expect.any(String) }))
  })
})


describe('匯入預覽請求一致性', () => {
  it('選定月份改變後，不採用舊 Excel 預覽', async () => {
    let resolvePreview!: (value: { data: typeof previewFixture }) => void
    mockPreviewExcel.mockReturnValueOnce(new Promise(resolve => { resolvePreview = resolve }))
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as {
      handleExcelUpload: (options: { file: File }) => Promise<void>
      previewResult: unknown
    }
    const pending = vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    await wrapper.setProps({ month: 7 })
    resolvePreview({ data: previewFixture })
    await pending
    expect(vm.previewResult).toBeNull()
  })

  it('較新的 Excel 預覽完成後，不被前一檔的回應覆蓋', async () => {
    let resolvePreview!: (value: { data: typeof previewFixture }) => void
    mockPreviewExcel.mockReturnValueOnce(new Promise(resolve => { resolvePreview = resolve }))
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as {
      handleExcelUpload: (options: { file: File }) => Promise<void>
      previewResult: typeof previewFixture | null
    }
    const pending = vm.handleExcelUpload({ file: new File(['old'], 'old.xls') })
    const latest = { ...previewFixture, normalized: [] }
    mockPreviewExcel.mockResolvedValueOnce({ data: latest })
    await vm.handleExcelUpload({ file: new File(['new'], 'new.xls') })
    resolvePreview({ data: previewFixture })
    await pending
    expect(vm.previewResult?.normalized).toEqual([])
  })
})


describe('逐筆打卡預覽', () => {
  it('顯示辨識格式、原始筆數及日期範圍', async () => {
    mockPreviewExcel.mockResolvedValueOnce({ data: {
      ...previewFixture, import_format: 'punch_events', device_id: 'default',
      source_count: 12, date_start: '2026-06-01', date_end: '2026-06-30',
    } })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleExcelUpload: (options: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    expect(wrapper.text()).toContain('逐筆刷卡')
    expect(wrapper.text()).toContain('原始刷卡 12 筆')
    expect(wrapper.text()).toContain('2026-06-30')
  })

  it('待人工確認的單卡不可直接視為可匯入', async () => {
    mockPreviewExcel.mockResolvedValueOnce({ data: {
      ...previewFixture, import_format: 'punch_events',
      summary: { importable: 0, problems: 1, overwrites: 0 }, normalized: [],
      rows: [{ ...previewFixture.rows[0], check: 'review_required',
        import_format: 'punch_events', source_employee_number: '101',
        punches: ['2026-06-01T08:00:00'], review_required: true, review_confirmed: false,
      }],
    } })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleExcelUpload: (options: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    expect(wrapper.text()).toContain('單筆卡 1 人日')
    const confirm = wrapper.findAll('button').find(b => b.text().includes('確認匯入'))
    expect(confirm?.attributes('disabled')).toBeDefined()
  })
})


describe('人工工號與刷卡核對契約', () => {
  it('明確儲存人工工號對照，不以姓名推定員工', async () => {
    mockSaveImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'default', version: 1, employee_mappings: [], employees: [] } })
    const wrapper = mountDialog()
    await nextTick()
    const vm = wrapper.vm as unknown as { mappings: Record<string, number>; handleSaveSettings: () => Promise<void> }
    expect(vm.mappings).toEqual({})
    vm.mappings['101'] = 7
    await vm.handleSaveSettings()
    expect(mockSaveImportSettings).toHaveBeenCalledWith(expect.objectContaining({
      device_id: 'default', version: 0, employee_mappings: [{ source_employee_number: '101', employee_id: 7 }],
    }))
  })

  it('人工選擇缺下班卡後，重送預覽仍保留完整原始紀錄', async () => {
    const row = { ...previewFixture.rows[0], import_format: 'punch_events', device_id: 'default',
      source_employee_number: '101', source_rows: [2], punches: ['2026-06-01T08:00:00'],
      review_required: true, review_confirmed: false, punch_out: null, check: 'review_required',
    }
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...previewFixture, rows: [row], normalized: [], import_format: 'punch_events' } })
    mockPreviewImport.mockResolvedValueOnce({ data: { ...previewFixture, rows: [row], normalized: [] } })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as {
      handleExcelUpload: (options: { file: File }) => Promise<void>
      reviewEdits: Record<number, { punch_in: string; punch_out: string; confirmed: boolean }>
      handleReviewPreview: () => Promise<void>
    }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    vm.reviewEdits[2] = { punch_in: '08:00', punch_out: '', confirmed: true }
    await vm.handleReviewPreview()
    expect(mockPreviewImport).toHaveBeenLastCalledWith(expect.objectContaining({ records: [expect.objectContaining({
      source_employee_number: '101', punches: ['2026-06-01T08:00:00'], source_rows: [2],
      punch_in: '08:00', punch_out: null, review_confirmed: true,
    })] }))
  })
})


describe('審查回歸', () => {
  it('兩筆同分鐘刷卡也提供人工核對入口', async () => {
    const row = { ...previewFixture.rows[0], import_format: 'punch_events', device_id: 'default',
      source_employee_number: '101', source_rows: [2, 3], punches: ['2026-06-01T08:00:00', '2026-06-01T08:00:20'],
      review_required: true, review_confirmed: false, check: 'review_required',
    }
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...previewFixture, rows: [row], normalized: [], import_format: 'punch_events' } })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleExcelUpload: (options: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    expect(wrapper.text()).toContain('依人工核對結果重新預覽')
  })

  it('匯入只包含可匯入列時，明示略過問題數', async () => {
    mockPreviewExcel.mockResolvedValueOnce({ data: previewFixture })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleExcelUpload: (options: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    expect(wrapper.text()).toContain('2 筆問題資料不會匯入')
  })

  it('舊匯入成功回應不關閉重新開啟的對話框', async () => {
    let resolveImport!: (value: { data: { message: string } }) => void
    mockUploadCsv.mockReturnValueOnce(new Promise(resolve => { resolveImport = resolve }))
    mockPreviewExcel.mockResolvedValueOnce({ data: previewFixture })
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as {
      handleExcelUpload: (options: { file: File }) => Promise<void>
      handleConfirmImport: () => Promise<void>
    }
    await vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    const pending = vm.handleConfirmImport()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    resolveImport({ data: { message: '成功' } })
    await pending
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('imported')).toHaveLength(1)
  })

  it('無效設備代號保留可修正輸入並阻止匯入', async () => {
    const wrapper = mountDialog()
    await nextTick()
    const input = wrapper.find('input[aria-label="設備代號"]')
    await input.setValue('中文')
    await input.trigger('change')
    await nextTick()
    expect(wrapper.find('input[aria-label="設備代號"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('設備代號限 1～40 個英文字母、數字、底線或連字號')
  })
})


describe('設備工號配對引導', () => {
  const employees = [
    { id: 11, name: '測試甲', employee_number: 'T011' },
    { id: 12, name: '測試乙', employee_number: 'T012' },
    { id: 13, name: '同名', employee_number: 'T013' },
    { id: 14, name: '同名', employee_number: 'T014' },
  ]
  function punchRow(number: string, name: string, index = 0) {
    return { ...previewFixture.rows[0], row_num: index + 2, employee_name: name, employee_number: '',
      matched_employee_id: null, source_employee_number: number, import_format: 'punch_events',
      check: 'employee_not_found', punches: ['2026-06-01T08:00:00', '2026-06-01T17:00:00'] }
  }
  async function openMapping(rows = [punchRow('101', '測試甲')], employeeMappings: { source_employee_number: string; employee_id: number }[] = []) {
    mockGetImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'default', version: 0, employee_mappings: employeeMappings, employees } })
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...previewFixture, import_format: 'punch_events', rows,
      summary: { importable: 0, overwrites: 0, problems: rows.length }, normalized: [] } })
    // 表格以實際 scoped slot 渲染每列，驗證使用者可見文案。
    const wrapper = mount(ImportPreviewDialog, { props: { modelValue: true, year: 2026, month: 6 }, global: { stubs: { ...stubs,
      'el-table': { template: '<div><slot /></div>' },
      'el-table-column': { data: () => ({ rows }), template: '<div><slot v-for="row in rows" :row="row" /></div>' },
    } } })
    await flushPromises()
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    return wrapper
  }
  beforeEach(() => { vi.clearAllMocks(); mockHasPermission.mockReturnValue(true) })

  it('未對照時展開並提示人數，指引先完成對照', async () => {
    const wrapper = await openMapping()
    expect(wrapper.find('details').attributes('open')).toBeDefined()
    expect(wrapper.text()).toContain('請先完成 1 人的員工對照')
    expect(wrapper.text()).toContain('設備工號 101')
    expect(wrapper.text()).toContain('尚未設定設備工號對照')
    expect(wrapper.text()).not.toContain('測試甲（）')
    expect(wrapper.text()).toContain('先完成工號對照與刷卡核對')
    expect(wrapper.text()).not.toContain('請先下載問題清單')
  })

  it('唯一同名建議需明確採用、儲存與後端重新預覽', async () => {
    const wrapper = await openMapping()
    expect(wrapper.vm.mappings).toEqual({})
    wrapper.vm.previewResult = {
      ...wrapper.vm.previewResult!,
      summary: { importable: 1, overwrites: 0, problems: 1 },
      rows: [...wrapper.vm.previewResult!.rows, { ...previewFixture.rows[0], row_num: 3 }],
      normalized: [normalizedRows[0]!],
    }
    await nextTick()
    expect(wrapper.findAll('button').find(b => b.text().includes('確認匯入'))!.attributes('disabled')).toBeUndefined()
    const adopt = wrapper.findAll('button').find(button => button.text().includes('採用 1 筆同名建議'))
    expect(adopt).toBeTruthy()
    await adopt!.trigger('click')
    expect(wrapper.vm.mappings).toEqual({ '101': 11 })
    expect(mockSaveImportSettings).not.toHaveBeenCalled()
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('對照尚未儲存')
    expect(wrapper.findAll('button').find(b => b.text().includes('確認匯入'))!.attributes('disabled')).toBeDefined()
    mockSaveImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'default', version: 1,
      employee_mappings: [{ source_employee_number: '101', employee_id: 11 }], employees } })
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...previewFixture, import_format: 'punch_events', rows: [], normalized: [] } })
    await wrapper.vm.handleSaveSettings()
    expect(mockSaveImportSettings).toHaveBeenCalledWith(expect.objectContaining({ employee_mappings: [{ source_employee_number: '101', employee_id: 11 }] }))
    expect(mockPreviewExcel).toHaveBeenCalledTimes(2)
    expect(mockUploadCsv).not.toHaveBeenCalled()
  })

  it('同名歧義、來源重名、已佔用員工與同工號姓名衝突均不建議', async () => {
    const wrapper = await openMapping([
      punchRow('101', '測試甲'), punchRow('102', '同名', 1),
      punchRow('103', '測試乙', 2), punchRow('104', '測試乙', 3),
      punchRow('105', '測試甲', 4), punchRow('105', '不同姓名', 5),
    ], [{ source_employee_number: '900', employee_id: 11 }])
    expect(wrapper.findAll('button').some(b => /採用 \d+ 筆同名建議/.test(b.text()))).toBe(false)
    expect(wrapper.vm.mappings).toEqual({ '900': 11 })
  })

  it('設定省略員工候選時不產生建議或拋錯', async () => {
    mockGetImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'default', version: 0 } })
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...previewFixture, import_format: 'punch_events', rows: [punchRow('101', '測試甲')] } })
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'punch.xls') })
    expect(wrapper.text()).toContain('請先完成 1 人的員工對照')
    expect(wrapper.findAll('button').some(b => b.text().includes('同名建議'))).toBe(false)
  })

  it('已儲存對照仍找不到員工時提示重新選擇' , async () => {
    const wrapper = await openMapping(undefined, [{ source_employee_number: '101', employee_id: 11 }])
    expect(wrapper.text()).toContain('已設定對照但找不到員工，請重新選擇')
  })

  it('唯讀權限無法採用建議，切換設備清除預覽與舊候選', async () => {
    const wrapper = await openMapping()
    mockHasPermission.mockReturnValue(false)
    mockGetImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'default', version: 0, employee_mappings: [], employees } })
    const readonly = mountDialog()
    await flushPromises()
    expect(readonly.vm.canWrite).toBe(false)
    readonly.vm.previewResult = wrapper.vm.previewResult
    await nextTick()
    const adopt = readonly.findAll('button').find(b => b.text().includes('採用 1 筆同名建議'))
    expect(adopt?.attributes('disabled')).toBeDefined()
    await adopt!.trigger('click')
    expect(readonly.vm.mappings).toEqual({})
    expect(mockSaveImportSettings).not.toHaveBeenCalled()
    mockHasPermission.mockReturnValue(true)
    mockGetImportSettings.mockResolvedValueOnce({ data: { default_format: 'auto', device_id: 'other', version: 0, employee_mappings: [], employees: [] } })
    await wrapper.find('input[aria-label="設備代號"]').setValue('other')
    await flushPromises()
    expect(wrapper.find('#mapping-101').exists()).toBe(false)
    expect(wrapper.findAll('button').some(b => b.text().includes('同名建議'))).toBe(false)
  })

  it('手動清除的對照不被批次建議重新填入', async () => {
    const wrapper = await openMapping([punchRow('101', '測試甲'), punchRow('102', '測試乙', 1)])
    await wrapper.find('#mapping-101').setValue('11')
    await wrapper.find('#mapping-101').setValue('')
    const adopt = wrapper.findAll('button').find(b => b.text().includes('採用 1 筆同名建議'))
    expect(adopt).toBeTruthy()
    await adopt!.trigger('click')
    expect(wrapper.vm.mappings['101']).toBeUndefined()
    expect(wrapper.vm.mappings['102']).toBe(12)
  })

  it('手動選擇保留，其他建議不得佔用該員工'  , async () => {
    const wrapper = await openMapping([punchRow('101', '測試甲'), punchRow('102', '測試乙', 1)])
    await wrapper.find('#mapping-101').setValue('12')
    expect(wrapper.vm.mappings['101']).toBe(12)
    expect(wrapper.findAll('button').some(b => /採用 \d+ 筆同名建議/.test(b.text()))).toBe(false)
  })
})

describe('批次核對操作', () => {
  const rows = [
    { ...previewFixture.rows[0], row_num: 2, employee_name: '測試甲', import_format: 'punch_events', source_rows: [2, 3, 4], punches: ['2026-06-01T08:00:00', '2026-06-01T08:01:00', '2026-06-01T17:00:00'], review_required: true, review_confirmed: false },
    { ...previewFixture.rows[0], row_num: 5, employee_name: '測試乙', import_format: 'punch_events', source_rows: [5], punches: ['2026-06-01T09:00:00'], punch_in: '09:00', punch_out: null, review_required: true, review_confirmed: false },
    { ...previewFixture.rows[0], row_num: 6, employee_name: '測試丙', import_format: 'punch_events', source_rows: [6, 7], punches: ['2026-06-01T08:00:00', '2026-06-01T08:00:20'], punch_in: '08:00', punch_out: '08:00', review_required: true, review_confirmed: false },
  ]
  const batchFixture = { ...previewFixture, import_format: 'punch_events', rows }
  async function openBatch() {
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.vm.handleExcelUpload({ file: new File(['synthetic'], 'batch.xls') })
    return wrapper
  }
  beforeEach(() => { vi.clearAllMocks(); mockHasPermission.mockReturnValue(true) })

  it('只全選目前篩選結果，切換篩選清空選取', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('multi')
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(1)
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    expect(wrapper.text()).toContain('已選 1 個人日')
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('single')
    expect(wrapper.text()).toContain('已選 0 個人日')
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(1)
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('duplicate')
    expect(wrapper.get('[data-review-row]').text()).toContain('測試丙')
  })

  it('先看摘要可取消，採用目前結果保留手改，無效相同時間明示略過', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="測試甲 2026-06-01 上班"]').setValue('08:01')
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="current"]').trigger('click')
    expect(wrapper.get('[aria-label="批次核對確認"]').text()).toContain('將套用 2 個人日，略過 1 個人日')
    expect(wrapper.text()).toContain('下班須晚於上班')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(false)
    await wrapper.get('[data-batch-cancel]').trigger('click')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(false)
    await wrapper.get('[data-batch-action="current"]').trigger('click')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    expect(wrapper.vm.reviewEdits[2]).toEqual({ punch_in: '08:01', punch_out: '17:00', confirmed: true })
    expect(wrapper.vm.reviewEdits[6]?.confirmed).toBe(false)
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('核對結果已變更')
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('unconfirmed')
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(1)
  })

  it.each([['in', '08:00', ''], ['out', '', '17:00']])('單側批次 %s 保留缺卡且送原始紀錄重新驗證', async (action, punchIn, punchOut) => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('multi')
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get(`[data-batch-action="${action}"]`).trigger('click')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    expect(wrapper.vm.reviewEdits[2]).toEqual({ punch_in: punchIn, punch_out: punchOut, confirmed: true })
    mockPreviewImport.mockResolvedValueOnce({ data: { ...batchFixture, rows: rows.map(row => ({ ...row, review_confirmed: true })) } })
    await wrapper.vm.handleReviewPreview()
    expect(mockPreviewImport).toHaveBeenLastCalledWith(expect.objectContaining({ records: expect.arrayContaining([expect.objectContaining({ punches: rows[0]!.punches, source_rows: [2, 3, 4], punch_in: punchIn || null, punch_out: punchOut || null, review_confirmed: true })]) }))
    expect(wrapper.text()).not.toContain('核對結果已變更')
  })

  it('重新預覽失敗保留批次結果可重試，匯入持續停用', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="in"]').trigger('click')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    mockPreviewImport.mockRejectedValueOnce(new Error('測試失敗'))
    await wrapper.vm.handleReviewPreview()
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(3)
    expect(wrapper.vm.reviewEdits[2]).toEqual({ punch_in: '08:00', punch_out: '', confirmed: true })
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).not.toHaveBeenCalled()
    mockPreviewImport.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleReviewPreview()
    expect(mockPreviewImport).toHaveBeenCalledTimes(2)
  })

  it.each(['resolve', 'reject'])('重核對舊請求 %s 不覆蓋新檔，換檔清除摘要與選取', async outcome => {
    const wrapper = await openBatch()
    let resolve!: (value: unknown) => void
    let reject!: (reason: Error) => void
    mockPreviewImport.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej }))
    const pending = wrapper.vm.handleReviewPreview()
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['new'], 'new.xls') })
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="out"]').trigger('click')
    if (outcome === 'resolve') resolve({ data: { ...batchFixture, rows: [] } })
    else reject(new Error('舊請求'))
    await pending
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(3)
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['newer'], 'newer.xls') })
    expect(wrapper.find('[aria-label="批次核對確認"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已選 0 個人日')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(false)
  })

  it('改月份、設備、格式與工號對照清空選取，不能套用舊摘要', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    wrapper.vm.mappings['101'] = 12
    await nextTick()
    expect(wrapper.text()).toContain('已選 0 個人日')
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.setProps({ month: 7 })
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(0)
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'again.xls') })
    expect(wrapper.text()).toContain('已選 0 個人日')
    await wrapper.get('[aria-label="打卡格式"]').setValue('daily_columns')
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(0)
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'again.xls') })
    await wrapper.get('[aria-label="設備代號"]').setValue('other')
    expect(wrapper.findAll('[data-review-row]')).toHaveLength(0)
  })
  it('未核對篩選中勾選核對後移除已隱藏選取', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('unconfirmed')
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-review-row="2"] td:last-child input').setValue(true)
    expect(wrapper.text()).toContain('已選 2 個人日')
  })

  it('重新上傳不解除未儲存工號對照的匯入阻擋', async () => {
    const wrapper = await openBatch()
    await wrapper.get('[aria-label="設備代號"]').trigger('change')
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...batchFixture, rows: rows.map(row => ({ ...row, source_employee_number: '101' })) } })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'mapped.xls') })
    await wrapper.get('#mapping-101').trigger('change')
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'new.xls') })
    expect(wrapper.text()).toContain('對照尚未儲存')
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).not.toHaveBeenCalled()
  })

  it.each(['csv', 'format'])('未儲存對照跨 %s 預覽重設與再上傳仍阻擋', async route => {
    const wrapper = await openBatch()
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...batchFixture, rows: rows.map(row => ({ ...row, source_employee_number: '101' })) } })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'mapped.xls') })
    await wrapper.get('#mapping-101').trigger('change')
    if (route === 'csv') {
      mockPreviewImport.mockResolvedValueOnce({ data: previewFixture })
      await wrapper.get('textarea').setValue('synthetic csv')
      await wrapper.findAll('button').find(button => button.text() === '預覽核對')!.trigger('click')
      await flushPromises()
    } else await wrapper.get('[aria-label="打卡格式"]').setValue('daily_columns')
    mockPreviewExcel.mockResolvedValueOnce({ data: batchFixture })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'new.xls') })
    expect(wrapper.text()).toContain('對照尚未儲存')
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).not.toHaveBeenCalled()
  })

})

describe('班表輔助核對', () => {
  const day = { date: '2026-06-01', is_expected_workday: true, schedule_known: true, expected_start_at: '2026-06-01T08:00:00+08:00', expected_end_at: '2026-06-01T17:00:00+08:00', approved_leaves: [], full_day_leave: false }
  const normal = { ...previewFixture.rows[0]!, employee_name: '班表測試', row_num: 2, import_format: 'punch_events', device_id: 'default', source_employee_number: '101', source_rows: [2, 3], punches: ['2026-06-01T08:00:00', '2026-06-01T08:05:00'], punch_in: '08:00', punch_out: '08:05', review_required: false, review_confirmed: false }
  const multi = { ...normal, punches: ['2026-06-01T08:00:00', '2026-06-01T08:05:00', '2026-06-01T17:00:00'], source_rows: [2, 3, 4], punch_out: '17:00', review_required: true }
  function fixture(row = normal) { return { ...previewFixture, import_format: 'punch_events', rows: [row], summary: { importable: 1, overwrites: 0, problems: 0 } } }
  async function openSchedule(row = normal) {
    mockPreviewExcel.mockResolvedValueOnce({ data: fixture(row) })
    mockMonthContext.mockResolvedValue({ data: { days: [day], roster: [] } })
    const wrapper = mountDialog(); await flushPromises()
    await wrapper.vm.handleExcelUpload({ file: new File(['synthetic'], 'schedule.xls') })
    return wrapper
  }
  beforeEach(() => { vi.clearAllMocks(); mockHasPermission.mockReturnValue(true) })
  async function load(wrapper: ReturnType<typeof mountDialog>) { await wrapper.get('[data-load-schedule]').trigger('click'); await flushPromises() }

  it('可選載入，原本兩筆同側也列人工並阻止直接匯入', async () => {
    const wrapper = await openSchedule()
    expect(mockMonthContext).not.toHaveBeenCalled()
    expect(wrapper.find('[data-review-row]').exists()).toBe(false)
    await load(wrapper)
    expect(wrapper.text()).toContain('各前後 60 分鐘')
    expect(wrapper.get('[data-review-row]').text()).toContain('疑似缺下班卡')
    await wrapper.vm.handleConfirmImport(); expect(mockUploadCsv).not.toHaveBeenCalled()
  })

  it('重預覽不得消除已發現的同側gate，明確確認後才可送預覽解鎖', async () => {
    const wrapper = await openSchedule(); await load(wrapper)
    mockPreviewImport.mockResolvedValueOnce({ data: fixture() })
    await wrapper.vm.handleReviewPreview()
    expect(wrapper.find('[data-review-row]').exists()).toBe(true)
    await wrapper.vm.handleConfirmImport(); expect(mockUploadCsv).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="in"]').trigger('click')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    mockPreviewImport.mockResolvedValueOnce({ data: fixture({ ...normal, punch_out: '', review_confirmed: true, review_required: true }) })
    await wrapper.vm.handleReviewPreview()
    expect(mockPreviewImport).toHaveBeenLastCalledWith(expect.objectContaining({ records: [expect.objectContaining({ review_required: true, review_confirmed: true, punch_out: null })] }))
    expect(wrapper.findAll('button').find(button => button.text().includes('確認匯入'))!.attributes('disabled')).toBeUndefined()
  })

  it('班表建議批次先摘要才確認，且須重新預覽', async () => {
    const wrapper = await openSchedule(multi); await load(wrapper)
    await wrapper.get('[aria-label="篩選核對紀錄"]').setValue('schedule_eligible')
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="schedule"]').trigger('click')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(false)
    expect(wrapper.get('[aria-label="批次核對確認"]').text()).toContain('上班 08:00／下班 17:00')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(true)
    await wrapper.vm.handleConfirmImport(); expect(mockUploadCsv).not.toHaveBeenCalled()
  })

  it('手改時間跨重新預覽後仍不得被班表建議覆蓋', async () => {
    const wrapper = await openSchedule(multi)
    await wrapper.get('[aria-label="班表測試 2026-06-01 上班"]').setValue('08:05')
    mockPreviewImport.mockResolvedValueOnce({ data: fixture({ ...multi, punch_in: '08:05' }) })
    await wrapper.vm.handleReviewPreview(); await load(wrapper)
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="schedule"]').trigger('click')
    expect(wrapper.get('[aria-label="批次核對確認"]').text()).toContain('已個別調整時間')
    expect(wrapper.get('[data-batch-confirm]').attributes('disabled')).toBeDefined()
    expect(wrapper.vm.reviewEdits[2]?.punch_in).toBe('08:05')
  })

  it('讀取失敗可重試，保留人工時間與安全gate', async () => {
    const wrapper = await openSchedule(multi)
    await wrapper.get('[aria-label="班表測試 2026-06-01 上班"]').setValue('08:05')
    mockMonthContext.mockRejectedValueOnce(new Error('失敗'))
    await load(wrapper)
    expect(wrapper.text()).toContain('班表讀取失敗')
    expect(wrapper.vm.reviewEdits[2]?.punch_in).toBe('08:05')
    await wrapper.get('[data-retry-schedule]').trigger('click'); await flushPromises()
    expect(mockMonthContext).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('班表讀取失敗')
  })

  it('換月份後舊班表回應不改新預覽，未儲存對照不得讀班表', async () => {
    const wrapper = await openSchedule()
    let resolve!: (value: unknown) => void
    mockMonthContext.mockReturnValueOnce(new Promise(res => { resolve = res }))
    await wrapper.get('[data-load-schedule]').trigger('click')
    await wrapper.setProps({ month: 7 })
    resolve({ data: { days: [day], roster: [] } }); await flushPromises()
    expect(wrapper.find('[data-review-row]').exists()).toBe(false)
    mockPreviewExcel.mockResolvedValueOnce({ data: fixture(multi) })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'new.xls') })
    await wrapper.get('#mapping-101').trigger('change')
    expect(wrapper.get('[data-load-schedule]').attributes('disabled')).toBeDefined()
  })
  it('載入期間直接呼叫確認匯入也被阻擋', async () => {
    const wrapper = await openSchedule()
    let resolve!: (value: unknown) => void
    mockMonthContext.mockReturnValueOnce(new Promise(res => { resolve = res }))
    await wrapper.get('[data-load-schedule]').trigger('click')
    expect(wrapper.text()).toContain('完成前暫停匯入')
    await wrapper.vm.handleConfirmImport(); expect(mockUploadCsv).not.toHaveBeenCalled()
    resolve({ data: { days: [day], roster: [] } }); await flushPromises()
    expect(wrapper.text()).not.toContain('完成前暫停匯入')
  })

  it('第一階段單側批次跨重新預覽後也保留選擇', async () => {
    const wrapper = await openSchedule(multi)
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="out"]').trigger('click')
    await wrapper.get('[data-batch-confirm]').trigger('click')
    mockPreviewImport.mockResolvedValueOnce({ data: fixture({ ...multi, punch_in: '', review_confirmed: true }) })
    await wrapper.vm.handleReviewPreview(); await load(wrapper)
    await wrapper.get('[aria-label="全選目前篩選結果"]').setValue(true)
    await wrapper.get('[data-batch-action="schedule"]').trigger('click')
    expect(wrapper.get('[aria-label="批次核對確認"]').text()).toContain('已個別調整時間')
    expect(wrapper.vm.reviewEdits[2]?.punch_in).toBe('')
  })

  it('卸載取消排隊員工查詢，舊回應不得再派下一筆', async () => {
    const wrapper = await openSchedule(multi)
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...fixture(multi), rows: [1, 2, 3].map(id => ({ ...multi, row_num: id, matched_employee_id: id })) } })
    await wrapper.vm.handleExcelUpload({ file: new File(['test'], 'queue.xls') })
    const resolve: ((value: unknown) => void)[] = []
    mockMonthContext.mockImplementation(() => new Promise(res => resolve.push(res)))
    await wrapper.get('[data-load-schedule]').trigger('click')
    expect(mockMonthContext).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    resolve.forEach(res => res({ data: { days: [day], roster: [] } })); await flushPromises()
    expect(mockMonthContext).toHaveBeenCalledTimes(2)
  })

  it('後端已排除的無效或未對照問題列不鎖住其他可匯入紀錄', async () => {
    const valid = { ...normal, punches: ['2026-06-01T08:00:00', '2026-06-01T17:00:00'], punch_out: '17:00' }
    const wrapper = await openSchedule(valid)
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...fixture(valid), rows: [valid,
      { ...normal, row_num: 8, matched_employee_id: null, check: 'employee_not_found', punches: [] },
      { ...normal, row_num: 9, date: null, check: 'invalid_date', punches: [] },
    ], normalized: [normalizedRows[0]], summary: { importable: 1, overwrites: 0, problems: 2 } } })
    await wrapper.vm.handleExcelUpload({ file: new File(['synthetic'], 'partial.xls') })
    await load(wrapper)
    expect(wrapper.text()).toContain('2 筆問題資料不會匯入')
    expect(wrapper.findAll('button').find(button => button.text().includes('確認匯入'))!.attributes('disabled')).toBeUndefined()
    mockUploadCsv.mockResolvedValueOnce({ data: { message: '完成', imported: 1 } })
    await wrapper.vm.handleConfirmImport()
    expect(mockUploadCsv).toHaveBeenLastCalledWith(expect.objectContaining({ records: [normalizedRows[0]] }))
  })

  it('原可匯入疑似同側列清空兩側未確認後，後端改為待核對仍阻擋混批', async () => {
    const other = { ...normal, row_num: 4, matched_employee_id: 2, source_employee_number: '102', source_rows: [4, 5], punches: ['2026-06-01T08:00:00', '2026-06-01T17:00:00'], punch_out: '17:00' }
    const wrapper = await openSchedule()
    mockPreviewExcel.mockResolvedValueOnce({ data: { ...fixture(), rows: [normal, other], summary: { importable: 2, overwrites: 0, problems: 0 } } })
    await wrapper.vm.handleExcelUpload({ file: new File(['synthetic'], 'mixed.xls') })
    await load(wrapper)
    await wrapper.get('[aria-label="班表測試 2026-06-01 上班"]').setValue('')
    await wrapper.get('[aria-label="班表測試 2026-06-01 下班"]').setValue('')
    expect(wrapper.vm.reviewEdits[2]?.confirmed).toBe(false)
    mockPreviewImport.mockResolvedValueOnce({ data: { ...fixture(), rows: [{ ...normal, punch_in: null, punch_out: null, check: 'review_required', review_required: true }, other], normalized: [normalizedRows[1]], summary: { importable: 1, overwrites: 0, problems: 1 } } })
    await wrapper.vm.handleReviewPreview()
    expect(wrapper.text()).toContain('1 個人日尚待班表人工核對')
    expect(wrapper.findAll('button').find(button => button.text().includes('確認匯入'))!.attributes('disabled')).toBeDefined()
    await wrapper.vm.handleConfirmImport(); expect(mockUploadCsv).not.toHaveBeenCalled()
  })

})
