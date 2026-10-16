/**
 * 角色同步頁：dry-run 預覽 → 二次確認 → 實跑，並把 `RoleSyncReport.results`
 * 逐 target 呈現（CT-P-05 / CT-FIX-07）。
 *
 * F57／MT-08（整合審查 R4／R13）：預覽回傳的 `source_snapshot_hash` 必須在實跑時
 * 帶回；來源／目標／模式變更即作廢預覽；實跑 409 回到「需重新預覽」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  syncRoles: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/platform', () => ({ listTenants: h.listTenants, syncRoles: h.syncRoles }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.error, warning: h.warning },
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

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

const DRY_REPORT = {
  source_tenant_id: 2,
  mode: 'merge',
  dry_run: true,
  source_snapshot_hash: HASH_A,
  results: [
    {
      tenant_id: 3,
      tenant_slug: 'branch-b',
      created: ['teacher'],
      updated: ['admin'],
      skipped: [],
      errors: [],
      committed: false,
      users_token_bumped: 0,
      legacy_snapshots_migrated: 0,
      role_changes: [
        {
          code: 'teacher',
          action: 'created',
          permissions_added: ['STUDENTS_READ', 'ATTENDANCE_READ'],
          permissions_removed: [],
          label_from: null,
          label_to: '教師',
          description_changed: false,
        },
        {
          code: 'admin',
          action: 'updated',
          permissions_added: ['FEES_WRITE'],
          permissions_removed: ['SALARY_READ'],
          label_from: '管理者',
          label_to: '行政主管',
          description_changed: true,
        },
      ],
    },
  ],
}

/** 後端 api/platform/roles_sync.py 的 F57 409 detail（來源在預覽後被改過）。 */
const SOURCE_CHANGED_DETAIL = '來源分校的角色設定在預覽之後已變動，請重新預覽確認差異後再執行'

