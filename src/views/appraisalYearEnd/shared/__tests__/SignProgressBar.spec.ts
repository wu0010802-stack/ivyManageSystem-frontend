import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SignProgressBar from '../SignProgressBar.vue'

describe('SignProgressBar', () => {
  it('顯示各狀態中文計數與總結', () => {
    const w = mount(SignProgressBar, { props: { counts: { DRAFT: 10, SUPERVISOR_SIGNED: 5, ACCOUNTING_SIGNED: 3, FINALIZED: 2 } } })
    expect(w.text()).toContain('草稿 10')
    expect(w.text()).toContain('已核定 2 / 共 20')
  })
  it('全零顯示尚無資料', () => {
    const w = mount(SignProgressBar, { props: { counts: {} } })
    expect(w.text()).toContain('尚無簽核資料')
  })
  it('段寬依比例', () => {
    const w = mount(SignProgressBar, { props: { counts: { DRAFT: 1, FINALIZED: 3 } } })
    const seg = w.find('[data-status="FINALIZED"]')
    expect(seg.attributes('style')).toContain('width: 75%')
  })
})
