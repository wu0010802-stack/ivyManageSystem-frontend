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
      { path: 'year-end/cycles/:id', component: Stub, meta: { title: '結算工作區' } },
      { path: 'year-end/payout', component: Stub, meta: { title: '考核年終發放' } },
      { path: 'rules', component: Stub, meta: { title: '規則設定' } },
      { path: 'rules/scoring', component: Stub, meta: { title: '考核計分規則' } },
      { path: 'rules/bonus-rates', component: Stub, meta: { title: '年終獎金率' } },
      { path: 'rules/year-end-rules', component: Stub, meta: { title: '年終規則' } },
      { path: 'rules/festival-headcount', component: Stub, meta: { title: '節慶人數' } },
      { path: 'exceptions', component: Stub, meta: { title: '待補資料與例外' } },
    ],
  }],
})

describe('AppraisalYearEndLayout — 待辦／待補資料兩段 + 齒輪（S1：考核／年終改由側欄切換）', () => {
  beforeEach(async () => {
    permState.read = true
    permState.settings = false
    permState.finalize = false
    permState.yearEnd = true
    await router.push('/appraisal-year-end/appraisal/current')
    await router.isReady()
  })

  it('只顯示兩段：待辦／待補資料；考核、年終不再是頂列段（側欄已分成兩個選單項）', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const options = w.findComponent({ name: 'ElSegmented' }).props('options') as Array<{ label: string; value: string }>
    expect(options.map((o) => o.value)).toEqual(['todo', 'exceptions'])
    expect(options.map((o) => o.label)).toEqual(['待辦', '待補資料'])
  })
  it('待補資料需 APPRAISAL_READ 或 YEAR_END_READ（同 exceptions 路由規則）', () => {
    permState.read = false
    permState.yearEnd = false
    permState.settings = true
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const options = w.findComponent({ name: 'ElSegmented' }).props('options') as Array<{ value: string }>
    // 只持 SETTINGS_READ：待辦可進（5 碼 OR），待補資料不可
    expect(options.map((o) => o.value)).toEqual(['todo'])
  })
  it('點「待補資料」導向 /appraisal-year-end/exceptions', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'exceptions')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/exceptions')
  })
  it('頁內不再渲染麵包屑（層級由頂列麵包屑與側欄表達）', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.find('.aye-breadcrumb').exists()).toBe(false)
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

describe('AppraisalYearEndLayout — activeKey（只有待辦、待補資料會高亮）', () => {
  beforeEach(() => { permState.read = true; permState.settings = false; permState.finalize = true; permState.yearEnd = true })

  it.each([
    ['/appraisal-year-end/todo', 'todo'],
    ['/appraisal-year-end/exceptions', 'exceptions'],
    // 考核／年終／發放／規則頁都不佔段
    ['/appraisal-year-end/appraisal/current', ''],
    ['/appraisal-year-end/year-end', ''],
    ['/appraisal-year-end/year-end/payout', ''],
    ['/appraisal-year-end/year-end/cycles/7', ''],
    ['/appraisal-year-end/rules', ''],
  ])('停在 %s → segmented modelValue=%j', async (path, expected) => {
    await router.push(path)
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.findComponent({ name: 'ElSegmented' }).props('modelValue')).toBe(expected)
  })
})

describe('AppraisalYearEndLayout — 齒輪依所在邊帶到該邊第一個可見規則頁籤', () => {
  beforeEach(() => { permState.read = true; permState.settings = true; permState.finalize = false; permState.yearEnd = true })

  it('年終側（/year-end）→ 年終側第一個可見頁籤（bonus-rates）', async () => {
    await router.push('/appraisal-year-end/year-end')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await w.find('.aye-gear').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules/bonus-rates')
  })

  it('年終側規則頁籤上同樣帶回年終側（只持 SETTINGS_READ → year-end-rules）', async () => {
    permState.read = false
    await router.push('/appraisal-year-end/rules/year-end-rules')
    await router.isReady()
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    await w.find('.aye-gear').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules/year-end-rules')
  })

  it('考核側與待辦 → /rules（由路由 redirect 依權限落點）', async () => {
    for (const from of ['/appraisal-year-end/appraisal/current', '/appraisal-year-end/todo']) {
      await router.push(from)
      await router.isReady()
      const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
      await w.find('.aye-gear').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/appraisal-year-end/rules')
    }
  })
})
