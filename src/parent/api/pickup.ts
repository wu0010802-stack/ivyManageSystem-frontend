/**
 * 家長端臨時接送授權 API。
 *
 * 對應後端 api/parent_portal/pickup.py。常用接送人 CRUD 與授權建立/取消/重發碼
 * 皆為 multipart（可選上傳照片），故用 FormData，不走 JSON body。
 */
import type { AxiosRequestConfig } from 'axios'
import api from './index'

export function listPickupPersons(studentId: number, config: AxiosRequestConfig = {}) {
  return api.get('/parent/pickup-persons', { params: { student_id: studentId }, ...config })
}

/**
 * @param form {student_id, person_name, person_relation, person_phone, note?, photo?: File}
 */
export function createPickupPerson(form: FormData) {
  return api.post('/parent/pickup-persons', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function updatePickupPerson(personId: number, form: FormData) {
  return api.patch(`/parent/pickup-persons/${personId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deletePickupPerson(personId: number) {
  return api.delete(`/parent/pickup-persons/${personId}`)
}

/**
 * @param form {student_ids（逗號分隔字串）, pickup_date, pickup_person_id? |
 *   (person_name, person_relation, person_phone), save_to_list?, note?, photo?: File}
 */
export function createPickupAuthorizations(form: FormData) {
  return api.post('/parent/pickup-authorizations', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function listPickupAuthorizations(params: { status?: string } = {}) {
  return api.get('/parent/pickup-authorizations', { params })
}

export function cancelPickupAuthorization(authId: number) {
  return api.post(`/parent/pickup-authorizations/${authId}/cancel`)
}

export function regeneratePickupCode(authId: number) {
  return api.post(`/parent/pickup-authorizations/${authId}/regenerate-code`)
}
