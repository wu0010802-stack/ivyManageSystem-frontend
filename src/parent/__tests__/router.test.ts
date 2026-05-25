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
      '/children/:studentId',
      '/children/:studentId/reports',
      '/children/:studentId/photos',
      '/children/:studentId/measurements',
    ])('%s 應有 tab=admin', (path) => {
      expect(tabOf(path)).toBe('admin')
    })
  })

  describe('Home tab 子頁（spec §5.1）', () => {
    it.each([
      '/home',
      '/contact-book',
      '/contact-book/:entryId',
      '/calendar',
    ])('%s 應有 tab=home', (path) => {
      expect(tabOf(path)).toBe('home')
    })
  })

  describe('Messages tab 子頁（spec §5.1）', () => {
    it.each([
      '/messages',
      '/messages/:threadId',
      '/announcements',
    ])('%s 應有 tab=messages', (path) => {
      expect(tabOf(path)).toBe('messages')
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

  describe('Modal 預告（Assistant 走 modal）', () => {
    it('/assistant 有 modal=true 且無 tab', () => {
      const r = findRoute('/assistant')
      expect(r?.meta?.modal).toBe(true)
      expect(r?.meta?.tab).toBeUndefined()
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
})
