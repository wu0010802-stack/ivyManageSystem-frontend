import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const listMock = vi.fn()
vi.mock('@/api/surveys', () => ({
  listPortalSurveys: (...a: unknown[]) => listMock(...a),
}))

describe('PortalSurveysView', () => {
  it('渲染進行中與已結束調查、空清單顯示 empty', async () => {
    listMock.mockResolvedValue({ data: { items: [
      { id: 1, title: '秋季戶外教學', event_date: '2030-10-15', reply_deadline: '2030-10-01', status: 'published', fee_note: null },
      { id: 2, title: '親子日', event_date: null, reply_deadline: '2020-01-01', status: 'closed', fee_note: null },
    ] } })
    const View = (await import('@/views/portal/PortalSurveysView.vue')).default
    const w = mount(View, { global: { plugins: [ElementPlus], stubs: { 'router-link': true } } })
    await flushPromises()
    expect(w.text()).toContain('秋季戶外教學')
    expect(w.text()).toContain('親子日')
    w.unmount()
  })
})
