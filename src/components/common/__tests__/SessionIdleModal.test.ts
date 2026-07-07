import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SessionIdleModal from '../SessionIdleModal.vue'

async function mountModal(props: { visible: boolean; remainingSeconds: number }) {
  const wrapper = mount(SessionIdleModal, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props,
  })
  // el-dialog 首次開啟需等 nextTick 後才實際渲染內容
  await flushPromises()
  return wrapper
}

describe('SessionIdleModal', () => {
  it('visible=false 時不顯示 dialog 內容', async () => {
    const wrapper = await mountModal({ visible: false, remainingSeconds: 300 })
    expect(wrapper.find('.el-dialog').exists()).toBe(false)
  })

  it('顯示 mm:ss 格式的倒數文字', async () => {
    const wrapper = await mountModal({ visible: true, remainingSeconds: 65 })
    expect(wrapper.text()).toContain('01:05')
  })

  it('remainingSeconds 為 0 時顯示 00:00（不顯示負數）', async () => {
    const wrapper = await mountModal({ visible: true, remainingSeconds: 0 })
    expect(wrapper.text()).toContain('00:00')
  })

  it('點擊「繼續使用」emit extend', async () => {
    const wrapper = await mountModal({ visible: true, remainingSeconds: 120 })
    const buttons = wrapper.findAll('button')
    const extendBtn = buttons.find((b) => b.text() === '繼續使用')
    expect(extendBtn).toBeTruthy()
    await extendBtn!.trigger('click')
    expect(wrapper.emitted('extend')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('點擊「關閉」emit close', async () => {
    const wrapper = await mountModal({ visible: true, remainingSeconds: 120 })
    const buttons = wrapper.findAll('button')
    const closeBtn = buttons.find((b) => b.text() === '關閉')
    expect(closeBtn).toBeTruthy()
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('extend')).toBeFalsy()
  })

  it('根節點帶有 session-idle-modal class（供 useIdleTimeout 全域 handler 排除自身互動）', async () => {
    const wrapper = await mountModal({ visible: true, remainingSeconds: 120 })
    expect(wrapper.find('.session-idle-modal').exists()).toBe(true)
  })
})
