/**
 * 教師 portal 補休結餘+下個結算月預告 API.
 * Backend: ivy-backend/api/portal/leaves_quota_expiry.py
 */
import api from '@/api/index'
import type { AxiosResp } from './_generated/typed'

/** 員工自己看補休結餘 / 最早到期 grant / 下個週年 / 下個結算月 */
export function getMyLeaveQuotaExpiry() {
  return api.get('/portal/me/leave-quota-expiry') as Promise<
    AxiosResp<'/portal/me/leave-quota-expiry', 'get'>
  >
}
