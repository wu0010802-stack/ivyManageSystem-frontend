import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/parent/api/childReports', () => ({
  fetchChildReports: vi.fn(),
  childReportDownloadUrl: (sid, rid) => `/api/parent/growth-reports/${rid}/download?student_id=${sid}`,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { fetchChildReports } from '@/parent/api/childReports'
import ChildReportsView from '@/parent/views/ChildReportsView.vue'

describe('ChildReportsView', () => {
  it('renders empty state when no reports', async () => {
    fetchChildReports.mockResolvedValueOnce({ data: { items: [] } })
    const w = mount(ChildReportsView, { attachTo: document.body })
    await flushPromises()
    expect(w.text()).toContain('還沒有')
    w.unmount()
  })

  it('renders report rows', async () => {
    fetchChildReports.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, period_label: '2026 春季', period_start: '2026-02-01',
            period_end: '2026-05-31', generated_at: '2026-05-14T10:00:00' },
        ],
      },
    })
    const w = mount(ChildReportsView, { attachTo: document.body })
    await flushPromises()
    expect(w.text()).toContain('2026 春季')
    expect(w.text()).toContain('下載 PDF')
    w.unmount()
  })
})
