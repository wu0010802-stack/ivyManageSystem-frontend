// src/components/attendance/__tests__/WorkspaceHeader.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import WorkspaceHeader from '../WorkspaceHeader.vue'

const perms = vi.hoisted(() => ({ set: new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE']) }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => perms.set.has(code) }))

// 真實 router（memory history）：讓組件內 useRouter().resolve 產生真實 href，
// 少 mock、更貼近實際行為。註冊 kiosk-punch 路由即可。
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/kiosk/punch', name: 'kiosk-punch', component: { template: '<div />' } },
  ],
})

// element-plus 未全域註冊，逐一 stub（僅保留測試所需行為：button 透傳 click、slot 文字）
const ElButton = {
  props: ['type', 'icon'],
  emits: ['click'],
  template: `<button class="el-button-stub" :data-type="type" @click="$emit('click')"><slot /></button>`,
}
const ElSelect = {
  props: ['modelValue'],
  template: `<select><slot /></select>`,
}
const ElOption = {
  props: ['value', 'label'],
  template: `<option :value="value">{{ label }}</option>`,
}
const ElStatistic = {
  props: ['title', 'value'],
  template: `<div class="el-statistic-stub">{{ title }}</div>`,
}

const ElDropdown = {
  name: 'ElDropdown',
  emits: ['command'],
  template: `<div class="el-dropdown-stub"><slot /><slot name="dropdown" /></div>`,
}
const ElDropdownMenu = { template: `<div><slot /></div>` }
const ElDropdownItem = { props: ['command', 'divided'], template: `<div class="dd-item" :data-command="command"><slot /></div>` }

const stubs = { ElButton, ElSelect, ElOption, ElStatistic, ElDropdown, ElDropdownMenu, ElDropdownItem }

function mountHeader(period: { year?: number; month?: number; canPrintAppraisal?: boolean } & Record<string, unknown> = {}) {
  const { year, month, canPrintAppraisal, ...rest } = period
  return mount(WorkspaceHeader, {
    props: {
      year: year ?? 2026,
      month: month ?? 6,
      ...(canPrintAppraisal !== undefined ? { canPrintAppraisal } : {}),
      ...rest,
    },
    global: { plugins: [router], stubs },
  })
}

describe('WorkspaceHeader — 電子打卡入口', () => {
  it('月份切換圖示按鈕有清楚的可存取名稱', () => {
    const wrapper = mountHeader()
    expect(wrapper.get('button[aria-label="上個月"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-label="下個月"]').exists()).toBe(true)
  })

  it('上／下個月以單一事件送出年月（跨年不會先換年再用舊年份換月）', async () => {
    const jan = mountHeader({ year: 2026, month: 1 })
    await jan.get('button[aria-label="上個月"]').trigger('click')
    expect(jan.emitted('update:period')).toEqual([[2025, 12]])
    expect(jan.emitted('update:year')).toBeUndefined()
    const dec = mountHeader({ year: 2026, month: 12 })
    await dec.get('button[aria-label="下個月"]').trigger('click')
    expect(dec.emitted('update:period')).toEqual([[2027, 1]])
  })

  it('工具列渲染「電子打卡」按鈕', () => {
    const wrapper = mountHeader()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('電子打卡'))
    expect(btn).toBeTruthy()
  })

  it('點擊「電子打卡」以 _blank 新分頁開啟 /kiosk/punch', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mountHeader()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('電子打卡'))!
    await btn.trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith('/kiosk/punch', '_blank')
    openSpy.mockRestore()
  })
})

describe('WorkspaceHeader — 月結選單', () => {
  it('有出勤寫入權限：列出「重算本月出勤」，選了送出 recalculate', async () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mountHeader()
    expect(wrapper.find('[data-command="recalculate"]').text()).toBe('重算本月出勤…')
    wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'recalculate')
    expect(wrapper.emitted('recalculate')).toHaveLength(1)
  })

  it('沒有出勤寫入權限：不列重算', () => {
    perms.set = new Set(['ATTENDANCE_READ'])
    expect(mountHeader().find('[data-command="recalculate"]').exists()).toBe(false)
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
  })

  it('canPrintAppraisal 為真才出現「批次列印考核表」選單項，點選 emit appraisal', () => {
    const without = mountHeader()
    expect(without.find('[data-command="appraisal"]').exists()).toBe(false)

    const wrapper = mountHeader({ canPrintAppraisal: true })
    expect(wrapper.find('[data-command="appraisal"]').text()).toBe('批次列印考核表')
    wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'appraisal')
    expect(wrapper.emitted('appraisal')).toHaveLength(1)
  })
})

