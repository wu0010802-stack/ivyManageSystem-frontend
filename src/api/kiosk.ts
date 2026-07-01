import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// ----- 電子打卡 Kiosk -----

/** 取得 kiosk 花名冊（在職員工清單，含 employee_id / name） */
export const getKioskRoster = (): AxiosResp<'/attendance/kiosk/roster', 'get'> =>
  api.get('/attendance/kiosk/roster')

/** 打卡預覽（驗 PIN、回傳預計動作，不寫入） */
export const kioskPreview = (
  data: ApiBody<'/attendance/kiosk/preview', 'post'>,
): AxiosResp<'/attendance/kiosk/preview', 'post'> =>
  api.post('/attendance/kiosk/preview', data)

/** 實際打卡（驗 PIN、寫入當天考勤列） */
export const kioskPunch = (
  data: ApiBody<'/attendance/kiosk/punch', 'post'>,
): AxiosResp<'/attendance/kiosk/punch', 'post'> =>
  api.post('/attendance/kiosk/punch', data)
