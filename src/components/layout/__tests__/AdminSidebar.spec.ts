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

const getUserInfo = vi.fn()
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, getUserInfo: (...a: unknown[]) => getUserInfo(...a) }
})

import AdminSidebar from '../AdminSidebar.vue'

const passthrough = { template: '<div><slot name="title" /><slot /></div>' }
const stubs = {
  ElAside: passthrough,
  ElScrollbar: passthrough,
  ElMenu: { props: ['defaultActive'], template: '<nav :data-active="defaultActive"><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: true,
}

function mountWith(
  perms: string[],
  props: { isMobile?: boolean; mobileOpen?: boolean } = {},
  attachTo?: HTMLElement,
) {
  getUserInfo.mockReturnValue({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { props, attachTo, global: { stubs } })
}

const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

describe('AdminSidebar 考核年終整併 + 群組可見性回歸', () => {
  beforeEach(() => vi.clearAllMocks())

  it('整合入口取代三個舊項目', () => {
    const w = mountWith(['*'])
    const all = items(w)
    expect(all).toContain('/appraisal-year-end')
    expect(all).not.toContain('/year_end/cycles')
    expect(all).not.toContain('/year-end/appraisal-payout')
    expect(all).not.toContain('/appraisal-management')
  })

  it('只有 SALARY_READ → 系統設定群組不顯示（修補回歸）', () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).not.toContain('group-settings')
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end')
  })

  it('只有 SETTINGS_READ → 人事薪資群組顯示且含整合入口（修補回歸）', () => {
    const w = mountWith(['SETTINGS_READ'])
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end')
    expect(subs(w)).toContain('group-settings')
  })

  it('只有 YEAR_END_READ → 入口可見', () => {
    expect(items(mountWith(['YEAR_END_READ']))).toContain('/appraisal-year-end')
  })

  it('只有 APPRAISAL_FINALIZE → 入口可見', () => {
    expect(items(mountWith(['APPRAISAL_FINALIZE']))).toContain('/appraisal-year-end')
  })

  it('只有 APPRAISAL_READ → 入口可見（2026-07-10 巢狀路由新增的頂層權限）', () => {
    expect(items(mountWith(['APPRAISAL_READ']))).toContain('/appraisal-year-end')
  })

  it('報名時間設定/修改紀錄 改掛課後才藝群組，不再出現在系統設定/報表', () => {
    const w = mountWith(['*'])
    const inGroup = (sub: string) =>
      w.find(`[data-sub="${sub}"]`).findAll('[data-item]').map((n) => n.attributes('data-item'))

    const activity = inGroup('group-activity')
    expect(activity).toContain('/activity/settings')
    expect(activity).toContain('/activity/changes')

    expect(inGroup('group-settings')).not.toContain('/activity/settings')
    expect(inGroup('group-reports')).not.toContain('/activity/changes')
  })

  it('只有 ACTIVITY_READ → 課後才藝顯示含修改紀錄；報表群組不再因此空殼顯示', () => {
    const w = mountWith(['ACTIVITY_READ'])
    expect(subs(w)).toContain('group-activity')
    expect(items(w)).toContain('/activity/changes')
    expect(subs(w)).not.toContain('group-reports')
  })
})

describe('AdminSidebar activeMenu 薪資子頁高亮', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.path = '/'
  })

  it('/salary/settle 等子頁 → 高亮「薪資管理」(/salary)', () => {
    routeState.path = '/salary/settle'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/salary')
  })

  it('其他路徑維持原樣（精確比對）', () => {
    routeState.path = '/employees'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/employees')
  })

  it('/appraisal-year-end/... 子頁（2026-07-10 巢狀路由）→ 高亮整合入口 (/appraisal-year-end)', () => {
    routeState.path = '/appraisal-year-end/rules/scoring'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/appraisal-year-end')
  })
})

describe('AdminSidebar 行動版無障礙互動', () => {
  beforeEach(() => vi.clearAllMocks())

  it('開啟時提供可聚焦的關閉按鈕，並可由 Escape 關閉', async () => {
    const w = mountWith(['*'], { isMobile: true, mobileOpen: true }, document.body)
    const closeButton = w.get('button[aria-label="關閉導覽選單"]')

    ;(w.vm as unknown as { focusCloseButton: () => void }).focusCloseButton()
    expect(document.activeElement).toBe(closeButton.element)

    await closeButton.trigger('keydown.esc')
    expect(w.emitted('close-sidebar')).toHaveLength(1)
    w.unmount()
  })

  it('關閉的行動側欄從輔助技術與鍵盤焦點移除', () => {
    const w = mountWith(['*'], { isMobile: true, mobileOpen: false })
    const navigation = w.get('#admin-navigation')

    expect(navigation.attributes('aria-hidden')).toBe('true')
    expect(navigation.attributes('inert')).toBeDefined()
  })
})
