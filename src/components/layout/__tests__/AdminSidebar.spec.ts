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
// AdminSidebar 的 canView 直接委派真實 hasPermission()（見 src/utils/auth.ts），其內部呼叫
// 的是模組自身的 getUserInfo 綁定，mock 匯出的 getUserInfo 攔截不到那條內部呼叫路徑
// （ESM 具名匯出各自綁定，同模組內部呼叫不會走被覆寫的匯出物件）。改用真實 setUserInfo
// 灌狀態，讓 getUserInfo/hasPermission 讀到同一份單例，測試才是對真實行為斷言。
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

function mountWith(
  perms: string[],
  props: { isMobile?: boolean; mobileOpen?: boolean } = {},
  attachTo?: HTMLElement,
) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { props, attachTo, global: { stubs } })
}

const items = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-item]').map((n) => n.attributes('data-item'))
const subs = (w: ReturnType<typeof mountWith>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

describe('AdminSidebar 考核年終整併 + 群組可見性回歸', () => {
  beforeEach(() => vi.clearAllMocks())

  it('「考核」「年終」兩個入口取代舊的整合入口與三個舊項目（2026-10-29 S1）', () => {
    const w = mountWith(['*'])
    const all = items(w)
    expect(all).toContain('/appraisal-year-end/appraisal')
    expect(all).toContain('/appraisal-year-end/year-end')
    // 舊單一入口「考核與年終」已拆掉（網址仍可用，只是不再是選單項）
    expect(all).not.toContain('/appraisal-year-end')
    expect(all).not.toContain('/year_end/cycles')
    expect(all).not.toContain('/year-end/appraisal-payout')
    expect(all).not.toContain('/appraisal-management')
  })

  it('只有 SALARY_READ → 系統設定群組不顯示（修補回歸）；人事薪資仍有年終入口，點擊落在共用待辦頁', () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).not.toContain('group-settings')
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end/todo')
    // 沒有 YEAR_END_READ，點原 routePath 會被路由守衛擋住，所以入口換成待辦頁
    expect(items(w)).not.toContain('/appraisal-year-end/year-end')
    expect(items(w)).not.toContain('/appraisal-year-end/appraisal')
  })

  it('只有 SETTINGS_READ → 人事薪資群組顯示且有年終入口（修補回歸）', () => {
    const w = mountWith(['SETTINGS_READ'])
    expect(subs(w)).toContain('group-leave')
    expect(items(w)).toContain('/appraisal-year-end/todo')
    expect(subs(w)).toContain('group-settings')
  })

  it('只有 YEAR_END_READ → 只看到「年終」，且入口就是年終清單（不落到待辦頁）', () => {
    const all = items(mountWith(['YEAR_END_READ']))
    expect(all).toContain('/appraisal-year-end/year-end')
    expect(all).not.toContain('/appraisal-year-end/appraisal')
    expect(all).not.toContain('/appraisal-year-end/todo')
  })

  it('只有 APPRAISAL_FINALIZE → 入口可見（走待辦頁，年終清單需 YEAR_END_READ）', () => {
    const all = items(mountWith(['APPRAISAL_FINALIZE']))
    expect(all).toContain('/appraisal-year-end/todo')
    expect(all).not.toContain('/appraisal-year-end/year-end')
  })

  it('只有 APPRAISAL_READ → 只看到「考核」（2026-07-10 巢狀路由新增的頂層權限）', () => {
    const all = items(mountWith(['APPRAISAL_READ']))
    expect(all).toContain('/appraisal-year-end/appraisal')
    expect(all).not.toContain('/appraisal-year-end/year-end')
    expect(all).not.toContain('/appraisal-year-end/todo')
  })

  it('APPRAISAL_READ＋YEAR_END_READ → 兩個入口都用各自的 routePath', () => {
    const all = items(mountWith(['APPRAISAL_READ', 'YEAR_END_READ']))
    expect(all).toContain('/appraisal-year-end/appraisal')
    expect(all).toContain('/appraisal-year-end/year-end')
    expect(all).not.toContain('/appraisal-year-end/todo')
  })

  it('「排班」「出勤核對」分開兩個入口（2026-10-29 S3）：SCHEDULE 只看到排班、ATTENDANCE_READ 只看到出勤核對', () => {
    const both = items(mountWith(['SCHEDULE', 'ATTENDANCE_READ']))
    expect(both).toContain('/schedule')
    expect(both).toContain('/attendance')
    expect(items(mountWith(['SCHEDULE']))).toContain('/schedule')
    expect(items(mountWith(['SCHEDULE']))).not.toContain('/attendance')
    expect(items(mountWith(['ATTENDANCE_READ']))).toContain('/attendance')
    expect(items(mountWith(['ATTENDANCE_READ']))).not.toContain('/schedule')
  })

  it('報名時間設定 掛課後才藝群組，不在系統設定；修改紀錄已併入報名管理頁籤（2026-10-29 M4），不再有獨立側欄項', () => {
    const w = mountWith(['*'])
    const inGroup = (sub: string) =>
      w.find(`[data-sub="${sub}"]`).findAll('[data-item]').map((n) => n.attributes('data-item'))

    const activity = inGroup('group-activity')
    expect(activity).toContain('/activity/settings')
    expect(activity).toContain('/activity/registrations')
    expect(activity).not.toContain('/activity/changes')

    expect(inGroup('group-settings')).not.toContain('/activity/settings')
    // 「報表」群組已於 2026-10-29 批次 2 取消，經營報表併入「財務」
    expect(subs(w)).not.toContain('group-reports')
    expect(inGroup('group-finance')).not.toContain('/activity/changes')
  })

  it('只有 ACTIVITY_READ → 課後才藝顯示報名管理（含異動紀錄頁籤）；報表／財務群組不會因此空殼顯示', () => {
    const w = mountWith(['ACTIVITY_READ'])
    expect(subs(w)).toContain('group-activity')
    expect(items(w)).toContain('/activity/registrations')
    expect(items(w)).not.toContain('/activity/changes')
    expect(subs(w)).not.toContain('group-reports')
    expect(subs(w)).not.toContain('group-finance')
  })

  it('只有 ACTIVITY_READ → 仍看得到 /activity/settings（課程與用品併入後不可再要求 WRITE）', () => {
    const w = mountWith(['ACTIVITY_READ'])
    expect(items(w)).toContain('/activity/settings')
    // 舊的課程與用品獨立入口已移除
    expect(items(w)).not.toContain('/activity/catalog')
  })

  it('只有 scope-qualified STUDENTS_READ:own_class（無裸 STUDENTS_READ）→ 學生選單仍可見（對齊 hasPermission 的 scope-aware 判斷，回歸修復）', () => {
    const w = mountWith(['STUDENTS_READ:own_class'])
    expect(subs(w)).toContain('group-students')
    expect(items(w)).toContain('/students')
  })

  it('無效 scope 後綴（非 scope-aware code 帶 scope 後綴）→ fail-closed 不顯示對應選單', () => {
    // EMPLOYEES_READ 不在 SCOPE_AWARE_CODES 內，帶 scope 後綴應視為無效（不可誤放行）
    const w = mountWith(['EMPLOYEES_READ:own_class'])
    expect(items(w)).not.toContain('/employees')
  })

  it('teacher 角色即使 permission_names 為 wildcard 仍完全看不到 admin 選單（短路防提權，不可移除）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    const w = mount(AdminSidebar, { global: { stubs } })
    expect(items(w)).toEqual([])
    expect(subs(w)).toEqual([])
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

  it('/appraisal-year-end/appraisal/... 與考核側規則頁籤 → 高亮「考核」', () => {
    for (const path of [
      '/appraisal-year-end/appraisal',
      '/appraisal-year-end/appraisal/calibration',
      '/appraisal-year-end/rules/scoring',
      '/appraisal-year-end/rules/bonus-rates',
      '/appraisal-year-end/rules/catalog',
      '/appraisal-year-end/rules/enrollment-targets',
    ]) {
      routeState.path = path
      const w = mountWith(['*'])
      expect(w.find('nav').attributes('data-active'), path).toBe('/appraisal-year-end/appraisal')
    }
  })

  it('/appraisal-year-end/year-end/... 與年終側規則頁籤 → 高亮「年終」', () => {
    for (const path of [
      '/appraisal-year-end/year-end',
      '/appraisal-year-end/year-end/payout',
      '/appraisal-year-end/year-end/cycles/7',
      '/appraisal-year-end/rules/festival-headcount',
      '/appraisal-year-end/rules/year-end-rules',
    ]) {
      routeState.path = path
      const w = mountWith(['*'])
      expect(w.find('nav').attributes('data-active'), path).toBe('/appraisal-year-end/year-end')
    }
  })

  it('兩邊共用的待辦、待補資料：兩邊都有 → 高亮「考核」；只看得到年終 → 高亮「年終」', () => {
    for (const path of ['/appraisal-year-end/todo', '/appraisal-year-end/exceptions']) {
      routeState.path = path
      expect(mountWith(['*']).find('nav').attributes('data-active'), path).toBe('/appraisal-year-end/appraisal')
      expect(mountWith(['APPRAISAL_READ']).find('nav').attributes('data-active'), path).toBe(
        '/appraisal-year-end/appraisal',
      )
      expect(mountWith(['YEAR_END_READ']).find('nav').attributes('data-active'), path).toBe(
        '/appraisal-year-end/year-end',
      )
    }
  })

  it('只靠 visibleAlso 可見的帳號（SETTINGS_READ）停在待辦頁 → 高亮他看得到的年終入口（待辦頁）', () => {
    routeState.path = '/appraisal-year-end/todo'
    const w = mountWith(['SETTINGS_READ'])
    expect(w.find('nav').attributes('data-active')).toBe('/appraisal-year-end/todo')
    expect(items(w)).toContain('/appraisal-year-end/todo')
  })

  // manifest 化後 activeMenu 改為 ACTIVE_MENU_ENTRIES 最長前綴匹配；
  // 釘住「本身即選單頁的深路徑」不可被較短前綴（/students、/settings）搶走高亮。
  it('/students/admissions 高亮自身（最長前綴勝過 /students）', () => {
    routeState.path = '/students/admissions'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/students/admissions')
  })

  it('/students/profile/123 非選單頁子路徑 → 高亮 /students', () => {
    routeState.path = '/students/profile/123'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/students')
  })

  it('/settings/accounts 高亮自身（最長前綴勝過 /settings）', () => {
    routeState.path = '/settings/accounts'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/settings/accounts')
  })

  it('/settings 精確高亮一般設定，不受 /settings/accounts 影響', () => {
    routeState.path = '/settings'
    const w = mountWith(['*'])
    expect(w.find('nav').attributes('data-active')).toBe('/settings')
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

describe('AdminSidebar 系統設定二級選單（路由拆分）', () => {
  it('wildcard：帳號設定/角色設定/一般設定三子項全可見', () => {
    const w = mountWith(['*'])
    const all = items(w)
    expect(all).toContain('/settings/accounts')
    expect(all).toContain('/settings/roles')
    expect(all).toContain('/settings')
  })

  it('只有 USER_MANAGEMENT_READ：群組顯示、僅帳號設定可見', () => {
    const w = mountWith(['USER_MANAGEMENT_READ'])
    expect(subs(w)).toContain('group-settings')
    const all = items(w)
    expect(all).toContain('/settings/accounts')
    expect(all).not.toContain('/settings/roles')
    expect(all).not.toContain('/settings')
  })

  it('只有 ROLES_MANAGE：群組顯示、僅角色設定可見', () => {
    const w = mountWith(['ROLES_MANAGE'])
    expect(subs(w)).toContain('group-settings')
    const all = items(w)
    expect(all).toContain('/settings/roles')
    expect(all).not.toContain('/settings/accounts')
    expect(all).not.toContain('/settings')
  })

  it('三權限皆無：系統設定群組整個不顯示', () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).not.toContain('group-settings')
  })
})
