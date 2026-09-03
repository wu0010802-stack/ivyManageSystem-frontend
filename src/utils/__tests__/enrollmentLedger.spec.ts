import { describe, it, expect } from 'vitest'
import {
  formatDelta,
  deltaClass,
  describeReconcile,
  buildTrendChartData,
  EVENT_KIND_TAG_TYPE,
  classChangeText,
  changeSummary,
} from '@/utils/enrollmentLedger'

describe('formatDelta', () => {
  it('正數加 + 號', () => expect(formatDelta(1)).toBe('+1'))
  it('負數保留 - 號', () => expect(formatDelta(-1)).toBe('-1'))
  it('零顯示空字串（轉班不影響全校人數，不必干擾閱讀）', () =>
    expect(formatDelta(0)).toBe(''))
  it('null 顯示問號——那是來源不明列，人數未知不是 0', () =>
    expect(formatDelta(null)).toBe('?'))
})

describe('deltaClass', () => {
  it('增減用不同色，來源不明另成一類', () => {
    expect(deltaClass(1)).toBe('delta-up')
    expect(deltaClass(-1)).toBe('delta-down')
    expect(deltaClass(0)).toBe('')
    expect(deltaClass(null)).toBe('delta-unknown')
  })
})

describe('classChangeText', () => {
  it('入學只有新班', () =>
    expect(classChangeText(null, '小班A')).toBe('→ 小班A'))
  it('離校只有原班', () =>
    expect(classChangeText('中班A', null)).toBe('中班A →'))
  it('轉班兩邊都有', () =>
    expect(classChangeText('小班A', '小班B')).toBe('小班A → 小班B'))
  it('都沒有時給破折號而非空白（表格不留空洞）', () =>
    expect(classChangeText(null, null)).toBe('—'))
})

describe('describeReconcile', () => {
  it('相符時是 ok', () => {
    const r = describeReconcile({
      opened: true,
      status: 'ok',
      ledger_total: 197,
      roster_total: 197,
      difference: 0,
      unknown_rows: [],
    })
    expect(r.level).toBe('ok')
    expect(r.text).toContain('197')
  })

  it('不符時同時說出兩個數字與差額', () => {
    const r = describeReconcile({
      opened: true,
      status: 'mismatch',
      ledger_total: 197,
      roster_total: 198,
      difference: 1,
      unknown_rows: [],
    })
    expect(r.level).toBe('warning')
    expect(r.text).toContain('197')
    expect(r.text).toContain('198')
  })

  it('有來源不明列時明講原因，讓人知道往哪查', () => {
    const r = describeReconcile({
      opened: true,
      status: 'mismatch',
      ledger_total: 197,
      roster_total: 198,
      difference: 1,
      unknown_rows: [
        {
          id: 5,
          event_date: '2026-08-19',
          event_kind: '來源不明異動',
          student_name: '張小美',
          field_changed: 'enrollment_date',
          old_value: '2026-09-01',
          new_value: '2026-08-15',
        },
      ],
    })
    expect(r.text).toContain('來源不明')
    expect(r.text).toContain('1')
  })

  it('尚未起帳時說明現況，不假裝相符', () => {
    const r = describeReconcile({
      opened: false,
      status: 'not_opened',
      ledger_total: null,
      roster_total: 196,
      difference: null,
      unknown_rows: [],
    })
    expect(r.level).toBe('info')
    expect(r.text).toContain('尚未起帳')
    expect(r.text).toContain('196')
  })
})

describe('buildTrendChartData', () => {
  const points = [
    { date: '2026-09-01', school_total: 197, class_totals: { '10': 25, '11': 18 } },
    { date: '2026-09-02', school_total: 196, class_totals: { '10': 24, '11': 18 } },
  ]

  it('全校為主線，勾選的班級各疊一條', () => {
    const d = buildTrendChartData(points, [10], { 10: '小班A' })
    expect(d.labels).toEqual(['2026-09-01', '2026-09-02'])
    expect(d.datasets).toHaveLength(2)
    expect(d.datasets[0].label).toBe('全校')
    expect(d.datasets[0].data).toEqual([197, 196])
    expect(d.datasets[1].label).toBe('小班A')
    expect(d.datasets[1].data).toEqual([25, 24])
  })

  it('沒勾選班級時只有全校一條', () => {
    expect(buildTrendChartData(points, [], {}).datasets).toHaveLength(1)
  })

  it('班級在某日尚無資料時給 null 而非 0（線斷開，不畫成掉到零）', () => {
    const sparse = [
      { date: '2026-09-01', school_total: 197, class_totals: {} },
      { date: '2026-09-02', school_total: 197, class_totals: { '10': 25 } },
    ]
    const d = buildTrendChartData(sparse, [10], { 10: '小班A' })
    expect(d.datasets[1].data).toEqual([null, 25])
  })
})

describe('EVENT_KIND_TAG_TYPE', () => {
  it('來源不明異動用警示色，不能跟正常事件同色', () => {
    expect(EVENT_KIND_TAG_TYPE['來源不明異動']).toBe('warning')
    expect(EVENT_KIND_TAG_TYPE['入學']).toBe('success')
    expect(EVENT_KIND_TAG_TYPE['退學']).toBe('danger')
  })
})

describe('changeSummary', () => {
  it('日期修正顯示中文欄位標籤與前後值（不可只放展開區）', () => {
    expect(
      changeSummary({
        field_changed: 'enrollment_date',
        old_value: '2026-09-01',
        new_value: '2026-08-15',
      }),
    ).toBe('入學日 2026-09-01 → 2026-08-15')
  })

  it('未知欄位退回原始欄名，不要顯示 undefined', () => {
    expect(
      changeSummary({ field_changed: 'some_new_field', old_value: 'a', new_value: 'b' }),
    ).toBe('some_new_field a → b')
  })

  it('空值標示為（空）而非留白', () => {
    expect(
      changeSummary({
        field_changed: 'withdrawal_date',
        old_value: null,
        new_value: '2026-09-10',
      }),
    ).toBe('離園日 （空） → 2026-09-10')
  })

  it('非修正類事件退回班級變化', () => {
    expect(
      changeSummary({ from_class_name: '小班A', to_class_name: '小班B' }),
    ).toBe('小班A → 小班B')
  })
})
