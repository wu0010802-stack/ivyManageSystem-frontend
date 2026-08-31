/**
 * 娃娃車管理整合頁（/bus）分頁可見性與導覽。
 *
 * 2026-08-13 三頁整合為單一入口＋頁內分頁：即時監看／乘車歷史＝BUS_READ、
 * 路線管理＝BUS_WRITE，分頁可見性各自跟碼走（比照 WorkbenchLayout 先例）；
 * 只持單一碼者由 /bus 的 redirect 落到自己看得到的分頁，本層不重複判斷落點。
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

  it('BUS_READ + BUS_WRITE → 三個分頁都在', () => {
    grantedPermissions.value = ['BUS_READ', 'BUS_WRITE']
    expect(tabNames(mountLayout())).toEqual(['monitor', 'history', 'routes'])
  })

  it('只有 BUS_READ → 看不到路線管理分頁', () => {
    grantedPermissions.value = ['BUS_READ']
    expect(tabNames(mountLayout())).toEqual(['monitor', 'history'])
  })

  it('只有 BUS_WRITE → 只看得到路線管理分頁', () => {
    grantedPermissions.value = ['BUS_WRITE']
    expect(tabNames(mountLayout())).toEqual(['routes'])
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

  it('tab-change 推對應子路由', () => {
    routePath.value = '/bus/monitor'
    const wrapper = mountLayout()
    wrapper.findComponent({ name: 'ElTabsStub' }).vm.$emit('tab-change', 'routes')
    expect(push).toHaveBeenCalledWith('/bus/routes')
  })

  it('路由變更反向同步 activeTab（瀏覽器返回鍵）', async () => {
    routePath.value = '/bus/monitor'
    const wrapper = mountLayout()
    routePath.value = '/bus/routes'
    await nextTick()
    expect(wrapper.find('.tabs').attributes('data-active')).toBe('routes')
  })
})
