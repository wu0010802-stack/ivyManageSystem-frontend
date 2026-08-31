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

const mockDownloadFile = vi.fn().mockResolvedValue(true)
vi.mock('@/utils/download', () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}))

const classroom = {
  id: 3,
  name: '小班A',
  grade_name: '小班',
  grade_id: 7,
  school_year: 115,
  semester: 1,
  capacity: 30,
  students: [
    { id: 11, name: '小明', gender: '男', is_active: true },
    { id: 12, name: '小美', gender: '女', is_active: true },
  ],
}

function mountDrawer(overrideClassroom: typeof classroom | null = classroom) {
  return mount(ClassroomStudentDrawer, {
    props: { visible: true, classroom: overrideClassroom, loading: false },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        'el-drawer': { template: '<div><slot /></div>' },
        StudentDetailPanel: true,
      },
    },
  })
}

describe('ClassroomStudentDrawer 匯出名冊', () => {
  beforeEach(() => {
    mockDownloadFile.mockClear()
  })

  it('banner 顯示「匯出名冊」按鈕', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const btn = wrapper.findAll('.banner-btn').find((b) => b.text() === '匯出名冊')
    expect(btn).toBeTruthy()
  })

  it('點擊後以 classroom_id 篩選呼叫 downloadFile，檔名含班名', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const btn = wrapper.findAll('.banner-btn').find((b) => b.text() === '匯出名冊')
    await btn!.trigger('click')
    await flushPromises()

    expect(mockDownloadFile).toHaveBeenCalledWith(
      '/exports/students',
      '小班A名冊.xlsx',
      { classroom_id: 3 },
    )
  })

  it('classroom 為 null 時不渲染按鈕（banner 整段在 v-if="classroom" 內）、也不誤呼叫', async () => {
    const wrapper = mountDrawer(null)
    await flushPromises()
    const btn = wrapper.findAll('.banner-btn').find((b) => b.text() === '匯出名冊')
    expect(btn).toBeUndefined()
    expect(mockDownloadFile).not.toHaveBeenCalled()
  })
})
