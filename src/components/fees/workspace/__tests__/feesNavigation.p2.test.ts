/**
 * 2026-09-07 bug hunt 第二批（P2／P3）：/fees 的網址契約。
 *
 * 1. 映射表用裸 obj[key] 查表會撞到 Object.prototype：?ws=constructor 讓整個
 *    後台崩到「此頁載入失敗」全螢幕錯誤頁（staging 實測，連側欄都不見）。
 * 2. ?search= 是全域搜尋帶進來的一次性上下文，卻永久黏在網址上：搜尋「王」
 *    後收款頁 170 列剩 11 列，切到工作台再切回收款仍是 11 列。
 * 3. 應收帳款的「月表／逐筆」切換完全不進 query，重新整理／分享網址／上一頁
 *    都回不到逐筆，與同層的 ?src= 行為互相矛盾。
 */
import { describe, expect, it } from 'vitest'
import { resolveFeesLocation } from '../feesNavigation'

describe('原型鏈污染：非法 ws／tab／view 不得讓頁面崩潰', () => {
  const HOSTILE = [
    'constructor',
    'toString',
    'hasOwnProperty',
    'valueOf',
    '__proto__',
    'isPrototypeOf',
  ]

  it.each(HOSTILE)('?ws=%s 退回工作台而不是拋錯', (value) => {
    expect(() => resolveFeesLocation({ ws: value })).not.toThrow()
    const loc = resolveFeesLocation({ ws: value })
    expect(loc.ws).toBe('workbench')
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.ws).toBe('workbench')
  })

  it.each(HOSTILE)('?tab=%s 退回工作台而不是拋錯', (value) => {
    expect(() => resolveFeesLocation({ tab: value })).not.toThrow()
    expect(resolveFeesLocation({ tab: value }).ws).toBe('workbench')
  })

  it.each(HOSTILE)('?ws=recon&view=%s 不得拋錯', (value) => {
    expect(() => resolveFeesLocation({ ws: 'recon', view: value })).not.toThrow()
  })

  it('合法的舊網址映射沒有被守衛擋掉', () => {
    expect(resolveFeesLocation({ tab: 'records' })).toMatchObject({
      ws: 'billing',
      view: 'receivable',
    })
    expect(resolveFeesLocation({ ws: 'recon', view: 'passbook' })).toMatchObject({
      ws: 'billing',
      view: 'matching',
      src: 'passbook',
    })
  })
})

describe('應收帳款檢視模式（月表／逐筆）進 query', () => {
  it('預設是月表，且不寫進網址（避免 URL 抖動）', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'receivable' })
    expect(loc.mode).toBe('statement')
    expect(loc.normalizedQuery.mode).toBeUndefined()
    expect(loc.needsNormalize).toBe(false)
  })

  it('?mode=list 還原逐筆（重新整理／分享網址都回得來）', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'receivable', mode: 'list' })
    expect(loc.mode).toBe('list')
    expect(loc.normalizedQuery.mode).toBe('list')
    expect(loc.needsNormalize).toBe(false)
  })

  it('非法 mode 退回月表並正規化', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'receivable', mode: 'bogus' })
    expect(loc.mode).toBe('statement')
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.mode).toBeUndefined()
  })

  it('mode 只在應收帳款有意義，其他檢視一律清掉', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'matching', mode: 'list' })
    expect(loc.mode).toBeNull()
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.mode).toBeUndefined()
  })

  it('帶 ?search= 進場時直接落地逐筆（全域搜尋的既有行為）', () => {
    const loc = resolveFeesLocation({ search: '王小明' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('receivable')
    expect(loc.mode).toBe('list')
  })
})
