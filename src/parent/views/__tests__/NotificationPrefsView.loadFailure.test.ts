import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getPrefs = vi.fn()
const updatePrefs = vi.fn().mockResolvedValue({ data: { ok: true } })
vi.mock('@/parent/api/notifications', () => ({
  getNotificationPreferences: (...a: unknown[]) => getPrefs(...a),
  updateNotificationPreferences: (...a: unknown[]) => updatePrefs(...a),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import NotificationPrefsView from '@/parent/views/NotificationPrefsView.vue'

beforeEach(() => {
  getPrefs.mockReset()
  updatePrefs.mockClear()
})

describe('NotificationPrefsView 載入失敗與切換方向', () => {
  it('載入失敗 → 顯示重試、不畫開關（避免全部顯示成「開」）', async () => {
    getPrefs.mockRejectedValueOnce(new Error('boom'))
    const w = shallowMount(NotificationPrefsView)
    await flushPromises()
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(true)
    expect(w.findAllComponents({ name: 'M3Switch' }).length).toBe(0)

    getPrefs.mockResolvedValueOnce({ data: { prefs: { 'parent.announcement': true } } })
    w.findComponent({ name: 'MobileErrorRetry' }).vm.$emit('retry')
    await flushPromises()
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.findAllComponents({ name: 'M3Switch' }).length).toBeGreaterThan(0)
  })

  it('未回傳的 key 顯示為開，按一下送出 false（不是 true）', async () => {
    getPrefs.mockResolvedValueOnce({ data: { prefs: {} } })
    const w = shallowMount(NotificationPrefsView)
    await flushPromises()
    const sw = w.findAllComponents({ name: 'M3Switch' })[0]
    expect(sw.props('modelValue')).toBe(true)
    sw.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(updatePrefs).toHaveBeenCalledWith({ 'parent.message_received': false })
  })
})
