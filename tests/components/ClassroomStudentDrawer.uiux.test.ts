import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'

vi.mock('@/composables/useClassroomProspects', () => ({
  useClassroomProspects: () => ({
    reservedCount: ref(0),
    prospects: ref([]),
    loading: ref(false),
    reload: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const classroom = {
  id: 3,
  name: '小班A',
  grade_name: '小班',
  grade_id: 7,
  school_year: 115,
  semester: 1,
  capacity: 30,
  students: [
    { id: 11, name: '小明', gender: '男', is_active: true, allergy: '花生' },
    { id: 12, name: '小美', gender: '女', is_active: true },
  ],
}

function mountDrawer() {
  return mount(ClassroomStudentDrawer, {
    props: { visible: true, classroom, loading: false },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        'el-drawer': { template: '<div><slot /></div>' },
        // 選取學生會掛載詳情面板；隔離其副作用
        StudentDetailPanel: true,
      },
    },
  })
}

describe('ClassroomStudentDrawer UI/UX', () => {
  beforeEach(() => vi.clearAllMocks())

  it('B1：名冊列可由鍵盤聚焦並以 Enter 選取學生', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const first = wrapper.find('.roster-item')
    expect(first.exists()).toBe(true)
    expect(first.attributes('role')).toBe('option')
    expect(first.attributes('tabindex')).toBe('0')

    await first.trigger('keydown.enter')
    expect(first.classes()).toContain('selected')
  })

  it('B3：點「男」統計 pill 過濾名冊只剩男生', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    // 過濾前兩位都在
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('小美')

    await wrapper.find('.stat-pill--info').trigger('click')
    await flushPromises()

    const rosterText = wrapper.find('.roster-list').text()
    expect(rosterText).toContain('小明')
    expect(rosterText).not.toContain('小美')
  })

  it('B3：點「需注意」統計 pill 只剩有健康警示的學生', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.find('.stat-pill--warning').trigger('click')
    await flushPromises()

    const rosterText = wrapper.find('.roster-list').text()
    expect(rosterText).toContain('小明') // 有過敏
    expect(rosterText).not.toContain('小美')
  })
})
