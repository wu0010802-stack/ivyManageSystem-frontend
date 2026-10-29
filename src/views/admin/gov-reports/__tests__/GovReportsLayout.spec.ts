/**
 * 政府申報頁籤殼（GovReportsLayout，後台 IA 重整 批次 2，2026-10-29）。
 * 每個頁籤依該頁 gate 用 v-if；可見頁籤不足兩個時整列隱藏；點頁籤＝導到該頁網址。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'

import GovReportsLayout from '../GovReportsLayout.vue'
import { setUserInfo } from '@/utils/auth'

const stub = (name: string) => ({ template: `<div data-testid="page-${name}">${name}</div>` })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/gov-reports',
        component: GovReportsLayout,
        redirect: '/admin/gov-reports/monthly',
        children: [
          { path: 'monthly', component: stub('monthly') },
          { path: 'certificates', component: stub('certificates') },
          { path: 'subsidies', component: stub('subsidies') },
          { path: 'iep', component: stub('iep') },
          { path: '/gov-reports', component: stub('export') },
        ],
      },
    ],
  })
}

async function mountAt(path: string, perms: string[]) {
  setUserInfo({ role: 'admin', permission_names: perms })
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [ElementPlus, router] } },
  )
  await flushPromises()
  return { wrapper, router }
}

const tabLabels = (w: Awaited<ReturnType<typeof mountAt>>['wrapper']) =>
  w.findAll('.el-tabs__item').map((n) => n.text())

describe('GovReportsLayout 頁籤依各頁 gate 顯示', () => {
  beforeEach(() => setUserInfo(null))

  it('GOV_REPORTS_VIEW＋GOV_REPORTS_EXPORT：五個頁籤，順序固定', async () => {
    const { wrapper } = await mountAt('/admin/gov-reports/monthly', [
      'GOV_REPORTS_VIEW',
      'GOV_REPORTS_EXPORT',
    ])
    expect(tabLabels(wrapper)).toEqual([
      '月度幼生在園統計',
      '在學證明開立紀錄',
      '特教加給與鐘點費',
      'IEP 個別化教育計畫',
      '勞健保與稅務申報',
    ])
    expect(wrapper.find('[data-testid="page-monthly"]').exists()).toBe(true)
  })

  it('只有 GOV_REPORTS_VIEW（例如主管）：只有教育部四頁，看不到勞健保與稅務申報', async () => {
    const { wrapper } = await mountAt('/admin/gov-reports/monthly', ['GOV_REPORTS_VIEW'])
    expect(tabLabels(wrapper)).toEqual([
      '月度幼生在園統計',
      '在學證明開立紀錄',
      '特教加給與鐘點費',
      'IEP 個別化教育計畫',
    ])
  })

  it('只有 GOV_REPORTS_EXPORT：只剩一頁，整列隱藏但頁面內容照常渲染', async () => {
    const { wrapper } = await mountAt('/gov-reports', ['GOV_REPORTS_EXPORT'])
    expect(wrapper.find('[data-testid="gov-reports-tabs"]').exists()).toBe(false)
    expect(wrapper.find('.el-tabs__item').exists()).toBe(false)
    expect(wrapper.find('[data-testid="page-export"]').exists()).toBe(true)
  })

  it('wildcard：五個頁籤', async () => {
    const { wrapper } = await mountAt('/admin/gov-reports/iep', ['*'])
    expect(tabLabels(wrapper)).toHaveLength(5)
  })

  it('目前頁籤高亮，隨路由切換', async () => {
    const { wrapper, router } = await mountAt('/admin/gov-reports/subsidies', ['*'])
    const active = () => wrapper.find('.el-tabs__item.is-active').text()
    expect(active()).toBe('特教加給與鐘點費')

    await router.push('/gov-reports')
    await flushPromises()
    expect(active()).toBe('勞健保與稅務申報')
  })

  it('點頁籤導到該頁網址（含 /gov-reports 絕對路徑子路由）', async () => {
    const { wrapper, router } = await mountAt('/admin/gov-reports/monthly', ['*'])
    const click = async (label: string) => {
      const item = wrapper.findAll('.el-tabs__item').find((n) => n.text() === label)
      expect(item, label).toBeDefined()
      await item!.trigger('click')
      await flushPromises()
    }

    await click('在學證明開立紀錄')
    expect(router.currentRoute.value.path).toBe('/admin/gov-reports/certificates')
    expect(wrapper.find('[data-testid="page-certificates"]').exists()).toBe(true)

    await click('勞健保與稅務申報')
    expect(router.currentRoute.value.path).toBe('/gov-reports')
    expect(wrapper.find('[data-testid="page-export"]').exists()).toBe(true)
  })
})
