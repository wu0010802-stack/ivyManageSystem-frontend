import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

vi.mock('@/parent/api/signDocuments', () => ({
  listMySignRequests: vi.fn(),
}))

import { listMySignRequests } from '@/parent/api/signDocuments'
import SignListView from '../SignListView.vue'

const mockList = listMySignRequests as ReturnType<typeof vi.fn>

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/sign/:id', component: { template: '<div />' } },
  ],
})

function mountView() {
  return mount(SignListView, { global: { plugins: [router] } })
}

describe('SignListView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('無待簽文件時顯示空狀態', async () => {
    mockList.mockResolvedValue({ data: { pending: [], signed: [] } })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('目前沒有待簽文件')
  })

  it('顯示待簽與已簽文件卡片', async () => {
    mockList.mockResolvedValue({
      data: {
        pending: [
          { id: 1, student_id: 10, student_name: '王小明', title: '入學契約', doc_type: 'contract', status: 'pending', sent_at: '2026-08-11T10:00:00', signed_at: null, has_pdf: false },
        ],
        signed: [
          { id: 2, student_id: 10, student_name: '王小明', title: '同意書', doc_type: 'consent_form', status: 'signed', sent_at: '2026-08-10T10:00:00', signed_at: '2026-08-10T11:00:00', has_pdf: true },
        ],
      },
    })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('入學契約')
    expect(w.text()).toContain('同意書')
    expect(w.text()).toContain('待簽')
  })

  it('點擊卡片導向詳情頁', async () => {
    mockList.mockResolvedValue({
      data: {
        pending: [
          { id: 5, student_id: 10, student_name: '王小明', title: '入學契約', doc_type: 'contract', status: 'pending', sent_at: '2026-08-11T10:00:00', signed_at: null, has_pdf: false },
        ],
        signed: [],
      },
    })
    const w = mountView()
    await flushPromises()
    const pushSpy = vi.spyOn(router, 'push')
    await w.find('.sign-card').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/sign/5')
  })
})
