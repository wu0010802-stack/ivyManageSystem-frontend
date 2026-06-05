import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'

// 回傳「真 ref」：模板 {{ reservedCount }} 才會 auto-unwrap
vi.mock('@/composables/useClassroomProspects', () => ({
  useClassroomProspects: () => ({
    reservedCount: ref(2),
    prospects: ref([
      { id: 1, child_name: '準新生甲', source: '官網', has_deposit: true, target_semester: 1 },
    ]),
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
    { id: 11, name: '在學甲', is_active: true },
    { id: 12, name: '在學乙', is_active: true },
  ],
}

function mountDrawer() {
  return mount(ClassroomStudentDrawer, {
    props: { visible: true, classroom, loading: false },
    global: {
      plugins: [ElementPlus],
      // el-drawer 在 jsdom 不渲染 body（teleport+transition）；stub 成直接吐 default slot
      stubs: { teleport: true, 'el-drawer': { template: '<div><slot /></div>' } },
    },
  })
}

describe('ClassroomStudentDrawer 準新生', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows prospect section and capacity pill with reserved', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('準新生甲')
    expect(text).toMatch(/保留\s*2/)
    expect(text).toContain('在學 2')
  })

  it('prospects are NOT counted in active students', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('在學 2') // activeStudents.length 未被準新生灌水
    expect(text).toContain('準新生甲') // 準新生在獨立區塊呈現
    expect(text).not.toContain('在學 3')
  })
})
