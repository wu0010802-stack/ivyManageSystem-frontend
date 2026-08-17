import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import WorkbenchTodoList from '../WorkbenchTodoList.vue'
import type { NextStep } from '../../nextStep'

const mountList = (items: NextStep[]) =>
  mount(WorkbenchTodoList, {
    props: { items },
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('WorkbenchTodoList', () => {
  it('items 為空時顯示「沒有待處理事項」', () => {
    const w = mountList([])
    expect(w.find('[data-test="wb-todo-list-empty"]').exists()).toBe(true)
  })

  it('依序渲染每一項的類型 tag／標題／說明／動作按鈕', () => {
    const items: NextStep[] = [
      { key: 'exceptions', title: '處理 2 筆阻斷級例外', reason: '阻斷級例外會讓試算與簽核出錯。', ctaLabel: '前往處理', to: '/appraisal-year-end/exceptions' },
      { key: 'payout', title: '4 筆考核年終可發放', reason: '簽核已完成。', ctaLabel: '前往發放', to: '/appraisal-year-end/year-end/payout?year=2026' },
    ]
    const w = mountList(items)
    expect(w.find('[data-test="wb-todo-item-exceptions"]').text()).toContain('處理 2 筆阻斷級例外')
    expect(w.find('[data-test="wb-todo-item-payout"]').text()).toContain('4 筆考核年終可發放')
    expect(w.findAll('.wb-todo-list__item')).toHaveLength(2)
  })
})
