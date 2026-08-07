/**
 * 總部（platform）選單的雙向可見性（CT-P-04(3)）。
 *
 * 兩條必須成立的事：
 *  1. 分校 admin（即使 `permission_names` 是 wildcard `*`）**看不到**總部選單——
 *     權限碼設定錯誤不該直接變成 UI 可達。
 *  2. platform admin（flag `platform_admin`）只看得到總部選單，分校業務群組全部隱藏
 *     （hq 租戶沒有那些資料，點進去只會 0 rows / 403）。
 */
import { describe, it, expect, vi } from 'vitest'
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
  ElBadge: true,
}

function mountWith(perms: string[], flags: string[] = []) {
  setUserInfo({ role: 'admin', permission_names: perms, flags })
  return mount(AdminSidebar, { global: { stubs } })
}

const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

const PLATFORM_ITEMS = [
  '/platform/overview',
  '/platform/tenants',
  '/platform/reports',
  '/platform/roles-sync',
  '/platform/audit',
]

describe('AdminSidebar 總部選單 gate', () => {
  it('分校 admin（wildcard 權限、無 platform_admin flag）看不到總部群組', () => {
    const w = mountWith(['*'])
    expect(subs(w)).not.toContain('group-platform')
    for (const path of PLATFORM_ITEMS) expect(items(w)).not.toContain(path)
    // 分校業務選單照常
    expect(subs(w)).toContain('group-leave')
  })

  it('即使誤把 PLATFORM_* 授予分校角色，沒有 flag 一樣看不到（fail-closed）', () => {
    const w = mountWith(['PLATFORM_TENANTS_MANAGE', 'PLATFORM_REPORTS_VIEW', 'PLATFORM_AUDIT_VIEW'])
    expect(subs(w)).not.toContain('group-platform')
    expect(items(w)).not.toContain('/platform/tenants')
  })

  it('platform admin 看得到總部五頁，且分校業務群組全部隱藏', () => {
    const w = mountWith(
      ['PLATFORM_TENANTS_MANAGE', 'PLATFORM_REPORTS_VIEW', 'PLATFORM_AUDIT_VIEW'],
      ['platform_admin'],
    )
    expect(subs(w)).toEqual(['group-platform'])
    for (const path of PLATFORM_ITEMS) expect(items(w)).toContain(path)
    expect(items(w)).not.toContain('/employees')
    expect(items(w)).not.toContain('/')
  })

  it('platform admin 只持報表碼 → 只看得到總覽與跨分校報表', () => {
    const w = mountWith(['PLATFORM_REPORTS_VIEW'], ['platform_admin'])
    expect(items(w)).toContain('/platform/overview')
    expect(items(w)).toContain('/platform/reports')
    expect(items(w)).not.toContain('/platform/tenants')
    expect(items(w)).not.toContain('/platform/audit')
    // 角色同步借道 PLATFORM_TENANTS_MANAGE，只有報表碼看不到
    expect(items(w)).not.toContain('/platform/roles-sync')
  })
})