describe('WorkspaceHeader 主要動作（桌機只有一顆 primary）', () => {
  const buttons = (w: ReturnType<typeof mountHeader>) => w.findAll('button')
  const primaries = (w: ReturnType<typeof mountHeader>) => w.findAll('button[data-type="primary"]')

  it('主要動作不是匯入：匯入鈕維持一般鈕，另在最右放一顆 primary，文字照 label，點了送 primary(action)', async () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mountHeader({ primary: { label: '先修設定問題・15 人', action: 'patterns' } })
    const importBtn = wrapper.get('[data-test="header-import"]')
    expect(importBtn.text()).toBe('匯入打卡紀錄')
    expect(importBtn.attributes('data-type')).toBeUndefined()
    expect(primaries(wrapper)).toHaveLength(1)
    const primary = wrapper.get('[data-test="header-primary"]')
    expect(primary.text()).toBe('先修設定問題・15 人')
    expect(primary.attributes('data-type')).toBe('primary')
    // 最右：在所有動作鈕之後
    const all = buttons(wrapper)
    expect(all[all.length - 1].element).toBe(primary.element)
    await primary.trigger('click')
    expect(wrapper.emitted('primary')).toEqual([['patterns']])
    expect(wrapper.emitted('import')).toBeUndefined()
  })

  it('主要動作是匯入：匯入鈕自己變 primary 並用該 label，整列只有一顆 primary', async () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mountHeader({ primary: { label: '匯入打卡', action: 'import' } })
    expect(primaries(wrapper)).toHaveLength(1)
    const importBtn = wrapper.get('[data-test="header-import"]')
    expect(importBtn.attributes('data-type')).toBe('primary')
    expect(importBtn.text()).toBe('匯入打卡')
    expect(wrapper.find('[data-test="header-primary"]').exists()).toBe(false)
    await importBtn.trigger('click')
    expect(wrapper.emitted('primary')).toEqual([['import']])
  })

  it('各動作都顯示自己的 label（處理待辦、交薪資）', () => {
    const daily = mountHeader({ primary: { label: '處理待辦・剩 169 件', action: 'daily' } })
    expect(daily.get('[data-test="header-primary"]').text()).toBe('處理待辦・剩 169 件')
    const payroll = mountHeader({ primary: { label: '交薪資', action: 'payroll' } })
    expect(payroll.get('[data-test="header-primary"]').text()).toBe('交薪資')
  })

  it('沒有主要動作（null、等老師回覆、已封存）：整列沒有 primary，匯入鈕是一般鈕', () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mountHeader({ primary: null })
    expect(primaries(wrapper)).toHaveLength(0)
    expect(wrapper.get('[data-test="header-import"]').text()).toBe('匯入打卡紀錄')
    expect(mountHeader().findAll('button[data-type="primary"]')).toHaveLength(0)
  })
})

describe('WorkspaceHeader 狀態膠囊', () => {
  const status = (w: ReturnType<typeof mountHeader>) => w.get('[data-test="header-status"]')

  it('open 核對中、partial 部分封存、sealed 已封存・唯讀', () => {
    expect(status(mountHeader({ sealState: 'open' })).text()).toBe('核對中')
    expect(status(mountHeader({ sealState: 'partial' })).text()).toBe('部分封存')
    expect(status(mountHeader({ sealState: 'sealed' })).text()).toBe('已封存・唯讀')
  })

  it('sealed 用鎖頭圖示（形狀不靠顏色）；open／partial 沒有鎖頭', () => {
    expect(status(mountHeader({ sealState: 'sealed' })).find('svg[data-test="header-status-lock"]').exists()).toBe(true)
    expect(status(mountHeader({ sealState: 'open' })).find('svg[data-test="header-status-lock"]').exists()).toBe(false)
    expect(status(mountHeader({ sealState: 'partial' })).find('svg[data-test="header-status-lock"]').exists()).toBe(false)
  })

  it('每個狀態有各自的修飾 class；還不知道月份狀態（沒給 sealState）就不畫膠囊', () => {
    expect(status(mountHeader({ sealState: 'sealed' })).classes()).toContain('is-sealed')
    expect(status(mountHeader({ sealState: 'partial' })).classes()).toContain('is-partial')
    expect(status(mountHeader({ sealState: 'open' })).classes()).toContain('is-open')
    expect(mountHeader().find('[data-test="header-status"]').exists()).toBe(false)
  })
})

