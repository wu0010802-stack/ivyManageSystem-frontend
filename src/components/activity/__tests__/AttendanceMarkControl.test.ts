import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import ElementPlus from 'element-plus'

import AttendanceMarkControl from '../AttendanceMarkControl.vue'

/**
 * 出缺席三態控制項的行為契約。
 *
 * 存在理由（2026-09-14 P0）：原本這裡是 `el-switch`。Element Plus 的 switch 在
 * 掛載時會把不在 [active-value, inactive-value] 內的 modelValue（含 null）立刻
 * emit 成 inactive-value，所以名冊上「未點名」（null）的學生一渲染就變成缺席；
 * 老師打開場次、什麼都不碰按下儲存，全班就被記成缺席（缺席會進退費堂數）。
 * 本檔的第一個 test 就是那個 bug 的回歸測試：掛載不得產生任何 emit。
 */
function mountControl(initial: boolean | null) {
  const state = ref<boolean | null>(initial)
  const wrapper = mount(
    defineComponent({
      components: { AttendanceMarkControl },
      setup() {
        return { state }
      },
      template: '<AttendanceMarkControl v-model="state" aria-label="王小明 出缺席" />',
    }),
    { global: { plugins: [ElementPlus] } },
  )
  const buttons = wrapper.findAll('button')
  return { wrapper, state, present: buttons[0], absent: buttons[1] }
}

describe('AttendanceMarkControl', () => {
  it('掛載 null（未點名）時不得改寫 modelValue', async () => {
    const { wrapper, state } = mountControl(null)
    await wrapper.vm.$nextTick()

    expect(state.value).toBeNull()
    expect(wrapper.findComponent(AttendanceMarkControl).emitted('update:modelValue')).toBeUndefined()
  })

  it('未點名時兩顆都不是選取狀態', () => {
    const { present, absent } = mountControl(null)

    expect(present.attributes('aria-pressed')).toBe('false')
    expect(absent.attributes('aria-pressed')).toBe('false')
  })

  it('點「出席」送出 true，點「缺席」送出 false', async () => {
    const { wrapper, state, present, absent } = mountControl(null)

    await present.trigger('click')
    expect(state.value).toBe(true)

    await absent.trigger('click')
    expect(state.value).toBe(false)

    void wrapper
  })

  it('已標記時對應的那顆為選取狀態', () => {
    const marked = mountControl(true)
    expect(marked.present.attributes('aria-pressed')).toBe('true')
    expect(marked.absent.attributes('aria-pressed')).toBe('false')

    const absentMarked = mountControl(false)
    expect(absentMarked.present.attributes('aria-pressed')).toBe('false')
    expect(absentMarked.absent.attributes('aria-pressed')).toBe('true')
  })

  it('重複點同一顆不會把狀態清回未點名', async () => {
    const { state, present } = mountControl(true)

    await present.trigger('click')

    expect(state.value).toBe(true)
  })

  it('disabled 時點擊不送出', async () => {
    const state = ref<boolean | null>(null)
    const wrapper = mount(
      defineComponent({
        components: { AttendanceMarkControl },
        setup() {
          return { state }
        },
        template: '<AttendanceMarkControl v-model="state" disabled />',
      }),
      { global: { plugins: [ElementPlus] } },
    )

    await wrapper.findAll('button')[0].trigger('click')

    expect(state.value).toBeNull()
  })

  it('兩顆都掛得上無障礙標籤', () => {
    const { present, absent } = mountControl(null)

    expect(present.text()).toBe('出席')
    expect(absent.text()).toBe('缺席')
    expect(present.attributes('aria-label')).toContain('王小明')
    expect(absent.attributes('aria-label')).toContain('王小明')
  })
})
