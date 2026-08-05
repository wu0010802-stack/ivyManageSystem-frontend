/**
 * 角色同步頁：dry-run 預覽 → 二次確認 → 實跑，並把 `RoleSyncReport.results`
 * 逐 target 呈現（CT-P-05 / CT-FIX-07）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  syncRoles: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/platform', () => ({ listTenants: h.listTenants, syncRoles: h.syncRoles }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.error, warning: vi.fn() },
  ElMessageBox: { confirm: h.confirm, prompt: h.prompt },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import PlatformRoleSyncView from '../PlatformRoleSyncView.vue'

const TENANTS = [
  { id: 2, slug: 'branch-a', name: 'A 校', kind: 'school', status: 'active' },
  { id: 3, slug: 'branch-b', name: 'B 校', kind: 'school', status: 'active' },
  { id: 4, slug: 'branch-c', name: 'C 校', kind: 'school', status: 'active' },
]

const DRY_REPORT = {
  source_tenant_id: 2,
  mode: 'merge',
  dry_run: true,
  results: [
    { tenant_id: 3, tenant_slug: 'branch-b', created: ['teacher'], updated: ['admin'], skipped: [], errors: [], committed: false, users_token_bumped: 0, legacy_snapshots_migrated: 0 },
  ],
}

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /></div>' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}<slot /></div>' },
  'el-button': {
    props: ['disabled', 'loading', 'type', 'plain'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-radio-group': { props: ['modelValue'], template: '<div><slot /></div>' },
  'el-radio': { template: '<label><slot /></label>' },
  'el-table': {
    props: ['data'],
    template: '<table><tbody><tr v-for="r in data" :key="r.tenant_id"><td>{{ r.tenant_slug }}</td><td>{{ (r.created || []).join(",") }}</td></tr></tbody></table>',
  },
  'el-table-column': { template: '<span />' },
  'el-tag': { template: '<span><slot /></span>' },
}

interface Vm {
  sourceId: number | null
  targetIds: number[]
  mode: 'merge' | 'overwrite'
  run: (dryRun: boolean) => Promise<void>
  confirmApply: () => Promise<void>
}

async function mountReady() {
  const w = mount(PlatformRoleSyncView, { global: { stubs } })
  await flushPromises()
  const vm = w.vm as unknown as Vm
  vm.sourceId = 2
  vm.targetIds = [3]
  await flushPromises()
  return { w, vm }
}

describe('PlatformRoleSyncView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({ data: { items: TENANTS, total: TENANTS.length } })
    h.syncRoles.mockResolvedValue({ data: DRY_REPORT })
    h.confirm.mockResolvedValue('ok')
    h.prompt.mockResolvedValue({ value: 'OVERWRITE' })
  })

  it('未選來源/目標時兩顆按鈕都不可按', async () => {
    const w = mount(PlatformRoleSyncView, { global: { stubs } })
    await flushPromises()
    expect((w.find('[data-testid="sync-preview"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('[data-testid="sync-apply"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('預覽送出 dry_run=true，並渲染逐 target 結果（results）', async () => {
    const { w, vm } = await mountReady()
    await vm.run(true)
    await flushPromises()

    expect(h.syncRoles).toHaveBeenCalledWith({
      source_tenant_id: 2,
      target_tenant_ids: [3],
      mode: 'merge',
      dry_run: true,
    })
    const table = w.find('[data-testid="sync-result-table"]')
    expect(table.text()).toContain('branch-b')
    expect(table.text()).toContain('teacher')
  })

  it('未預覽前「實際執行」是 disabled（先看差異再動手）', async () => {
    const { w } = await mountReady()
    expect((w.find('[data-testid="sync-apply"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('預覽後才解鎖實跑；merge 走一般確認框', async () => {
    const { w, vm } = await mountReady()
    await vm.run(true)
    await flushPromises()
    expect((w.find('[data-testid="sync-apply"]').element as HTMLButtonElement).disabled).toBe(false)

    h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, dry_run: false, results: [{ ...DRY_REPORT.results[0], committed: true }] } })
    await vm.confirmApply()
    await flushPromises()

    expect(h.confirm).toHaveBeenCalled()
    expect(h.syncRoles).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: false }))
    // 實跑後回到「必須重新預覽」狀態，避免同一份預覽被連按兩次
    expect((w.find('[data-testid="sync-apply"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('overwrite 模式需要輸入確認字串（prompt），取消則不送出', async () => {
    const { vm } = await mountReady()
    vm.mode = 'overwrite'
    await vm.run(true)
    await flushPromises()
    h.syncRoles.mockClear()

    h.prompt.mockRejectedValueOnce(new Error('cancel'))
    await vm.confirmApply()
    await flushPromises()
    expect(h.syncRoles).not.toHaveBeenCalled()

    h.prompt.mockResolvedValueOnce({ value: 'OVERWRITE' })
    await vm.confirmApply()
    await flushPromises()
    expect(h.syncRoles).toHaveBeenCalledWith(expect.objectContaining({ mode: 'overwrite', dry_run: false }))
  })

  it('來源不小心被選進目標時，送出前會被濾掉（後端會直接拒絕整批）', async () => {
    const { vm } = await mountReady()
    vm.targetIds = [2, 3]
    await vm.run(true)
    await flushPromises()
    expect(h.syncRoles).toHaveBeenCalledWith(expect.objectContaining({ target_tenant_ids: [3] }))
  })

  it('409（目標正被另一個同步鎖住）顯示錯誤而不是靜默', async () => {
    const { vm } = await mountReady()
    h.syncRoles.mockRejectedValueOnce({ response: { status: 409 }, displayMessage: '同步進行中' })
    await vm.run(true)
    await flushPromises()
    expect(h.error).toHaveBeenCalledWith('同步進行中')
  })
})
