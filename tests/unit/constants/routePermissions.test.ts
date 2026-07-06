import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

describe('員工詳情頁路由權限', () => {
  it('/employees 規則必須 prefix:true，讓 /employees/:id 繼承 EMPLOYEES_READ（default-deny 下漏掉會全員 403）', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/employees')
    expect(rule).toBeDefined()
    expect(rule?.permission).toBe('EMPLOYEES_READ')
    expect(rule?.prefix).toBe(true)
  })
})
