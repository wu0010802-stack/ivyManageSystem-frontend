import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/internalMetrics', () => ({
  getSchedulerMetrics: vi.fn(),
}))

import SettingsObservabilityTab from '../SettingsObservabilityTab.vue'
import * as api from '@/api/internalMetrics'

const _emptyMetrics = {
  worker_pid: 12345,
  hostname: 'test-host',
  schedulers: {},
}

const _healthyMetrics = {
  worker_pid: 12345,
  hostname: 'test-host',
  schedulers: {
    medication_reminder: {
      last_success_at: '2026-05-26T10:00:00Z',
      last_failure_at: null,
      consecutive_failures: 0,
      last_rows_processed: 5,
      total_rows_processed: 250,
      total_runs: 50,
      total_failures: 0,
      last_error_message: null,
    },
  },
}

const _failingMetrics = {
  worker_pid: 12345,
  hostname: 'test-host',
  schedulers: {
    finance_reconciliation: {
      last_success_at: '2026-05-25T02:00:00Z',
      last_failure_at: '2026-05-26T02:00:00Z',
      consecutive_failures: 5,
      last_rows_processed: 0,
      total_rows_processed: 100,
      total_runs: 60,
      total_failures: 5,
      last_error_message: 'ConnectionError: DB unreachable',
    },
    medication_reminder: {
      last_success_at: '2026-05-26T07:30:00Z',
      last_failure_at: null,
      consecutive_failures: 0,
      last_rows_processed: 3,
      total_rows_processed: 200,
      total_runs: 50,
      total_failures: 0,
      last_error_message: null,
    },
  },
}

describe('SettingsObservabilityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no schedulers have run', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: _emptyMetrics,
    })
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="metrics-table"]').exists()).toBe(false)
  })

  it('renders worker chip with pid and hostname', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: _emptyMetrics,
    })
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    const chip = wrapper.find('[data-testid="worker-chip"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('12345')
    expect(chip.text()).toContain('test-host')
  })

  it('renders rows for each scheduler', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: _healthyMetrics,
    })
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-testid="metrics-table"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('medication_reminder')
    expect(wrapper.text()).toContain('250') // total_rows_processed
  })

  it('shows failing-banner and danger tag when consecutive_failures >= 3', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: _failingMetrics,
    })
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-testid="failing-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="failure-tag-danger"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ConnectionError: DB unreachable')
  })

  it('shows error banner when api call fails', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network down'),
    )
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    const err = wrapper.find('[data-testid="load-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('Network down')
  })

  it('refresh button triggers another api call', async () => {
    ;(api.getSchedulerMetrics as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: _emptyMetrics })
      .mockResolvedValueOnce({ data: _healthyMetrics })
    const wrapper = mount(SettingsObservabilityTab, { attachTo: document.body })
    await flushPromises()
    expect(api.getSchedulerMetrics).toHaveBeenCalledTimes(1)
    await wrapper.find('[data-testid="refresh-btn"]').trigger('click')
    await flushPromises()
    expect(api.getSchedulerMetrics).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('medication_reminder')
  })
})
