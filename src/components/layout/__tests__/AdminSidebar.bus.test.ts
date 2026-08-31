/**
 * 側欄的娃娃車入口（2026-08-13 起三項整合為單一「娃娃車管理」/bus）。
 *
 * 陷阱在群組層：項目掛在「學生與班級」群組底下，而群組本身有
 * `hasVisibleStudentItems` 的 v-if。只加項目、忘了把 BUS_* 加進群組條件的話，
 * 只持 BUS_READ／BUS_WRITE 的帳號會連整個群組都看不到——選單裡等於沒有娃娃車，
 * 而使用者完全無從診斷（頁面其實進得去）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routeState = { path: '/' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ get path() { return routeState.path } }),
}))

import AdminSidebar from '../AdminSidebar.vue'
import { setUserInfo } from '@/utils/auth'

const passthrough = { template: '<div><slot name="title" /><slot /></div>' }
const stubs = {
  ElAside: passthrough,
  ElScrollbar: passthrough,
  ElMenu: { props: ['defaultActive'], template: '<nav><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: true,
}

function mountWith(perms: string[]) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { global: { stubs } })
}
const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

beforeEach(() => setUserInfo(null))

describe('AdminSidebar 娃娃車入口', () => {
  it('wildcard 管理員看得到整合入口，且舊三項不再出現', () => {
    const all = items(mountWith(['*']))
    expect(all).toContain('/bus')
    expect(all).not.toContain('/bus-monitor')
    expect(all).not.toContain('/bus-history')
    expect(all).not.toContain('/bus-routes')
  })

  it('只有 BUS_READ：看得到整合入口，且群組本身要顯示出來', () => {
    const w = mountWith(['BUS_READ'])
    expect(items(w)).toContain('/bus')
    expect(subs(w)).toContain('group-students')
  })

  it('只有 BUS_WRITE：看得到整合入口，且群組本身要顯示出來', () => {
    const w = mountWith(['BUS_WRITE'])
    expect(items(w)).toContain('/bus')
    expect(subs(w)).toContain('group-students')
  })

  it('沒有 BUS_* 的帳號看不到娃娃車入口', () => {
    expect(items(mountWith(['SALARY_READ']))).not.toContain('/bus')
  })

  it('隨車老師的 BUS_TRIPS_OPERATE 不會帶出管理端入口', () => {
    expect(items(mountWith(['BUS_TRIPS_OPERATE']))).not.toContain('/bus')
  })
})
