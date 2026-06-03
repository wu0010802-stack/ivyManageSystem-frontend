import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
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
  ElMenu: { template: '<nav><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: true,
}

function mountWith(perms: string[]) {
  getUserInfo.mockReturnValue({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { global: { stubs } })
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
})
