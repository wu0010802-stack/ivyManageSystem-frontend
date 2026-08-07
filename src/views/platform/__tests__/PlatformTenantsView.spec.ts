/**
 * 分校管理頁：建立分校必須「先 dry-run 過閘門、才准實建」，且一次性密碼與登入連結
 * 的呈現要 fail-closed（沒有 public_origin 就不顯示連結，GAP-09）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  createTenant: vi.fn(),
  suspendTenant: vi.fn(),
  resumeTenant: vi.fn(),
  archiveTenant: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  listTenants: h.listTenants,
  createTenant: h.createTenant,
  suspendTenant: h.suspendTenant,
  resumeTenant: h.resumeTenant,
  archiveTenant: h.archiveTenant,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: h.confirm, prompt: vi.fn() },
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import PlatformTenantsView from '../PlatformTenantsView.vue'

const TENANTS = [
  { id: 2, slug: 'branch-a', name: 'A 校', kind: 'school', status: 'active', student_count: 10, employee_count: 3, public_origin: 'https://a.example.tw' },
  { id: 3, slug: 'branch-b', name: 'B 校', kind: 'school', status: 'suspended', student_count: 0, employee_count: 1, public_origin: null },
]

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /></div>' },
  EmptyState: { template: '<div class="empty" />' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}<slot /></div>' },
  // ⚠ 不要在 stub 裡 `$emit('click')`：stub 的根節點是原生 <button>，父層的 @click
  // 會以 fallthrough attribute 綁在它身上，再自己 emit 一次等於每按一下觸發兩次
  //（曾讓本檔的 createTenant 被呼叫 4 次）。
  'el-button': {
    props: ['disabled', 'loading', 'type', 'link', 'plain'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  'el-table': {
    props: ['data'],
    template: '<table><tbody><tr v-for="r in data" :key="r.id"><td>{{ r.slug }}</td></tr></tbody></table>',
  },
  'el-table-column': { template: '<span />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'router-link': { props: ['to'], template: '<a><slot /></a>' },
}

const mountView = () => mount(PlatformTenantsView, { global: { stubs } })

async function openCreateForm(w: ReturnType<typeof mountView>) {
  await w.find('[data-testid="open-create"]').trigger('click')
  await w.find('[data-testid="create-slug"]').setValue('branch-c')
  await w.find('[data-testid="create-name"]').setValue('C 校')
  await flushPromises()
}

describe('PlatformTenantsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({ data: { items: TENANTS, total: TENANTS.length } })
    h.confirm.mockResolvedValue('confirm')
  })

  it('列出分校清單', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('branch-a')
    expect(w.text()).toContain('branch-b')
  })

  it('未通過 dry-run 前「確認建立」是 disabled', async () => {
    const w = mountView()
    await flushPromises()
    await openCreateForm(w)
    expect((w.find('[data-testid="create-submit"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(h.createTenant).not.toHaveBeenCalled()
  })

  it('dry-run 回 blockers → 顯示阻礙原因且仍不可建立', async () => {
    h.createTenant.mockResolvedValue({ data: { dry_run: true, slug: 'branch-c', blockers: ['tnt021 尚未套用'] } })
    const w = mountView()
    await flushPromises()
    await openCreateForm(w)
    await w.find('[data-testid="create-dryrun"]').trigger('click')
    await flushPromises()

    expect(h.createTenant).toHaveBeenCalledWith(expect.objectContaining({ dry_run: true }))
    expect(w.find('[data-testid="create-blockers"]').text()).toContain('tnt021 尚未套用')
    expect((w.find('[data-testid="create-submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('dry-run 通過後才實建，且回傳的一次性密碼只在結果視窗顯示', async () => {
    h.createTenant
      .mockResolvedValueOnce({ data: { dry_run: true, slug: 'branch-c', blockers: [] } })
      .mockResolvedValueOnce({
        data: { dry_run: false, slug: 'branch-c', tenant_id: 4, admin_username: 'admin', admin_one_time_password: 'P@ssw0rd!' },
      })
    // 實建後清單重抓：新分校已帶 public_origin
    h.listTenants
      .mockResolvedValueOnce({ data: { items: TENANTS, total: 2 } })
      .mockResolvedValue({
        data: {
          items: [...TENANTS, { id: 4, slug: 'branch-c', name: 'C 校', kind: 'school', status: 'active', public_origin: 'https://c.example.tw' }],
          total: 3,
        },
      })

    const w = mountView()
    await flushPromises()
    await openCreateForm(w)
    await w.find('[data-testid="create-dryrun"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="create-dryrun-ok"]').exists()).toBe(true)

    await w.find('[data-testid="create-submit"]').trigger('click')
    await flushPromises()

    expect(h.createTenant).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: false, slug: 'branch-c' }))
    expect(w.find('[data-testid="one-time-password"]').text()).toBe('P@ssw0rd!')
    expect(w.find('[data-testid="result-login-url"]').text()).toBe('https://c.example.tw')
  })

  it('新分校沒有 public_origin → 隱藏登入連結（不猜一個 hq 的網址）', async () => {
    h.createTenant
      .mockResolvedValueOnce({ data: { dry_run: true, slug: 'branch-c', blockers: [] } })
      .mockResolvedValueOnce({ data: { dry_run: false, slug: 'branch-c', tenant_id: 4, admin_username: 'admin', admin_one_time_password: 'x' } })
    h.listTenants.mockResolvedValue({
      data: { items: [...TENANTS, { id: 4, slug: 'branch-c', name: 'C 校', kind: 'school', status: 'active', public_origin: null }], total: 3 },
    })

    const w = mountView()
    await flushPromises()
    await openCreateForm(w)
    await w.find('[data-testid="create-dryrun"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="create-submit"]').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="result-login-url"]').exists()).toBe(false)
    expect(w.find('[data-testid="result-no-origin"]').exists()).toBe(true)
  })

  it('停用分校需二次確認，確認後呼叫 suspend 並重抓清單', async () => {
    h.suspendTenant.mockResolvedValue({ data: { id: 2, slug: 'branch-a', status: 'suspended' } })
    const w = mountView()
    await flushPromises()

    await (w.vm as unknown as { changeStatus: (row: unknown, a: string) => Promise<void> }).changeStatus(
      TENANTS[0],
      'suspend',
    )
    await flushPromises()

    expect(h.confirm).toHaveBeenCalled()
    expect(h.suspendTenant).toHaveBeenCalledWith(2)
    expect(h.listTenants).toHaveBeenCalledTimes(2)
  })

  it('使用者在確認框按取消 → 不送出任何請求', async () => {
    h.confirm.mockRejectedValue(new Error('cancel'))
    const w = mountView()
    await flushPromises()

    await (w.vm as unknown as { changeStatus: (row: unknown, a: string) => Promise<void> }).changeStatus(
      TENANTS[0],
      'archive',
    )
    await flushPromises()

    expect(h.archiveTenant).not.toHaveBeenCalled()
  })
})
