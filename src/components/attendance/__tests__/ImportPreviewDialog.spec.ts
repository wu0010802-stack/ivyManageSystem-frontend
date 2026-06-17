// src/components/attendance/__tests__/ImportPreviewDialog.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── hoisted mocks ──────────────────────────────────────────────────────────────
const { mockPreviewImport, mockUploadCsv, mockUploadFile, mockNotify } = vi.hoisted(() => ({
  mockPreviewImport: vi.fn(),
  mockUploadCsv: vi.fn(),
  mockUploadFile: vi.fn(),
  mockNotify: vi.fn(),
}))

// ── mock api ───────────────────────────────────────────────────────────────────
vi.mock('@/api/attendance', () => ({
  previewImport: mockPreviewImport,
  uploadCsv: mockUploadCsv,
  uploadFile: mockUploadFile,
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

    expect(mockPreviewImport).toHaveBeenCalledWith({ raw_text: expect.stringContaining('E001') })
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

  // ── Tab B: Excel 上傳 ─────────────────────────────────────────────────────────
  it('Tab B: 觸發 uploadFile → emit imported', async () => {
    const mockFile = new File(['data'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    mockUploadFile.mockResolvedValue({ data: { message: '上傳完成', success: 5, failed: 0 } })

    const wrapper = mountDialog()

    // Call handleExcelUpload directly through exposed vm
    const vm = wrapper.vm as { handleExcelUpload: (opts: { file: File }) => Promise<void> }
    await vm.handleExcelUpload({ file: mockFile })
    await nextTick()

    expect(mockUploadFile).toHaveBeenCalled()
    const formData = mockUploadFile.mock.calls[0][0] as FormData
    expect(formData.get('file')).toBe(mockFile)
    expect(wrapper.emitted('imported')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe(false)
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
