/**
 * 報名管理入口（後台 IA 重整 M4）：「報名」「異動紀錄」兩頁籤合一，?tab= 與網址同步。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

const replaceMock = vi.fn()
const route = reactive<{ query: Record<string, string> }>({ query: {} })

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: replaceMock }),
}))
const hasPermissionMock = vi.fn((_code: string) => true)
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => hasPermissionMock(code) }))

// 兩個子頁各自有完整測試；這裡只驗 hub 的殼
vi.mock('@/views/activity/ActivityRegistrationView.vue', () => ({
  default: {
    name: 'ActivityRegistrationView',
    props: { embedded: Boolean },
    template: '<div data-test="registrations" :data-embedded="String(embedded)" />',
  },
}))
vi.mock('@/views/activity/ActivityChangesView.vue', () => ({
  default: {
    name: 'ActivityChangesView',
    props: { embedded: Boolean },
    template: '<div data-test="changes" :data-embedded="String(embedded)" />',
  },
}))

import ActivityRegistrationHubView from '../ActivityRegistrationHubView.vue'

const stubs = {
  PageHeader: { props: ['title'], template: '<h2 data-test="page-title">{{ title }}</h2>' },
  'el-tabs': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div data-test="tabs" :data-active="modelValue"><slot /></div>',
  },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<i data-test="pane" :data-name="name" :data-label="label" />',
  },
}

const mountHub = () => mount(ActivityRegistrationHubView, { global: { stubs } })
const vmOf = (w: ReturnType<typeof mountHub>) => w.vm as unknown as { activeTab: string }

describe('ActivityRegistrationHubView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    hasPermissionMock.mockReturnValue(true)
  })

  it('預設落在「報名」頁籤：頁名報名管理、兩個頁籤、只掛報名頁（embedded）', () => {
    const w = mountHub()
    expect(w.find('[data-test="page-title"]').text()).toBe('報名管理')
    expect(w.findAll('[data-test="pane"]').map((p) => p.attributes('data-label'))).toEqual(['報名', '異動紀錄'])
    expect(w.find('[data-test="registrations"]').attributes('data-embedded')).toBe('true')
    expect(w.find('[data-test="changes"]').exists()).toBe(false)
  })

  it('?tab=changes（含 /activity/changes 舊網址 redirect 落點）直接開「異動紀錄」', () => {
    route.query = { tab: 'changes' }
    const w = mountHub()
    expect(w.find('[data-test="tabs"]').attributes('data-active')).toBe('changes')
    expect(w.find('[data-test="changes"]').attributes('data-embedded')).toBe('true')
    expect(w.find('[data-test="registrations"]').exists()).toBe(false)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('?tab= 無效值 fallback 到「報名」', () => {
    route.query = { tab: 'nope' }
    const w = mountHub()
    expect(vmOf(w).activeTab).toBe('registrations')
  })

  it('切到「異動紀錄」回寫 tab=changes 並保留報名篩選 query；切回預設則移除 tab', async () => {
    route.query = { payment_status: 'unpaid' }
    const w = mountHub()
    vmOf(w).activeTab = 'changes'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { payment_status: 'unpaid', tab: 'changes' } })

    route.query = { payment_status: 'unpaid', tab: 'changes' } // 模擬 router.replace 已生效
    await flushPromises()
    vmOf(w).activeTab = 'registrations'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { payment_status: 'unpaid' } })
  })

  it('異動頁點學生姓名（push ?open=<id>、無 tab）→ 回到報名頁籤並重新掛載報名頁', async () => {
    route.query = { tab: 'changes' }
    const w = mountHub()
    expect(w.find('[data-test="registrations"]').exists()).toBe(false)
    route.query = { open: '42' }
    await nextTick()
    await flushPromises()
    expect(vmOf(w).activeTab).toBe('registrations')
    expect(w.find('[data-test="registrations"]').exists()).toBe(true)
  })
})
