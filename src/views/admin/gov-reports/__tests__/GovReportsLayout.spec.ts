/**
 * 政府申報頁籤殼（GovReportsLayout，後台 IA 重整 批次 2，2026-10-29）。
 * 每個頁籤依該頁 gate 用 v-if；可見頁籤不足兩個時整列隱藏；點頁籤＝導到該頁網址。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'

const getSystemConfig = vi.hoisted(() => vi.fn())
const updateSystemConfig = vi.hoisted(() => vi.fn())
vi.mock('@/api/systemConfig', () => ({
  getSystemConfig: (...a: unknown[]) => getSystemConfig(...a),
  updateSystemConfig: (...a: unknown[]) => updateSystemConfig(...a),
}))

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

// 2026-10-29 S5：勞保／健保／勞退三組單位編號（gov.* system_configs）自系統設定 › 分校設定搬來，
// 頁籤列右側「申報單位設定」開 dialog。入口需 SETTINGS_READ（讀 system_configs），寫入需 SETTINGS_WRITE。
describe('GovReportsLayout 申報單位設定', () => {
  beforeEach(() => {
    setUserInfo(null)
    getSystemConfig.mockReset().mockRejectedValue({ response: { status: 404 } })
    updateSystemConfig.mockReset()
  })

  const settingsBtn = (w: Awaited<ReturnType<typeof mountAt>>['wrapper']) =>
    w.find('[data-testid="gov-unit-settings"]')

  it('有 SETTINGS_READ：頁籤列右側有「申報單位設定」；沒有則不顯示', async () => {
    const withRead = await mountAt('/admin/gov-reports/monthly', ['GOV_REPORTS_VIEW', 'SETTINGS_READ'])
    expect(settingsBtn(withRead.wrapper).exists()).toBe(true)
    expect(settingsBtn(withRead.wrapper).text()).toBe('申報單位設定')

    const without = await mountAt('/admin/gov-reports/monthly', ['GOV_REPORTS_VIEW'])
    expect(settingsBtn(without.wrapper).exists()).toBe(false)
    expect(getSystemConfig).not.toHaveBeenCalled()
  })

  it('只剩一個頁籤（頁籤列隱藏）時入口仍在，頁面內容照常渲染', async () => {
    const { wrapper } = await mountAt('/gov-reports', ['GOV_REPORTS_EXPORT', 'SETTINGS_READ'])
    expect(wrapper.find('[data-testid="gov-reports-tabs"]').exists()).toBe(false)
    expect(settingsBtn(wrapper).exists()).toBe(true)
    expect(wrapper.find('[data-testid="page-export"]').exists()).toBe(true)
  })

  it('點開後只讀取三組單位編號 key；沒有 SETTINGS_WRITE 時唯讀（無儲存鈕、顯示無權限提示）', async () => {
    const { wrapper } = await mountAt('/admin/gov-reports/monthly', ['GOV_REPORTS_VIEW', 'SETTINGS_READ'])
    expect(getSystemConfig).not.toHaveBeenCalled() // dialog 沒開不載入
    await settingsBtn(wrapper).trigger('click')
    await flushPromises()
    expect(getSystemConfig.mock.calls.map((c) => c[0]).sort()).toEqual([
      'gov.health_insurance_unit_code',
      'gov.labor_insurance_unit_code',
      'gov.pension_employer_code',
    ])
    const body = document.body.textContent ?? ''
    expect(body).toContain('勞保投保單位編號')
    expect(body).toContain('目前帳號無系統設定編輯權限')
    expect(document.body.querySelector('.tenant-config-tab .config-row__actions button')).toBeNull()
  })

  it('有 SETTINGS_WRITE：可編輯並儲存（PUT /system-configs/{key}）', async () => {
    updateSystemConfig.mockResolvedValue({ data: { config_key: 'x', config_value: '12345678', is_default: false } })
    const { wrapper } = await mountAt('/admin/gov-reports/monthly', ['GOV_REPORTS_VIEW', 'SETTINGS_READ', 'SETTINGS_WRITE'])
    await settingsBtn(wrapper).trigger('click')
    await flushPromises()
    const row = document.body.querySelector('[data-test="config-row-gov.labor_insurance_unit_code"]')!
    const input = row.querySelector('input') as HTMLInputElement
    input.value = '12345678'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const save = row.querySelector('.config-row__actions button') as HTMLButtonElement
    expect(save).not.toBeNull()
    save.click()
    await flushPromises()
    expect(updateSystemConfig).toHaveBeenCalledWith('gov.labor_insurance_unit_code', { config_value: '12345678' })
  })
})
