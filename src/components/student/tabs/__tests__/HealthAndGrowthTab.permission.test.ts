import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

/**
 * 需求 2（2026-09-09）：健康／成長檔案合併後，「成長類」分組必須沿用原
 * growth_profile 一級 tab 的顯示條件（PORTFOLIO_READ），否則只有
 * STUDENTS_HEALTH_READ 的使用者會看到一個他們原本完全看不到的分組
 * （前端可見性回退，見 ultra review 2026-09-09 finding #1）。
 */

const hasPermissionMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/auth', () => ({ hasPermission: hasPermissionMock }))

import HealthAndGrowthTab from '../HealthAndGrowthTab.vue'

async function mountWithQuery(initialQuery: Record<string, string>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/students/profile/:id', name: 'student', component: { template: '<div/>' } }],
  })
  await router.push({ path: '/students/profile/1', query: initialQuery })
  await router.isReady()

  const wrapper = mount(HealthAndGrowthTab, {
    props: { studentId: 1, syncUrl: true, initialGroup: 'growth' },
    global: {
      plugins: [router],
      stubs: {
        HealthGrowthTab: true,
        GrowthProfileTab: true,
        'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>' },
        'el-radio-button': { template: '<button class="el-radio-button"><slot /></button>', props: ['value'] },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('HealthAndGrowthTab 權限收斂', () => {
  it('無 PORTFOLIO_READ 時不顯示「成長類」按鈕，即使 initialGroup=growth', async () => {
    hasPermissionMock.mockImplementation((code: string) => code !== 'PORTFOLIO_READ')
    const { wrapper } = await mountWithQuery({})
    const buttons = wrapper.findAll('.el-radio-button')
    const labels = buttons.map((b) => b.text())
    expect(labels.some((l) => l.includes('成長類'))).toBe(false)
  })

  it('無 PORTFOLIO_READ 時 ?group=growth 書籤也不會把使用者帶進成長類（只掛載 HealthGrowthTab）', async () => {
    hasPermissionMock.mockImplementation((code: string) => code !== 'PORTFOLIO_READ')
    const { wrapper } = await mountWithQuery({ group: 'growth' })
    expect(wrapper.findComponent({ name: 'GrowthProfileTab' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'HealthGrowthTab' }).exists()).toBe(true)
  })

  it('有 PORTFOLIO_READ 時「成長類」按鈕正常顯示且可掛載', async () => {
    hasPermissionMock.mockReturnValue(true)
    const { wrapper } = await mountWithQuery({ group: 'growth' })
    const buttons = wrapper.findAll('.el-radio-button')
    const labels = buttons.map((b) => b.text())
    expect(labels.some((l) => l.includes('成長類'))).toBe(true)
  })
})
