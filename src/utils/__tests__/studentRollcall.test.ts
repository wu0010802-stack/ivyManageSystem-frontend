import { describe, it, expect } from 'vitest'
import {
  ROLLCALL_STATUSES,
  summarizeRollcall,
  filterRollcall,
  buildSaveEntries,
  parseRollcallRemark,
  composeRollcallRemark,
  formatLastRecorded,
  monthlySummaryText,
  attendanceRateLabel,
  type RollcallRecord,
} from '@/utils/studentRollcall'

/**
 * 到園點名的純邏輯（2026-09-14 UI/UX 審查）。
 *
 * 核心語意變更：`status` 為 null／空字串＝**未點名**，不再於載入時預選「出席」。
 * 儲存採「只送已點的」（業主裁定 B，與才藝課程點名一致），未點名的列不寫任何
 * 紀錄，首頁「到園點名 N」因此會持續提醒，兩處口徑一致。
 */

const ROSTER: RollcallRecord[] = [
  { student_id: 1, student_no: '01', name: '王小明', status: '出席', remark: '' },
  { student_id: 2, student_no: '02', name: '陳語彤', status: '病假', remark: '家長申請#12' },
  { student_id: 3, student_no: '03', name: '林承翰', status: null, remark: '' },
  { student_id: 4, student_no: '04', name: '張詠晴', status: '缺席', remark: '' },
  { student_id: 5, student_no: '05', name: '李柏睿', status: '', remark: '' },
  { student_id: 6, student_no: '06', name: '黃思妤', status: '事假', remark: '' },
  { student_id: 7, student_no: '07', name: '吳宇軒', status: '遲到', remark: '' },
]

describe('ROLLCALL_STATUSES', () => {
  it('與後端 VALID_STATUSES 同序同值', () => {
    expect([...ROLLCALL_STATUSES]).toEqual(['出席', '缺席', '病假', '事假', '遲到'])
  })
})

describe('summarizeRollcall', () => {
  it('未點名同時涵蓋 null 與空字串', () => {
    expect(summarizeRollcall(ROSTER).unmarked).toBe(2)
  })

  it('病假與事假合併成「請假」一類', () => {
    expect(summarizeRollcall(ROSTER).leave).toBe(2)
  })

  it('分別計出席、缺席、遲到與總數', () => {
    const s = summarizeRollcall(ROSTER)
    expect(s.total).toBe(7)
    expect(s.present).toBe(1)
    expect(s.absent).toBe(1)
    expect(s.late).toBe(1)
  })

  it('空名冊全為 0', () => {
    expect(summarizeRollcall([])).toEqual({
      total: 0, unmarked: 0, present: 0, absent: 0, leave: 0, late: 0,
    })
  })
})

