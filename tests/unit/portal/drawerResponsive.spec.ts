import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 設定 matchMedia 模擬：useIsMobile 在 setup 時讀 mql.matches，需在 mount 前呼叫
function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(max-width: 767.98px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
}

// el-drawer 內容 teleport 到 body；斷言讀 drawer 元件 prop 而非 DOM
import ContactBookEntryDrawer from '@/views/portal/components/contactBook/ContactBookEntryDrawer.vue'
import ActivityRollcallDrawer from '@/views/portal/components/activity/ActivityRollcallDrawer.vue'

describe('portal drawer 手機響應式 size', () => {
  beforeEach(() => setMobile(false))

  it('ContactBookEntryDrawer 桌機 size=520px / 手機 size=100%', async () => {
    setMobile(false)
    const desktop = mount(ContactBookEntryDrawer, {
      props: { modelValue: true, studentName: '小明' },
      global: { plugins: [ElementPlus] },
    })
    expect(desktop.findComponent({ name: 'ElDrawer' }).props('size')).toBe('520px')
    desktop.unmount()

    setMobile(true)
    const mobile = mount(ContactBookEntryDrawer, {
      props: { modelValue: true, studentName: '小明' },
      global: { plugins: [ElementPlus] },
    })
    expect(mobile.findComponent({ name: 'ElDrawer' }).props('size')).toBe('100%')
    mobile.unmount()
  })

  it('ActivityRollcallDrawer 桌機 size=460px / 手機 size=100%', async () => {
    setMobile(false)
    const desktop = mount(ActivityRollcallDrawer, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus] },
    })
    expect(desktop.findComponent({ name: 'ElDrawer' }).props('size')).toBe('460px')
    desktop.unmount()

    setMobile(true)
    const mobile = mount(ActivityRollcallDrawer, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus] },
    })
    expect(mobile.findComponent({ name: 'ElDrawer' }).props('size')).toBe('100%')
    mobile.unmount()
  })
})
