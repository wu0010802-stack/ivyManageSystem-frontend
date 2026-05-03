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

// ----- 便利端點：未發布列表 / 複製昨日 / 套用範本 / 批次發布 -----

// 列某班某日未發布草稿
export const listUnpublished = (params) =>
  api.get('/portal/contact-book/unpublished', { params })

// 把昨日該班所有 entry 欄位複製為今日草稿（已存在則 skip）
export const copyFromYesterday = (data) =>
  api.post('/portal/contact-book/copy-from-yesterday', data)

// 套用範本到一個或多個 entry
export const applyTemplate = (data) =>
  api.post('/portal/contact-book/apply-template', data)

// 一鍵批次發布草稿
export const batchPublish = (data) =>
  api.post('/portal/contact-book/batch-publish', data)
