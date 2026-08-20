import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminSidebar from '@/components/layout/AdminSidebar.vue'

// canView 是 Object.keys(PERMISSION_NAMES) 的映射，故此處直接用**真實**的權限清單。
// 原本是手工列舉的子集，等於側欄權限的第三份手工維護表：漏一個 key 該選單項就
// 靜默消失，測試紅在「選單項不存在」上，看不出真正原因是 mock 沒跟上
// （2026-07-27 改 gov-reports gate 時實際踩到）。
// getUserInfo 回 wildcard '*' + hasPermission 一律 true，所以權限值不影響斷言，
// 只有 key 的集合有影響——那正好該用真的。
vi.mock('@/utils/auth', async () => {
  const { PERMISSION_NAMES } = await import('@/constants/permissions')
  return {
    PERMISSION_NAMES,
    getUserInfo: () => ({ permission_names: ['*'], name: 'admin' }),
    // AdminSidebar 的 canView 直接委派 hasPermission（見 src/utils/auth.ts）；
    // 固定回 true，本檔專注驗 IA 結構而非權限判定。
    hasPermission: () => true,
    // 2026-08-04 4e：側欄新增總部（platform）雙向過濾。本檔驗的是**分校** IA，
    // 故固定回 false（＝分校視角：總部群組隱藏、業務群組照常）。總部視角的斷言在
    // src/components/layout/__tests__/AdminSidebar.platform.spec.ts。
    isPlatformAdmin: () => false,
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

// 讓 el-aside 傳遞 slot 內容（預設字串 stub 會吃掉 slot）
const ElAsidePassthrough = { template: '<div><slot /></div>' }

const mountSidebar = async (props = {}) => {
  const wrapper = mount(AdminSidebar, {
    global: {
      plugins: [router],
      stubs: {
        'el-aside': ElAsidePassthrough,
        'el-menu': { template: '<div><slot /></div>' },
        'el-menu-item': {
          props: ['index'],
          template: '<div :data-index="index"><slot /><slot name="title" /></div>',
        },
        'el-sub-menu': { template: '<div><slot /><slot name="title" /></div>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        'el-badge': {
          props: ['value'],
          template: '<span class="mock-badge">{{ value }}</span>',
        },
        'router-link': { template: '<a><slot /></a>' },
      },
    },
    props: { isMobile: false, ...props },
  })
  await router.isReady()
  return wrapper
}

describe('AdminSidebar collapse-toggle a11y', () => {
  it('收合按鈕是 <button> 且有 aria-label', async () => {
    const wrapper = await mountSidebar()
    const toggle = wrapper.find('.collapse-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('type')).toBe('button')
    expect(toggle.attributes('aria-label')).toMatch(/收合|展開/)
  })

  it('shows 學生 menu item pointing to /students', async () => {
    const wrapper = await mountSidebar()
    const items = wrapper.findAll('[data-index="/students"]')
    expect(items.length).toBeGreaterThan(0)
    const studentsItem = items[0]
    expect(studentsItem.text()).toContain('學生')
    // 確保不是 "學生管理"
    expect(studentsItem.text()).not.toContain('學生管理')
  })

  it('does not show /student-academic-affairs menu item anymore', async () => {
    const wrapper = await mountSidebar()
    const items = wrapper.findAll('[data-index="/student-academic-affairs"]')
    expect(items.length).toBe(0)
  })

  it('renders sub-menu titled 學生與班級', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('學生與班級')
    expect(wrapper.text()).not.toContain('學生教務')
  })
})

describe('AdminSidebar 9-IA structure', () => {
  it('「工作台」一級項目存在且連結至 /workbench', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/workbench"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('工作台')
  })

  it('「報表」一級子選單存在（操作紀錄已於 2026-08-20 移出至稽核與資料品質）', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('報表')
    expect(wrapper.find('[data-index="/audit-logs"]').exists()).toBe(false)
    expect(wrapper.find('[data-index="/data-quality"]').exists()).toBe(false)
  })

  it('「稽核與資料品質」為獨立入口，涵蓋操作紀錄與資料異常待辦', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/governance"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('稽核與資料品質')
  })

  it('「報表」含修改紀錄 /activity/changes', async () => {
    const wrapper = await mountSidebar()
    const changesItem = wrapper.find('[data-index="/activity/changes"]')
    expect(changesItem.exists()).toBe(true)
    expect(changesItem.text()).toContain('修改紀錄')
  })

  it('「報表」含月度幼生在園統計 /admin/gov-reports/monthly', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/admin/gov-reports/monthly"]')
    expect(item.exists()).toBe(true)
    // 原「月度月報」疊詞且未說是什麼月報（實為教育部幼生通報），2026-07-28 命名稽核改名
    expect(item.text()).toContain('月度幼生在園統計')
  })

  it('「系統設定」不再含考核管理（已整併至人事薪資「考核與年終」）', async () => {
    const wrapper = await mountSidebar()
    const items = wrapper.findAll('[data-index="/appraisal-management"]')
    expect(items.length).toBe(0)
  })

  it('「課後才藝」含才藝設定與品項 /activity/settings，且不再有獨立的課程與用品入口', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/activity/settings"]')
    expect(item.exists()).toBe(true)
    // 2026-07-31 起課程與用品併入本頁前兩個 tab，名稱從「報名與通知設定」改為涵蓋品項的說法
    expect(item.text()).toContain('才藝設定與品項')
    expect(wrapper.find('[data-index="/activity/catalog"]').exists()).toBe(false)
  })

  it('「人事薪資」含「考核與年終」整合入口 /appraisal-year-end', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/appraisal-year-end"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('考核與年終')
  })

  it('「收支簽收」整合入口在園務行政（廠商付款/雜項收款已整併）', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/finance-signoffs"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('收支簽收')
    expect(wrapper.find('[data-index="/vendor-payments"]').exists()).toBe(false)
    expect(wrapper.find('[data-index="/misc-receipts"]').exists()).toBe(false)
  })

  it('「年終獎金 / 考核年終 payout」獨立項目已整併（不再單獨出現）', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.find('[data-index="/year_end/cycles"]').exists()).toBe(false)
    expect(wrapper.find('[data-index="/year-end/appraisal-payout"]').exists()).toBe(false)
  })
})

