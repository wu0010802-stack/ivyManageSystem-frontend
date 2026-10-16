import { describe, it, expect } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAdmissionsTermFilter } from '../useAdmissionsTermFilter'

describe('招生工作位置', () => {
  it('頁籤與學期同時改動保留其他 query，返回時還原位置', async () => {
    let state!: ReturnType<typeof useAdmissionsTermFilter>
    const Page = defineComponent({ setup() { state = useAdmissionsTermFilter(); return () => null } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/students/admissions', component: Page }] })
    await router.push('/students/admissions?tab=intake&sy=115&sem=1&keyword=test')
    const wrapper = mount(Page, { global: { plugins: [router] } })
    expect(state.activeTab?.value).toBe('intake')
    state.activeTab.value = 'records'
    state.semester.value = 2
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'records', sy: '115', sem: '2', keyword: 'test' })
    await router.push('/students/admissions?tab=stats&sy=114&sem=1')
    await flushPromises()
    expect(state.activeTab.value).toBe('stats')
    expect(state.schoolYear.value).toBe(114)
    router.back()
    await flushPromises()
    expect(state.activeTab.value).toBe('records')
    expect(state.semester.value).toBe(2)
    wrapper.unmount()
  })
})
