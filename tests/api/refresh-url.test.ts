import { describe, it, expect } from 'vitest'
import { buildRefreshUrl, API_BASE } from '@/api'

describe('buildRefreshUrl — token refresh 端點須與 api 實例同 base', () => {
  it('預設使用 API_BASE，不寫死 /api', () => {
    expect(buildRefreshUrl()).toBe(`${API_BASE}/auth/refresh`)
  })

  it('自訂 base 前綴時 refresh 路徑跟著走（回歸：原本寫死 /api/auth/refresh）', () => {
    expect(buildRefreshUrl('/backend-api')).toBe('/backend-api/auth/refresh')
  })
})
