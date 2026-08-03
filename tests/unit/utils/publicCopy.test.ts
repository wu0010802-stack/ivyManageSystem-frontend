import { describe, it, expect } from 'vitest'
import {
  parseBoldSegments,
  noticeLinesToItems,
  noticeItemsToLines,
} from '@/utils/publicCopy'

describe('parseBoldSegments', () => {
  it('無標記時回傳單一非粗體 segment', () => {
    expect(parseBoldSegments('人數未達最低標準時，這門課會取消開課。')).toEqual([
      { text: '人數未達最低標準時，這門課會取消開課。', bold: false },
    ])
  })

  it('解析前中後三段', () => {
    expect(parseBoldSegments('本學期才藝課線上報名，**額滿為止**。')).toEqual([
      { text: '本學期才藝課線上報名，', bold: false },
      { text: '額滿為止', bold: true },
      { text: '。', bold: false },
    ])
  })

  it('支援同條多個粗體', () => {
    expect(parseBoldSegments('**甲**與**乙**')).toEqual([
      { text: '甲', bold: true },
      { text: '與', bold: false },
      { text: '乙', bold: true },
    ])
  })

  it('未閉合的星號照原文顯示，不誤判為粗體', () => {
    expect(parseBoldSegments('注意 **重點')).toEqual([
      { text: '注意 **重點', bold: false },
    ])
  })

  it('空字串回傳單一空 segment（模板 v-for 不炸）', () => {
    expect(parseBoldSegments('')).toEqual([{ text: '', bold: false }])
  })
})

describe('noticeLinesToItems / noticeItemsToLines', () => {
  it('一行一條、去前後空白、跳過空行', () => {
    expect(noticeLinesToItems('  額滿為止 \n\n 取消開課\n   ')).toEqual([
      '額滿為止',
      '取消開課',
    ])
  })

  it('全空回 null（後端 NULL=用預設文案）', () => {
    expect(noticeLinesToItems('')).toBeNull()
    expect(noticeLinesToItems('  \n  ')).toBeNull()
  })

  it('陣列與 textarea 字串互轉往返一致', () => {
    const items = ['額滿為止', '**娃娃車**請家長接送']
    expect(noticeLinesToItems(noticeItemsToLines(items))).toEqual(items)
    expect(noticeItemsToLines(null)).toBe('')
    expect(noticeItemsToLines(undefined)).toBe('')
  })
})
