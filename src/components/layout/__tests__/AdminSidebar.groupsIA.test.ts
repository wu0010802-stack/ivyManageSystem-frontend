/**
 * 後台 IA 重整 批次 2（2026-10-29）：側欄群組重整的結構守衛。
 *
 * 守的是「群組順序／歸屬」與「權限語意不變」兩件事：
 * - 順序：儀表板 → 工作台 → 人事薪資 → 學生與班級 → 招生 → 接送交通 → 財務 → 園務行政
 *   → 課後才藝 → 系統設定 → 總部管理；治理（稽核與資料品質）維持最底。
 * - 歸屬：每個選單項只在一個群組；原「報表」群取消、不得殘留。
 * - 健康與給藥加進選單，可見性碼＝STUDENTS_HEALTH_READ（與路由規則同源）。
 * - 側欄展開狀態不落地：localStorage 殘留舊 key（含已取消的 reports）不得影響渲染。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { SIDEBAR_TREE } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

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

function mountWith(perms: string[]) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { global: { stubs } })
}
const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))
const inGroup = (w: ReturnType<typeof mountWith>, sub: string) =>
  w.find(`[data-sub="${sub}"]`).findAll('[data-item]').map((n) => n.attributes('data-item'))

describe('側欄群組順序與歸屬（SIDEBAR_TREE 靜態）', () => {
  it('群組順序固定；原「報表」群取消', () => {
    expect(SIDEBAR_TREE.groups.map((g) => g.index)).toEqual([
      'group-leave',
      'group-students',
      'group-recruitment',
      'group-transport',
      'group-finance',
      'group-admin',
      'group-activity',
      'group-settings',
      'group-platform',
    ])
    expect(SIDEBAR_TREE.groups.map((g) => g.index)).not.toContain('group-reports')
  })

  it('一級項目在群組之前（儀表板、工作台），治理在最底', () => {
    expect(SIDEBAR_TREE.topLevel.map((i) => i.index)).toEqual(['/', '/workbench'])
    expect(SIDEBAR_TREE.bottomLevel.map((i) => i.index)).toEqual(['/governance'])
  })

  it('各群內容與順序', () => {
    const itemsOf = (idx: string) =>
      SIDEBAR_TREE.groups.find((g) => g.index === idx)?.items.map((i) => i.index)
    expect(itemsOf('group-students')).toEqual([
      '/classrooms',
      '/students',
      '/students/sign-documents',
      '/portfolio/medication-today',
      '/growth-books',
      '/enrollment-stats',
    ])
    expect(itemsOf('group-recruitment')).toEqual(['/students/admissions'])
    expect(itemsOf('group-transport')).toEqual(['/dismissal-queue', '/pickup-authorizations', '/bus'])
    expect(itemsOf('group-finance')).toEqual(['/fees', '/finance-signoffs', '/reports'])
    expect(itemsOf('group-admin')).toEqual(['/announcements', '/calendar', '/surveys'])
  })

  it('同一個選單項只出現在一個群組（搬家不得留下重複入口）', () => {
    const all = [
      ...SIDEBAR_TREE.topLevel.map((i) => i.index),
      ...SIDEBAR_TREE.bottomLevel.map((i) => i.index),
      ...SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index)),
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('el-sub-menu index 沿用舊 key：leave／students／admin／activity／settings 未改名', () => {
    const idx = SIDEBAR_TREE.groups.map((g) => g.index)
    for (const key of ['leave', 'students', 'admin', 'activity', 'settings']) {
      expect(idx).toContain(`group-${key}`)
    }
  })
})

describe('健康與給藥（加進選單）權限語意', () => {
  beforeEach(() => setUserInfo(null))

  it('可見性碼＝STUDENTS_HEALTH_READ，且與路由規則一致', () => {
    const item = SIDEBAR_TREE.groups
      .flatMap((g) => g.items)
      .find((i) => i.index === '/portfolio/medication-today')
    expect(item?.title).toBe('健康與給藥')
    expect(item?.visibleCodes).toEqual(['STUDENTS_HEALTH_READ'])
  })

  it('只有 STUDENTS_HEALTH_READ：看得到入口、進得了頁；只有 STUDENTS_READ 看不到', () => {
    const w = mountWith(['STUDENTS_HEALTH_READ'])
    expect(items(w)).toContain('/portfolio/medication-today')
    expect(subs(w)).toContain('group-students')
    expect(canAccessRoute('/portfolio/medication-today')).toBe(true)

    expect(items(mountWith(['STUDENTS_READ']))).not.toContain('/portfolio/medication-today')
    expect(canAccessRoute('/portfolio/medication-today')).toBe(false)
  })

  it('STUDENTS_HEALTH_WRITE／STUDENTS_MEDICATION_ADMINISTER 是動作碼，單獨持有不帶出入口', () => {
    expect(items(mountWith(['STUDENTS_HEALTH_WRITE']))).not.toContain('/portfolio/medication-today')
    expect(items(mountWith(['STUDENTS_MEDICATION_ADMINISTER']))).not.toContain(
      '/portfolio/medication-today',
    )
  })
})

describe('新群組的權限可見性（每群獨立，不互相外溢）', () => {
  beforeEach(() => setUserInfo(null))

  it('只有 RECRUITMENT_READ：只看到「招生」群組，學生與班級群組不出現', () => {
    const w = mountWith(['RECRUITMENT_READ'])
    expect(subs(w)).toEqual(['group-recruitment'])
    expect(items(w)).toEqual(['/students/admissions'])
  })

  it('只有 FEES_READ：只看到「財務」群組的學費管理', () => {
    const w = mountWith(['FEES_READ'])
    expect(subs(w)).toEqual(['group-finance'])
    expect(inGroup(w, 'group-finance')).toEqual(['/fees'])
  })

  it('只有 REPORTS：經營報表現屬「財務」群組', () => {
    const w = mountWith(['REPORTS'])
    expect(subs(w)).toEqual(['group-finance'])
    expect(inGroup(w, 'group-finance')).toEqual(['/reports'])
  })

  it('只有 VENDOR_PAYMENT_READ：收付款管理在「財務」群組而非「園務行政」', () => {
    const w = mountWith(['VENDOR_PAYMENT_READ'])
    expect(subs(w)).toEqual(['group-finance'])
    expect(inGroup(w, 'group-finance')).toEqual(['/finance-signoffs'])
  })

  it('只有 DISMISSAL_CALLS_READ／GUARDIANS_READ：看到「接送交通」群組，不帶出學生群組', () => {
    const w1 = mountWith(['DISMISSAL_CALLS_READ'])
    expect(subs(w1)).toEqual(['group-transport'])
    expect(items(w1)).toEqual(['/dismissal-queue'])
    const w2 = mountWith(['GUARDIANS_READ'])
    expect(subs(w2)).toEqual(['group-transport'])
    expect(items(w2)).toEqual(['/pickup-authorizations'])
  })

  it('wildcard：群組依序渲染（順序＝需求順序）', () => {
    const w = mountWith(['*'])
    expect(subs(w)).toEqual([
      'group-leave',
      'group-students',
      'group-recruitment',
      'group-transport',
      'group-finance',
      'group-admin',
      'group-activity',
      'group-settings',
    ])
  })
})

describe('側欄展開狀態不落地（舊 key 不得讓側欄壞掉）', () => {
  beforeEach(() => setUserInfo(null))

  it('localStorage 殘留已取消的 reports／各種舊展開 key，側欄仍正常渲染且不出現 group-reports', () => {
    for (const key of [
      'sidebar-opened',
      'sidebarOpenedMenus',
      'admin-menu-open',
      'el-menu-opened',
      'group-reports',
    ]) {
      localStorage.setItem(key, JSON.stringify(['group-reports', 'reports', 'group-leave']))
    }
    localStorage.setItem('ivy:sidebar:open', 'group-reports')
    const w = mountWith(['*'])
    expect(subs(w)).not.toContain('group-reports')
    expect(subs(w)).toContain('group-finance')
    expect(items(w)).toContain('/reports')
    expect(w.find('nav').exists()).toBe(true)
  })

  it('AdminSidebar 掛載時不讀寫任何 storage（展開狀態只由 el-menu default-active 決定）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    vi.mocked(localStorage.getItem).mockClear()
    vi.mocked(localStorage.setItem).mockClear()
    mount(AdminSidebar, { global: { stubs } })
    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
})
