import { describe, it, expect } from 'vitest'
import PortalLayoutSource from '@/layouts/PortalLayout.vue?raw'

/**
 * 導覽結構的文字契約測試（SPEC-024）。
 *
 * 掛 PortalLayout 需要 WS、router、多個 store 與 onboarding MessageBox，
 * 成本遠高於本 task 要鎖的東西：底部 tab 與側欄指到哪、有沒有缺項。
 * 因此改用 ?raw 讀原始碼斷言，與 src/router/__tests__ 的漂移守衛同一路數。
 */
describe('PortalLayout 班級導覽（SPEC-024 → 2026-09-14 首頁整併）', () => {
  // ⚠ 本檔用 ?raw 掃整份原始碼，註解也會被掃到。反向斷言一律鎖標記形狀
  // （index="…"／<span>…</span>），不要用裸字串，否則被自己寫的註解打紅。

  it('底部導覽不再有「班級」tab——班級功能已在首頁，同一頁不需要兩個 tab', () => {
    expect(PortalLayoutSource).not.toContain("router.push('/portal/class')")
    expect(PortalLayoutSource).not.toContain("router.push('/portal/class-hub')")
    expect(PortalLayoutSource).toContain("router.push('/portal/home')")
  })

  it('不再有 classTabActive——沒有班級 tab 就沒有它要點亮的對象', () => {
    expect(PortalLayoutSource).not.toContain('classTabActive')
  })

  it('側欄不再有「今日班級工作台」', () => {
    expect(PortalLayoutSource).not.toContain('今日班級工作台')
  })

  it('側欄補上原本缺席的三個入口', () => {
    expect(PortalLayoutSource).toContain('index="/portal/contact-book"')
    expect(PortalLayoutSource).toContain('index="/portal/student-attendance"')
    expect(PortalLayoutSource).toContain('index="/portal/work-samples"')
  })

  it('側欄不再有「班級總覽」項——它指的頁面已收進首頁', () => {
    expect(PortalLayoutSource).not.toContain('index="/portal/class"')
    expect(PortalLayoutSource).not.toContain('<span>班級總覽</span>')
  })

  it('側欄「全班量體位」改指首頁的抽屜深連結', () => {
    expect(PortalLayoutSource).toContain('<span>全班量體位</span>')
    expect(PortalLayoutSource).toContain('index="/portal/home?sheet=measurement"')
    expect(PortalLayoutSource).not.toContain('index="/portal/class?sheet=measurement"')
  })
})