const applyDisabled = (w: ReturnType<typeof mount>): boolean =>
  (w.find('[data-testid="sync-apply"]').element as HTMLButtonElement).disabled

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
  describe('F57：預覽雜湊（source_snapshot_hash）', () => {
    it('實跑請求帶回預覽回傳的雜湊；預覽請求本身不帶', async () => {
      const { vm } = await mountReady()
      await vm.run(true)
      await flushPromises()
      expect(h.syncRoles.mock.calls[0][0]).not.toHaveProperty('source_snapshot_hash')

      h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, dry_run: false } })
      await vm.confirmApply()
      await flushPromises()
      expect(h.syncRoles).toHaveBeenLastCalledWith(
        expect.objectContaining({ dry_run: false, source_snapshot_hash: HASH_A }),
      )
    })

    it('預覽後變更來源 → 作廢預覽與雜湊；重新預覽後實跑帶的是新雜湊', async () => {
      const { w, vm } = await mountReady()
      await vm.run(true)
      await flushPromises()
      expect(applyDisabled(w)).toBe(false)

      vm.sourceId = 4
      await flushPromises()
      expect(applyDisabled(w)).toBe(true)
      // 舊預覽不再顯示，避免誤以為畫面上的差異就是新來源的差異
      expect(w.find('[data-testid="sync-result"]').exists()).toBe(false)

      h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, source_tenant_id: 4, source_snapshot_hash: HASH_B } })
      await vm.run(true)
      await flushPromises()
      h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, dry_run: false } })
      await vm.confirmApply()
      await flushPromises()
      expect(h.syncRoles).toHaveBeenLastCalledWith(
        expect.objectContaining({ source_tenant_id: 4, dry_run: false, source_snapshot_hash: HASH_B }),
      )
    })

    it('預覽後變更目標或模式也會作廢預覽', async () => {
      const { w, vm } = await mountReady()
      await vm.run(true)
      await flushPromises()
      vm.targetIds = [3, 4]
      await flushPromises()
      expect(applyDisabled(w)).toBe(true)

      await vm.run(true)
      await flushPromises()
      expect(applyDisabled(w)).toBe(false)
      vm.mode = 'overwrite'
      await flushPromises()
      expect(applyDisabled(w)).toBe(true)
    })

    it('預覽請求在途中改了來源 → 回來的結果不算數（不能拿舊參數的雜湊去實跑）', async () => {
      const { w, vm } = await mountReady()
      let resolvePreview: (v: unknown) => void = () => {}
      h.syncRoles.mockReturnValueOnce(new Promise((r) => { resolvePreview = r }))
      const pending = vm.run(true)
      vm.sourceId = 4
      await flushPromises()
      resolvePreview({ data: DRY_REPORT })
      await pending
      await flushPromises()
      expect(applyDisabled(w)).toBe(true)
    })

    it('實跑回 409（來源已變動）→ 提示重新預覽並回到需預覽狀態', async () => {
      const { w, vm } = await mountReady()
      await vm.run(true)
      await flushPromises()

      h.syncRoles.mockRejectedValueOnce({ response: { status: 409, data: { detail: SOURCE_CHANGED_DETAIL } } })
      await vm.confirmApply()
      await flushPromises()

      expect(h.warning).toHaveBeenCalledWith('來源已變動，請重新預覽')
      expect(h.error).not.toHaveBeenCalled()
      expect(applyDisabled(w)).toBe(true)
      expect(w.find('[data-testid="sync-result"]').exists()).toBe(false)

      // 重新預覽拿到新雜湊，實跑帶新的
      h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, source_snapshot_hash: HASH_B } })
      await vm.run(true)
      await flushPromises()
      h.syncRoles.mockResolvedValueOnce({ data: { ...DRY_REPORT, dry_run: false } })
      await vm.confirmApply()
      await flushPromises()
      expect(h.syncRoles).toHaveBeenLastCalledWith(expect.objectContaining({ source_snapshot_hash: HASH_B }))
    })

    it('實跑回其他 409（目標被鎖）→ 顯示後端訊息，仍要求重新預覽', async () => {
      const { w, vm } = await mountReady()
      await vm.run(true)
      await flushPromises()

      h.syncRoles.mockRejectedValueOnce({
        response: { status: 409, data: { detail: '另一個角色同步正在對此租戶執行中，請稍後再試' } },
        displayMessage: '另一個角色同步正在對此租戶執行中，請稍後再試',
      })
      await vm.confirmApply()
      await flushPromises()

      expect(h.error).toHaveBeenCalledWith('另一個角色同步正在對此租戶執行中，請稍後再試')
      expect(h.warning).not.toHaveBeenCalledWith('來源已變動，請重新預覽')
      expect(applyDisabled(w)).toBe(true)
    })
  })

  it('預覽逐目標渲染 role_changes（新增／移除的權限、名稱變更、描述變更）', async () => {
    const { w, vm } = await mountReady()
    await vm.run(true)
    await flushPromises()

    const teacher = w.find('[data-testid="sync-diff-3-teacher"]')
    expect(teacher.exists()).toBe(true)
    expect(teacher.text()).toContain('新建')
    expect(teacher.text()).toContain('教師')
    expect(teacher.find('[data-testid="sync-diff-added"]').text()).toContain('STUDENTS_READ')
    expect(teacher.find('[data-testid="sync-diff-added"]').text()).toContain('ATTENDANCE_READ')
    expect(teacher.find('[data-testid="sync-diff-removed"]').exists()).toBe(false)

    const admin = w.find('[data-testid="sync-diff-3-admin"]')
    expect(admin.text()).toContain('覆寫')
    expect(admin.text()).toContain('管理者')
    expect(admin.text()).toContain('行政主管')
    expect(admin.text()).toContain('描述')
    expect(admin.find('[data-testid="sync-diff-added"]').text()).toContain('FEES_WRITE')
    expect(admin.find('[data-testid="sync-diff-removed"]').text()).toContain('SALARY_READ')
  })
})
