import type { ApiQuery, AxiosResp, Schema } from '@/api/_generated/typed'
import api from './index'

export const fetchChildPhotos = (studentId: number, params: unknown = {}) =>
  api.get('/parent/photos', { params: { student_id: studentId, ...(params as object) } })

/** 一張回顧卡 ＝ 一個時間窗。空窗的時間窗後端直接不回傳。 */
export type PhotoRecap = Schema<'PhotoRecapWindowOut'>

/** 回顧內的單張照片。 */
export type RecapPhoto = Schema<'PhotoRecapPhotoOut'>

/** 相簿回顧：1／3／6 個月前、1／2 年前的「同一天」前後各 5 天。 */
export function fetchChildRecaps(
  studentId: number,
): AxiosResp<'/parent/photo-recaps', 'get'> {
  const params: ApiQuery<'/parent/photo-recaps', 'get'> = { student_id: studentId }
  return api.get('/parent/photo-recaps', { params })
}
