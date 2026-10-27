import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(),
}))
vi.mock('@/api/contactBook', () => ({
  applyTemplate: vi.fn(),
  batchPublish: vi.fn(),
  batchUpsert: vi.fn(),
  copyFromYesterday: vi.fn(),
  deletePhoto: vi.fn(),
  getClassDay: vi.fn(),
  publishEntry: vi.fn(),
  updateEntry: vi.fn(),
  uploadPhoto: vi.fn(),
}))
vi.mock('@/composables/useContactBookTemplates', () => ({
  useContactBookTemplates: () => ({
    loaded: { value: false },
    loading: { value: false },
    templates: { value: [] },
    load: vi.fn(),
  }),
}))
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getMyStudents } from '@/api/portal'
import { getClassDay } from '@/api/contactBook'
import PortalContactBookView from '../PortalContactBookView.vue'

const STUBS = {
  ContactBookFilterBar: true,
  ContactBookEntryCard: true,
  ContactBookEntryDrawer: true,
  EmptyState: true,
  PortalErrorState: { name: 'PortalErrorState', props: ['message'], emits: ['retry'], template: '<div class="pes">{{ message }}</div>' },
  'el-card': true,
  'el-tag': true,
  'el-progress': true,
  'el-empty': { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  'el-dialog': true,
  'el-button': true,
  'el-radio-group': true,
  'el-radio': true,
}
const mountView = () => mount(PortalContactBookView, { global: { stubs: STUBS, directives: { loading: () => {} } } })

beforeEach(() => vi.clearAllMocks())

describe('PortalContactBookView 載入失敗', () => {
  it('班級載入失敗 → 顯示錯誤與重試，不顯示「無學生資料」；重試成功後載入當日', async () => {
    vi.mocked(getMyStudents).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('.pes').text()).toContain('班級資料載入失敗')
    expect(w.text()).not.toContain('無學生資料')

    vi.mocked(getMyStudents).mockResolvedValueOnce({ data: { classrooms: [{ classroom_id: 1, classroom_name: '蘋果班' }] } } as never)
    vi.mocked(getClassDay).mockResolvedValueOnce({ data: { items: [{ student_id: 9 }], completion: { roster: 1, draft: 0, published: 0, missing: 1 } } } as never)
    w.findComponent({ name: 'PortalErrorState' }).vm.$emit('retry')
    await flushPromises()
    expect(w.find('.pes').exists()).toBe(false)
    expect(getClassDay).toHaveBeenCalled()
  })

  it('當日聯絡簿載入失敗 → 顯示錯誤，不顯示「此日期此班級無學生資料」', async () => {
    vi.mocked(getMyStudents).mockResolvedValueOnce({ data: { classrooms: [{ classroom_id: 1, classroom_name: '蘋果班' }] } } as never)
    vi.mocked(getClassDay).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('.pes').text()).toContain('聯絡簿載入失敗')
    expect(w.text()).not.toContain('此日期此班級無學生資料')
  })

  it('真的沒有負責班級 → 說明沒有班級', async () => {
    vi.mocked(getMyStudents).mockResolvedValueOnce({ data: { classrooms: [] } } as never)
    const w = mountView()
    await flushPromises()
    expect(w.find('.empty').text()).toBe('目前沒有你負責的班級')
  })
})
