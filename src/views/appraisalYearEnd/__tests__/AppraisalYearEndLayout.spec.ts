import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import AppraisalYearEndLayout from '../AppraisalYearEndLayout.vue'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn((p: string) => p === 'APPRAISAL_READ') }))

const Stub = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{
    path: '/appraisal-year-end', component: AppraisalYearEndLayout, redirect: '/appraisal-year-end/overview',
    children: [
      { path: 'overview', component: Stub, meta: { title: '總覽' } },
      { path: 'appraisal/current', component: Stub, meta: { title: '考核', breadcrumb: ['考核', '當期總覽'] } },
      // 無 meta.breadcrumb、只有 meta.title 的路由（fallback 分支）
      { path: 'year-end', component: Stub, meta: { title: '年終' } },
    ],
  }],
})

describe('AppraisalYearEndLayout', () => {
  beforeEach(async () => { await router.push('/appraisal-year-end/appraisal/current'); await router.isReady() })
  it('只顯示有權限的導覽項（APPRAISAL_READ → 總覽+考核+例外中心）', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [ElementPlus, router] } })
    const text = w.text()
    expect(text).toContain('考核')
    expect(text).not.toContain('年終獎金率') // 規則設定內頁不出現在頂層
    expect(w.findAll('.aye-nav [role="radio"], .aye-nav .el-segmented__item').length).toBeGreaterThan(0)
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
    // 用 .el-breadcrumb__inner 逐段比對，避免「考核與年終」子字串巧合覆蓋掉 fallback 判斷。
    // 只在第一個 .aye-breadcrumb 內找（直接 mount 時內部 <router-view> 因缺少 depth
    // context 會把自己重新渲染一次，與 AppraisalManagementView.spec.ts 的既知現象相同）。
    const segments = w.find('.aye-breadcrumb').findAll('.el-breadcrumb__inner').map((n) => n.text())
    expect(segments).toEqual(['考核與年終', '年終'])
  })
})
