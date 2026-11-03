/**
 * 每日點名獨立頁（/students/rollcall，2026-11-03 自學生儀表板抽出）。
 * 點名表與各班進度由 AttendanceSection 負責（見 AttendanceSection.spec.ts），這裡只驗頁面接線：
 * 班級清單載入與預設班、班級經 provide 交給區塊、點名日期雙向綁定、隱藏區塊自己的標頭。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, inject } from 'vue'
import { ElMessage } from 'element-plus'
import StudentRollcallView from '@/views/StudentRollcallView.vue'
import { getClassrooms } from '@/api/classrooms'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { todayISO } from '@/utils/format'

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }
})

const AttendanceSectionStub = defineComponent({
  name: 'AttendanceSection',
  props: { attendanceDate: String, hideHeader: Boolean },
  emits: ['update:attendanceDate'],
  setup(props) {
    const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
    return () => h('div', {
      class: 'section-stub',
      'data-classroom': String(ctx?.filters.classroomId ?? ''),
      'data-date': props.attendanceDate,
      'data-hide-header': String(props.hideHeader),
    })
  },
})

const mountView = () => shallowMount(StudentRollcallView, {
  global: {
    stubs: {
      AttendanceSection: AttendanceSectionStub,
      PageHeader: { props: ['title'], template: '<div><h2>{{ title }}</h2><slot name="actions" /></div>' },
      'el-select': true,
      'el-option': true,
      'el-date-picker': true,
    },
  },
})

describe('StudentRollcallView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getClassrooms).mockReset()
    vi.mocked(ElMessage.error).mockClear()
  })

  it('標題為每日點名；載入本學期班級後預設第一班，交給點名區塊', async () => {
    vi.mocked(getClassrooms).mockResolvedValue({ data: [{ id: 11, name: '天堂鳥' }, { id: 12, name: '櫻花' }] } as never)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('h2').text()).toBe('每日點名')
    expect(getClassrooms).toHaveBeenCalledWith(expect.objectContaining({ include_inactive: false }))
    const section = wrapper.find('.section-stub')
    expect(section.attributes('data-classroom')).toBe('11')
    expect(section.attributes('data-date')).toBe(todayISO())
    expect(section.attributes('data-hide-header')).toBe('true')
  })

  it('換班級會更新點名區塊的班級', async () => {
    vi.mocked(getClassrooms).mockResolvedValue({ data: [{ id: 11, name: '天堂鳥' }, { id: 12, name: '櫻花' }] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 12)
    await flushPromises()
    expect(wrapper.find('.section-stub').attributes('data-classroom')).toBe('12')
  })

  it('點名日期雙向綁定：頁面改日期傳給區塊；區塊回寫（返回儲存）也更新頁面日期', async () => {
    vi.mocked(getClassrooms).mockResolvedValue({ data: [{ id: 11, name: '天堂鳥' }] } as never)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-09-06')
    await flushPromises()
    expect(wrapper.find('.section-stub').attributes('data-date')).toBe('2026-09-06')

    wrapper.findComponent(AttendanceSectionStub).vm.$emit('update:attendanceDate', '2026-09-05')
    await flushPromises()
    expect(wrapper.find('.section-stub').attributes('data-date')).toBe('2026-09-05')
    expect(wrapper.findComponent({ name: 'ElDatePicker' }).attributes('modelvalue')).toBe('2026-09-05')
  })

  it('班級清單載入失敗：提示錯誤、不選班，頁面照常渲染', async () => {
    vi.mocked(getClassrooms).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(wrapper.find('.section-stub').attributes('data-classroom')).toBe('')
  })
})
