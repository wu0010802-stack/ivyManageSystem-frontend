import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import ElementPlus, { ElMessageBox } from 'element-plus'

const hasPermissionMock = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}))

vi.mock('@/api/surveys', () => ({
  getSurvey: vi.fn(),
  createSurvey: vi.fn(),
  updateSurvey: vi.fn(),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: [] }),
}))

import SurveyFormView from '../SurveyFormView.vue'

const SurveyList = defineComponent({ template: '<div>survey list</div>' })
const RouterHost = defineComponent({ setup: () => () => h(RouterView) })

describe('SurveyFormView SPA route-leave 草稿保護', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockImplementation((permission: string) => permission === 'SURVEYS_WRITE')
  })

  it('新增調查已編輯時，memory history 離開取消後應留在表單', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/surveys/new', component: SurveyFormView },
        { path: '/surveys', name: 'surveys', component: SurveyList },
      ],
    })
    await router.push('/surveys/new')
    await router.isReady()
    const wrapper = mount(RouterHost, {
      global: { plugins: [router, ElementPlus] },
    })
    await flushPromises()

    const view = wrapper.findComponent(SurveyFormView)
    const vm = view.vm as unknown as { draft: { title: string } }
    vm.draft.title = '尚未儲存的親子活動調查'
    await view.vm.$nextTick()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')

    await router.push('/surveys')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/surveys/new')
    wrapper.unmount()
    confirmSpy.mockRestore()
  })
})
