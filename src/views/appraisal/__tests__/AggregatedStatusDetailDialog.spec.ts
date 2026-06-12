import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AggregatedStatusDetailDialog from '../AggregatedStatusDetailDialog.vue'

/**
 * 2026-06-11 規章對齊後（leave/absent 分流 + merit 功項），detail dialog
 * 必須顯示曠職天數、復學事件數與功 counts——否則主任核分看不到
 * 曠職 −4/日 的依據，功過相抵後分數與顯示的「過」counts 對不上帳。
 */

const STUBS = {
    teleport: true,
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-descriptions': { template: '<div><slot /></div>' },
    'el-descriptions-item': {
        template: '<div>{{ $attrs.label }}<slot /></div>',
    },
    'el-table': true,
    'el-table-column': true,
    'el-empty': true,
    'el-tooltip': true,
    'el-icon': true,
    'el-tag': { template: '<span><slot /></span>' },
    'el-button': { template: '<button><slot /></button>' },
}

const participant = {
    employee_name: '王雅玲',
    role_group: 'HEAD_TEACHER',
    reinstate_count: 1,
    attendance: {
        late_count: 2,
        early_leave_count: 0,
        missing_punch_count: 0,
        leave_days: 3,
        absent_days: 2,
        suggested_score_delta: '-8.75',
    },
    retention: { classroom_name: '向日葵班', retention_rate: '90.00' },
    activity: null,
    disciplinary: {
        warning_count: 1,
        minor_count: 0,
        major_count: 0,
        commend_count: 2,
        minor_merit_count: 1,
        major_merit_count: 0,
        actions: [],
        suggested_score_delta: '1.00',
    },
}

const mountDialog = () =>
    mount(AggregatedStatusDetailDialog, {
        props: { visible: true, participant, cycle: {}, rules: {} },
        global: { stubs: STUBS },
    })

describe('AggregatedStatusDetailDialog 規章新欄位', () => {
    it('出缺勤 tab 顯示曠職天數', () => {
        const wrapper = mountDialog()
        expect(wrapper.text()).toContain('曠職')
        expect(wrapper.text()).toMatch(/曠職\s*2\s*天/)
    })

    it('顯示復學事件數', () => {
        const wrapper = mountDialog()
        expect(wrapper.text()).toContain('復學')
    })

    it('懲處紀錄 tab 顯示功 counts（嘉獎/小功/大功）', () => {
        const wrapper = mountDialog()
        expect(wrapper.text()).toContain('嘉獎')
        expect(wrapper.text()).toContain('小功')
        expect(wrapper.text()).toContain('大功')
    })
})
