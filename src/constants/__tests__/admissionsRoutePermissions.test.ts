import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

// /students 是 exact 匹配，不涵蓋 /students/admissions；缺這條規則
// canAccessRoute 的 default-deny 會把頁面鎖死（含 super admin）——歷史踩雷兩次。
describe('招生入學路由權限規則（default-deny 防鎖死）', () => {
  it('有 /students/admissions 規則且為 RECRUITMENT_READ', () => {
    expect(
      ROUTE_PERMISSION_RULES.some(
        (r) => r.path === '/students/admissions' && r.permission === 'RECRUITMENT_READ',
      ),
    ).toBe(true)
  })

  it('/recruitment 規則保留（redirect 來源仍需可解析）', () => {
    expect(
      ROUTE_PERMISSION_RULES.some(
        (r) => r.path === '/recruitment' && r.permission === 'RECRUITMENT_READ',
      ),
    ).toBe(true)
  })
})
