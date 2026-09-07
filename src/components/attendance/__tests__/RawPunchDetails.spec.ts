import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RawPunchDetails from '../RawPunchDetails.vue'

describe('原始打卡詳情', () => {
  it('顯示匯入時保存的完整刷卡與來源列', () => {
    const wrapper = mount(RawPunchDetails, { props: { importMetadata: {
      import_format: 'punch_events', device_id: 'default', source_employee_number: '101',
      source_rows: [2, 3, 4], punches: ['2026-08-03T08:00:00', '2026-08-03T12:00:00', '2026-08-03T17:00:00'], review_confirmed: true,
    } } })
    expect(wrapper.text()).toContain('來源列 2、3、4')
    expect(wrapper.findAll('li')).toHaveLength(3)
    expect(wrapper.text()).toContain('2026-08-03 12:00:00')
    expect(wrapper.text()).toContain('已人工核對')
  })
  it('沒有逐筆匯入資料時不顯示入口', () => {
    expect(mount(RawPunchDetails, { props: { importMetadata: null } }).find('details').exists()).toBe(false)
  })
})
