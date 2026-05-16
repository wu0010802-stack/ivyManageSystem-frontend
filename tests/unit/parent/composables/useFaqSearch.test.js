import { describe, it, expect } from 'vitest'
import { searchFaq } from '@/parent/composables/useFaqSearch'

const ITEMS = [
  { id: 'a', question: '請假怎麼申請？', keywords: ['請假', '病假'], answer: '請點下方按鈕…' },
  { id: 'b', question: '月費怎麼繳？', keywords: ['繳費', 'ATM'], answer: '請依指定銀行帳號…' },
  { id: 'c', question: '接送時間是幾點？', keywords: ['接送'], answer: '正常班放學時間 16:00' },
  { id: 'd', question: '颱風天會放假嗎？', keywords: ['颱風', '放假'], answer: '依縣市政府公告…' },
]

describe('searchFaq', () => {
  it('空字串回傳空陣列', () => {
    expect(searchFaq(ITEMS, '')).toEqual([])
    expect(searchFaq(ITEMS, '   ')).toEqual([])
  })

  it('完全匹配 question 排第一', () => {
    const r = searchFaq(ITEMS, '請假怎麼申請')
    expect(r[0].id).toBe('a')
  })

  it('單字搜尋（中文逐字配對）', () => {
    const r = searchFaq(ITEMS, '颱')
    expect(r.map(x => x.id)).toContain('d')
  })

  it('keyword 命中加分', () => {
    const r = searchFaq(ITEMS, 'ATM')
    expect(r[0].id).toBe('b')
  })

  it('limit 截斷', () => {
    const r = searchFaq(ITEMS, '請', 1)
    expect(r.length).toBeLessThanOrEqual(1)
  })

  it('完全沒命中回傳空陣列', () => {
    expect(searchFaq(ITEMS, 'xyz123')).toEqual([])
  })
})
