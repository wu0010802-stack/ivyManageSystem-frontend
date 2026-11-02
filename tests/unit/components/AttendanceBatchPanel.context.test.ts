/**
 * 點名編修（AttendanceBatchPanel）班級／日期上下文的不變式。
 * 2026-11-02 改版（未點名不再預設出席、只送改動列、切換時的未存變更守衛）後重寫，
 * 保留原本四條：切換後載入失敗不可存舊資料、空清單不可存、舊回應晚到不可覆蓋、
 * 存檔晚回不可對新日期 emit saved 或重抓。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const confirmDiscardChanges = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges,
  useUnsavedChangesGuard: vi.fn(),
}))
vi.mock('@/api/studentAttendance', () => ({ getDailyAttendance: vi.fn(), batchSaveAttendance: vi.fn() }))

import AttendanceBatchPanel from '@/components/student/academic-affairs/AttendanceBatchPanel.vue'
import { getDailyAttendance, batchSaveAttendance } from '@/api/studentAttendance'

const response = (id = 1, name = '測試學生') => ({ data: { records: [{ student_id: id, name, status: null, remark: null }] } })

type PanelProps = { date: string; classroomId: number | null }

function mountPanel(opts: { syncBack?: boolean } = {}) {
  const props: Record<string, unknown> = { date: '2026-09-14', classroomId: 1, hideClassroomSelect: true, hideDatePicker: true }
  const wrapper = mount(AttendanceBatchPanel, {
    props,
    global: { plugins: [ElementPlus], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  if (opts.syncBack) {
    // 模擬外層 v-model：回寫事件直接改回 props
    wrapper.setProps({
      'onUpdate:classroomId': (v: number | null) => wrapper.setProps({ classroomId: v } as Partial<PanelProps>),
      'onUpdate:date': (v: string) => wrapper.setProps({ date: v } as Partial<PanelProps>),
    } as never)
  }
  return wrapper
}

const saveButton = (w: ReturnType<typeof mountPanel>) => w.find('[data-testid="rollcall-save"]')

/** 第一列點「出席」，製造一筆改動 */
async function markFirstPresent(w: ReturnType<typeof mountPanel>) {
  await w.findAll('.status-seg')[0].findAll('input[type="radio"]')[0].setValue(true)
}

beforeEach(() => {
  vi.mocked(getDailyAttendance).mockReset()
  vi.mocked(batchSaveAttendance).mockReset()
  confirmDiscardChanges.mockReset()
  vi.mocked(getDailyAttendance).mockResolvedValue(response() as never)
})

describe('點名編修上下文', () => {
  it.each([{ date: '2026-09-15' }, { classroomId: 2 }])('有改動時切換 %j 並選捨棄、新上下文載入失敗：不可儲存舊資料', async (next) => {
    const wrapper = mountPanel()
    await flushPromises()
    await markFirstPresent(wrapper)
    confirmDiscardChanges.mockResolvedValueOnce(true)
    vi.mocked(getDailyAttendance).mockRejectedValueOnce(new Error('失敗'))
    await wrapper.setProps(next)
    await flushPromises()
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('點名資料載入失敗')
    expect(saveButton(wrapper).exists()).toBe(false)
    expect(batchSaveAttendance).not.toHaveBeenCalled()
  })

  it('新日期載入空清單不可儲存；載入學生並改動後只送新日期那一筆', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(getDailyAttendance).mockResolvedValueOnce({ data: { records: [] } } as never)
    await wrapper.setProps({ date: '2026-09-15' })
    await flushPromises()
    expect(saveButton(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('這個班級目前沒有在籍學生')

    vi.mocked(batchSaveAttendance).mockResolvedValueOnce({ data: { warnings: [] } } as never)
    await wrapper.setProps({ date: '2026-09-16' })
    await flushPromises()
    await markFirstPresent(wrapper)
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(batchSaveAttendance).toHaveBeenCalledWith({ date: '2026-09-16', entries: [{ student_id: 1, status: '出席', remark: null }] })
  })

  it('舊日期晚回不可覆蓋新日期點名資料', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(getDailyAttendance).mockReturnValueOnce(new Promise((done) => { resolve = done }) as never)
    const wrapper = mountPanel()
    vi.mocked(getDailyAttendance).mockResolvedValueOnce(response(2, '新日期學生') as never)
    await wrapper.setProps({ date: '2026-09-15' })
    await flushPromises()
    resolve(response(1, '舊日期學生'))
    await flushPromises()
    expect(wrapper.text()).toContain('新日期學生')
    expect(wrapper.text()).not.toContain('舊日期學生')
  })

  it('儲存晚回：送的是舊日期；切到新日期後不發 saved、不重抓；存檔中切換不跳「捨棄」詢問', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(batchSaveAttendance).mockReturnValueOnce(new Promise((done) => { resolve = done }) as never)
    const wrapper = mountPanel()
    await flushPromises()
    await markFirstPresent(wrapper)
    await saveButton(wrapper).trigger('click')
    await wrapper.setProps({ date: '2026-09-15' })
    await flushPromises()
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
    const calls = vi.mocked(getDailyAttendance).mock.calls.length
    resolve({ data: { warnings: [] } })
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(getDailyAttendance).toHaveBeenCalledTimes(calls)
    expect(batchSaveAttendance).toHaveBeenCalledWith({ date: '2026-09-14', entries: [{ student_id: 1, status: '出席', remark: null }] })
  })

  it('有改動時切換並選「返回儲存」：回寫舊班級、不抓新班，編修保留且可儲存到原班原日期', async () => {
    const wrapper = mountPanel({ syncBack: true })
    await flushPromises()
    await markFirstPresent(wrapper)
    confirmDiscardChanges.mockResolvedValueOnce(false)
    await wrapper.setProps({ classroomId: 2 })
    await flushPromises()
    expect(wrapper.emitted('update:classroomId')?.at(-1)).toEqual([1])
    expect(wrapper.props('classroomId')).toBe(1)
    expect(vi.mocked(getDailyAttendance).mock.calls.some(([q]) => q.classroom_id === 2)).toBe(false)
    expect(saveButton(wrapper).text()).toContain('儲存 1 位')

    vi.mocked(batchSaveAttendance).mockResolvedValueOnce({ data: { warnings: [] } } as never)
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(batchSaveAttendance).toHaveBeenCalledWith({ date: '2026-09-14', entries: [{ student_id: 1, status: '出席', remark: null }] })
  })

  it('選「返回儲存」但外層沒有接回寫：改抓新班，整段期間都不能把舊班資料存到新上下文', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await markFirstPresent(wrapper)
    let answer!: (v: boolean) => void
    confirmDiscardChanges.mockReturnValueOnce(new Promise((r) => { answer = r }))
    vi.mocked(getDailyAttendance).mockResolvedValueOnce(response(5, '二班學生') as never)
    await wrapper.setProps({ classroomId: 2 })
    await flushPromises()
    // 詢問框開著：表格仍是舊班，但不可儲存
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    answer(false)
    await flushPromises()
    expect(wrapper.text()).toContain('二班學生')
    expect(batchSaveAttendance).not.toHaveBeenCalled()
  })
})
