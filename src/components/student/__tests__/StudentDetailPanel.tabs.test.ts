/**
 * 學生檔案頁籤整併（後台 IA 重整 S6，2026-10-29）：
 * - 一級頁籤：出席併入教務紀錄、「健康／成長檔案」攤平成「健康」「成長」兩個，頁籤內不再巢狀
 * - 舊 ?tab=／?sub=／?group= 書籤與站內連結全數對照到現行頁籤，網址改寫成現行 key
 * - 每個頁籤的權限 gate 照原樣（健康＝STUDENTS_HEALTH_READ，成長＝PORTFOLIO_READ…）
 * 對照表本身的凍結測試在 studentProfileTabs.test.ts；這裡測面板的接線。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const granted = vi.hoisted(() => ({ codes: new Set<string>() }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => granted.codes.has(code) }))
vi.mock('@/api/students', () => ({
  getStudent: vi.fn().mockResolvedValue({ data: {} }),
  getStudentProfile: vi.fn().mockResolvedValue({ data: { id: 1, basic: { name: '小明' } } }),
}))
vi.mock('@/utils/domainBus', () => ({
  domainBus: { on: vi.fn(), off: vi.fn() },
  STUDENT_EVENTS: { UPDATED: 'u', LIFECYCLE_CHANGED: 'l' },
  RECORD_EVENTS: { CREATED: 'c', UPDATED: 'u2', DELETED: 'd' },
}))

import StudentDetailPanel from '../StudentDetailPanel.vue'

const ALL = [
  'FEES_READ', 'ACTIVITY_READ', 'PORTFOLIO_READ', 'STUDENTS_HEALTH_READ', 'STUDENTS_SPECIAL_NEEDS_READ',
]

async function mountPanel(opts: {
  query?: Record<string, string>
  initialTab?: string
  mode?: 'page' | 'drawer'
  context?: string
}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/students/profile/:id', name: 'student', component: { template: '<div/>' } }],
  })
  await router.push({ path: '/students/profile/1', query: opts.query ?? {} })
  await router.isReady()
  const replaceSpy = vi.spyOn(router, 'replace')

  const wrapper = mount(StudentDetailPanel, {
    props: {
      studentId: 1,
      mode: opts.mode ?? 'page',
      context: opts.context ?? 'students',
      syncUrl: (opts.mode ?? 'page') === 'page',
      initialTab: opts.initialTab ?? opts.query?.tab ?? '',
    },
    global: {
      plugins: [router],
      directives: { loading: {} },
      stubs: {
        StudentSummaryHeader: true,
        StudentEditDialog: true,
        LifecycleTransitionDialog: true,
        StudentEnrollmentCertButton: true,
        OverviewTab: { name: 'OverviewTab', emits: ['goto-tab'], template: '<div class="overview" />' },
        BasicInfoTab: true,
        RecordsTab: { name: 'RecordsTab', props: ['sectionRequest'], template: '<div class="records" />' },
        FeesTab: true,
        ActivityTab: true,
        HealthTab: true,
        GrowthTab: { name: 'GrowthTab', props: ['sectionRequest'], template: '<div class="growth" />' },
        CommunicationTab: true,
        LifecycleTab: true,
        JourneyTimeline: true,
        StudentDisabilityDocsPanel: true,
        'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
        'el-tab-pane': { props: ['name', 'label'], template: '<div class="el-tab-pane" :data-name="name"><slot /></div>' },
        'el-collapse': true,
        'el-collapse-item': true,
        'el-icon': true,
        'el-button': true,
        'el-empty': true,
      },
    },
  })
  await flushPromises()
  const state = () => wrapper.vm.$.setupState as unknown as { activeTab: string }
  return { wrapper, router, replaceSpy, activeTab: () => state().activeTab }
}

const paneNames = (w: Awaited<ReturnType<typeof mountPanel>>['wrapper']) =>
  w.findAll('.el-tab-pane').map((p) => p.attributes('data-name'))
const lastQuery = (r: Awaited<ReturnType<typeof mountPanel>>['router']) => r.currentRoute.value.query

describe('StudentDetailPanel 一級頁籤', () => {
  beforeEach(() => {
    granted.codes = new Set(ALL)
  })

  it('全權限：10 個一級頁籤，沒有獨立的「出席紀錄」，也沒有合併的「健康／成長檔案」', async () => {
    const { wrapper } = await mountPanel({ query: { tab: 'basic' } })
    expect(paneNames(wrapper)).toEqual([
      'overview', 'basic', 'records', 'fees', 'activity', 'health', 'growth',
      'disability_docs', 'lifecycle', 'communication',
    ])
  })

  it('權限 gate 照原樣：健康＝STUDENTS_HEALTH_READ、成長＝PORTFOLIO_READ、學費／才藝／鑑定文件各自的碼', async () => {
    granted.codes = new Set()
    const none = await mountPanel({ query: { tab: 'basic' } })
    expect(paneNames(none.wrapper)).toEqual(['overview', 'basic', 'records', 'lifecycle', 'communication'])

    granted.codes = new Set(['STUDENTS_HEALTH_READ'])
    const healthOnly = await mountPanel({ query: { tab: 'basic' } })
    expect(paneNames(healthOnly.wrapper)).toContain('health')
    expect(paneNames(healthOnly.wrapper)).not.toContain('growth')

    granted.codes = new Set(['PORTFOLIO_READ'])
    const portfolioOnly = await mountPanel({ query: { tab: 'basic' } })
    expect(paneNames(portfolioOnly.wrapper)).toContain('growth')
    expect(paneNames(portfolioOnly.wrapper)).not.toContain('health')
  })

  it('預設頁籤不變：page＝基本資料、classroom 抽屜＝總覽', async () => {
    expect((await mountPanel({})).activeTab()).toBe('basic')
    expect((await mountPanel({ mode: 'drawer', context: 'classroom' })).activeTab()).toBe('overview')
  })
})

describe('舊 ?tab= 書籤 → 現行頁籤（網址同步改寫）', () => {
  beforeEach(() => {
    granted.codes = new Set(ALL)
  })

  it.each([
    ['timeline', 'timeline'],
    ['photo_gallery', 'photo_gallery'],
    ['growth_report', 'growth_report'],
    ['milestones', 'milestones'],
  ])('?tab=%s → 成長頁籤，?sub=%s，沒有殘留 group', async (legacy, sub) => {
    const { router, activeTab, wrapper } = await mountPanel({ query: { tab: legacy } })
    expect(activeTab()).toBe('growth')
    expect(lastQuery(router)).toEqual({ tab: 'growth', sub })
    expect(wrapper.getComponent({ name: 'GrowthTab' }).props('sectionRequest')).toMatchObject({ section: sub })
  })

  it('?tab=health_growth_profile&group=growth&sub=timeline（合併後的舊網址）→ 成長 › 時間軸，group 拿掉', async () => {
    const { router, activeTab } = await mountPanel({
      query: { tab: 'health_growth_profile', group: 'growth', sub: 'timeline', from: 'roster' },
    })
    expect(activeTab()).toBe('growth')
    expect(lastQuery(router)).toEqual({ tab: 'growth', sub: 'timeline', from: 'roster' })
  })

  it.each([
    [{ tab: 'health_growth_profile' }, 'health'],
    [{ tab: 'health_growth_profile', group: 'health' }, 'health'],
    [{ tab: 'health_growth' }, 'health'],
    [{ tab: 'growth_profile' }, 'growth'],
    [{ tab: 'guardians' }, 'basic'],
  ])('%j → %s，網址改寫成現行 key 且不帶 sub', async (query, expected) => {
    const { router, activeTab } = await mountPanel({ query })
    expect(activeTab()).toBe(expected)
    expect(lastQuery(router)).toEqual({ tab: expected })
  })

  it('?tab=attendance（出席／請假／評量頁的「看他檔案」連結）→ 教務紀錄 › 出席', async () => {
    const { router, activeTab, wrapper } = await mountPanel({ query: { tab: 'attendance' } })
    expect(activeTab()).toBe('records')
    expect(lastQuery(router)).toEqual({ tab: 'records', sub: 'attendance' })
    expect(wrapper.getComponent({ name: 'RecordsTab' }).props('sectionRequest')).toMatchObject({ section: 'attendance' })
  })

  it('現行 key 帶 ?sub=（站內連結 tab=records&sub=attendance）：不改寫網址，仍請求該區塊', async () => {
    const { router, activeTab, replaceSpy, wrapper } = await mountPanel({ query: { tab: 'records', sub: 'attendance' } })
    expect(activeTab()).toBe('records')
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(lastQuery(router)).toEqual({ tab: 'records', sub: 'attendance' })
    expect(wrapper.getComponent({ name: 'RecordsTab' }).props('sectionRequest')).toMatchObject({ section: 'attendance' })
  })

  it('非舊 key、無 sub：網址原封不動（不多寫 replace）', async () => {
    const { router, replaceSpy, activeTab } = await mountPanel({ query: { tab: 'basic' } })
    expect(activeTab()).toBe('basic')
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(lastQuery(router)).toEqual({ tab: 'basic' })
  })

  it('抽屜（syncUrl=false）完全不碰網址，但舊 key 照樣對得到頁籤', async () => {
    const { router, activeTab, replaceSpy } = await mountPanel({ mode: 'drawer', context: 'classroom', initialTab: 'attendance' })
    expect(activeTab()).toBe('records')
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(lastQuery(router)).toEqual({})
  })
})

describe('舊 key 遇到權限：依候選順序退，最後退回總覽', () => {
  it('只有 PORTFOLIO_READ：health_growth_profile → 退到成長', async () => {
    granted.codes = new Set(['PORTFOLIO_READ'])
    const { activeTab, router } = await mountPanel({ query: { tab: 'health_growth_profile' } })
    expect(activeTab()).toBe('growth')
    expect(lastQuery(router).tab).toBe('growth')
  })

  it('只有 STUDENTS_HEALTH_READ：?group=growth 的書籤 → 退到健康（不會空白）', async () => {
    granted.codes = new Set(['STUDENTS_HEALTH_READ'])
    const { activeTab } = await mountPanel({ query: { tab: 'health_growth_profile', group: 'growth', sub: 'timeline' } })
    expect(activeTab()).toBe('health')
  })

  it('兩個碼都沒有：退回總覽；沒有 FEES_READ 連到 fees 同樣退回總覽', async () => {
    granted.codes = new Set()
    expect((await mountPanel({ query: { tab: 'health_growth_profile' } })).activeTab()).toBe('overview')
    expect((await mountPanel({ query: { tab: 'fees' } })).activeTab()).toBe('overview')
  })
})

describe('總覽卡片 goto-tab', () => {
  beforeEach(() => {
    granted.codes = new Set(ALL)
  })

  it('attendance → 教務紀錄並請求出席區塊；guardians → 基本資料；fees → 學費', async () => {
    const { wrapper, activeTab } = await mountPanel({ mode: 'drawer', context: 'classroom' })
    const overview = wrapper.getComponent({ name: 'OverviewTab' })

    overview.vm.$emit('goto-tab', 'attendance')
    await flushPromises()
    expect(activeTab()).toBe('records')
    expect(wrapper.getComponent({ name: 'RecordsTab' }).props('sectionRequest')).toMatchObject({ section: 'attendance' })

    overview.vm.$emit('goto-tab', 'guardians')
    await flushPromises()
    expect(activeTab()).toBe('basic')

    overview.vm.$emit('goto-tab', 'fees')
    await flushPromises()
    expect(activeTab()).toBe('fees')
  })

  it('同一區塊重複請求會換新的 nonce（使用者在教務紀錄內改看別的區塊後，再點出席卡片仍要切回去）', async () => {
    const { wrapper } = await mountPanel({ mode: 'drawer', context: 'classroom' })
    const overview = wrapper.getComponent({ name: 'OverviewTab' })
    overview.vm.$emit('goto-tab', 'attendance')
    await flushPromises()
    const a = wrapper.getComponent({ name: 'RecordsTab' }).props('sectionRequest') as { nonce: number }
    overview.vm.$emit('goto-tab', 'attendance')
    await flushPromises()
    const b = wrapper.getComponent({ name: 'RecordsTab' }).props('sectionRequest') as { nonce: number }
    expect(b.nonce).toBeGreaterThan(a.nonce)
  })
})

describe('使用者切頁籤時的網址同步', () => {
  beforeEach(() => {
    granted.codes = new Set(ALL)
  })

  it('從成長（?sub=timeline）切到教務紀錄：寫 tab、拿掉不屬於新頁籤的 sub', async () => {
    const { wrapper, router } = await mountPanel({ query: { tab: 'growth', sub: 'timeline' } })
    ;(wrapper.vm.$.setupState as unknown as { activeTab: string }).activeTab = 'records'
    await flushPromises()
    expect(lastQuery(router)).toEqual({ tab: 'records' })
  })

  it('切到同樣擁有該 sub 的頁籤時保留 sub（records ?sub=attendance 不被誤刪）', async () => {
    const { wrapper, router } = await mountPanel({ query: { tab: 'basic', sub: 'attendance' } })
    ;(wrapper.vm.$.setupState as unknown as { activeTab: string }).activeTab = 'records'
    await flushPromises()
    expect(lastQuery(router)).toEqual({ tab: 'records', sub: 'attendance' })
  })
})
