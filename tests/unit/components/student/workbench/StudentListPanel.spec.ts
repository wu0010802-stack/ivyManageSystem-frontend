import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
  reactive,
  type ComputedRef,
} from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'

const route = reactive({
  query: {
    school_year: '2025',
    semester: '2',
    classroom_id: '8',
    action: 'create',
  },
})
const push = vi.fn()
const replace = vi.fn(() => Promise.resolve())
const getStudents = vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } }))
const getClassrooms = vi.fn(() => Promise.resolve({
  data: [
    {
      id: 8,
      name: '向日葵班',
      school_year: 2025,
      semester: 2,
      semester_label: '2025學年度下學期',
      grade_name: '中班',
    },
  ],
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/students', () => ({
  getStudents: (...args) => getStudents(...args),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  graduateStudent: vi.fn(),
  bulkTransferStudents: vi.fn(),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...args) => getClassrooms(...args),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn(),
}))

import { downloadFile } from '@/utils/download'

afterEach(() => vi.unstubAllGlobals())

const tableRowsKey = Symbol('student-table-rows')

const ElTableStub = defineComponent({
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    provide(tableRowsKey, computed(() => props.data))
    return () => h('div', { 'data-testid': 'student-table' }, slots.default?.())
  },
})

const ElTableColumnStub = defineComponent({
  setup(_, { slots }) {
    const rows = inject<ComputedRef<unknown[]>>(tableRowsKey)
    return () => h(
      'div',
      rows?.value.flatMap((row) => slots.default?.({ row }) ?? []) ?? [],
    )
  },
})

const mountPanel = () => shallowMount(StudentListPanel, {
  global: {
    directives: {
      loading: () => {},
    },
    stubs: {
      TableSkeleton: true,
      PageHeader: { template: '<header><slot name="actions" /></header>' },
      AdminListToolbar: { template: '<div><slot name="actions" /></div>' },
      AdminListCards: false,
      'el-card': { template: '<article><slot /></article>' },
      'el-checkbox': true,
      'el-tabs': { template: '<div><slot /></div>' },
      'el-tab-pane': { template: '<div><slot /></div>' },
      'el-input': { template: '<input />' },
      'el-table': ElTableStub,
      'el-table-column': ElTableColumnStub,
      'el-pagination': true,
      'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
      'el-form': { template: '<form><slot /></form>' },
      'el-form-item': { template: '<div><slot /></div>' },
      'el-select': { template: '<div><slot /></div>' },
      'el-option': true,
      'el-switch': true,
      'el-button': { template: '<button><slot /></button>' },
      'el-date-picker': true,
      'el-radio-group': { template: '<div><slot /></div>' },
      'el-radio-button': { template: '<label><slot /></label>' },
      'el-radio': { template: '<label><slot /></label>' },
      'el-divider': true,
      'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
      'el-dropdown-menu': { template: '<div><slot /></div>' },
      'el-dropdown-item': { template: '<button role="menuitem"><slot /></button>' },
      'el-tag': true,
      'el-tooltip': { template: '<div><slot /></div>' },
      'el-icon': true,
    },
  },
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  route.query = { school_year: '2025', semester: '2', classroom_id: '8', action: 'create' }
  getStudents.mockResolvedValue({ data: { items: [], total: 0 } })
  getClassrooms.mockResolvedValue({ data: [{
    id: 8, name: '向日葵班', school_year: 2025, semester: 2,
    semester_label: '2025學年度下學期', grade_name: '中班',
  }] })
})

