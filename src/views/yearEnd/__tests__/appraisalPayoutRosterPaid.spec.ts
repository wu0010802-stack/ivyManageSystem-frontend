import { describe, it, expect } from 'vitest'
import {
  displayTotal,
  importWarningLabels,
  payableAmount,
  payoutWarningLabels,
  rosterPaidHalves,
  rosterPaidNotice,
} from '../appraisalPayoutRosterPaid'

const row = (over: Record<string, unknown> = {}) => ({
  earlier_amount: '6400.00',
  later_amount: '7200.00',
  total_amount: '13600.00',
  earlier_roster_paid: false,
  later_roster_paid: false,
  ...over,
})

describe('rosterPaidHalves', () => {
  it('任一列帶旗標就算該半年已發放（旗標是週期層級，每列相同）', () => {
    expect(rosterPaidHalves([row(), row({ earlier_roster_paid: true })])).toEqual({ earlier: true, later: false })
    expect(rosterPaidHalves([row({ later_roster_paid: true })])).toEqual({ earlier: false, later: true })
  })

  it('沒有資料或舊後端沒回旗標：都視為未發放', () => {
    expect(rosterPaidHalves([])).toEqual({ earlier: false, later: false })
    expect(rosterPaidHalves([{}])).toEqual({ earlier: false, later: false })
  })
})

describe('payableAmount / displayTotal', () => {
  it('沒有旗標時等於後端的 total_amount，顯示字串原樣', () => {
    expect(payableAmount(row())).toBe(13600)
    expect(displayTotal(row())).toBe('13600.00')
  })

  it('上學期已另循名冊發放：只算下學期那半', () => {
    const r = row({ earlier_roster_paid: true })
    expect(payableAmount(r)).toBe(7200)
    expect(displayTotal(r)).toBe('7200')
  })

  it('下學期已發放：只算上學期那半；兩半都已發放為 0', () => {
    expect(payableAmount(row({ later_roster_paid: true }))).toBe(6400)
    expect(payableAmount(row({ earlier_roster_paid: true, later_roster_paid: true }))).toBe(0)
  })
})

describe('rosterPaidNotice', () => {
  it('兩半都沒標記回 null（不顯示提示）', () => {
    expect(rosterPaidNotice({ earlier: false, later: false }, '113上', '113下')).toBeNull()
  })

  it('只標一半：點名該學期，說明不會建立明細', () => {
    const text = rosterPaidNotice({ earlier: true, later: false }, '113上', '113下')
    expect(text).toContain('113上')
    expect(text).not.toContain('113下')
    expect(text).toContain('不會')
  })

  it('兩半都標：兩個學期都點名，並說明這次沒有可建立的發放資料', () => {
    const text = rosterPaidNotice({ earlier: true, later: true }, '113上', '113下')
    expect(text).toContain('113上')
    expect(text).toContain('113下')
    expect(text).toContain('沒有')
  })
})

describe('payoutWarningLabels', () => {
  const base: Record<string, string> = { inactive_employee: '已離職' }

  it('一般代碼查表，未知代碼原樣顯示', () => {
    expect(payoutWarningLabels(['inactive_employee', 'mystery'], base)).toEqual(['已離職', 'mystery'])
  })

  it('appraisal_roster_already_paid:<週期 id> 轉成中文，不露出代碼與 id', () => {
    const [label] = payoutWarningLabels(['appraisal_roster_already_paid:12'], base)
    expect(label).toContain('名冊')
    expect(label).not.toMatch(/appraisal_roster_already_paid|12/)
  })

  it('同一句話不重複（兩半都標記、或每列都帶同一警告時只留一句）', () => {
    expect(
      payoutWarningLabels(
        ['appraisal_roster_already_paid:12', 'appraisal_roster_already_paid:13', 'inactive_employee', 'inactive_employee'],
        base,
      ),
    ).toHaveLength(2)
  })
})

describe('importWarningLabels（年終 Excel 匯入的提醒）', () => {
  const SERVER =
    '113 學年上學期考核名冊已標記發放（appraisal_roster_already_paid:12），本次匯入的對應考核獎金年終仍會再發一次，請確認是否重複'

  it('後端句子拿掉括號內的代碼與週期 id，其餘照舊', () => {
    const [label] = importWarningLabels([SERVER])
    expect(label).toBe('113 學年上學期考核名冊已標記發放，本次匯入的對應考核獎金年終仍會再發一次，請確認是否重複')
    expect(label).not.toMatch(/appraisal_roster_already_paid|12/)
  })

  it('全形與半形括號都處理', () => {
    expect(importWarningLabels(['113 學年下學期名冊已標記發放 (appraisal_roster_already_paid:7)，請確認'])[0]).toBe(
      '113 學年下學期名冊已標記發放，請確認',
    )
  })

  it('整句只剩代碼時改用固定中文說明', () => {
    const [label] = importWarningLabels(['appraisal_roster_already_paid:12'])
    expect(label).toContain('名冊已標記發放')
    expect(label).toContain('年終仍會再發一次')
    expect(label).not.toContain('appraisal_roster_already_paid')
  })

  it('兩個學期各一句保留；完全相同的句子只留一句；其他警告原樣', () => {
    const labels = importWarningLabels([
      SERVER,
      SERVER.replace('上學期', '下學期').replace(':12', ':13'),
      'appraisal_roster_already_paid:99',
      'appraisal_roster_already_paid:98',
      '其他提醒',
    ])
    expect(labels).toHaveLength(4)
    expect(labels).toContain('其他提醒')
  })

  it('沒有警告或舊後端沒回欄位：空陣列', () => {
    expect(importWarningLabels([])).toEqual([])
    expect(importWarningLabels(undefined)).toEqual([])
    expect(importWarningLabels(null)).toEqual([])
  })
})
