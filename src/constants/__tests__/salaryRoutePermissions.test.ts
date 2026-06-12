import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

// 薪資 IA 拆分後子路由（/salary/settle 等）必須被權限規則涵蓋，
// 否則 canAccessRoute 的 default-deny 會把頁面鎖死（含 super admin）。
describe('salary 子路由權限規則（default-deny 防鎖死）', () => {
    it('有 /salary prefix 規則涵蓋所有子頁', () => {
        expect(
            ROUTE_PERMISSION_RULES.some(
                (r) => r.path === '/salary' && r.permission === 'SALARY_READ' && r.prefix === true,
            ),
        ).toBe(true)
    })

    it('沒有殘留比 /salary 更長、會搶 longest-match 的薪資子路由規則', () => {
        const subRules = ROUTE_PERMISSION_RULES.filter(
            (r) => r.path.startsWith('/salary/'),
        )
        expect(subRules).toEqual([])
    })
})
