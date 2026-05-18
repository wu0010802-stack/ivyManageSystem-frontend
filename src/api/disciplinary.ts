import api from './index'

// 懲處記錄管理（警告/小過/大過，自動扣節慶+超額獎金）
//
// type: 'warning' (警告) / 'minor' (小過) / 'major' (大過)
// deduction_amount: 0 表示用 BonusConfig 預設（警告 1000 / 小過 3000 / 大過 0）

export const listDisciplinaryActions = (params: unknown = {}) =>
  api.get('/disciplinary-actions', { params })

export const createDisciplinaryAction = (payload: unknown) =>
  api.post('/disciplinary-actions', payload)

export const updateDisciplinaryAction = (id: number, payload: unknown) =>
  api.put(`/disciplinary-actions/${id}`, payload)

export const deleteDisciplinaryAction = (id: number) =>
  api.delete(`/disciplinary-actions/${id}`)
