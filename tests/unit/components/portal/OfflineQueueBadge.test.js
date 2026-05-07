import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OfflineQueueBadge from '@/components/portal/OfflineQueueBadge.vue'

describe('OfflineQueueBadge', () => {
  it('renders nothing when count is 0', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 0 } })
    expect(w.find('[data-test="badge-root"]').exists()).toBe(false)
  })

  it('renders count when > 0', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 3 } })
    expect(w.find('[data-test="badge-root"]').exists()).toBe(true)
    expect(w.text()).toContain('3')
    expect(w.text()).toContain('待同步')
  })

  it('shows clock icon when status=pending', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 2, status: 'pending' } })
    expect(w.find('[data-test="badge-root"]').classes()).toContain('badge--pending')
  })

  it('shows warning color when status=failed', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 1, status: 'failed' } })
    expect(w.find('[data-test="badge-root"]').classes()).toContain('badge--failed')
  })

  it('emits click when clicked', async () => {
    const w = mount(OfflineQueueBadge, { props: { count: 2 } })
    await w.find('[data-test="badge-root"]').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('caps display at 99+', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 150 } })
    expect(w.text()).toContain('99+')
  })
})