describe('WorkspaceHeader 手機一列', () => {
  const mobile = (props: Record<string, unknown> = {}) =>
    mountHeader({ mobile: true, sealState: 'open', canPayrollCompare: true, canPrintAppraisal: true, ...props })

  it('一列：上個月、年月文字、下個月、狀態膠囊、⋯；沒有年月下拉、匯入鈕、月底作業鈕與電子打卡連結', () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mobile({ year: 2026, month: 9 })
    expect(wrapper.get('[data-test="header-period"]').text()).toBe('2026 年 9 月')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('[data-test="header-status"]').text()).toBe('核對中')
    expect(wrapper.get('button[aria-label="更多動作"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="header-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="header-month-tools"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="header-kiosk"]').exists()).toBe(false)
    // 沒有另起一列的動作區（桌機才有）
    expect(wrapper.find('.workspace-header__actions').exists()).toBe(false)
  })

  it('手機頁首不放 primary（由進度膠囊負責），即使有給 primary', () => {
    const wrapper = mobile({ primary: { label: '先修設定問題・15 人', action: 'patterns' } })
    expect(wrapper.findAll('button[data-type="primary"]')).toHaveLength(0)
    expect(wrapper.find('[data-test="header-primary"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('先修設定問題')
  })

  it('上／下個月照常送 update:period', async () => {
    const wrapper = mobile({ year: 2026, month: 1 })
    await wrapper.get('button[aria-label="上個月"]').trigger('click')
    expect(wrapper.emitted('update:period')).toEqual([[2025, 12]])
  })

  it('⋯ 選單含三類項目：匯入打卡紀錄、開電子打卡台、月底作業各項（依權限）', () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const wrapper = mobile()
    const items = wrapper.findAll('.dd-item').map((i) => [i.attributes('data-command'), i.text()])
    expect(items).toEqual([
      ['import', '匯入打卡紀錄'],
      ['kiosk', '開電子打卡台'],
      ['payroll', '薪資扣項核對'],
      ['export', '匯出月報'],
      ['appraisal', '批次列印考核表'],
      ['recalculate', '重算本月出勤…'],
    ])
  })

  it('沒有出勤寫入權限：選單沒有匯入與重算；沒給 canPayrollCompare／canPrintAppraisal 也不列', () => {
    perms.set = new Set(['ATTENDANCE_READ'])
    const wrapper = mountHeader({ mobile: true })
    expect(wrapper.findAll('.dd-item').map((i) => i.attributes('data-command'))).toEqual(['kiosk', 'export'])
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
  })

  it('選單項送出對應事件；電子打卡台以新分頁開啟', () => {
    perms.set = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE'])
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mobile()
    const dropdown = wrapper.findComponent({ name: 'ElDropdown' })
    for (const command of ['import', 'payroll', 'export', 'appraisal', 'recalculate']) dropdown.vm.$emit('command', command)
    expect(wrapper.emitted('import')).toHaveLength(1)
    expect(wrapper.emitted('payroll')).toHaveLength(1)
    expect(wrapper.emitted('export')).toHaveLength(1)
    expect(wrapper.emitted('appraisal')).toHaveLength(1)
    expect(wrapper.emitted('recalculate')).toHaveLength(1)
    dropdown.vm.$emit('command', 'kiosk')
    expect(openSpy).toHaveBeenCalledWith('/kiosk/punch', '_blank')
    openSpy.mockRestore()
  })
})
