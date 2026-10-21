/**
 * 學期輪值表頁籤：無輪值表 → 建立；有 → 儲存送整份覆寫；未儲存時不可套用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onUnmounted, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGet, mockCreate, mockReplace, mockImport, mockExport } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockCreate: vi.fn(), mockReplace: vi.fn(), mockImport: vi.fn(), mockExport: vi.fn(),
}))
vi.mock('@/api/dutyRotations', () => ({
  getDutyRotation: mockGet,
  createDutyRotation: mockCreate,
  replaceDutyRotation: mockReplace,
  importDutyRotation: mockImport,
  exportDutyRotation: mockExport,
  applyDutyRotation: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({
    activeShiftTypes: ref([{ id: 6, name: '早車', work_start: '07:00', work_end: '16:30', is_active: true }]).value,
    fetchShiftTypes: vi.fn(),
  }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 115, semester: 1 }),
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import DutyRotationPanel from '../DutyRotationPanel.vue'

// 比照原排班頁測試的 stub 慣例
const globalConfig = {
  stubs: {
    'el-button': {
      props: ['type', 'loading', 'disabled', 'size', 'link'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-select': {
      props: ['modelValue'],
      emits: ['update:modelValue', 'change'],
      template: '<div class="sel"><slot /></div>',
    },
    'el-option': { props: ['label', 'value'], template: '<div class="opt">{{ label }}</div>' },
    'el-input': { props: ['modelValue'], template: '<input class="inp" />' },
    'el-alert': { props: ['title', 'type', 'closable'], template: '<div class="alert"><b>{{ title }}</b><slot /></div>' },
    'el-upload': { props: ['onChange', 'autoUpload', 'accept', 'showFileList'], template: '<div class="upload"><slot /></div>' },
    'el-date-picker': { props: ['modelValue'], template: '<input class="dp" />' },
    'el-dialog': { props: ['modelValue', 'title', 'width'], template: '<div v-if="modelValue" class="dlg"><slot /></div>' },
    DutyRotationApplyDialog: {
      props: ['modelValue', 'rotationId', 'fromWeekStart', 'weeks'],
      template: '<div class="apply-dlg" />',
    },
  },
}

const isDisabled = (wrapper: ReturnType<typeof mount>, testId: string) =>
  (wrapper.find(`[data-test="${testId}"]`).element as HTMLButtonElement).disabled

const rotation = {
  id: 7, school_year: 115, semester: 1, name: '115 上教師值勤表',
  default_head_shift_type_id: null, default_assistant_shift_type_id: 6,
  last_applied_at: null, last_applied_by: null,
  rows: [{ id: 11, label: '早車', teacher_role: 'assistant', shift_type_id: 6, sort_order: 0 }],
  weeks: [{ id: 1, week_start_date: '2026-09-14', label: '05' }],
  cells: [{ week_start_date: '2026-09-14', row_id: 11, classroom_id: 101 }],
  issues: [{ code: 'NO_DEFAULT', severity: 'warning', message: '未設定班導未輪值時的班別', week_start_date: null, row_id: null, classroom_id: null, employee_id: null }],
  classrooms: [{ id: 101, name: '滿天星', class_code: '中1', head_teacher_id: null, head_teacher_name: null, assistant_teacher_id: 2, assistant_teacher_name: '王老師' }],
  reapply_hint: { pending: true, from_week_start: '2026-09-21', affected_count: 3 },
}

describe('DutyRotationPanel', () => {
  beforeEach(() => {
    for (const m of [mockGet, mockCreate, mockReplace, mockImport, mockExport]) m.mockReset()
  })

  it('查無輪值表時可建立', async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 404 } })
    mockCreate.mockResolvedValueOnce({ data: rotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    await wrapper.find('[data-test="create"]').trigger('click')
    await flushPromises()
    expect(mockCreate).toHaveBeenCalledWith({ school_year: 115, semester: 1, name: '115 上教師值勤表' })
    expect(wrapper.find('[data-test="grid"]').exists()).toBe(true)
  })

  it('載入後顯示問題與重新套用提示；未修改時儲存停用、套用可用', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    expect(wrapper.find('[data-test="issues"]').text()).toContain('未設定班導未輪值時的班別')
    expect(wrapper.find('[data-test="reapply-hint"]').exists()).toBe(true)
    expect(isDisabled(wrapper, 'save')).toBe(true)
    expect(isDisabled(wrapper, 'apply')).toBe(false)
  })

  it('移除週次後可儲存，送出整份覆寫且套用被停用', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    mockReplace.mockResolvedValueOnce({ data: { ...rotation, weeks: [], cells: [] } })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    await wrapper.find('[data-test="remove-week-2026-09-14"]').trigger('click')
    expect(isDisabled(wrapper, 'apply')).toBe(true)
    expect(isDisabled(wrapper, 'save')).toBe(false)
    await wrapper.find('[data-test="save"]').trigger('click')
    await flushPromises()
    expect(mockReplace).toHaveBeenCalledWith(7, expect.objectContaining({ weeks: [], cells: [] }))
  })

  it('確認匯入時後端二次驗證失敗（HTTP 200 但 applied:false）不當作成功，對話框保留開啟並顯示錯誤', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    mockImport
      // 預覽（dry_run=true）：當下沒有錯誤
      .mockResolvedValueOnce({ data: { applied: false, errors: [], week_count: 1, cell_count: 1, rotation: null } })
      // 確認匯入（dry_run=false）：後端重新驗證後發現班級代號找不到
      .mockResolvedValueOnce({
        data: {
          applied: false,
          errors: ['第 05 週「早車」的班級代號「大9」找不到'],
          week_count: 0,
          cell_count: 0,
          rotation: null,
        },
      })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()

    const upload = wrapper.findComponent('.upload') as unknown as {
      props: (k: string) => (f: { raw: File }) => Promise<void>
    }
    await upload.props('onChange')({ raw: new File([''], 'x.xlsx') })
    await flushPromises()
    expect(wrapper.find('.dlg').exists()).toBe(true)
    expect(isDisabled(wrapper, 'confirm-import')).toBe(false)

    await wrapper.find('[data-test="confirm-import"]').trigger('click')
    await flushPromises()

    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
    // 對話框仍開著，且顯示後端回傳的錯誤訊息
    expect(wrapper.find('.dlg').exists()).toBe(true)
    expect(wrapper.text()).toContain('第 05 週「早車」的班級代號「大9」找不到')
    expect(isDisabled(wrapper, 'confirm-import')).toBe(true)
    // 輪值表本體未被替換（原本的問題清單仍在，未被 res.data.rotation=null 蓋掉）
    expect(wrapper.find('[data-test="issues"]').text()).toContain('未設定班導未輪值時的班別')
  })

  it('Final fix FE-2：dirty 時切換學期會先確認，取消則不載入且值還原', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    await wrapper.find('[data-test="remove-week-2026-09-14"]').trigger('click')
    expect(isDisabled(wrapper, 'save')).toBe(false) // 現在是 dirty

    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    mockGet.mockClear()

    const semesterSelect = wrapper.findComponent('[data-test="term-semester"]')
    expect(semesterSelect.props('modelValue')).toBe(1)
    await semesterSelect.vm.$emit('update:modelValue', 2)
    await semesterSelect.vm.$emit('change', 2)
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      '有未儲存的變更，切換學期會捨棄這些變更，確定？',
      expect.any(String),
      expect.objectContaining({ type: 'warning' })
    )
    expect(mockGet).not.toHaveBeenCalled() // 取消則不載入
    expect(semesterSelect.props('modelValue')).toBe(1) // 值還原
  })

  it('套用後面板重讀輪值表期間，套用對話框不得被卸載（D-08：後續處理清單要留著）；changed 往上轉發', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    const unmounted = vi.fn()
    const wrapper = mount(DutyRotationPanel, {
      global: {
        stubs: {
          ...globalConfig.stubs,
          DutyRotationApplyDialog: {
            name: 'DutyRotationApplyDialog',
            props: ['modelValue', 'rotationId', 'fromWeekStart', 'weeks'],
            emits: ['applied', 'changed', 'update:modelValue'],
            setup() {
              onUnmounted(unmounted)
              return {}
            },
            template: '<div class="apply-dlg" />',
          },
        },
      },
    })
    await flushPromises()
    let finishReload!: (v: unknown) => void
    mockGet.mockReturnValueOnce(new Promise((resolve) => { finishReload = resolve }))
    const dlg = wrapper.findComponent({ name: 'DutyRotationApplyDialog' })
    dlg.vm.$emit('applied', { applied: true, counts: {}, changes: [] })
    await flushPromises()
    expect(wrapper.find('.drp-muted').exists()).toBe(true) // 重讀中
    expect(unmounted).not.toHaveBeenCalled()
    expect(wrapper.find('.apply-dlg').exists()).toBe(true)
    finishReload({ data: rotation })
    await flushPromises()
    expect(unmounted).not.toHaveBeenCalled()
    expect(wrapper.emitted('applied')).toHaveLength(1)

    dlg.vm.$emit('changed')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
})

// ── 檢查結果摘要（原本一條 issue 一行，數十條把表格推出首屏）────────────────────────
describe('DutyRotationPanel — 檢查結果摘要', () => {
  beforeEach(() => {
    for (const m of [mockGet, mockCreate, mockReplace, mockImport, mockExport]) m.mockReset()
  })

  // 3 個班級都沒設副班導 × 2 個職務列 × 11 週（含「預」備週）＝ 66 筆 CLASS_MISSING_TEACHER
  const weekDates = [
    '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07',
    '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12',
  ]
  const weekLabels = ['預', ...Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))]
  const bigRotation = {
    ...rotation,
    rows: [
      { id: 11, label: '早車', teacher_role: 'assistant', shift_type_id: 6, sort_order: 0 },
      { id: 12, label: '午車', teacher_role: 'assistant', shift_type_id: 6, sort_order: 1 },
    ],
    weeks: weekDates.map((d, i) => ({ id: i + 1, week_start_date: d, label: weekLabels[i] })),
    cells: [],
    classrooms: [
      { id: 101, name: '滿天星', class_code: '中1', head_teacher_id: 1, head_teacher_name: '甲', assistant_teacher_id: null, assistant_teacher_name: null },
      { id: 102, name: '小太陽', class_code: '中2', head_teacher_id: 2, head_teacher_name: '乙', assistant_teacher_id: null, assistant_teacher_name: null },
      { id: 103, name: '彩虹', class_code: '大1', head_teacher_id: 3, head_teacher_name: '丙', assistant_teacher_id: null, assistant_teacher_name: null },
    ],
    reapply_hint: { pending: false, from_week_start: null, affected_count: 0 },
    issues: [
      { code: 'NO_DEFAULT', severity: 'warning', message: '未設定班導未輪值時的班別；未輪值的班導不會寫入週班表', week_start_date: null, row_id: null, classroom_id: null, employee_id: null },
      ...weekDates.flatMap((d, wi) =>
        [11, 12].flatMap((rowId) =>
          [101, 102, 103].map((roomId) => ({
            code: 'CLASS_MISSING_TEACHER',
            severity: 'warning',
            message: `某班 尚未設定副班導，第 ${weekLabels[wi]} 週「${rowId === 11 ? '早車' : '午車'}」不會寫入週班表`,
            week_start_date: d,
            row_id: rowId,
            classroom_id: roomId,
            employee_id: null,
          })),
        ),
      ),
    ],
  }

  it('數十條提醒收成一行摘要＋分組明細：預設收合、只有警告時不擋；明細行數遠少於原始筆數', async () => {
    mockGet.mockResolvedValueOnce({ data: bigRotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()

    const issues = wrapper.find('[data-test="issues"]')
    // 摘要列：67 項提醒、無錯誤
    expect(issues.find('.drp-checks__summary').text()).toContain('67 項提醒')
    expect(issues.find('.drp-checks__summary').text()).not.toContain('項錯誤')
    expect(issues.find('.drp-checks__summary').text()).toContain('班級尚未設定老師 66')
    // 預設收合
    const detail = issues.find('#drp-checks-detail')
    expect((detail.element as HTMLElement).style.display).toBe('none')
    expect(issues.find('[data-test="issues-toggle"]').attributes('aria-expanded')).toBe('false')
    // 66 筆原始 issue 合併成「班級 × 職務列」6 行（3 班 × 2 職務），而不是 66 行
    const missing = issues.find('[data-test="issue-group-CLASS_MISSING_TEACHER"]')
    expect(missing.findAll('li')).toHaveLength(6)
    expect(issues.findAll('li')).toHaveLength(7) // + NO_DEFAULT 1 行

    // 展開
    await issues.find('[data-test="issues-toggle"]').trigger('click')
    expect((detail.element as HTMLElement).style.display).not.toBe('none')
    expect(issues.find('[data-test="issues-toggle"]').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('合併後不丟資訊：班級、角色、職務名稱與每一週都在明細行裡；「預」寫成預備週，不出現「第 預 週」', async () => {
    mockGet.mockResolvedValueOnce({ data: bigRotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()

    const lines = wrapper
      .find('[data-test="issue-group-CLASS_MISSING_TEACHER"]')
      .findAll('li')
      .map((li) => li.text())
    // 依班級名稱（zh-TW 排序）再依職務列順序
    const sample = lines.find((l) => l.includes('滿天星') && l.includes('早車'))!
    expect(sample).toBe(
      '滿天星 尚未設定副班導：「早車」在預備週、第 01、02、03、04、05、06、07、08、09、10 週不會寫入週班表',
    )
    for (const room of ['滿天星', '小太陽', '彩虹']) {
      for (const row of ['早車', '午車']) {
        expect(lines.some((l) => l.includes(room) && l.includes(`「${row}」`))).toBe(true)
      }
    }
    expect(wrapper.find('[data-test="issues"]').text()).not.toContain('第 預 週')
    wrapper.unmount()
  })

  it('後端原文（非合併類）裡的「第 預 週」改寫成預備週', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        ...bigRotation,
        issues: [
          { code: 'CLASS_WRONG_TERM', severity: 'error', message: '第 預 週「早車」的班級不屬於本學期', week_start_date: weekDates[0], row_id: 11, classroom_id: 101, employee_id: null },
        ],
      },
    })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    const text = wrapper.find('[data-test="issues"]').text()
    expect(text).toContain('預備週「早車」的班級不屬於本學期')
    expect(text).not.toContain('第 預 週')
    wrapper.unmount()
  })

  it('有錯誤時預設展開（錯誤會讓「套用到班表」停用，使用者要立刻看到原因），錯誤排在提醒之前', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        ...bigRotation,
        issues: [
          bigRotation.issues[1],
          { code: 'EMPLOYEE_DOUBLE_BOOKED', severity: 'error', message: '第 01 週同一位老師被排到「早車」與「午車」（滿天星）', week_start_date: weekDates[1], row_id: 12, classroom_id: 101, employee_id: 9 },
        ],
      },
    })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    const issues = wrapper.find('[data-test="issues"]')
    expect((issues.find('#drp-checks-detail').element as HTMLElement).style.display).not.toBe('none')
    expect(issues.find('.drp-checks__summary').text()).toContain('1 項錯誤')
    expect(issues.find('.drp-checks__summary').text()).toContain('1 項提醒')
    const titles = issues.findAll('h4').map((h) => h.text())
    expect(titles[0]).toContain('同一位老師同週重複排入')
    expect(isDisabled(wrapper, 'apply')).toBe(true)
    wrapper.unmount()
  })

  it('結構化欄位對不回（班級／職務／週次查無）就不合併，原文照列', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        ...bigRotation,
        issues: [
          { code: 'CLASS_MISSING_TEACHER', severity: 'warning', message: '某班 尚未設定副班導，第 05 週「早車」不會寫入週班表', week_start_date: '2030-01-01', row_id: 999, classroom_id: 101, employee_id: null },
        ],
      },
    })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    expect(wrapper.find('[data-test="issues"]').text()).toContain('某班 尚未設定副班導，第 05 週「早車」不會寫入週班表')
    wrapper.unmount()
  })

  it('週次表頭：「預」顯示為預備週，數字週維持原樣；列內小按鈕帶放大點擊區的 class', async () => {
    mockGet.mockResolvedValueOnce({ data: bigRotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    const heads = wrapper.findAll('[data-test="grid"] thead th').slice(2)
    expect(heads[0].text()).toContain('預備週')
    expect(heads[1].text()).toContain('01')
    expect(wrapper.find(`[data-test="remove-week-${weekDates[0]}"]`).classes()).toContain('drp-link-btn')
    wrapper.unmount()
  })
})
