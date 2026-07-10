import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index'

// Task 4 審查裁決：/appraisal-year-end/rules 的預設落點不可寫死 'scoring'（該頁需
// APPRAISAL_READ）——只持 SETTINGS_READ 的使用者會落在自己看不到的分頁。落點須依權限而定。
const hasPermissionMock = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig()),
  getUserInfo: () => ({ role: 'admin', permission_names: ['*'] }),
  isAuthenticated: () => true,
  hasPermission: hasPermissionMock,
  canAccessRoute: () => true,
}))

const mkRouter = () => createRouter({ history: createMemoryHistory(), routes })

describe('/appraisal-year-end/rules 預設落點依權限而定（Task 4 審查裁決補強）', () => {
  it('持 APPRAISAL_READ → 落在 scoring', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'APPRAISAL_READ')
    const router = mkRouter()
    await router.push('/appraisal-year-end/rules')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules/scoring')
  })

  it('無 APPRAISAL_READ、只有 SETTINGS_READ → 落在 year-end-rules（而非 scoring）', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
    const router = mkRouter()
    await router.push('/appraisal-year-end/rules')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules/year-end-rules')
  })
})
