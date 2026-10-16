import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

/**
 * 課程點名｜單一場次頁（2026-09-14 改版：drawer → 獨立路由）。
 *
 * 承接原 PortalActivityAttendanceView.race.test.ts 裡屬於「點名」而非「列表」的兩條
 * 守衛：後端 skipped 時要重抓權威名冊、不得用本地輸入樂觀當成已落地。
 * 另外鎖住改版後的行為：儲存成功留在本頁（關掉等於把老師踢回列表再自己找回那一列）。
 */
vi.mock('@/api/activity', () => ({
  getPortalAttendanceSession: vi.fn(),
  batchUpdatePortalAttendance: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import {
  batchUpdatePortalAttendance,
  getPortalAttendanceSession,
} from '@/api/activity'
import PortalActivityRollcallView from '../PortalActivityRollcallView.vue'

const push = vi.fn()
const routeParams: { sessionId: string } = { sessionId: '101' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParams }),
  useRouter: () => ({ push }),
  onBeforeRouteLeave: vi.fn(),
}))

function detail(...marks: Array<boolean | null>) {
  return {
    data: {
      id: 101,
      course_name: '跆拳道',
      session_date: '2026-09-16',
      total: marks.length,
      last_recorded_at: '2026-09-16T16:24:00',
      last_recorded_by: 't002',
      students: marks.map((is_present, i) => ({
        registration_id: 11 + i,
        student_id: 500 + i,
        student_name: `學生${i + 1}`,
        class_name: '天堂鳥',
        classroom_id: 1,
        is_present,
        attendance_notes: '',
      })),
    },
  }
}

const PanelStub = defineComponent({
  name: 'PortalRollcallPanel',
  props: ['groups', 'students', 'presentCount', 'absentCount', 'unmarkedCount', 'dirtyCount'],
  template:
    '<div data-test="panel" :data-unmarked="unmarkedCount" :data-present="presentCount" :data-dirty="dirtyCount">{{ students.length }}</div>',
})

async function mountPage() {
  const wrapper = mount(PortalActivityRollcallView, {
    global: {
      stubs: {
        PortalRollcallPanel: PanelStub,
        PortalPageHeader: { template: '<header><slot name="actions" /></header>' },
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

type PageVm = {
  drawerSession: { students: Array<{ is_present: boolean | null }> } | null
  handleSave: () => Promise<void>
  setUnmarkedPresent: () => void
}

beforeEach(() => {
  vi.clearAllMocks()
  push.mockClear()
  routeParams.sessionId = '101'
})

describe('PortalActivityRollcallView', () => {
  it('依路由的場次編號載入名冊，並要求依班分組', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, null) as never)

    const wrapper = await mountPage()

    expect(getPortalAttendanceSession).toHaveBeenCalledWith(101, { group_by: 'classroom' })
    expect(wrapper.find('[data-test="panel"]').text()).toBe('2')
  })

  it('載入未點名的名冊後不得把任何人變成缺席', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, null, true) as never)

    const wrapper = await mountPage()

    const vm = wrapper.vm as unknown as PageVm
    expect(vm.drawerSession!.students.map((s) => s.is_present)).toEqual([null, null, true])
    expect(wrapper.find('[data-test="panel"]').attributes('data-unmarked')).toBe('2')
  })

  it('儲存成功後留在本頁，不把老師踢回列表', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, null) as never)
    vi.mocked(batchUpdatePortalAttendance).mockResolvedValue({
      data: { updated: 1, skipped: 0 },
    } as never)

    const wrapper = await mountPage()
    const vm = wrapper.vm as unknown as PageVm
    vm.drawerSession!.students[0].is_present = true
    await vm.handleSave()
    await flushPromises()

    expect(batchUpdatePortalAttendance).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="panel"]').exists()).toBe(true)
    expect(push).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已儲存 1 筆點名')
  })

  it('只送有異動的列，沒動過的未點名不會被送出', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, null, null) as never)
    vi.mocked(batchUpdatePortalAttendance).mockResolvedValue({
      data: { updated: 1, skipped: 0 },
    } as never)

    const wrapper = await mountPage()
    const vm = wrapper.vm as unknown as PageVm
    vm.drawerSession!.students[1].is_present = false
    await vm.handleSave()
    await flushPromises()

    expect(batchUpdatePortalAttendance).toHaveBeenCalledWith(101, [
      { registration_id: 12, is_present: false, notes: '' },
    ])
  })

  it('完全沒有異動時不打 API', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, null) as never)

    const wrapper = await mountPage()
    await (wrapper.vm as unknown as PageVm).handleSave()

    expect(batchUpdatePortalAttendance).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('沒有需要儲存的點名異動')
  })

  it('後端 skipped 時重抓權威名冊，不用本地輸入樂觀當成已落地', async () => {
    vi.mocked(getPortalAttendanceSession)
      .mockResolvedValueOnce(detail(null, null) as never)
      .mockResolvedValueOnce(detail(true, null) as never)
    vi.mocked(batchUpdatePortalAttendance).mockResolvedValue({
      data: { updated: 1, skipped: 1 },
    } as never)

    const wrapper = await mountPage()
    const vm = wrapper.vm as unknown as PageVm
    vm.drawerSession!.students[0].is_present = true
    vm.drawerSession!.students[1].is_present = true
    await vm.handleSave()
    await flushPromises()

    expect(getPortalAttendanceSession).toHaveBeenCalledTimes(2)
    expect(vm.drawerSession!.students.map((s) => s.is_present)).toEqual([true, null])
  })

  it('批次只把未點名的補成出席，已標缺席的不動', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null, false, true) as never)

    const wrapper = await mountPage()
    const vm = wrapper.vm as unknown as PageVm
    vm.setUnmarkedPresent()
    await flushPromises()

    expect(vm.drawerSession!.students.map((s) => s.is_present)).toEqual([true, false, true])
  })

  it('頁首顯示上次儲存的時間與點名者', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(true) as never)

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('上次儲存')
    expect(wrapper.text()).toContain('t002')
  })

  it('場次編號不是數字時不打 API', async () => {
    vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null) as never)
    routeParams.sessionId = 'abc'

    await mountPage()

    expect(getPortalAttendanceSession).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalledWith('場次編號不正確')
  })
})
