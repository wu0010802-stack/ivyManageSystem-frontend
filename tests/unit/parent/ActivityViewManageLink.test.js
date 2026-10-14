// #2（前端）：家長報名成功後，後端一次性回傳 query_token，
// ActivityView 須以公開查詢頁網址組成「管理我的報名」連結並呈現給家長保存。
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  myRegistrations: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  registerCourses: vi.fn(),
  confirmPromotion: vi.fn(),
  declinePromotion: vi.fn(),
  getRegistrationTime: vi.fn(() => Promise.resolve({ data: { open_at: null, close_at: '2999-01-01T00:00:00Z' } })),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '阿活' }],
    load: vi.fn(() => Promise.resolve()),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))

import { registerCourses } from '@/parent/api/activity'
import ActivityView from '@/parent/views/ActivityView.vue'
import ConfirmDialog from '@/parent/components/ConfirmDialog.vue'

function mountView() {
  return mount(ActivityView, {
    attachTo: document.body,
    global: {
      stubs: {
        // PullToRefresh 是最外層包裹，需渲染 slot 才看得到 ActivityView 自身模板
        PullToRefresh: { template: '<div><slot /></div>' },
        ActivityHero: true,
        ChildContextHeader: true,
        ActivityCardList: true,
        ActivityRegisterSheet: true,
        RegistrationStatusList: true,
        ParentIcon: true,
      },
    },
  })
}

describe('ActivityView 管理連結 (#2)', () => {
  it('報名成功後呈現含回傳 token 的公開管理連結', async () => {
    registerCourses.mockResolvedValueOnce({
      data: { id: 1, query_token: 'tok-xyz-123456', courses: [] },
    })
    const w = mountView()
    await flushPromises()

    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    expect(w.text()).toContain('管理連結')
    expect(w.text()).toContain(
      '/public.html#/activity/query?token=tok-xyz-123456',
    )
    w.unmount()
  })

  it('回應未含 token 時不顯示管理連結卡片', async () => {
    registerCourses.mockResolvedValueOnce({ data: { id: 2, courses: [] } })
    const w = mountView()
    await flushPromises()

    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    expect(w.text()).not.toContain('管理連結')
    w.unmount()
  })

  it('後端對非手機家長明確回 query_token=null 時不顯示無法使用的管理連結', async () => {
    registerCourses.mockResolvedValueOnce({
      data: { id: 3, query_token: null, courses: [] },
    })
    const w = mountView()
    await flushPromises()

    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    expect(w.text()).not.toContain('管理連結')
    expect(w.vm.manageUrl).toBe('')
    w.unmount()
  })

  it('按 × 不會直接消失：先確認並提醒保存，確認後才關閉', async () => {
    registerCourses.mockResolvedValueOnce({
      data: { id: 4, query_token: 'tok-close-1', courses: [] },
    })
    const w = mountView()
    await flushPromises()
    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    await w.find('[data-testid="manage-link-close"]').trigger('click')
    const dialog = w.findAllComponents(ConfirmDialog).find((d) => d.props('title') === '確定已保存管理連結？')
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('message')).toContain('還沒複製')
    // 確認前連結仍在
    expect(w.text()).toContain('tok-close-1')

    dialog.vm.$emit('confirm')
    await flushPromises()
    expect(w.text()).not.toContain('tok-close-1')
    w.unmount()
  })

  it('複製：clipboard 被拒時退回 execCommand，成功後關閉提醒改為「已複製」版本', async () => {
    registerCourses.mockResolvedValueOnce({
      data: { id: 5, query_token: 'tok-copy-1', courses: [] },
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
      configurable: true,
    })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    const w = mountView()
    await flushPromises()
    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    await w.find('.manage-link-copy').trigger('click')
    await flushPromises()
    expect(exec).toHaveBeenCalledWith('copy')

    await w.find('[data-testid="manage-link-close"]').trigger('click')
    const dialog = w.findAllComponents(ConfirmDialog).find((d) => d.props('title') === '確定已保存管理連結？')
    expect(dialog.props('message')).toContain('連結已複製')
    Reflect.deleteProperty(navigator, 'clipboard')
    w.unmount()
  })
})