describe('StudentListPanel', () => {
  it('uses route query to preload academic term and classroom filters', async () => {
    mountPanel()

    await flushPromises()
    await nextTick()

    expect(getClassrooms).toHaveBeenCalledWith({ current_only: false })
    expect(getStudents).toHaveBeenCalledWith(expect.objectContaining({
      school_year: 2025,
      semester: 2,
      classroom_id: 8,
      is_active: true,
    }))
    expect(replace).toHaveBeenCalledWith({
      query: {
        school_year: '2025',
        semester: '2',
        classroom_id: '8',
        tab: 'roster',
      },
    })
  })

  it('匯出教育局格式：帶目前篩選參數呼叫 k12ea 下載', async () => {
    const wrapper = mountPanel()

    await flushPromises()
    await nextTick()

    // 模擬透過 URL 選班級，確認匯出使用更新後的篩選。
    route.query = { school_year: '2025', semester: '2', classroom_id: '8' }
    await flushPromises()
    await nextTick()
    await flushPromises()

    const exportBtn = wrapper
      .findAll('[role="menuitem"]')
      .find((btn) => btn.text().includes('匯出教育局格式'))
    expect(exportBtn).toBeTruthy()
    await exportBtn!.trigger('click')

    expect(downloadFile).toHaveBeenCalledWith(
      '/exports/students/k12ea',
      '幼生資料匯入.xls',
      expect.objectContaining({
        is_active: true,
        school_year: 2025,
        semester: 2,
        classroom_id: 8,
      }),
    )
  })

  it('顯示所選學期的歷史班級，不顯示學生目前班級', async () => {
    getClassrooms.mockResolvedValue({
      data: [
        {
          id: 10,
          name: '歷史學期班',
          school_year: 2025,
          semester: 2,
          semester_label: '2025學年度下學期',
          grade_name: '中班',
        },
        {
          id: 20,
          name: '目前班級',
          school_year: 2026,
          semester: 1,
          semester_label: '2026學年度上學期',
          grade_name: '大班',
        },
      ],
    })
    getStudents.mockResolvedValue({
      data: {
        items: [{
          id: 1,
          student_id: 'TEST-001',
          name: '測試學生',
          classroom_id: 20,
          term_classroom_id: 10,
        }],
        total: 1,
      },
    })

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()
    await flushPromises()

    const table = wrapper.get('[data-testid="student-table"]')
    expect(table.text()).toContain('歷史學期班')
    expect(table.text()).not.toContain('目前班級')
  })
})

it('未選學生不顯示批次工具列，選取後可清除', async () => {
  setActivePinia(createPinia())
  const wrapper = mountPanel()
  await flushPromises()
  expect(wrapper.find('[data-test="student-batch-toolbar"]').exists()).toBe(false)
  wrapper.findComponent(ElTableStub).vm.$emit('selection-change', [{ id: 99, name: '測試' }])
  await nextTick()
  expect(wrapper.get('[data-test="student-batch-toolbar"]').text()).toContain('已選 1')
  await wrapper.get('[data-test="clear-student-selection"]').trigger('click')
  expect(wrapper.find('[data-test="student-batch-toolbar"]').exists()).toBe(false)
  wrapper.unmount()
})

it('分頁寫入非PII路由，返回 query 更新會恢復頁碼', async () => {
  setActivePinia(createPinia())
  const wrapper = mountPanel()
  await flushPromises()
  const vm = wrapper.vm as unknown as { handlePageChange: (page: number) => void; currentPage: number }
  vm.handlePageChange(3)
  await nextTick()
  expect(push).toHaveBeenCalledWith({ query: expect.objectContaining({ page: '3' }) })
  const last = push.mock.calls.at(-1)?.[0]
  expect(last?.query).not.toHaveProperty('q')
  route.query = { school_year: '2025', semester: '2', classroom_id: '8', page: '2' } as typeof route.query
  await nextTick()
  await flushPromises()
  expect(vm.currentPage).toBe(2)
  expect(getStudents).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 50 }))
  wrapper.unmount()
})

it('手機卡片保留學生檔案、編輯、更多操作與批次勾選', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  setActivePinia(createPinia())
  route.query = { school_year: '2025', semester: '2', classroom_id: '8' } as typeof route.query
  getStudents.mockResolvedValue({ data: { items: [{ id: 99, name: '手機測試', classroom_id: 8 }], total: 1 } })
  const wrapper = mountPanel()
  await flushPromises()
  await nextTick()
  const cards = wrapper.get('.admin-list-cards')
  expect(cards.text()).toContain('檔案')
  expect(cards.text()).toContain('編輯')
  expect(cards.text()).toContain('更多')
  const checkbox = wrapper.findAllComponents({ name: 'ElCheckbox' }).find(c => c.attributes('aria-label') === '選取 手機測試')
  expect(checkbox).toBeTruthy()
  checkbox!.vm.$emit('update:modelValue', true)
  await nextTick()
  expect(wrapper.get('[data-test="student-batch-toolbar"]').text()).toContain('已選 1')
  wrapper.unmount()
  vi.unstubAllGlobals()
})
