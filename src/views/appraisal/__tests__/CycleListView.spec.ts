import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import CycleListView from '@/views/appraisal/CycleListView.vue'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { createAppraisalCycle } from '@/api/appraisal'

const CYCLES = [
  { id: 3, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.0, status: 'CLOSED' },
  { id: 4, academic_year: 114, semester: 'SECOND', base_score_calc_date: '2026-03-15', base_score: 80.0, status: 'OPEN' },
  { id: 1, academic_year: 113, semester: 'FIRST', base_score_calc_date: '2024-09-15', base_score: 70.0, status: 'CLOSED' },
  { id: 2, academic_year: 113, semester: 'SECOND', base_score_calc_date: '2025-03-15', base_score: 72.0, status: 'CLOSED' },
]

const listCyclesMock = vi.fn()
vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: (...args: unknown[]) => listCyclesMock(...args),
  createAppraisalCycle: vi.fn().mockResolvedValue({ data: {} }),
  importAppraisalExcel: vi.fn().mockResolvedValue({ data: {} }),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  exportAppraisalTransferRosterXlsxUrl: vi.fn().mockReturnValue('/y'),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: vi.fn().mockReturnValue({ school_year: 114, semester: 2 }),
}))
// Task 7：form/importForm 動態預設改讀 useAcademicTermStore（民國學年 114、下學期）
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 2, setTerm: vi.fn() }),
}))
// Task A7：canCreateCycle 對齊 APPRAISAL_FINALIZE（傳給共用 CreateCycleDialog 的 canWrite）
const permState = { finalize: true }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn((p: string) => p === 'APPRAISAL_FINALIZE' && permState.finalize),
}))

const routeQuery: { value: Record<string, unknown> } = { value: {} }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: replaceMock }),
}))

