import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppraisalManagementView from '../AppraisalManagementView.vue'

const CurrentStub = { template: '<div class="stub-current" />' }
const HistoryStub = { template: '<div class="stub-history" />' }
const InstitutionEventsStub = { template: '<div class="stub-institution-events" />' }
const DisciplinaryStub = { template: '<div class="stub-disciplinary" />' }

const stubs = {
  ElTabs: {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tab-change'],
    template: '<div class="stub-tabs"><slot /></div>',
  },
  ElTabPane: { name: 'ElTabPane', props: ['label', 'name'], template: '<div><slot /></div>' },
}

// AppraisalManagementView 自身即為路由 component（掛在 /appraisal-year-end/appraisal），
// 內含 <router-view />；若直接 mount(AppraisalManagementView) 而不透過外層 <router-view>，
// 其內部 <router-view /> 因缺少 depth context 會把自己（matched[0]）當成子頁重新渲染一次
// （el-tabs 區塊會重複兩份）。改用只含 <router-view /> 的 RootWrapper 掛載以取得正確 depth。
const RootWrapper = { template: '<router-view />' }

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/appraisal-year-end/appraisal',
      component: AppraisalManagementView,
      redirect: '/appraisal-year-end/appraisal/current',
      children: [
        { path: 'current', component: CurrentStub },
        { path: 'history', component: HistoryStub },
        { path: 'institution-events', component: InstitutionEventsStub },
        { path: 'disciplinary', component: DisciplinaryStub },
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

describe('AppraisalManagementView tabs（路由驅動，不再自管 query）', () => {
  it('path=.../history 渲染歷史週期子頁（內嵌明細改由子路由自管）且 tabs active=history', async () => {
    const { w } = await mountAt('/appraisal-year-end/appraisal/history')
    expect(w.find('.stub-history').exists()).toBe(true)
    expect(w.find('.stub-current').exists()).toBe(false)
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('history')
  })

  it('path=.../institution-events 渲染活動出席子頁', async () => {
    const { w } = await mountAt('/appraisal-year-end/appraisal/institution-events')
    expect(w.find('.stub-institution-events').exists()).toBe(true)
    expect(w.find('.stub-current').exists()).toBe(false)
  })

  it('path=.../current（預設）渲染當期總覽子頁', async () => {
    const { w } = await mountAt('/appraisal-year-end/appraisal/current')
    expect(w.find('.stub-current').exists()).toBe(true)
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('current')
  })

  it('tab-change 觸發 router.push 到對應子路由（取代原本 query replace）', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/appraisal/history')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'disciplinary')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/appraisal/disciplinary')
  })

  it('tab-change 傳入目前 tab 名稱時不重覆 push', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/appraisal/current')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'current')
    await flushPromises()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('不再出現「考核設定」tab（已移至 /rules/*，由 Task 5 掛載）', async () => {
    const { w } = await mountAt('/appraisal-year-end/appraisal/current')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    const labels = panes.map((p) => p.props('label'))
    expect(labels).toEqual(['當期總覽', '歷史週期與簽核', '活動出席', '懲處記錄', '等第校準'])
  })
})
