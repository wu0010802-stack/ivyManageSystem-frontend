/**
 * NotificationPrefsView — 娃娃車快到提醒（bus.approaching）渲染回歸測試
 *
 * 背景：後端把 `bus.approaching` 納入 `PARENT_NOTIFICATION_EVENT_TYPES`，
 * `GET /preferences` 現在會回傳這個 key。本頁以 `EVENT_LABELS`（非 API 回傳的
 * key）為準去 v-for 渲染偏好清單，`EVENT_LABELS` 原本沒有這一筆，家長偏好頁
 * 看不到、關不掉這則通知。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getNotificationPreferencesMock = vi.fn()
const updateNotificationPreferencesMock = vi.fn().mockResolvedValue({ data: { ok: true } })
vi.mock('@/parent/api/notifications', () => ({
  getNotificationPreferences: (...args: unknown[]) => getNotificationPreferencesMock(...args),
  updateNotificationPreferences: (...args: unknown[]) => updateNotificationPreferencesMock(...args),
}))

beforeEach(() => {
  getNotificationPreferencesMock.mockReset()
  updateNotificationPreferencesMock.mockClear()
  getNotificationPreferencesMock.mockResolvedValue({
    data: {
      prefs: {
        message_received: true,
        announcement: true,
        event_ack_required: true,
        fee_due: true,
        leave_result: true,
        attendance_alert: true,
        'bus.approaching': true,
      },
    },
  })
})

describe('NotificationPrefsView — 娃娃車快到提醒', () => {
  it('渲染清單包含 bus.approaching 一項（有標籤文字）', async () => {
    const NotificationPrefsView = (await import('@/parent/views/NotificationPrefsView.vue')).default
    const wrapper = shallowMount(NotificationPrefsView)
    await flushPromises()

    expect(wrapper.text()).toContain('娃娃車快到提醒')

    wrapper.unmount()
  })

  it('可切換 bus.approaching 偏好（呼叫 update API 帶對應 key）', async () => {
    const NotificationPrefsView = (await import('@/parent/views/NotificationPrefsView.vue')).default
    const wrapper = shallowMount(NotificationPrefsView)
    await flushPromises()

    const vm = wrapper.vm as unknown as { toggle: (ev: string) => Promise<void> }
    await vm.toggle('bus.approaching')
    await flushPromises()

    expect(updateNotificationPreferencesMock).toHaveBeenCalledWith({ 'bus.approaching': false })

    wrapper.unmount()
  })
})
