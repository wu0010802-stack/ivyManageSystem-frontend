import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 學生個案頁頁首（2026-10-12 UI/UX 審查）。
 *
 * 1. 學生姓名是整頁唯一的大標題，原本是 h2，導致頁面沒有 h1（Portal 殼層不提供 h1，
 *    每頁由 PortalPageHeader 或頁面自己給一個）。改為 h1，樣式不變。
 * 2. 三顆動作鈕（新增觀察／記量測／記里程碑）手機 390px 寬排不下，第三顆會超出卡片
 *    右緣；排版靠 CSS（flex-wrap），jsdom 無版面引擎，這裡只釘三顆鈕都在同一個
 *    .actions 容器內，確保換行規則涵蓋全部按鈕。
 */

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

vi.mock('@/api/portalStudentDetail', () => ({
  getStudentDetail: vi.fn(),
}))

import { getStudentDetail } from '@/api/portalStudentDetail'
import PortalStudentDetailView from '@/views/portal/PortalStudentDetailView.vue'

function detailPayload() {
  return {
    student: { id: 5, name: '王小明', birthday: '2022-03-01', lifecycle_status: 'enrolled' },
    classroom: { name: '小班' },
    guardians: [],
    health: { allergies: [], medications: [] },
    attendance_30d: {},
    recent_observations_30d: [],
    recent_assessments: [],
    recent_incidents_30d: [],
    contact_book_recent: [],
  }
}

async function mountView() {
  const wrapper = mount(PortalStudentDetailView, {
    global: { plugins: [ElementPlus] },
    props: { studentId: 5 },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PortalStudentDetailView 頁首', () => {
  beforeEach(() => {
    vi.mocked(getStudentDetail).mockResolvedValue({ data: detailPayload() } as never)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('學生姓名是頁面的 h1（不再是 h2）', async () => {
    const wrapper = await mountView()

    const h1s = wrapper.findAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].text()).toBe('王小明')
    expect(wrapper.find('.title-row h2').exists()).toBe(false)
  })

  it('三顆動作鈕都在同一個 .actions 容器內', async () => {
    const wrapper = await mountView()

    const buttons = wrapper.get('.header .actions').findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['新增觀察', '記量測', '記里程碑'])
  })
})
