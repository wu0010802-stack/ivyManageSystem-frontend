import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PlanTeacherCell from '../PlanTeacherCell.vue'

const optionGroups = [
  { label: '原班老師', options: [{ id: 100, label: '林佳蓉', disabled: false, note: '原班' }] },
  { label: '帶班老師', options: [{ id: 101, label: '陳怡君', disabled: true, note: '玫瑰班導' }] },
  { label: '其他職務', options: [{ id: 103, label: '王主任', disabled: false, note: '' }] },
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
      optionGroups,
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
  it('下拉依組別呈現（原班老師／帶班老師／其他職務）', async () => {
    const w = mountCell()
    await w.find('.teacher-trigger').trigger('click')
    const groups = w.findComponent({ name: 'ElSelect' }).findAllComponents({ name: 'ElOptionGroup' })
    expect(groups.map(g => g.props('label'))).toEqual(['原班老師', '帶班老師', '其他職務'])
  })

  it('下拉 placeholder 顯示原班老師；沒有原班老師時寫「選擇老師」', async () => {
    const w = mountCell()
    await w.find('.teacher-trigger').trigger('click')
    expect(w.findComponent({ name: 'ElSelect' }).props('placeholder')).toBe('原班：林佳蓉')
    const plain = mountCell({ sourceTeacherName: null })
    await plain.find('.teacher-trigger').trigger('click')
    expect(plain.findComponent({ name: 'ElSelect' }).props('placeholder')).toBe('選擇老師')
  })

  it('沒選就離開（blur／Tab）：收回成顯示態，不 emit', async () => {
    const w = mountCell()
    await w.find('.teacher-trigger').trigger('click')
    w.findComponent({ name: 'ElSelect' }).vm.$emit('blur', new FocusEvent('blur'))
    await nextTick()
    expect(w.findComponent({ name: 'ElSelect' }).exists()).toBe(false)
    expect(w.find('.teacher-trigger').exists()).toBe(true)
    expect(w.emitted('change')).toBeFalsy()
  })

  it('這一格存檔失敗：顯示錯誤訊息並標成 aria-invalid', () => {
    const w = mountCell({ error: '班導「吳老師」已停用，請改選其他老師' })
    expect(w.find('.teacher-error').text()).toBe('班導「吳老師」已停用，請改選其他老師')
    expect(w.find('.teacher-trigger').attributes('aria-invalid')).toBe('true')
    expect(w.find('.teacher-trigger').classes()).toContain('has-error')
  })
})
