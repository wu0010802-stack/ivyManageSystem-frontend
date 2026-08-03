import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

// 審核工作台兩個分頁自 2026-08-03 起各自一碼：待簽核=APPROVALS、
// 高風險事件=HIGH_RISK_READ（原本共用 AUDIT_LOGS，等於要連「報表 › 操作紀錄」
// 一起授出去才看得到）。本檔鎖住「分頁可見性跟著各自的碼走」。

const grantedPermissions = ref<string[]>([])
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => grantedPermissions.value.includes(code),
}))

vi.mock('@/composables/useHighRiskAuditCount', () => ({
  useHighRiskAuditCount: () => ({ unackCount: ref(0) }),
}))

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/workbench/approvals' }),
  useRouter: () => ({ push }),
  RouterView: { template: '<div class="router-view-stub" />' },
}))

import WorkbenchLayout from '../WorkbenchLayout.vue'

const mountLayout = () =>
  mount(WorkbenchLayout, {
    global: {
      stubs: {
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<div class="tab-pane" :data-name="name">{{ label }}<slot name="label" /></div>',
        },
        'el-badge': { template: '<span />' },
      },
    },
  })

const tabNames = (wrapper: ReturnType<typeof mountLayout>) =>
  wrapper.findAll('.tab-pane').map((n) => n.attributes('data-name'))

describe('WorkbenchLayout 分頁可見性', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('兩碼皆有 → 兩個分頁都在', () => {
    grantedPermissions.value = ['APPROVALS', 'HIGH_RISK_READ']
    expect(tabNames(mountLayout())).toEqual(['approvals', 'high-risk'])
  })

  it('只有 APPROVALS → 看不到高風險事件分頁', () => {
    grantedPermissions.value = ['APPROVALS']
    expect(tabNames(mountLayout())).toEqual(['approvals'])
  })

  it('只有 HIGH_RISK_READ → 看不到待簽核分頁', () => {
    grantedPermissions.value = ['HIGH_RISK_READ']
    expect(tabNames(mountLayout())).toEqual(['high-risk'])
  })

  it('只有 AUDIT_LOGS（操作紀錄）→ 高風險事件分頁不會出現', () => {
    grantedPermissions.value = ['AUDIT_LOGS', 'APPROVALS']
    expect(tabNames(mountLayout())).toEqual(['approvals'])
  })
})