describe('AdminSidebar workbenchBadge', () => {
  // 2026-08-20：高風險事件移出工作台後兩個 badge 分家——工作台只算待簽核，
  // 高風險未確認數改掛「稽核與資料品質」。相加會讓工作台的 badge 指向它已無的分頁。
  it('工作台 badge 只算待簽核；高風險未確認數掛在稽核與資料品質', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 3, pendingHighRiskAudit: 2 })
    expect(wrapper.find('[data-index="/workbench"]').find('.mock-badge').text()).toBe('3')
    expect(wrapper.find('[data-index="/governance"]').find('.mock-badge').text()).toBe('2')
    expect(wrapper.findAll('.mock-badge').map((b) => b.text())).not.toContain('5')
  })

  it('兩者皆為 0 時不渲染 badge', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 0, pendingHighRiskAudit: 0 })
    const badges = wrapper.findAll('.mock-badge')
    // workbenchBadge = 0 → v-if false → no badge rendered on workbench item
    expect(badges.filter((b) => b.text() === '0').length).toBe(0)
  })

  it('pendingHighRiskAudit 預設 0 且不影響 pendingActivityInquiries badge', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 0, pendingHighRiskAudit: 0, pendingActivityInquiries: 4 })
    const badges = wrapper.findAll('.mock-badge')
    const badgeValues = badges.map((b) => b.text())
    // pendingActivityInquiries badge still shows
    expect(badgeValues).toContain('4')
  })
})

describe('AdminSidebar 才藝報名待審核 badge（報名管理選單項）', () => {
  it('pendingActivityReview > 0 時「報名管理」顯示 badge', async () => {
    const wrapper = await mountSidebar({ pendingActivityReview: 3 })
    const item = wrapper.find('[data-index="/activity/registrations"]')
    expect(item.exists()).toBe(true)
    const badge = item.find('.mock-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('pendingActivityReview 為 0（預設）時不顯示 badge', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/activity/registrations"]')
    expect(item.exists()).toBe(true)
    expect(item.find('.mock-badge').exists()).toBe(false)
  })
})
