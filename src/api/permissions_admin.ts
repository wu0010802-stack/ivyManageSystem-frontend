import api from './index'
import type { AxiosResponse } from 'axios'

export interface Role {
  code: string
  label: string
  description: string | null
  permissions: string[]
  is_core: boolean
}

export interface RoleIn {
  code: string
  label: string
  description?: string
  permissions: string[]
}

export interface RoleUpdate {
  label?: string
  description?: string
  permissions?: string[]
}

export function createRole(payload: RoleIn): Promise<AxiosResponse<Role>> {
  return api.post('/roles', payload)
}

export function updateRole(code: string, payload: RoleUpdate): Promise<AxiosResponse<Role>> {
  return api.put(`/roles/${encodeURIComponent(code)}`, payload)
}

export function deleteRole(code: string): Promise<AxiosResponse<{ ok: boolean }>> {
  return api.delete(`/roles/${encodeURIComponent(code)}`)
}
