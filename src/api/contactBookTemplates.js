/**
 * 聯絡簿範本 API（對應 api/portal/contact_book_templates.py）。
 *
 * 範本有兩層：personal（個人）/ shared（園所共用，需 PORTFOLIO_PUBLISH）。
 */
import api from './index'

export function listTemplates(params = {}) {
  return api.get('/portal/contact-book/templates', { params })
}

export function createTemplate(payload) {
  return api.post('/portal/contact-book/templates', payload)
}

export function updateTemplate(templateId, payload) {
  return api.patch(`/portal/contact-book/templates/${templateId}`, payload)
}

export function archiveTemplate(templateId) {
  return api.delete(`/portal/contact-book/templates/${templateId}`)
}

export function promoteTemplate(templateId) {
  return api.post(`/portal/contact-book/templates/${templateId}/promote`)
}
