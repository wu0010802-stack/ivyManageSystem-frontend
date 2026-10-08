import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import StudentMonthlyStats from '../StudentMonthlyStats.vue'

/**
 * 月統計的窄幕版與「0% 不等於全班缺席」（2026-09-14 UI/UX 審查 P2）。
 *
 * 改版前這裡是後台報表原樣搬進手機：四張同尺寸大數字卡、27 根長條圖（手機只標
 * 得出 10 個名字）、12 欄 el-table（手機看得到 4 欄、沒有捲動提示）。而且月初
 * 一筆都還沒點時顯示「班級出席率 0%」，讀起來像全班缺席。
 */

const isMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile, cleanup: () => {} }),
}))
vi.mock('@/composables/useChartJs', () => ({
  BarChart: { name: 'BarChart', props: ['data', 'options'], template: '<canvas data-test="bar-chart" />' },
}))

const STUDENT = (over: Record<string, unknown> = {}) => ({
  student_id: 1, student_no: 'A001', name: '小明',
  attendance_rate: 95, school_days: 22, recorded_days: 20,
  出席: 20, 缺席: 1, 病假: 1, 事假: 0, 遲到: 0, 未點名: 0,
  longest_absence_streak: 1, absence_alert: false,
  ...over,
})

const DATA = {
  classroom_name: '天堂鳥', year: 2026, month: 9,
  classroom_attendance_rate: 92,
  classroom_record_completion_rate: 85,
  school_days_count: 22,
  students: [
    STUDENT(),
    STUDENT({
      student_id: 2, student_no: 'A002', name: '小華',
      attendance_rate: 60, recorded_days: 22,
      出席: 13, 缺席: 5, 病假: 3, 遲到: 1,
      longest_absence_streak: 4, absence_alert: true,
    }),
  ],
  alerts: [{ student_id: 2, name: '小華', longest_absence_streak: 4 }],
}

const NOT_STARTED = {
  ...DATA,
  classroom_attendance_rate: 0,
  classroom_record_completion_rate: 0,
  students: [STUDENT({ attendance_rate: 0, recorded_days: 0, 出席: 0, 缺席: 0, 病假: 0, 未點名: 22 })],
  alerts: [],
}

const STUBS = {
  ElDatePicker: { name: 'ElDatePicker', props: ['modelValue'], template: '<input />' },
  ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
  ElCard: { name: 'ElCard', template: '<div class="el-card"><slot name="header" /><slot /></div>' },
  ElTag: { name: 'ElTag', props: ['type'], template: '<span class="el-tag"><slot /></span>' },
  ElTable: { name: 'ElTable', props: ['data'], template: '<table class="el-table"><slot /></table>' },
  ElTableColumn: { name: 'ElTableColumn', template: '<td />' },
}

function mountStats(props = {}, mobile = false) {
  isMobile.value = mobile
  return mount(StudentMonthlyStats, {
    props: { data: DATA, monthPicker: '2026-09', loading: false, ...props },
    global: { stubs: STUBS },
  })
}

describe('摘要句取代四張大數字卡', () => {
  it('不再有 hero 數字卡牆', () => {
    const w = mountStats()
    try {
      expect(w.findAll('.summary-card')).toHaveLength(0)
    } finally {
      w.unmount()
    }
  })

  it('一句話講完上課日、點名完成率與出席率', () => {
    const w = mountStats()
    try {
      expect(w.find('.month-summary').text()).toBe('9 月共 22 個上課日・已點名 85%・出席率 92%')
    } finally {
      w.unmount()
    }
  })

  it('整月還沒點名時說「尚未點名」，不說出席率 0%', () => {
    const w = mountStats({ data: NOT_STARTED })
    try {
      const text = w.find('.month-summary').text()
      expect(text).toContain('尚未點名')
      expect(text).not.toContain('出席率')
    } finally {
      w.unmount()
    }
  })
})

describe('連缺告警排在最前面', () => {
  it('告警區出現在摘要之後、明細之前', () => {
    const w = mountStats()
    try {
      const html = w.html()
      expect(html.indexOf('month-summary')).toBeLessThan(html.indexOf('alert-card'))
      expect(html.indexOf('alert-card')).toBeLessThan(html.indexOf('chart-card'))
    } finally {
      w.unmount()
    }
  })
})

describe('窄幕不畫後台報表', () => {
  it('手機不畫長條圖與 12 欄表格', () => {
    const w = mountStats({}, true)
    try {
      expect(w.find('[data-test="bar-chart"]').exists()).toBe(false)
      expect(w.find('.el-table').exists()).toBe(false)
    } finally {
      w.unmount()
    }
  })

  it('手機改成每生一列，帶姓名與出席率', () => {
    const w = mountStats({}, true)
    try {
      const rows = w.findAll('.student-month-row')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('小明')
      expect(rows[0].text()).toContain('95%')
    } finally {
      w.unmount()
    }
  })

  it('手機列帶出缺席、請假與遲到次數', () => {
    const w = mountStats({}, true)
    try {
      const row = w.findAll('.student-month-row')[1]
      expect(row.text()).toContain('缺席 5')
      expect(row.text()).toContain('請假 3')
      expect(row.text()).toContain('遲到 1')
    } finally {
      w.unmount()
    }
  })

  it('連缺告警的學生在手機列上標出來', () => {
    const w = mountStats({}, true)
    try {
      expect(w.findAll('.student-month-row')[1].classes()).toContain('is-alert')
      expect(w.findAll('.student-month-row')[0].classes()).not.toContain('is-alert')
    } finally {
      w.unmount()
    }
  })

  it('該生整月沒被點過時顯示「尚無紀錄」而不是 0%', () => {
    const w = mountStats({ data: NOT_STARTED }, true)
    try {
      expect(w.findAll('.student-month-row')[0].text()).toContain('尚無紀錄')
    } finally {
      w.unmount()
    }
  })

  it('桌機維持長條圖與表格', () => {
    const w = mountStats({}, false)
    try {
      expect(w.find('[data-test="bar-chart"]').exists()).toBe(true)
      expect(w.find('.el-table').exists()).toBe(true)
      expect(w.findAll('.student-month-row')).toHaveLength(0)
    } finally {
      w.unmount()
    }
  })
})
