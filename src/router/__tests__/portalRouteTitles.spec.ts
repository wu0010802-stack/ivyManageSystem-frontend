/**
 * 教師端每一頁都必須有 `meta.title`（2026-09-03 UI/UX 稽核 P2-16）。
 *
 * 為什麼是守衛而不是一次性修正：`meta.title` 決定瀏覽器分頁標題
 * （`document.title`）。實測 31 條教師端路由中有 11 條退回站名
 * 「常春藤教師入口」，老師開兩個分頁就分不出哪個是薪資、哪個是出勤。
 * 新增頁面時很容易再漏，所以用測試釘住。
 *
 * 修法是替該路由補 `meta: { title: '…' }`，不是放寬本檔斷言。
 */
import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'

import { routes } from '@/router/index'

function findPortalShell(records: readonly RouteRecordRaw[]): RouteRecordRaw | undefined {
  for (const r of records) {
    if (r.path === '/portal' && r.children?.length) return r
    const nested = r.children ? findPortalShell(r.children) : undefined
    if (nested) return nested
  }
  return undefined
}

describe('教師端路由 meta.title', () => {
  const shell = findPortalShell(routes)

  it('找得到 /portal 殼層路由', () => {
    expect(shell).toBeDefined()
    expect(shell!.children!.length).toBeGreaterThan(20)
  })

  it('每一條有畫面的子路由都有 meta.title', () => {
    const missing = (shell!.children ?? [])
      .filter((r) => r.component !== undefined && r.redirect === undefined)
      .filter((r) => typeof r.meta?.title !== 'string' || !r.meta.title)
      .map((r) => r.path)

    expect(missing).toEqual([])
  })

  it('title 不重複，分頁列與歷史記錄才分得出來', () => {
    const titles = (shell!.children ?? [])
      .filter((r) => r.component !== undefined && r.redirect === undefined)
      .map((r) => r.meta?.title as string)
      .filter(Boolean)

    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i)
    expect(dupes).toEqual([])
  })
})
