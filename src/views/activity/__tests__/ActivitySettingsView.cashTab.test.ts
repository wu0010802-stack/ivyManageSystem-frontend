/**
 * 才藝管理設定「收銀設定」頁籤（後台 IA 重整 S5，2026-10-29）。
 *
 * POS 現金門檻（pos.cash_count_required_threshold／pos.cash_deposit_warning_threshold）自
 * 「系統設定 › 分校設定」搬來。元件讀 system_configs 要 SETTINGS_READ，所以頁籤以此顯示
 * （與 ACTIVITY_WRITE 無關）；寫入權限（SETTINGS_WRITE＋金流簽核）逐 key 在元件內鎖定。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const granted = vi.hoisted(() => ({ codes: new Set<string>() }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => granted.codes.has(code) }))

const mockRoute = reactive<{ query: Record<string, unknown> }>({ query: {} })
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/api/activity', () => ({
  getRegistrationTime: vi.fn().mockResolvedValue({ data: {} }),
  updateRegistrationTime: vi.fn(),
  uploadActivityPoster: vi.fn(),
  getWaitlistPromotedEmailTemplate: vi.fn().mockResolvedValue({ data: {} }),
  updateWaitlistPromotedEmailTemplate: vi.fn(),
  testSendWaitlistPromotedEmail: vi.fn(),
  getRegistrationSuccessEmailTemplate: vi.fn().mockResolvedValue({ data: {} }),
  updateRegistrationSuccessEmailTemplate: vi.fn(),
  testSendRegistrationSuccessEmail: vi.fn(),
}))

import ActivitySettingsView from '../ActivitySettingsView.vue'

const stubs = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<section class="pane" :data-name="name" :data-label="label"><slot /></section>',
  },
}

function mountView() {
  return shallowMount(ActivitySettingsView, { global: { stubs } })
}
const paneNames = (w: ReturnType<typeof mountView>) => w.findAll('.pane').map((p) => p.attributes('data-name'))
const activeTab = (w: ReturnType<typeof mountView>) => (w.vm as unknown as { activeTab: string }).activeTab

describe('ActivitySettingsView — 收銀設定頁籤', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.query = {}
  })

  it('有 ACTIVITY_WRITE＋SETTINGS_READ：收銀設定排在報名設定後、信件模板前', async () => {
    granted.codes = new Set(['ACTIVITY_READ', 'ACTIVITY_WRITE', 'SETTINGS_READ'])
    const w = mountView()
    await flushPromises()
    expect(paneNames(w)).toEqual(['courses', 'supplies', 'registration', 'cash', 'waitlistEmail', 'successEmail'])
  })

  it('只有 ACTIVITY_READ＋SETTINGS_READ：看得到收銀設定（唯讀角色不因缺 ACTIVITY_WRITE 看不到 system_configs）', async () => {
    granted.codes = new Set(['ACTIVITY_READ', 'SETTINGS_READ'])
    const w = mountView()
    await flushPromises()
    expect(paneNames(w)).toEqual(['courses', 'supplies', 'cash'])
  })

  it('沒有 SETTINGS_READ：沒有收銀設定，?tab=cash 退回課程管理', async () => {
    granted.codes = new Set(['ACTIVITY_READ', 'ACTIVITY_WRITE'])
    mockRoute.query = { tab: 'cash' }
    const w = mountView()
    await flushPromises()
    expect(paneNames(w)).not.toContain('cash')
    expect(activeTab(w)).toBe('courses')
  })

  it('?tab=cash 直接開收銀設定，嵌入的區塊是 placement=activity（只有 POS 兩個門檻）', async () => {
    granted.codes = new Set(['ACTIVITY_READ', 'SETTINGS_READ'])
    mockRoute.query = { tab: 'cash' }
    const w = mountView()
    await flushPromises()
    expect(activeTab(w)).toBe('cash')
    const block = w.findComponent({ name: 'SettingsTenantConfigTab' })
    expect(block.exists()).toBe(true)
    expect(block.props('placement')).toBe('activity')
  })

  it('不是收銀設定頁籤時不掛載區塊（不先打 system_configs API）', async () => {
    granted.codes = new Set(['ACTIVITY_READ', 'SETTINGS_READ'])
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'SettingsTenantConfigTab' }).exists()).toBe(false)
  })
})
