import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ListView from '../ListView.vue'

// el-table 的列內容在 mounted 後才透過 post-flush watcher 排版完成，
// 必須等一次 flushPromises 才會出現在 DOM（比照 AuditChangesDetail.test.ts 既有作法）。
describe('ListView', () => {
  it('點擊員工姓名觸發 open-detail 事件，帶出該列 participant', async () => {
    const participants = [{ id: 1, employee_id: 42, employee_name: '林靜宜', role_group: 'HOMEROOM' }]
    const wrapper = mount(ListView, {
      props: { cycleId: 5, participants, summaryByParticipant: {} },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await wrapper.find('[data-test="detail-btn-1"]').trigger('click')
    expect(wrapper.emitted('open-detail')?.[0]).toEqual([participants[0]])
  })

  it('後端回 employee_name 時第一欄顯示姓名而非「員工 N」（UAT PAY-27）', async () => {
    const participants = [
      { id: 1, employee_id: 8, employee_name: '林靜宜', role_group: 'HOMEROOM' },
      { id: 2, employee_id: 9, role_group: 'HOMEROOM' },
    ]
    const wrapper = mount(ListView, {
      props: { cycleId: 5, participants, summaryByParticipant: {} },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="detail-btn-1"]').text()).toBe('林靜宜')
    expect(wrapper.text()).not.toContain('員工 8')
    // 舊資料缺姓名時仍降級為「員工 N」，不拋錯
    expect(wrapper.find('[data-test="detail-btn-2"]').text()).toBe('員工 9')
  })
})
