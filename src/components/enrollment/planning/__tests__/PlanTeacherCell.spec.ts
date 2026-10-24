import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PlanTeacherCell from '../PlanTeacherCell.vue'

const options = [
  { id: 100, label: '林佳蓉', disabled: false, note: '' },
  { id: 101, label: '陳怡君', disabled: true, note: '玫瑰班導' },
]

function mountCell(props: Record<string, unknown> = {}) {
  return mount(PlanTeacherCell, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      role: 'head',
      className: '百合',
      teacherId: null,
      teacherName: null,
      sourceTeacherName: '林佳蓉',
      editable: true,
      disabled: false,
      options,
      ...props,
    },
  })
}

describe('PlanTeacherCell', () => {
  it('未指派：顯示「未指派」與原班老師提示（不必 hover tooltip）', () => {
    const w = mountCell()
    expect(w.text()).toContain('未指派')
    expect(w.find('.teacher-source').text()).toBe('原班：林佳蓉')
  })

  it('已指派：只顯示姓名，不顯示原班提示', () => {
    const w = mountCell({ teacherId: 100, teacherName: '林佳蓉' })
    expect(w.find('.teacher-name').text()).toBe('林佳蓉')
    expect(w.find('.teacher-source').exists()).toBe(false)
  })

  it('可編輯：點格子展開下拉，選擇後 emit change(id) 並收回', async () => {
    const w = mountCell()
    await w.find('.teacher-trigger').trigger('click')
    const select = w.findComponent({ name: 'ElSelect' })
    expect(select.exists()).toBe(true)
    select.vm.$emit('change', 100)
    await nextTick()
    expect(w.emitted('change')![0]).toEqual([100])
    expect(w.findComponent({ name: 'ElSelect' }).exists()).toBe(false)
  })

  it('清除選擇 emit change(null)（undefined 會被 JSON 吞掉，必須正規化）', async () => {
    const w = mountCell({ teacherId: 100, teacherName: '林佳蓉' })
    await w.find('.teacher-trigger').trigger('click')
    w.findComponent({ name: 'ElSelect' }).vm.$emit('change', undefined)
    await nextTick()
    expect(w.emitted('change')![0]).toEqual([null])
  })

  it('選回原本的老師不 emit（免無意義 version bump）', async () => {
    const w = mountCell({ teacherId: 100, teacherName: '林佳蓉' })
    await w.find('.teacher-trigger').trigger('click')
    w.findComponent({ name: 'ElSelect' }).vm.$emit('change', 100)
    await nextTick()
    expect(w.emitted('change')).toBeFalsy()
  })

  it('只有班導未指派用警示色（擋發布）；副班導／美語未指派用次要色', () => {
    expect(mountCell({ role: 'head' }).find('.teacher-trigger').classes()).toContain('is-blocking')
    expect(mountCell({ role: 'assistant' }).find('.teacher-trigger').classes()).not.toContain('is-blocking')
    expect(mountCell({ role: 'head', teacherId: 100, teacherName: '林佳蓉' }).find('.teacher-trigger').classes()).not.toContain('is-blocking')
  })

  it('唯讀：沒有可點的按鈕', () => {
    const w = mountCell({ editable: false })
    expect(w.find('.teacher-trigger').exists()).toBe(false)
    expect(w.text()).toContain('未指派')
  })

  it('mutation 進行中（disabled）：按鈕停用', () => {
    const w = mountCell({ disabled: true })
    expect((w.find('.teacher-trigger').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('按鈕有可讀的 aria-label（班名＋職務＋現值）', () => {
    const w = mountCell()
    expect(w.find('.teacher-trigger').attributes('aria-label')).toBe('百合 班導：未指派，點擊選擇老師')
  })
})
