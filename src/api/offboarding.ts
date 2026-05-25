import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

export const previewOffboarding = (
    id: number,
    data: ApiBody<'/offboarding/{employee_id}/preview', 'post'>,
): AxiosResp<'/offboarding/{employee_id}/preview', 'post'> =>
    api.post(`/offboarding/${id}/preview`, data)

export const processOffboarding = (
    id: number,
    data: ApiBody<'/offboarding/{employee_id}/process', 'post'>,
): AxiosResp<'/offboarding/{employee_id}/process', 'post'> =>
    api.post(`/offboarding/${id}/process`, data)

export const getOffboardingDetail = (id: number): AxiosResp<'/offboarding/{employee_id}', 'get'> =>
    api.get(`/offboarding/${id}`)

export const getOffboardingCertificate = (id: number): Promise<import('axios').AxiosResponse<Blob>> =>
    api.get(`/offboarding/${id}/certificate.pdf`, { responseType: 'blob' })

export const patchNhiUnenroll = (
    id: number,
    data: ApiBody<'/offboarding/{employee_id}/nhi-unenroll', 'patch'>,
): AxiosResp<'/offboarding/{employee_id}/nhi-unenroll', 'patch'> =>
    api.patch(`/offboarding/${id}/nhi-unenroll`, data)

export const postMagicLink = (id: number): AxiosResp<'/offboarding/{employee_id}/magic-link', 'post'> =>
    api.post(`/offboarding/${id}/magic-link`)

export const deleteMagicLink = (id: number): AxiosResp<'/offboarding/{employee_id}/magic-link', 'delete'> =>
    api.delete(`/offboarding/${id}/magic-link`)
