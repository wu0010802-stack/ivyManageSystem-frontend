import api from './index'
import type { AxiosResponse } from 'axios'

export interface PermissionDefinition {
  code: string
  label: string
  description: string | null
  group_name: string
  is_core: boolean
}

export interface PermissionDefinitionIn {
  code: string
  label: string
  description?: string
  group_name?: string
}

export interface PermissionDefinitionUpdate {
  label?: string
  description?: string
  group_name?: string
}

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

export function createPermissionDefinition(payload: PermissionDefinitionIn): Promise<AxiosResponse<PermissionDefinition>> {
  return api.post('/permissions/definitions', payload)
}

export function updatePermissionDefinition(code: string, payload: PermissionDefinitionUpdate): Promise<AxiosResponse<PermissionDefinition>> {
  return api.put(`/permissions/definitions/${encodeURIComponent(code)}`, payload)
}

export function deletePermissionDefinition(code: string): Promise<AxiosResponse<{ ok: boolean }>> {
  return api.delete(`/permissions/definitions/${encodeURIComponent(code)}`)
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
