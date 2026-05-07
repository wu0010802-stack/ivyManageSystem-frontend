import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentOfflinePanel from '@/views/portal/components/studentAttendance/StudentOfflinePanel.vue'

const STUBS = {
  OfflineQueueBadge: {
    template: '<span data-test="badge" :data-count="count" :data-status="status">{{ count }} 待同步</span>',
    props: ['count', 'status'],
  },
  ElButton: {
    template: '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
    props: ['size', 'type', 'loading', 'disabled'],
    emits: ['click'],
  },
}

describe('StudentOfflinePanel', () => {
  it('does not render when online and no pending', () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: true, pendingCount: 0, syncing: false },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="offline-panel"]').exists()).toBe(false)
  })

  it('renders offline message when isOnline=false', () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: false, pendingCount: 0, syncing: false },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="offline-panel"]').classes()).toContain('is-offline')
    expect(w.text()).toContain('目前離線')
  })

  it('renders OfflineQueueBadge when online with pending > 0', () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: true, pendingCount: 3, syncing: false },
      global: { stubs: STUBS },
    })
    const badge = w.find('[data-test="badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('data-count')).toBe('3')
    expect(badge.attributes('data-status')).toBe('pending')
  })

  it('shows sync button when online with pending > 0', async () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: true, pendingCount: 2, syncing: false },
      global: { stubs: STUBS },
    })
    const btn = w.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('立即同步')
    await btn.trigger('click')
    expect(w.emitted('sync-now')).toHaveLength(1)
  })

  it('shows loading state on sync button when syncing=true', () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: true, pendingCount: 1, syncing: true },
      global: { stubs: STUBS },
    })
    const btn = w.find('button')
    expect(btn.attributes('data-loading')).toBe('true')
  })

  it('hides sync button when offline (even if pending exists)', () => {
    const w = mount(StudentOfflinePanel, {
      props: { isOnline: false, pendingCount: 5, syncing: false },
      global: { stubs: STUBS },
    })
    expect(w.find('button').exists()).toBe(false)
  })
})
