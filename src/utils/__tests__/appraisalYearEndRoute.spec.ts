import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, clearAuth, canAccessRoute } from '@/utils/auth'

describe('canAccessRoute /appraisal-year-end (整合工作區)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each(['SETTINGS_READ', 'SALARY_READ', 'YEAR_END_READ', 'APPRAISAL_FINALIZE'])(
    '持有 %s 即可存取',
    (perm) => {
      setUserInfo({ role: 'admin', permission_names: [perm] })
      expect(canAccessRoute('/appraisal-year-end')).toBe(true)
    },
  )

  it('四者皆無則拒絕', () => {
    setUserInfo({ role: 'admin', permission_names: ['DASHBOARD'] })
    expect(canAccessRoute('/appraisal-year-end')).toBe(false)
  })
})
