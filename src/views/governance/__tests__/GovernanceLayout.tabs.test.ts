/**
 * 稽核與資料品質整合頁的分頁可見性與切換。
 *
 * 三個分頁各自一碼（HIGH_RISK_READ / AUDIT_LOGS / DATA_QUALITY_READ），彼此不
 * 互相授權：看得到操作紀錄不代表看得到高風險事件。分頁列只渲染有權限的那幾個，
 * 對應的路由守衛在 ROUTE_PERMISSION_RULES（見 governanceNav.test.ts）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const grantedPermissions = ref<string[]>([])
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => grantedPermissions.value.includes(code),
}))

const unackCount = ref(0)
vi.mock('@/composables/useHighRiskAuditCount', () => ({
  useHighRiskAuditCount: () => ({ unackCount }),
}))

const push = vi.fn()
const routeState = { path: '/governance/audit-logs' }
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routeState.path
    },
  }),
  useRouter: () => ({ push }),
  RouterView: { template: '<div class="router-view-stub" />' },
}))

import GovernanceLayout from '../GovernanceLayout.vue'

const mountLayout = () =>
  mount(GovernanceLayout, {
    global: {
      stubs: {
        'el-tabs': {
          props: ['modelValue'],
          template: '<div class="tabs" :data-active="modelValue"><slot /></div>',
        },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<div class="tab-pane" :data-name="name">{{ label }}<slot name="label" /></div>',
        },
        'el-badge': { props: ['value'], template: '<em class="badge">{{ value }}</em>' },
      },
    },
  })

const tabNames = (w: ReturnType<typeof mountLayout>) =>
  w.findAll('.tab-pane').map((n) => n.attributes('data-name'))

describe('GovernanceLayout 分頁可見性', () => {
  beforeEach(() => {
    push.mockClear()
    routeState.path = '/governance/audit-logs'
    unackCount.value = 0
  })

  it('三碼皆有 → 四個分頁依序都在（含沿用 AUDIT_LOGS 的家長端監控）', () => {
    grantedPermissions.value = ['HIGH_RISK_READ', 'AUDIT_LOGS', 'DATA_QUALITY_READ']
    expect(tabNames(mountLayout())).toEqual(['high-risk', 'audit-logs', 'data-quality', 'parent-monitor'])
  })

  it('分頁標籤即三個頁面的名稱（子頁不再自帶標題）', () => {
    // 「資料異常待辦」為 2026-05 命名裁定（原「資料品質報告」讀起來像報表，
    // 實際是可確認／標記已修正／忽略的待辦佇列）；整併後這個名字掛在分頁上。
    grantedPermissions.value = ['HIGH_RISK_READ', 'AUDIT_LOGS', 'DATA_QUALITY_READ']
    const text = mountLayout().text()
    expect(text).toContain('高風險事件')
    expect(text).toContain('操作紀錄')
    expect(text).toContain('資料異常待辦')
  })

  it('只有 AUDIT_LOGS → 看不到高風險事件與資料異常待辦分頁（但看得到沿用同碼的監控分頁）', () => {
    grantedPermissions.value = ['AUDIT_LOGS']
    expect(tabNames(mountLayout())).toEqual(['audit-logs', 'parent-monitor'])
  })

  it('只有 HIGH_RISK_READ → 只剩高風險事件分頁', () => {
    grantedPermissions.value = ['HIGH_RISK_READ']
    expect(tabNames(mountLayout())).toEqual(['high-risk'])
  })

  it('DATA_QUALITY_WRITE 不是檢視碼，不會單獨開出資料異常待辦分頁', () => {
    grantedPermissions.value = ['DATA_QUALITY_WRITE']
    expect(tabNames(mountLayout())).toEqual([])
  })
})

describe('GovernanceLayout 分頁狀態與切換', () => {
  beforeEach(() => {
    push.mockClear()
    grantedPermissions.value = ['HIGH_RISK_READ', 'AUDIT_LOGS', 'DATA_QUALITY_READ']
  })

  it('目前路徑決定 active 分頁', () => {
    routeState.path = '/governance/data-quality'
    expect(mountLayout().find('.tabs').attributes('data-active')).toBe('data-quality')
  })

  it('高風險未確認數以 badge 顯示在分頁標籤上', () => {
    routeState.path = '/governance/high-risk'
    unackCount.value = 3
    expect(mountLayout().find('.tab-pane[data-name="high-risk"] .badge').text()).toBe('3')
  })

  it('未確認數為 0 時不顯示 badge', () => {
    unackCount.value = 0
    expect(mountLayout().find('.tab-pane[data-name="high-risk"] .badge').exists()).toBe(false)
  })
})