const stubs = {
  CycleDetailPanel: defineComponent({
    name: 'CycleDetailPanel',
    props: ['cycleId'],
    setup(props) {
      return () => h('div', { 'data-test': 'detail-panel-stub' }, String(props.cycleId))
    },
  }),
  ElSelect: defineComponent({
    name: 'ElSelect',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    // data-test 由使用端 attrs fallthrough 帶入（只有 toolbar 的 select 有 data-test="cycle-select"）
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  ElOption: defineComponent({
    name: 'ElOption',
    props: ['value', 'label'],
    setup(props) {
      return () => h('div', { 'data-test': 'cycle-option', 'data-value': String(props.value) }, String(props.label))
    },
  }),
  ElEmpty: defineComponent({
    name: 'ElEmpty',
    props: ['description'],
    setup(props, { slots }) {
      return () => h('div', { 'data-test': 'empty-stub' }, [String(props.description), slots.default?.()])
    },
  }),
  ElButton: {
    props: ['type', 'icon', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElInputNumber: { template: '<input />' },
  ElDatePicker: { template: '<input />' },
  ElUpload: { template: '<div><slot /></div>' },
  // Task A7：「新增週期」自帶 dialog 改用共用 CreateCycleDialog；實際表單/canWrite
  // gate/送出流程已在 CreateCycleDialog.spec.ts 用真實元件測過，這裡只驗證 parent
  // wiring（開關 + canWrite 傳遞 + @created 觸發 reload）。
  CreateCycleDialog: defineComponent({
    name: 'CreateCycleDialog',
    props: ['visible', 'canWrite'],
    emits: ['update:visible', 'created'],
    setup(props, { emit }) {
      return () => props.visible
        ? h('div', { 'data-test': 'create-cycle-dialog-stub', 'data-can-write': String(props.canWrite) }, [
            h('button', {
              'data-test': 'create-cycle-dialog-stub-created-btn',
              onClick: () => emit('created', { id: 12, academic_year: 114, semester: 'FIRST' }),
            }),
          ])
        : null
    },
  }),
}

const flush = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
}

const mountView = () => mount(CycleListView, { global: { stubs } })

describe('CycleListView（dropdown + 內嵌明細）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
    listCyclesMock.mockResolvedValue({ data: CYCLES })
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 114, semester: 2 })
    permState.finalize = true
  })

  it('dropdown 渲染所有週期選項，新到舊排序', async () => {
    const wrapper = mountView()
    await flush()
    const options = wrapper.find('[data-test="cycle-select"]').findAll('[data-test="cycle-option"]')
    expect(options.map((o) => o.text())).toEqual([
      '114 學年下學期（開放）',
      '114 學年上學期（已封存）',
      '113 學年下學期（已封存）',
      '113 學年上學期（已封存）',
    ])
  })

  it('P4：Excel 匯入降級為例外 fallback 入口', async () => {
    const wrapper = mountView()
    await flush()
    const vm = wrapper.vm as unknown as { importFallbackNotice: string }

    expect(wrapper.text()).toContain('更多操作')
    expect(wrapper.text()).not.toContain('上傳 Excel')
    expect(vm.importFallbackNotice).toContain('Excel 匯入僅供例外對稿')
  })

  it('預設選中當期學期的週期（非最新一筆也優先當期）', async () => {
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 113, semester: 2 })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('2')
  })

  it('當期無週期時 fallback 最新一筆', async () => {
    vi.mocked(getCurrentAcademicTerm).mockReturnValue({ school_year: 115, semester: 1 })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('4')
  })

  it('URL query cycle 有效時優先於當期', async () => {
    routeQuery.value = { cycle: '1' }
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('1')
  })

  it('URL query cycle 無效（不存在的 id）時退回當期', async () => {
    routeQuery.value = { cycle: '999' }
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="detail-panel-stub"]').text()).toBe('4')
  })

  it('預設選中後同步 cycle 至 URL query', async () => {
    mountView()
    await flush()
    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ cycle: '4' }) })
  })

  it('無任何週期時顯示空狀態、不渲染明細', async () => {
    listCyclesMock.mockResolvedValue({ data: [] })
    const wrapper = mountView()
    await flush()
    expect(wrapper.find('[data-test="empty-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="detail-panel-stub"]').exists()).toBe(false)
  })

  it('Task 7：匯入表單預設值依當前學年（useAcademicTermStore）動態推算，非寫死 114/160', async () => {
    const wrapper = mountView()
    await flush()
    const vm = wrapper.vm as unknown as {
      importForm: { start_date: string; end_date: string; base_score_calc_date: string }
    }
    // school_year 114 → 西元 2025；下學期 → 隔年 2026 起算
    expect(vm.importForm.start_date).toBe('2026-02-01')
    expect(vm.importForm.end_date).toBe('2026-07-31')
    expect(vm.importForm.base_score_calc_date).toBe('2026-03-15')
  })

  // ── Task A7：新增週期改開共用 CreateCycleDialog（不再自帶 form/submit）───
  // 表單欄位/target 留空送 0/canWrite gate 的實際行為已在 CreateCycleDialog.spec.ts
  // 與 useCreateCycle.spec.ts 用真實元件/純函式測過；此處只驗證本頁 wiring。
  it('Task A7：點「新增週期」開啟共用 CreateCycleDialog，canWrite 反映 hasPermission(APPRAISAL_FINALIZE)', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="create-cycle-dialog-stub"]').exists()).toBe(false)
    const createBtn = wrapper.findAll('button').find((b) => b.text() === '新增週期')
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await flush()

    const dialogStub = wrapper.find('[data-test="create-cycle-dialog-stub"]')
    expect(dialogStub.exists()).toBe(true)
    expect(dialogStub.attributes('data-can-write')).toBe('true')
    expect(createAppraisalCycle).not.toHaveBeenCalled()
  })

  it('Task A7：canWrite=false（無 APPRAISAL_FINALIZE）時仍可開啟 dialog，但 canWrite 傳 false', async () => {
    permState.finalize = false
    const wrapper = mountView()
    await flush()

    const createBtn = wrapper.findAll('button').find((b) => b.text() === '新增週期')
    await createBtn!.trigger('click')
    await flush()

    expect(wrapper.find('[data-test="create-cycle-dialog-stub"]').attributes('data-can-write')).toBe('false')
  })

  it('Task A7：CreateCycleDialog emit created 後 reload 週期清單', async () => {
    const wrapper = mountView()
    await flush()

    const createBtn = wrapper.findAll('button').find((b) => b.text() === '新增週期')
    await createBtn!.trigger('click')
    await flush()

    listCyclesMock.mockClear()
    await wrapper.find('[data-test="create-cycle-dialog-stub-created-btn"]').trigger('click')
    await flush()

    expect(listCyclesMock).toHaveBeenCalledTimes(1)
  })
})