describe('filterRollcall', () => {
  it('all 回傳原順序全部', () => {
    expect(filterRollcall(ROSTER, 'all').map(r => r.student_id)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('unmarked 同時撈出 null 與空字串', () => {
    expect(filterRollcall(ROSTER, 'unmarked').map(r => r.student_id)).toEqual([3, 5])
  })

  it('leave 同時涵蓋病假與事假', () => {
    expect(filterRollcall(ROSTER, 'leave').map(r => r.student_id)).toEqual([2, 6])
  })

  it('單一狀態只回該狀態', () => {
    expect(filterRollcall(ROSTER, '缺席').map(r => r.student_id)).toEqual([4])
  })

  it('未知的篩選鍵回傳全部，不得讓名冊憑空消失', () => {
    expect(filterRollcall(ROSTER, 'nope' as never)).toHaveLength(7)
  })
})

describe('buildSaveEntries（業主裁定 B：只送已點的）', () => {
  it('未點名的列不送出，保持未點名', () => {
    const entries = buildSaveEntries(ROSTER)
    expect(entries.map(e => e.student_id)).toEqual([1, 2, 4, 6, 7])
  })

  it('空備註送 null 而非空字串', () => {
    expect(buildSaveEntries(ROSTER)[0]).toEqual({ student_id: 1, status: '出席', remark: null })
  })

  it('備註原樣保留', () => {
    expect(buildSaveEntries(ROSTER)[1].remark).toBe('家長申請#12')
  })

  it('全班都沒點時回空陣列（呼叫端據此擋掉空送出）', () => {
    expect(buildSaveEntries([{ student_id: 1, status: null }])).toEqual([])
  })
})

describe('parseRollcallRemark', () => {
  it('辨識家長請假自動寫入的備註', () => {
    expect(parseRollcallRemark('家長申請#12')).toEqual({ fromParentLeave: true, text: '' })
  })

  it('家長請假備註後接老師補充時，補充文字要留著', () => {
    expect(parseRollcallRemark('家長申請#12 已聯繫')).toEqual({ fromParentLeave: true, text: '已聯繫' })
  })

  it('老師自己寫的備註原樣回傳', () => {
    expect(parseRollcallRemark('早上有點咳嗽')).toEqual({ fromParentLeave: false, text: '早上有點咳嗽' })
  })

  it('空值不當成家長請假', () => {
    expect(parseRollcallRemark(null)).toEqual({ fromParentLeave: false, text: '' })
  })
})

describe('composeRollcallRemark', () => {
  /**
   * 後端 revert_attendance_for_leave 只刪除備註吻合「家長申請#<id>」的列
   * （is_remark_owned_by_leave）。老師在備註框補字時若把前綴洗掉，家長之後撤銷
   * 請假就再也還原不了那一天——所以前綴必須留著。
   */
  it('家長請假的列補字時保留前綴', () => {
    expect(composeRollcallRemark('家長申請#12', '已聯繫')).toBe('家長申請#12 已聯繫')
  })

  it('家長請假的列清空補字時只留前綴', () => {
    expect(composeRollcallRemark('家長申請#12 已聯繫', '')).toBe('家長申請#12')
  })

  it('老師自己的備註不加任何前綴', () => {
    expect(composeRollcallRemark('早上咳嗽', '已退燒')).toBe('已退燒')
  })

  it('原本沒備註時就是老師打的字', () => {
    expect(composeRollcallRemark(null, '早上咳嗽')).toBe('早上咳嗽')
  })
})

describe('formatLastRecorded', () => {
  it('有時間有記錄者：顯示時刻與姓名', () => {
    expect(formatLastRecorded('2026-09-14T08:41:00', '吳逸倫')).toBe('上次儲存 08:41・吳逸倫')
  })

  it('有時間無記錄者（家長請假自動寫入）只顯示時刻', () => {
    expect(formatLastRecorded('2026-09-14T07:05:00', null)).toBe('上次儲存 07:05')
  })

  it('尚未有任何紀錄時回空字串，讓呼叫端不要畫這一行', () => {
    expect(formatLastRecorded(null, null)).toBe('')
  })

  it('時間字串壞掉時不拋錯也不顯示', () => {
    expect(formatLastRecorded('not-a-date', '吳逸倫')).toBe('')
  })
})

describe('monthlySummaryText', () => {
  it('整月尚未點名時不講 0%，改講尚未點名', () => {
    expect(monthlySummaryText({
      month: 9, school_days_count: 20,
      classroom_record_completion_rate: 0, classroom_attendance_rate: 0,
    })).toBe('9 月共 20 個上課日・尚未點名')
  })

  it('已有紀錄時帶出點名完成率與出席率', () => {
    expect(monthlySummaryText({
      month: 9, school_days_count: 20,
      classroom_record_completion_rate: 65, classroom_attendance_rate: 96.5,
    })).toBe('9 月共 20 個上課日・已點名 65%・出席率 96.5%')
  })

  it('無資料回空字串', () => {
    expect(monthlySummaryText(null)).toBe('')
  })
})

describe('attendanceRateLabel', () => {
  it('該生整月未被點過時顯示「尚無紀錄」而非 0%', () => {
    expect(attendanceRateLabel(0, 0)).toBe('尚無紀錄')
  })

  it('有點名紀錄時顯示百分比', () => {
    expect(attendanceRateLabel(0, 3)).toBe('0%')
    expect(attendanceRateLabel(96.5, 20)).toBe('96.5%')
  })
})
