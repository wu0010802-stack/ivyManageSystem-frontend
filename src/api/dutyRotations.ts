import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 學期值勤輪值表（SPEC-026 §2.2）。SCHEDULE 權限。

export const getDutyRotation = (
  params: ApiQuery<'/duty-rotations', 'get'>
): AxiosResp<'/duty-rotations', 'get'> => api.get('/duty-rotations', { params })

export const createDutyRotation = (
  data: ApiBody<'/duty-rotations', 'post'>
): AxiosResp<'/duty-rotations', 'post'> => api.post('/duty-rotations', data)

/** 整份覆寫：rows／weeks／cells 一次送出，cells 以 row_index 指向 rows 陣列 */
export const replaceDutyRotation = (
  id: number,
  data: ApiBody<'/duty-rotations/{rotation_id}', 'put'>
): AxiosResp<'/duty-rotations/{rotation_id}', 'put'> => api.put(`/duty-rotations/${id}`, data)

/** dry_run=true 只回差異預覽，不寫入 */
export const applyDutyRotation = (
  id: number,
  data: ApiBody<'/duty-rotations/{rotation_id}/apply', 'post'>
): AxiosResp<'/duty-rotations/{rotation_id}/apply', 'post'> =>
  api.post(`/duty-rotations/${id}/apply`, data)

export const importDutyRotation = (
  id: number,
  file: File,
  dryRun: boolean
): AxiosResp<'/duty-rotations/{rotation_id}/import', 'post'> => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/duty-rotations/${id}/import`, formData, {
    params: { dry_run: dryRun },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// blob 端點無 JSON schema，維持 untyped（比照 exportShifts）
export const exportDutyRotation = (id: number) =>
  api.get(`/duty-rotations/${id}/export`, { responseType: 'blob' })
