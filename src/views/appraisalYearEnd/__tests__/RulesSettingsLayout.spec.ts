import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import RulesSettingsLayout from '../RulesSettingsLayout.vue'

const hasPermissionMock = vi.hoisted(() => vi.fn((_: string) => true))
vi.mock('@/utils/auth', () => ({ hasPermission: (p: string) => hasPermissionMock(p) }))

const ScoringStub = { template: '<div class="stub-scoring" />' }
const BonusStub = { template: '<div class="stub-bonus" />' }
const CatalogStub = { template: '<div class="stub-catalog" />' }
const EnrollmentStub = { template: '<div class="stub-enrollment" />' }
const YearEndRulesStub = { template: '<div class="stub-year-end-rules" />' }

const stubs = {
  ElTabs: {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tab-change'],
    template: '<div class="stub-tabs"><slot /></div>',
  },
  ElTabPane: { name: 'ElTabPane', props: ['label', 'name'], template: '<div><slot /></div>' },
}

// 同 AppraisalManagementView.spec.ts 的既知現象：RulesSettingsLayout 自身即為路由 component，
// 內含 <router-view />；直接 mount 會讓內部 <router-view> 因缺 depth context 重複渲染自己。
// 改用只含 <router-view /> 的 RootWrapper 掛載取得正確 depth。
const RootWrapper = { template: '<router-view />' }

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/appraisal-year-end/rules',
      component: RulesSettingsLayout,
      children: [
        { path: 'scoring', component: ScoringStub },
        { path: 'bonus-rates', component: BonusStub },
        { path: 'catalog', component: CatalogStub },
        { path: 'enrollment-targets', component: EnrollmentStub },
        { path: 'year-end-rules', component: YearEndRulesStub },
      ],
    }],
  })
}

async function mountAt(path: string) {
  const router = buildRouter()
  await router.push(path)
  await router.isReady()
  const w = mount(RootWrapper, { global: { plugins: [router], stubs } })
  await flushPromises()
  return { w, router }
}

describe('RulesSettingsLayout', () => {
  beforeEach(() => {
    hasPermissionMock.mockReset()
    hasPermissionMock.mockReturnValue(true)
  })

  it('持 APPRAISAL_READ + SETTINGS_READ → 5 個分頁全顯示', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules/scoring')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual([
      'scoring', 'bonus-rates', 'catalog', 'enrollment-targets', 'year-end-rules',
    ])
  })

  it('path=.../year-end-rules 渲染年終規則子頁且 tabs active=year-end-rules', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    expect(w.find('.stub-year-end-rules').exists()).toBe(true)
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('year-end-rules')
  })

  it('tab-change 觸發 router.push 到對應子路由', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'catalog')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/rules/catalog')
  })

  it('tab-change 傳入目前 tab 名稱時不重覆 push', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'scoring')
    await flushPromises()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('只有 SETTINGS_READ（無 APPRAISAL_READ）→ 只顯示年終規則分頁', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual(['year-end-rules'])
  })

  // Task 4 審查裁決 #2：activeTab fallback 不可寫死 'scoring'（該頁需 APPRAISAL_READ），
  // 只持 SETTINGS_READ 時若因故落在此 fallback 分支，須落在使用者實際看得到的第一個分頁。
  it('只有 SETTINGS_READ 時 activeTab fallback 落在 year-end-rules（非寫死 scoring）', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
    // 掛在無 leaf segment 的 bare 'rules' 路徑，模擬 route.path.split('/')[3] 為 undefined 的情境
    const { w } = await mountAt('/appraisal-year-end/rules')
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('year-end-rules')
  })
})
