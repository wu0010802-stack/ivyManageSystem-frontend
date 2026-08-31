import { beforeEach, describe, expect, it } from 'vitest'
import { hasFullSalaryView, setUserInfo } from '@/utils/auth'

describe('hasFullSalaryView', () => {
  beforeEach(() => setUserInfo(null))

  it.each(['admin', 'hr', 'accountant', 'principal'])(
    '%s 可檢視全員薪資',
    (role) => {
      setUserInfo({ role, permission_names: ['SALARY_READ'] })
      expect(hasFullSalaryView()).toBe(true)
    },
  )

  it.each(['supervisor', 'teacher', 'custom_role'])(
    '%s 不可檢視全員薪資',
    (role) => {
      setUserInfo({ role, permission_names: ['SALARY_READ'] })
      expect(hasFullSalaryView()).toBe(false)
    },
  )

  it('未登入時 fail-closed', () => {
    expect(hasFullSalaryView()).toBe(false)
  })
})
