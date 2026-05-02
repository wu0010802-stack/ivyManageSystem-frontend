import api from './index'

// ----- 教師端聯絡簿 -----

// 列班級當日（含草稿與已發布、含完成度）
export const getClassDay = (params) =>
  api.get('/portal/contact-book', { params })

// 班級表式批次 upsert（草稿）
export const batchUpsert = (data) =>
  api.post('/portal/contact-book/batch', data)

// 單筆編輯（樂觀鎖：if-match 帶 entry.version）
export const updateEntry = (entryId, data, version) =>
  api.put(`/portal/contact-book/${entryId}`, data, {
    headers: version != null ? { 'If-Match': String(version) } : {},
  })

// 發布單筆（觸發 WS + LINE）
export const publishEntry = (entryId) =>
  api.post(`/portal/contact-book/${entryId}/publish`)

// 上傳照片（一次一張）
export const uploadPhoto = (entryId, formData) =>
  api.post(`/portal/contact-book/${entryId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// 軟刪照片
export const deletePhoto = (entryId, attachmentId) =>
  api.delete(`/portal/contact-book/${entryId}/photos/${attachmentId}`)
