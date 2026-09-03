import { describe, it, expect } from 'vitest'
import router from '../router'

function findRoute(path: string) {
  return router.getRoutes().find(r => r.path === path)
}

function tabOf(path: string): string | undefined {
  const r = findRoute(path)
  return r?.meta?.tab as string | undefined
}

describe('parent router IA (2026-05-22 restructure)', () => {
  describe('Family tab 已砍', () => {
    it('/family path 不存在', () => {
      expect(findRoute('/family')).toBeUndefined()
    })
    it('未匹配的 path 走 catch-all redirect /home', () => {
      const fallback = router.getRoutes().find(r => r.path === '/:pathMatch(.*)*')
      expect(fallback).toBeDefined()
      expect(fallback?.redirect).toBe('/home')
    })
  })

  describe('Admin tab 新增', () => {
    it('/admin path 存在且 tab=admin', () => {
      const r = findRoute('/admin')
      expect(r).toBeDefined()
      expect(r?.name).toBe('parent-admin')
      expect(r?.meta?.tab).toBe('admin')
      expect(r?.meta?.title).toBe('事務')
    })
  })

  describe('Admin tab 子頁（spec §5.1）', () => {
    it.each([
      '/leaves',
      '/fees',
      '/medications',
      '/medications/new',
      '/medications/:id',
      '/activity',
      '/events',
      '/events/:eventId/ack',
      '/attendance',
    ])('%s 應有 tab=admin', (path) => {
      expect(tabOf(path)).toBe('admin')
    })
  })

  describe('Home tab 子頁（spec §5.1）', () => {
    it.each([
      '/home',
      '/calendar',
    ])('%s 應有 tab=home', (path) => {
      expect(tabOf(path)).toBe('home')
    })
  })

  describe('Child tab（P2 IA 重整，2026-08-14：5-tab 導航新增「孩子」hub）', () => {
    it('/child hub 存在且 tab=child', () => {
      const r = findRoute('/child')
      expect(r).toBeDefined()
      expect(r?.name).toBe('parent-child-hub')
      expect(r?.meta?.tab).toBe('child')
    })
    it.each([
      '/children/:studentId',
      '/children/:studentId/reports',
      '/children/:studentId/photos',
      '/children/:studentId/measurements',
    ])('%s 應有 tab=child（P2 起自 admin/home 改歸屬，避免與孩子 hub 雙入口）', (path) => {
      expect(tabOf(path)).toBe('child')
    })
  })

  describe('Contact-book tab（2026-08-28：訊息下架，第三個 tab 換成聯絡簿）', () => {
    it.each([
      '/contact-book',
      '/contact-book/:entryId',
      '/announcements',
    ])('%s 應有 tab=contact-book', (path) => {
      expect(tabOf(path)).toBe('contact-book')
    })

    it('/contact-book 是 tab 根頁，不顯示返回鍵', () => {
      expect(findRoute('/contact-book')?.meta?.showBack).toBeUndefined()
    })

    it('訊息路由已移除，改為 redirect 到 /contact-book', () => {
      expect(findRoute('/messages')?.name).toBeUndefined()
      expect(findRoute('/messages')?.redirect).toBe('/contact-book')
      expect(findRoute('/messages/:threadId')?.redirect).toBe('/contact-book')
    })
  })

  describe('Me tab（Phase D 將移至 drawer）', () => {
    it.each(['/me', '/notifications/preferences', '/bind-additional'])('%s 應有 tab=me', (path) => {
      expect(tabOf(path)).toBe('me')
    })
  })

  describe('Drawer 預告（Phase D 將消耗 inDrawer flag）', () => {
    it('/notifications/preferences 有 inDrawer=true', () => {
      expect(findRoute('/notifications/preferences')?.meta?.inDrawer).toBe(true)
    })
    it('/bind-additional 有 inDrawer=true', () => {
      expect(findRoute('/bind-additional')?.meta?.inDrawer).toBe(true)
    })
  })

  describe('Assistant 走 FAQ 純頁面（不走 modal）', () => {
    // main da3667df 已將 Assistant 從 chatbot/modal 改為 FAQ 純頁面，
    // mass-merge 時 FE-4 IA-restructure 的 modal 化設計被 drop。
    // 2026-09-02：入口補進「我的」偏好清單，因此改為 tab='me'（原本無 tab，
    // 是因為當時全站沒有任何入口連到這頁）。
    it('/assistant 無 modal、tab=me、有 showBack', () => {
      const r = findRoute('/assistant')
      expect(r?.meta?.modal).toBeUndefined()
      expect(r?.meta?.tab).toBe('me')
      expect(r?.meta?.showBack).toBe(true)
    })
  })

  describe('健康紀錄 title', () => {
    it('/children/:studentId/measurements 有 title', () => {
      expect(findRoute('/children/:studentId/measurements')?.meta?.title).toBe('健康紀錄')
    })
  })

  describe('Public routes 不變', () => {
    it.each(['/login', '/bind'])('%s 應 public=true 且 hideTabBar=true', (path) => {
      const r = findRoute(path)
      expect(r?.meta?.public).toBe(true)
      expect(r?.meta?.hideTabBar).toBe(true)
    })
  })

  /**
   * LINE Rich Menu 是家長聊天室下方那張常駐選單，五格各連到這裡的一個路徑。
   * 它的內容定義在 **另一個 repo**（`ivy-backend/scripts/setup_line_richmenu.py`
   * 的 `_CELLS`），由人工執行腳本部署，改了路由不會有任何訊號。
   *
   * 實際發生過：2026-05-22 的 IA v3 把 `/family` 砍掉，選單沒跟著改，「家校」
   * 那格連到不存在的路由，被 catch-all 靜默導回首頁——家長只覺得按了沒反應，
   * 沒人回報，漂移了三個半月。
   *
   * 這條測試是跨 repo 契約的前端側：**刪掉或改名任何一個路徑，這裡會先紅**，
   * 提醒你同步改後端那份清單並重新部署選單。
   */
  describe('LINE Rich Menu 依賴的路徑（跨 repo 契約）', () => {
    const RICH_MENU_PATHS = ['/home', '/child', '/contact-book', '/admin', '/me']

    it.each(RICH_MENU_PATHS)(
      '%s 必須存在——Rich Menu 有一格連到它，刪除前先改 ivy-backend/scripts/setup_line_richmenu.py',
      (path) => {
        expect(findRoute(path)).toBeDefined()
      },
    )

    it('五個路徑正好是底部導覽的五個分頁（選單與 App 導覽一致，家長不用學兩套）', () => {
      const tabs = RICH_MENU_PATHS.map(tabOf)
      expect(tabs).toEqual(['home', 'child', 'contact-book', 'admin', 'me'])
    })
  })
})
