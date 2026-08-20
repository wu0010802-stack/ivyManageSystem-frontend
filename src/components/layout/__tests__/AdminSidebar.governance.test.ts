/**
 * 稽核與資料品質（/governance）在側邊欄的呈現：
 * - 單一項目，渲染於所有群組「之後」（側邊欄最底）。
 * - badge 拆分：審核工作台只算待簽核，高風險未確認數改掛 /governance。
 *   （拆分前兩者相加掛在工作台，高風險事件搬走後會變成「點進去看不到對應項目」。）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const routeState = { path: '/' }
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routeState.path
    },
  }),
}))

import AdminSidebar from '../AdminSidebar.vue'
import { setUserInfo } from '@/utils/auth'

const passthrough = { template: '<div><slot name="title" /><slot /></div>' }
const stubs = {
  ElAside: passthrough,
  ElScrollbar: passthrough,
  ElMenu: { props: ['defaultActive'], template: '<nav :data-active="defaultActive"><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: { props: ['value'], template: '<em class="badge">{{ value }}</em>' },
}

function mountWith(perms: string[], props: Record<string, unknown> = {}) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { props, global: { stubs } })
}

const badgeOf = (w: ReturnType<typeof mountWith>, index: string) =>
  w.find(`[data-item="${index}"]`).find('.badge').exists()
    ? w.find(`[data-item="${index}"]`).find('.badge').text()
    : null

describe('AdminSidebar 稽核與資料品質項目', () => {
  beforeEach(() => vi.clearAllMocks())

  it('渲染在所有群組之後（側邊欄最底）', () => {
    const w = mountWith(['*'])
    const html = w.html()
    const governanceAt = html.indexOf('data-item="/governance"')
    const lastGroupAt = html.lastIndexOf('data-sub=')
    expect(governanceAt).toBeGreaterThan(-1)
    expect(governanceAt).toBeGreaterThan(lastGroupAt)
  })

  it('只持三碼其中之一也看得到入口', () => {
    for (const code of ['HIGH_RISK_READ', 'AUDIT_LOGS', 'DATA_QUALITY_READ']) {
      const w = mountWith([code])
      expect(
        w.findAll('[data-item]').map((n) => n.attributes('data-item')),
        `只持 ${code} 應看得到 /governance`
      ).toContain('/governance')
    }
  })

  it('三碼皆無則不顯示', () => {
    const w = mountWith(['STUDENTS_READ'])
    expect(w.findAll('[data-item]').map((n) => n.attributes('data-item'))).not.toContain('/governance')
  })
})

describe('AdminSidebar badge 拆分', () => {
  it('高風險未確認數掛在 /governance', () => {
    const w = mountWith(['*'], { pendingApprovals: 2, pendingHighRiskAudit: 5 })
    expect(badgeOf(w, '/governance')).toBe('5')
  })

  it('審核工作台只算待簽核，不再加計高風險未確認', () => {
    const w = mountWith(['*'], { pendingApprovals: 2, pendingHighRiskAudit: 5 })
    expect(badgeOf(w, '/workbench')).toBe('2')
  })

  it('待簽核為 0 時工作台不顯示 badge（即使高風險有未確認）', () => {
    const w = mountWith(['*'], { pendingApprovals: 0, pendingHighRiskAudit: 5 })
    expect(badgeOf(w, '/workbench')).toBeNull()
  })
})
