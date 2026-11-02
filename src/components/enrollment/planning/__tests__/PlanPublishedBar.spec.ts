import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlanPublishedBar from '../PlanPublishedBar.vue'

function mountBar(props: Record<string, unknown> = {}) {
  return mount(PlanPublishedBar, {
    global: { plugins: [ElementPlus] },
    props: {
      publishedAt: '2027-06-20T09:30:00',
      applyDate: '2027-08-01',
      appliesImmediately: false,
      schedulerEnabled: true,
      applyFailure: null,
      applyOverdue: false,
      today: '2027-07-22',
      ...props,
    },
  })
}

describe('PlanPublishedBar', () => {
  it('一般：已於 MM/DD 發布、將於套用日自動套用（還有 N 天）、要修改先撤回', () => {
    const w = mountBar()
    expect(w.text()).toContain('已於 06/20 發布')
    expect(w.text()).toContain('將於 2027/08/01 自動套用（還有 10 天）')
    expect(w.text()).toContain('要修改請先撤回發布')
    expect(w.classes()).toContain('is-info')
  })

  it('自動套用未啟用：error 樣式，明講不會套用、要請系統管理員開啟，不寫「自動套用」日期', () => {
    const w = mountBar({ schedulerEnabled: false })
    expect(w.classes()).toContain('is-error')
    expect(w.find('.bar-headline').text()).toBe('自動套用未啟用，請聯絡系統管理員開啟，否則不會套用')
    expect(w.text()).not.toContain('將於 2027/08/01 自動套用')
    expect(w.text()).toContain('已於 06/20 發布')
  })

  it('有套用失敗原因：error 樣式並顯示原因', () => {
    const w = mountBar({ applyFailure: '有 2 項阻擋：A；B' })
    expect(w.classes()).toContain('is-error')
    expect(w.find('.bar-headline').text()).toBe('套用失敗：有 2 項阻擋：A；B')
    expect(w.text()).toContain('系統會自動重試')
  })

  it('自動套用未啟用時仍列出上次失敗原因，但不說會自動重試', () => {
    const w = mountBar({ schedulerEnabled: false, applyFailure: '套用時發生系統錯誤（X），請聯絡系統管理員' })
    expect(w.text()).toContain('上次套用失敗：套用時發生系統錯誤（X）')
    expect(w.text()).not.toContain('自動重試')
  })

  it('補救模式：約一小時內套用；逾期改 warning', () => {
    expect(mountBar({ appliesImmediately: true }).text()).toContain('約一小時內套用到現行班級')
    const overdue = mountBar({ appliesImmediately: true, applyOverdue: true })
    expect(overdue.classes()).toContain('is-warning')
    expect(overdue.find('.bar-headline').text()).toContain('仍未套用')
  })

  it('套用日就是今天：寫「今天」而不是「還有 0 天」', () => {
    expect(mountBar({ today: '2027-08-01' }).text()).toContain('（今天）')
  })
  it('有阻擋（排程啟用、尚未失敗）：error「套用會失敗」，不再說何時自動套用；補救模式也一樣', () => {
    const w = mountBar({ blockingCount: 2 })
    expect(w.classes()).toContain('is-error')
    expect(w.find('.bar-headline').text()).toBe('已發布的計畫有 2 項阻擋，套用會失敗')
    expect(w.text()).not.toContain('自動套用')
    expect(w.text()).toContain('已於 06/20 發布')
    const remedial = mountBar({ blockingCount: 1, appliesImmediately: true })
    expect(remedial.find('.bar-headline').text()).toBe('已發布的計畫有 1 項阻擋，套用會失敗')
    expect(remedial.text()).not.toContain('約一小時內')
  })

  it('優先序：排程未啟用、套用失敗排在阻擋前面，阻擋改列在說明裡', () => {
    const off = mountBar({ schedulerEnabled: false, blockingCount: 2 })
    expect(off.find('.bar-headline').text()).toContain('自動套用未啟用')
    expect(off.find('.bar-details').text()).toContain('另有 2 項阻擋，處理前不會套用')
    const failed = mountBar({ applyFailure: 'X', blockingCount: 1 })
    expect(failed.find('.bar-headline').text()).toBe('套用失敗：X')
  })

  it('actions slot：放處理按鈕（例如撤回並重新產生）', () => {
    const w = mount(PlanPublishedBar, {
      global: { plugins: [ElementPlus] },
      props: { applyDate: '2027-08-01', schedulerEnabled: true, today: '2027-07-22', blockingCount: 1 },
      slots: { actions: '<button class="slot-btn">撤回並重新產生</button>' },
    })
    expect(w.find('.bar-actions .slot-btn').exists()).toBe(true)
  })
})
