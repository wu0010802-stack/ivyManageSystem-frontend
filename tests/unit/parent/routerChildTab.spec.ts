import { describe, it, expect } from 'vitest'
import router from '@/parent/router'

// 2026-08-28：聯絡簿升格為自己的 tab（訊息下架後空出來的那一格），
// 因此 /contact-book* 不再屬 child tab；孩子 hub 仍留連結過去。
const CHILD_TAB_PATHS = [
  '/children/:studentId',
  '/children/:studentId/reports',
  '/children/:studentId/photos',
  '/children/:studentId/measurements',
]

describe('孩子相關路由 tab 歸屬（P2 IA 重整）', () => {
  it.each(CHILD_TAB_PATHS)('%s 的 meta.tab 為 child', (path) => {
    const route = router.getRoutes().find((r) => r.path === path)
    expect(route).toBeTruthy()
    expect(route?.meta.tab).toBe('child')
  })

  it('/child hub 本身 meta.tab 為 child', () => {
    const route = router.getRoutes().find((r) => r.path === '/child')
    expect(route).toBeTruthy()
    expect(route?.meta.tab).toBe('child')
  })
})
