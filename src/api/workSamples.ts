import api from './index'
import type { AxiosProgressEvent } from 'axios'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'
import { uploadAttachment } from './portfolio'

export const listWorkSamples = (
  studentId: number,
  params: ApiQuery<'/students/{student_id}/work-samples', 'get'> = {},
): AxiosResp<'/students/{student_id}/work-samples', 'get'> =>
  api.get(`/students/${studentId}/work-samples`, { params })

export const createWorkSample = (
  studentId: number,
  data: ApiBody<'/students/{student_id}/work-samples', 'post'>,
): AxiosResp<'/students/{student_id}/work-samples', 'post'> =>
  api.post(`/students/${studentId}/work-samples`, data)

export const updateWorkSample = (
  studentId: number,
  wsId: number,
  data: ApiBody<'/students/{student_id}/work-samples/{ws_id}', 'patch'>,
): AxiosResp<'/students/{student_id}/work-samples/{ws_id}', 'patch'> =>
  api.patch(`/students/${studentId}/work-samples/${wsId}`, data)

export const deleteWorkSample = (
  studentId: number,
  wsId: number,
): AxiosResp<'/students/{student_id}/work-samples/{ws_id}', 'delete'> =>
  api.delete(`/students/${studentId}/work-samples/${wsId}`)

export const uploadWorkSamplePhoto = (
  file: File,
  wsId: number,
  opts: { onUploadProgress?: (e: AxiosProgressEvent) => void } = {},
) => uploadAttachment(file, 'work_sample', wsId, opts)
