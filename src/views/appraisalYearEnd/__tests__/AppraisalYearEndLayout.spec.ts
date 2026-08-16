import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import AppraisalYearEndLayout from '../AppraisalYearEndLayout.vue'

const permState = { read: true, settings: false, finalize: false, yearEnd: true }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(
    (p: string) =>
      (p === 'APPRAISAL_READ' && permState.read) ||
      (p === 'SETTINGS_READ' && permState.settings) ||
      (p === 'APPRAISAL_FINALIZE' && permState.finalize) ||
      (p === 'YEAR_END_READ' && permState.yearEnd),
  ),
}))

const Stub = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{
    path: '/appraisal-year-end', component: AppraisalYearEndLayout, redirect: '/appraisal-year-end/todo',
    children: [
      { path: 'todo', component: Stub, meta: { title: '待辦' } },
      { path: 'appraisal/current', component: Stub, meta: { title: '考核', breadcrumb: ['考核', '當期總覽'] } },
      { path: 'year-end', component: Stub, meta: { title: '年終' } },
      { path: 'year-end/cycles/:id', component: Stub, meta: { title: '年終 › 結算工作區' } },
      { path: 'year-end/payout', component: Stub, meta: { title: '考核年終發放' } },
      { path: 'rules', component: Stub, meta: { title: '規則設定' } },
      { path: 'exceptions', component: Stub, meta: { title: '待補資料與例外' } },
    ],
  }],
})

describe('AppraisalYearEndLayout — 三段 + 齒輪（V2 IA）', () => {
  beforeEach(async () => {
    permState.read = true
    permState.settings = false
    permState.finalize = false
    await router.push('/appraisal-year-end/appraisal/current')
    await router.isReady()
  })

  it('只顯示三段：待辦／考核／年終，不再有「發放」「規則設定」「例外中心」段', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const options = w.findComponent({ name: 'ElSegmented' }).props('options') as Array<{ label: string; value: string }>
    expect(options.map((o) => o.value)).toEqual(['todo', 'appraisal', 'year-end'])
    expect(options.map((o) => o.label)).toEqual(['待辦', '考核', '年終'])
  })

  it('麵包屑顯示 目前 section 路徑', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.find('.aye-breadcrumb').text()).toContain('當期總覽')
  })

  it('麵包屑 fallback：路由只有 meta.title（無 meta.breadcrumb）時顯示該 title', async () => {
    await router.push('/appraisal-year-end/year-end')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    const segments = w.find('.aye-breadcrumb').findAll('.el-breadcrumb__inner').map((n) => n.text())
    expect(segments).toEqual(['考核與年終', '年終'])
  })
})

describe('AppraisalYearEndLayout — 齒輪（規則設定）入口', () => {
  beforeEach(async () => {
    permState.read = true; permState.settings = false; permState.finalize = false
    await router.push('/appraisal-year-end/appraisal/current')
    await router.isReady()
  })

  it('有 APPRAISAL_READ 權限時齒輪顯示，帶 aria-label', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const gear = w.find('.aye-gear')
    expect(gear.exists()).toBe(true)
    expect(gear.attributes('aria-label')).toBe('規則與進階設定')
  })

  it('點擊齒輪導向 /appraisal-year-end/rules', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await w.find('.aye-gear').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules')
  })

  it('無 APPRAISAL_READ 且無 SETTINGS_READ 時齒輪不顯示', () => {
    permState.read = false
    permState.settings = false
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    expect(w.find('.aye-gear').exists()).toBe(false)
  })

  it('只有 SETTINGS_READ（無 APPRAISAL_READ）時齒輪仍顯示', () => {
    permState.read = false
    permState.settings = true
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    expect(w.find('.aye-gear').exists()).toBe(true)
  })
})

describe('AppraisalYearEndLayout — activeKey 折算（payout/rules/exceptions 不獨立佔段）', () => {
  beforeEach(() => { permState.read = true; permState.settings = false; permState.finalize = true })

  it('停在 payout 路由時 segmented 高亮「年終」（發放已併入年終網域）', async () => {
    await router.push('/appraisal-year-end/year-end/payout')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('year-end')
  })

  it('年終週期工作區路由（/year-end/cycles/:id）activeKey 落在「年終」', async () => {
    await router.push('/appraisal-year-end/year-end/cycles/7')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('year-end')
  })

  it('停在規則設定路由時 segmented 不高亮任何段', async () => {
    await router.push('/appraisal-year-end/rules')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('')
  })

  it('停在例外中心路由時 segmented 不高亮任何段', async () => {
    await router.push('/appraisal-year-end/exceptions')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe('')
  })
})
