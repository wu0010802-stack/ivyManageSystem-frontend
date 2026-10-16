import { describe, it, expect } from 'vitest'
import PortalLayoutSource from '@/layouts/PortalLayout.vue?raw'

/**
 * 才藝導覽的文字契約測試（課程點名獨立頁，2026-09-14）。
 *
 * 掛 PortalLayout 需要 WS、router 與多個 store，成本遠高於本案要鎖的東西：
 * 側欄「才藝」群組底下有沒有課程點名這個入口。沿用 PortalLayoutClassNav.test.ts
 * 的 ?raw 路數。
 */
describe('PortalLayout 才藝導覽', () => {
  // 斷言鎖在 menu label 的標記形狀（<span>…</span>）而非整檔任意出現：
  // ?raw 連註解一起讀進來，寬鬆的 toContain 會被說明歷史的註解文字騙過去。
  it('側欄有獨立的「課程點名」入口', () => {
    expect(PortalLayoutSource).toContain('index="/portal/activity/attendance"')
    expect(PortalLayoutSource).toContain('<span>課程點名</span>')
  })

  it('才藝群組同時保留報名入口', () => {
    expect(PortalLayoutSource).toContain('index="/portal/activity"')
    expect(PortalLayoutSource).toContain('<span>才藝報名</span>')
  })

  it('側欄不再用「才藝管理」這個涵蓋兩件事的舊名稱', () => {
    expect(PortalLayoutSource).not.toContain('<span>才藝管理</span>')
  })
})
