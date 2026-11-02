import { describe, it, expect } from 'vitest'
import {
  buildBatchEntries,
  fillUnmarked,
  isParentLeaveRemark,
  isRowDirty,
  markAllAbsent,
  matchesRollcallFilter,
  newlyAbsentCount,
  parentLeaveId,
  summarizeRollcall,
  toRollcallRows,
  type RollcallRow,
} from '../rollcallEditor'

const row = (id: number, status: string | null, remark = ''): RollcallRow => ({
  student_id: id,
  student_no: `S${id}`,
  name: `學生${id}`,
  status,
  remark,
})

describe('toRollcallRows', () => {
  it('未點名維持 null，不再預設成出席（舊版開抽屜存檔會把整班未點名寫成出席）', () => {
    const { rows, baseline } = toRollcallRows([
      { student_id: 1, name: 'A', status: null, remark: null },
      { student_id: 2, name: 'B', status: '缺席', remark: '發燒' },
    ])
    expect(rows.map(r => r.status)).toEqual([null, '缺席'])
    expect(rows[0].remark).toBe('')
    expect(baseline.get(1)).toEqual({ status: null, remark: '' })
    expect(baseline.get(2)).toEqual({ status: '缺席', remark: '發燒' })
  })
})

describe('家長請假 remark', () => {
  it('辨識後端寫入的「家長申請#<id>」並取出假單 id', () => {
    expect(isParentLeaveRemark('家長申請#42')).toBe(true)
    expect(parentLeaveId('家長申請#42')).toBe(42)
    expect(isParentLeaveRemark('接送台補登')).toBe(false)
    expect(parentLeaveId('接送台補登')).toBeNull()
    expect(isParentLeaveRemark(null)).toBe(false)
  })
})

describe('summarizeRollcall', () => {
  it('依目前（含未存）狀態計數，病假事假合併為請假', () => {
    const s = summarizeRollcall([row(1, '出席'), row(2, '遲到'), row(3, '缺席'), row(4, '病假'), row(5, '事假'), row(6, null)])
    expect(s).toEqual({ total: 6, present: 1, late: 1, absent: 1, leave: 2, unmarked: 1 })
  })
})

describe('matchesRollcallFilter', () => {
  it('各篩選只留對應狀態', () => {
    const rows = [row(1, '出席'), row(2, '遲到'), row(3, '缺席'), row(4, '病假'), row(5, '事假'), row(6, null)]
    const ids = (f: Parameters<typeof matchesRollcallFilter>[1]) => rows.filter(r => matchesRollcallFilter(r, f)).map(r => r.student_id)
    expect(ids('all')).toEqual([1, 2, 3, 4, 5, 6])
    expect(ids('unmarked')).toEqual([6])
    expect(ids('leave')).toEqual([4, 5])
    expect(ids('缺席')).toEqual([3])
  })
})

describe('dirty 與送出內容', () => {
  it('只送出有改動且已選狀態的學生；備註前後空白不算改動；空備註送 null', () => {
    const { rows, baseline } = toRollcallRows([
      { student_id: 1, name: 'A', status: '出席', remark: null },
      { student_id: 2, name: 'B', status: null, remark: null },
      { student_id: 3, name: 'C', status: '缺席', remark: '發燒' },
      { student_id: 4, name: 'D', status: null, remark: null },
    ])
    rows[1].status = '遲到'
    rows[2].remark = ' 發燒 '
    rows[3].remark = '還沒到'
    expect(isRowDirty(rows[0], baseline.get(1))).toBe(false)
    expect(isRowDirty(rows[1], baseline.get(2))).toBe(true)
    expect(isRowDirty(rows[2], baseline.get(3))).toBe(false)
    // 只寫備註、沒選狀態：算改動（要提示），但無法送出（後端狀態必填）
    expect(isRowDirty(rows[3], baseline.get(4))).toBe(true)
    expect(buildBatchEntries(rows, baseline)).toEqual([
      { student_id: 2, status: '遲到', remark: null },
    ])
  })

  it('newlyAbsentCount 只算「本次轉為缺席」的人（這些家長會收到 LINE 缺席通知）', () => {
    const { rows, baseline } = toRollcallRows([
      { student_id: 1, name: 'A', status: '缺席', remark: null },
      { student_id: 2, name: 'B', status: null, remark: null },
      { student_id: 3, name: 'C', status: '出席', remark: null },
    ])
    rows[1].status = '缺席'
    rows[2].status = '缺席'
    expect(newlyAbsentCount(rows, baseline)).toBe(2)
  })
})

describe('批次動作', () => {
  it('fillUnmarked 只補未點名的人，不覆蓋已點名或請假', () => {
    const rows = [row(1, null), row(2, '病假', '家長申請#9'), row(3, '缺席'), row(4, null)]
    expect(fillUnmarked(rows)).toBe(2)
    expect(rows.map(r => r.status)).toEqual(['出席', '病假', '缺席', '出席'])
  })

  it('markAllAbsent 跳過已請假的學生（含家長假單），避免把請假改成缺席又誤發缺席通知', () => {
    const rows = [row(1, null), row(2, '病假', '家長申請#9'), row(3, '事假', '接送台補登'), row(4, '出席')]
    expect(markAllAbsent(rows)).toBe(2)
    expect(rows.map(r => r.status)).toEqual(['缺席', '病假', '事假', '缺席'])
  })
})

describe('家長假單列被改成非請假', () => {
  it('送出的備註改寫成「原為家長請假（假單 #id）」，家長取消假單時才不會刪掉這筆出席', () => {
    const { rows, baseline } = toRollcallRows([
      { student_id: 1, name: 'A', status: '病假', remark: '家長申請#42' },
      { student_id: 2, name: 'B', status: '病假', remark: '家長申請#43' },
    ])
    rows[0].status = '出席'
    rows[1].status = '事假'
    expect(buildBatchEntries(rows, baseline)).toEqual([
      { student_id: 1, status: '出席', remark: '原為家長請假（假單 #42）' },
      // 仍是請假：保留假單連結
      { student_id: 2, status: '事假', remark: '家長申請#43' },
    ])
  })
})

