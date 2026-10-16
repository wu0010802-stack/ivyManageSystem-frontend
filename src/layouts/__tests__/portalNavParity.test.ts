import { describe, it, expect } from 'vitest'
import layoutSrc from '@/layouts/PortalLayout.vue?raw'
import { CLASS_FEATURES } from '@/constants/portalClassFeatures'

/**
 * 擋整類守衛（2026-10-12）：首頁功能格與桌機側欄要「同一個功能、同一個名字、都找得到」。
 *
 * 2026-10-12 審查時兩邊各自維護、已經漂移：
 * - 首頁格子寫「才藝點名」，側欄與頁面標題是業主 09-14 定名的「課程點名」
 * - 「接送授權」vs「臨時接送授權」、「異常待確認」vs「異常確認」、「未讀公告」vs「公告通知」
 * - 「活動調查」「我的成長軌跡」只有首頁格子有，桌機側欄找不到
 * 新增功能時兩邊都要補，名字以頁面 meta.title 為準。
 */

// 收件匣型捷徑：指向別的頁面裡「待我處理」的那一段，名字本來就不同於目的頁
const SHORTCUT_KEYS = new Set(['pending-substitute', 'pending-swap'])

function sidebarLabel(path: string): string | null {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const item = new RegExp(`<el-menu-item[^>]*index="${escaped}"[^>]*>([\\s\\S]*?)</el-menu-item>`).exec(layoutSrc)
  if (!item) return null
  const label = /<span>([^<]+)<\/span>/.exec(item[1]) ?? /<template #title>([^<]+)<\/template>/.exec(item[1])
  return label ? label[1].trim() : null
}

const features = CLASS_FEATURES.filter((f) => f.to && !SHORTCUT_KEYS.has(f.key))

describe('首頁功能格 ↔ 桌機側欄：同一功能同一名字', () => {
  it('有東西可比（守衛本身沒有空轉）', () => {
    expect(features.length).toBeGreaterThan(15)
  })

  it.each(features)('$label（$to）在側欄有同名入口', (f) => {
    const path = (f.to as string).split('?')[0]
    expect(sidebarLabel(path)).toBe(f.label)
  })

  it('「今日工作台」是側欄第一個頂層項目，不藏在子選單裡（unique-opened 會把它收起來）', () => {
    const home = layoutSrc.indexOf('index="/portal/home"')
    const firstSubMenu = layoutSrc.indexOf('<el-sub-menu')
    expect(home).toBeGreaterThan(-1)
    expect(home).toBeLessThan(firstSubMenu)
  })

  it('側欄群組名不用破折號', () => {
    expect(layoutSrc).not.toMatch(/<span>班級 — /)
  })
})
