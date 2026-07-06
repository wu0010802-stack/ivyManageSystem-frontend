import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  continueSession: vi.fn(),
  logoutNow: vi.fn(),
}))

vi.mock('@/composables/useSessionWatchdog', async () => {
  const { ref } = await import('vue')
  const countdownRemainingMs = ref<number | null>(125_000)
  return {
    useSessionWatchdogState: () => ({ countdownRemainingMs }),
    continueSession: h.continueSession,
    logoutNow: h.logoutNow,
    __countdown: countdownRemainingMs, // 測試專用把手
  }
})

import SessionIdleDialog from '../common/SessionIdleDialog.vue'
import * as watchdog from '@/composables/useSessionWatchdog'

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="dlg"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-button': { template: '<button><slot /></button>' },
}

describe('SessionIdleDialog', () => {
  afterEach(() => {
    // 還原共享 singleton ref，避免最後一個測試把它設成 null 後影響其他檔案的測試順序
    const countdown = (watchdog as unknown as { __countdown: { value: number | null } })
      .__countdown
    countdown.value = 125_000
  })

  it('倒數中顯示 mm:ss（125000ms → 2:05）', () => {
    const wrapper = mount(SessionIdleDialog, { global: { stubs } })
    expect(wrapper.find('.dlg').exists()).toBe(true)
    expect(wrapper.text()).toContain('2:05')
  })

  it('點「繼續使用」→ continueSession', async () => {
    const wrapper = mount(SessionIdleDialog, { global: { stubs } })
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('繼續使用'))!.trigger('click')
    expect(h.continueSession).toHaveBeenCalled()
  })

  it('點「立即登出」→ logoutNow', async () => {
    const wrapper = mount(SessionIdleDialog, { global: { stubs } })
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('立即登出'))!.trigger('click')
    expect(h.logoutNow).toHaveBeenCalled()
  })

  it('countdownRemainingMs 為 null 時不渲染', async () => {
    const countdown = (watchdog as unknown as { __countdown: { value: number | null } })
      .__countdown
    countdown.value = null
    const wrapper = mount(SessionIdleDialog, { global: { stubs } })
    expect(wrapper.find('.dlg').exists()).toBe(false)
  })
})
