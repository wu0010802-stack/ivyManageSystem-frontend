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
  template: `<button class="el-button-stub" @click="$emit('click')"><slot /></button>`,
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
const ElDropdownItem = { props: ['command'], template: `<div class="dd-item" :data-command="command"><slot /></div>` }

const stubs = { ElButton, ElSelect, ElOption, ElStatistic, ElDropdown, ElDropdownMenu, ElDropdownItem }

function mountHeader(period: { year?: number; month?: number } = {}) {
  return mount(WorkspaceHeader, {
    props: {
      year: period.year ?? 2026,
      month: period.month ?? 6,
      kpis: { fullAttendance: 0, lateCount: 0, missingCount: 0, pendingAnomalies: 0 },
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
})
