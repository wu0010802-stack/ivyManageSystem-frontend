/**
 * 家長端用藥單 API（Phase 2）。
 *
 * 對應後端 api/parent_portal/medications.py。
 * 過敏軟警告：第一次提交若藥名與過敏原相關 → 後端回 409；
 * 前端應在 catch 中判斷 detail.code === 'ALLERGY_WARNING' 顯示
 * 確認彈框，使用者按「確認送出」後重 POST 並帶 acknowledge_allergy_warning=true。
 */

import api from './index'

export function listMedicationOrders(params = {}) {
  return api.get('/parent/medication-orders', { params })
}

export function getMedicationOrder(orderId) {
  return api.get(`/parent/medication-orders/${orderId}`)
}

/**
 * @param {Object} payload {student_id, order_date, medication_name, dose, time_slots, note?, acknowledge_allergy_warning?}
 */
export function createMedicationOrder(payload) {
  return api.post('/parent/medication-orders', payload)
}

export function uploadMedicationPhoto(orderId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/parent/medication-orders/${orderId}/photos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteMedicationPhoto(orderId, attachmentId) {
  return api.delete(`/parent/medication-orders/${orderId}/photos/${attachmentId}`)
}

/** 上傳事件簽收的手寫簽名圖（PNG）。 */
export function uploadAckSignature(eventId, studentId, pngBlob) {
  const fd = new FormData()
  fd.append('file', pngBlob, 'signature.png')
  return api.post(
    `/parent/events/${eventId}/ack/signature?student_id=${studentId}`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}
