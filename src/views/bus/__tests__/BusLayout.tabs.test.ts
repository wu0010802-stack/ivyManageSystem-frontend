/**
 * 娃娃車管理整合頁（/bus）分頁可見性與導覽。
 *
 * 2026-08-13 三頁整合為單一入口＋頁內分頁：即時監看／乘車歷史＝BUS_READ、
 * 路線管理＝BUS_WRITE，分頁可見性各自跟碼走（比照 WorkbenchLayout 先例）；
 * 只持單一碼者由 /bus 的 redirect 落到自己看得到的分頁，本層不重複判斷落點。
 *
 * 2026-08-26 班次排程加兩分頁：今日調度（BUS_READ）與設定（BUS_WRITE）。
 * 今日調度掛 BUS_READ 是刻意的——發車後的編輯權另由 BUS_IN_PROGRESS_WRITE 在
 * 頁內控制，分頁層若改掛 BUS_WRITE，只持檢視碼的行政會連當日名單都看不到。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const grantedPermissions = ref<string[]>([])
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => grantedPermissions.value.includes(code),
}))

const push = vi.fn()
const routePath = ref('/bus/monitor')
vi.mock('vue-router', () => ({
  useRoute: () => ({ get path() { return routePath.value } }),
  useRouter: () => ({ push }),
  RouterView: { template: '<div class="router-view-stub" />' },
}))

import BusLayout from '../BusLayout.vue'

const mountLayout = () =>
  mount(BusLayout, {
    global: {
      stubs: {
        'el-tabs': {
          name: 'ElTabsStub',
          props: ['modelValue'],
          emits: ['tab-change'],
          template: '<div class="tabs" :data-active="modelValue"><slot /></div>',
        },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<div class="tab-pane" :data-name="name">{{ label }}</div>',
        },
      },
    },
  })

const tabNames = (wrapper: ReturnType<typeof mountLayout>) =>
  wrapper.findAll('.tab-pane').map((n) => n.attributes('data-name'))

describe('BusLayout 分頁可見性', () => {
  beforeEach(() => {
    push.mockClear()
    routePath.value = '/bus/monitor'
  })

  it('BUS_READ + BUS_WRITE → 五個分頁都在（含順序）', () => {
    grantedPermissions.value = ['BUS_READ', 'BUS_WRITE']
    expect(tabNames(mountLayout())).toEqual([
      'monitor', 'dispatch', 'history', 'routes', 'settings',
    ])
  })

  it('只有 BUS_READ → 看得到今日調度，看不到路線管理／設定分頁', () => {
    grantedPermissions.value = ['BUS_READ']
    expect(tabNames(mountLayout())).toEqual(['monitor', 'dispatch', 'history'])
  })

  it('只有 BUS_WRITE → 只看得到路線管理與設定分頁', () => {
    grantedPermissions.value = ['BUS_WRITE']
    expect(tabNames(mountLayout())).toEqual(['routes', 'settings'])
  })

  it('BUS_IN_PROGRESS_WRITE 單獨持有帶不出今日調度（進頁碼仍是 BUS_READ）', () => {
    grantedPermissions.value = ['BUS_IN_PROGRESS_WRITE']
    expect(tabNames(mountLayout())).toEqual([])
  })

  it('BUS_TRIPS_OPERATE（隨車老師碼）帶不出任何分頁', () => {
    grantedPermissions.value = ['BUS_TRIPS_OPERATE']
    expect(tabNames(mountLayout())).toEqual([])
  })
})

describe('BusLayout 分頁導覽', () => {
  beforeEach(() => {
    push.mockClear()
    grantedPermissions.value = ['BUS_READ', 'BUS_WRITE']
  })

  it('activeTab 由路由初始化（/bus/history → history）', () => {
    routePath.value = '/bus/history'
    expect(mountLayout().find('.tabs').attributes('data-active')).toBe('history')
  })

  it('activeTab 由路由初始化（新分頁：/bus/dispatch、/bus/settings）', () => {
    for (const [path, tab] of [
      ['/bus/dispatch', 'dispatch'],
      ['/bus/settings', 'settings'],
    ]) {
      routePath.value = path
      expect(mountLayout().find('.tabs').attributes('data-active'), path).toBe(tab)
    }
  })

  it('未知子路徑退回 monitor（不炸、也不停在前一個分頁）', () => {
    routePath.value = '/bus/unknown-subpage'
    expect(mountLayout().find('.tabs').attributes('data-active')).toBe('monitor')
  })

  it('tab-change 推對應子路由', () => {
    routePath.value = '/bus/monitor'
    const wrapper = mountLayout()
    wrapper.findComponent({ name: 'ElTabsStub' }).vm.$emit('tab-change', 'routes')
    expect(push).toHaveBeenCalledWith('/bus/routes')
  })

  it('tab-change 推新分頁（dispatch／settings 的 name 必須等於路徑尾段）', () => {
    routePath.value = '/bus/monitor'
    const wrapper = mountLayout()
    const tabs = wrapper.findComponent({ name: 'ElTabsStub' })
    tabs.vm.$emit('tab-change', 'dispatch')
    expect(push).toHaveBeenCalledWith('/bus/dispatch')
    tabs.vm.$emit('tab-change', 'settings')
    expect(push).toHaveBeenCalledWith('/bus/settings')
  })

  it('路由變更反向同步 activeTab（瀏覽器返回鍵）', async () => {
    routePath.value = '/bus/monitor'
    const wrapper = mountLayout()
    routePath.value = '/bus/routes'
    await nextTick()
    expect(wrapper.find('.tabs').attributes('data-active')).toBe('routes')

    routePath.value = '/bus/dispatch'
    await nextTick()
    expect(wrapper.find('.tabs').attributes('data-active')).toBe('dispatch')
  })
})
