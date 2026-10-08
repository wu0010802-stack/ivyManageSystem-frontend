/** F13：通知偏好讀寫一律使用後端 canonical event_type（parent.*／bus.approaching）。 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import NotificationPrefsView from '../NotificationPrefsView.vue'
import M3Switch from '@/parent/components/m3/M3Switch.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/parent/api/notifications', () => ({
  getNotificationPreferences: mocks.get,
  updateNotificationPreferences: mocks.put,
}))

beforeEach(() => {
  mocks.put.mockReset().mockResolvedValue({ data: {} })
  mocks.get.mockReset().mockResolvedValue({ data: { channel: 'line', prefs: {
    'parent.message_received': true,
    'parent.announcement': false,
    'parent.event_ack_required': true,
    'parent.fee_due': true,
    'parent.leave_result': true,
    'parent.attendance_alert': true,
    'parent.contact_book_published': true,
    'bus.approaching': true,
  } } })
})

describe('NotificationPrefsView canonical key（F13）', () => {
  it('後端已關閉園所公告時，開關顯示關閉', async () => {
    const wrapper = shallowMount(NotificationPrefsView)
    await flushPromises()
    expect(wrapper.findAllComponents(M3Switch)[1].props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('關閉原先啟用的老師訊息時，第一次 PUT 以 canonical key 送 false', async () => {
    const wrapper = shallowMount(NotificationPrefsView)
    await flushPromises()
    wrapper.findAllComponents(M3Switch)[0].vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledWith({ 'parent.message_received': false })
    wrapper.unmount()
  })
})
