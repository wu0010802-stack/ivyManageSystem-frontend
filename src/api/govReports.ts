import type { AxiosResponse } from 'axios'
import api from './index'
import type { ApiQuery } from './_generated/typed'

// 五個端點皆回傳檔案（Excel / TXT），response 一律 Blob
export const getStaffQualificationChecklist = (
  params: ApiQuery<'/gov-reports/staff-qualification-checklist', 'get'>,
): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-reports/staff-qualification-checklist', { params, responseType: 'blob' })

export const getLaborInsurance = (params: ApiQuery<'/gov-reports/labor-insurance', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-reports/labor-insurance', { params, responseType: 'blob' })

export const getHealthInsurance = (params: ApiQuery<'/gov-reports/health-insurance', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-reports/health-insurance', { params, responseType: 'blob' })

export const getWithholding = (params: ApiQuery<'/gov-reports/withholding', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-reports/withholding', { params, responseType: 'blob' })

export const getPension = (params: ApiQuery<'/gov-reports/pension', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-reports/pension', { params, responseType: 'blob' })
