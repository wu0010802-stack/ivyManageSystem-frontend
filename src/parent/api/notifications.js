/**
 * 家長端通知偏好 API（Phase 6）。
 */

import api from './index'

export function getNotificationPreferences() {
  return api.get('/parent/notifications/preferences')
}

export function updateNotificationPreferences(prefs) {
  return api.put('/parent/notifications/preferences', { prefs })
}
