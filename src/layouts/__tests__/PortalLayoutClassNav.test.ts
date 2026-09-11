import { describe, it, expect } from 'vitest'
import PortalLayoutSource from '@/layouts/PortalLayout.vue?raw'

/**
 * 導覽結構的文字契約測試（SPEC-024）。
 *
 * 掛 PortalLayout 需要 WS、router、多個 store 與 onboarding MessageBox，
 * 成本遠高於本 task 要鎖的東西：底部 tab 與側欄指到哪、有沒有缺項。
 * 因此改用 ?raw 讀原始碼斷言，與 src/router/__tests__ 的漂移守衛同一路數。
 */
describe('PortalLayout 班級導覽（SPEC-024）', () => {
  it('底部「班級」tab 指向 /portal/class', () => {
    expect(PortalLayoutSource).toContain("router.push('/portal/class')")
    expect(PortalLayoutSource).not.toContain("router.push('/portal/class-hub')")
  })

  it('classTabActive 認的是 /portal/class 而非 /portal/class-hub', () => {
    expect(PortalLayoutSource).toContain("route.path.startsWith('/portal/class')")
    expect(PortalLayoutSource).not.toContain(
      "route.path.startsWith('/portal/class-hub')",
    )
  })

  it('側欄不再有「今日班級工作台」', () => {
    expect(PortalLayoutSource).not.toContain('今日班級工作台')
  })

  it('側欄補上原本缺席的三個入口', () => {
    expect(PortalLayoutSource).toContain('index="/portal/contact-book"')
    expect(PortalLayoutSource).toContain('index="/portal/student-attendance"')
    expect(PortalLayoutSource).toContain('index="/portal/work-samples"')
  })

  it('側欄有班級總覽與全班量體位', () => {
    expect(PortalLayoutSource).toContain('班級總覽')
    expect(PortalLayoutSource).toContain('全班量體位')
  })
})
