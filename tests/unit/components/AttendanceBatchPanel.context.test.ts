import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AttendanceBatchPanel from '@/components/student/academic-affairs/AttendanceBatchPanel.vue'
import { getDailyAttendance, batchSaveAttendance } from '@/api/studentAttendance'
vi.mock('@/api/studentAttendance', () => ({ getDailyAttendance: vi.fn(), batchSaveAttendance: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }))
const response = (id = 1) => ({ data: { records: [{ student_id: id, name: '測試學生', status: null, remark: null }] } })
function mountPanel() {
  return mount(AttendanceBatchPanel, { props: { date: '2026-09-14', classroomId: 1 }, global: { directives: { loading: () => {} }, stubs: {
    'el-button': { props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
    'el-table': { props: ['data'], template: '<div>{{ JSON.stringify(data) }}</div>' },
  } } })
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getDailyAttendance).mockResolvedValue(response() as never) })
describe('點名編修上下文', () => {
  it.each([{ date: '2026-09-15' }, { classroomId: 2 }])('切換 %j 載入失敗後不可儲存舊資料', async (props) => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(getDailyAttendance).mockRejectedValueOnce(new Error('失敗'))
    await wrapper.setProps(props)
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === '儲存編修')!.trigger('click')
    expect(batchSaveAttendance).not.toHaveBeenCalled()
  })
  it('新日期成功載入空清單後仍不可儲存，成功載入學生才可儲存', async () => {
    const wrapper = mountPanel(); await flushPromises()
    vi.mocked(getDailyAttendance).mockResolvedValueOnce({ data: { records: [] } } as never)
    await wrapper.setProps({ date: '2026-09-15' }); await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === '儲存編修')!.trigger('click')
    expect(batchSaveAttendance).not.toHaveBeenCalled()
    vi.mocked(batchSaveAttendance).mockResolvedValueOnce({ data: {} } as never)
    await wrapper.setProps({ date: '2026-09-16' }); await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === '儲存編修')!.trigger('click')
    await flushPromises()
    expect(batchSaveAttendance).toHaveBeenCalledWith({ date: '2026-09-16', entries: [{ student_id: 1, status: '出席', remark: null }] })
  })
  it('舊日期晚回不可覆蓋新日期點名資料', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(getDailyAttendance).mockReturnValueOnce(new Promise((done) => { resolve = done }) as never)
    const wrapper = mountPanel()
    vi.mocked(getDailyAttendance).mockResolvedValueOnce(response(2) as never)
    await wrapper.setProps({ date: '2026-09-15' })
    await flushPromises()
    resolve(response(1)); await flushPromises()
    expect(wrapper.text()).toContain('"student_id":2')
    expect(wrapper.text()).not.toContain('"student_id":1')
  })
  it('儲存晚回不可對新日期發 saved 或重新載入', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(batchSaveAttendance).mockReturnValueOnce(new Promise((done) => { resolve = done }) as never)
    const wrapper = mountPanel(); await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === '儲存編修')!.trigger('click')
    await wrapper.setProps({ date: '2026-09-15' }); await flushPromises()
    const calls = vi.mocked(getDailyAttendance).mock.calls.length
    resolve({ data: {} }); await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(getDailyAttendance).toHaveBeenCalledTimes(calls)
    expect(batchSaveAttendance).toHaveBeenCalledWith({ date: '2026-09-14', entries: [{ student_id: 1, status: '出席', remark: null }] })
  })
})
