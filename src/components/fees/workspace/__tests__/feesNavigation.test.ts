import { describe, expect, it } from 'vitest'
import {
  FEE_MAIN_WORKSPACES,
  FEE_MATCHING_SOURCES,
  FEE_WORKSPACE_VIEWS,
  LEGACY_FEE_TAB_MAP,
  LEGACY_FEE_WS_VIEW_MAP,
  resolveFeesLocation,
} from '../feesNavigation'

describe('feesNavigation：主導航形狀（2026-09-02 帳單＋對帳合併）', () => {
  it('主導航固定三項（工作台/收款/結算），費用設定不在其中', () => {
    expect(FEE_MAIN_WORKSPACES.map((w) => w.key)).toEqual([
      'workbench',
      'billing',
      'settlement',
    ])
    expect(FEE_MAIN_WORKSPACES.map((w) => w.label)).toEqual(['工作台', '收款', '結算'])
  })

  it('收款次層＝應收帳款（預設）／入帳媒合／退款', () => {
    expect(FEE_WORKSPACE_VIEWS.billing.map((v) => v.key)).toEqual([
      'receivable',
      'matching',
      'refunds',
    ])
    expect(FEE_WORKSPACE_VIEWS.billing.map((v) => v.label)).toEqual([
      '應收帳款',
      '入帳媒合',
      '退款',
    ])
  })

  it('結算與設定次層維持兩項', () => {
    expect(FEE_WORKSPACE_VIEWS.settlement.map((v) => v.key)).toEqual([
      'handover',
      'close',
    ])
    expect(FEE_WORKSPACE_VIEWS.settings.map((v) => v.key)).toEqual([
      'templates',
      'billingCodes',
    ])
  })

  it('入帳媒合來源＝代收明細（預設）＋存摺明細', () => {
    expect(FEE_MATCHING_SOURCES.map((s) => s.key)).toEqual(['collection', 'passbook'])
    expect(FEE_MATCHING_SOURCES[0].label).toContain('代收')
    expect(FEE_MATCHING_SOURCES[1].label).toContain('存摺')
  })

  it('recon 不再是合法工作區', () => {
    expect(FEE_WORKSPACE_VIEWS).not.toHaveProperty('recon')
  })
})

describe('feesNavigation：舊 tab 深連結相容映射（8 個舊 tab 全數涵蓋）', () => {
  const CASES: [string, string, string | null, string | null][] = [
    ['records', 'billing', 'receivable', null],
    ['templates', 'settings', 'templates', null],
    ['refunds', 'billing', 'refunds', null],
    // 舊 bankRecon 深連結＝存摺對帳，落在入帳媒合的存摺來源
    ['bankRecon', 'billing', 'matching', 'passbook'],
    // 預繳已併入應收帳款（月表「預繳」欄）
    ['prepayments', 'billing', 'receivable', null],
    ['cashHandover', 'settlement', 'handover', null],
    ['close', 'settlement', 'close', null],
    ['billingCodes', 'settings', 'billingCodes', null],
  ]

  it.each(CASES)('?tab=%s → ws=%s / view=%s / src=%s', (tab, ws, view, src) => {
    const loc = resolveFeesLocation({ tab })
    expect(loc.ws).toBe(ws)
    expect(loc.view).toBe(view)
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.tab).toBeUndefined()
    expect(loc.normalizedQuery.ws).toBe(ws)
    if (view) expect(loc.normalizedQuery.view).toBe(view)
    if (src) {
      expect(loc.src).toBe(src)
      expect(loc.normalizedQuery.src).toBe(src)
    }
  })

  it('映射表本身涵蓋且僅涵蓋 8 個舊 tab', () => {
    expect(Object.keys(LEGACY_FEE_TAB_MAP).sort()).toEqual(
      [
        'bankRecon',
        'billingCodes',
        'cashHandover',
        'close',
        'prepayments',
        'records',
        'refunds',
        'templates',
      ].sort(),
    )
  })

  it('未知 tab 值退回工作台', () => {
    const loc = resolveFeesLocation({ tab: 'nonsense' })
    expect(loc.ws).toBe('workbench')
    expect(loc.needsNormalize).toBe(true)
  })
})

describe('feesNavigation：舊 ws/view 深連結相容映射（2026-08-25 IA）', () => {
  it('?ws=recon 未指定 view → 收款／入帳媒合（代收來源）', () => {
    const loc = resolveFeesLocation({ ws: 'recon' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('matching')
    expect(loc.src).toBe('collection')
    expect(loc.needsNormalize).toBe(true)
    // 預設來源不寫進網址，避免 URL 抖動
    expect(loc.normalizedQuery.src).toBeUndefined()
  })

  it('?ws=recon&view=collection → 入帳媒合（代收來源）', () => {
    const loc = resolveFeesLocation({ ws: 'recon', view: 'collection' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('matching')
    expect(loc.src).toBe('collection')
  })

  it('?ws=recon&view=passbook → 入帳媒合（存摺來源，寫進網址）', () => {
    const loc = resolveFeesLocation({ ws: 'recon', view: 'passbook' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('matching')
    expect(loc.src).toBe('passbook')
    expect(loc.normalizedQuery.src).toBe('passbook')
  })

  it('?ws=recon&view=billslips → 應收帳款並開啟匯入紀錄抽屜', () => {
    const loc = resolveFeesLocation({ ws: 'recon', view: 'billslips' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('receivable')
    expect(loc.imports).toBe(true)
    expect(loc.normalizedQuery.imports).toBe('1')
  })

  it('?ws=billing&view=records → 應收帳款', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'records' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('receivable')
    expect(loc.needsNormalize).toBe(true)
  })

  it('?ws=billing&view=prepayments → 應收帳款（預繳已併入）', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'prepayments' })
    expect(loc.view).toBe('receivable')
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.view).toBe('receivable')
  })

  it('映射表涵蓋 recon 系列與 billing 舊 view', () => {
    expect(Object.keys(LEGACY_FEE_WS_VIEW_MAP).sort()).toEqual(
      [
        'billing/prepayments',
        'billing/records',
        'recon',
        'recon/billslips',
        'recon/collection',
        'recon/passbook',
      ].sort(),
    )
  })
})

describe('feesNavigation：ws/view 解析', () => {
  it('無 query 時預設工作台', () => {
    const loc = resolveFeesLocation({})
    expect(loc.ws).toBe('workbench')
    expect(loc.view).toBeNull()
    expect(loc.src).toBeNull()
    expect(loc.imports).toBe(false)
  })

  it('合法 ws+view 直接採用且不需正規化', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'refunds' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('refunds')
    expect(loc.needsNormalize).toBe(false)
  })

  it('入帳媒合帶合法 src 不需正規化', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'matching', src: 'passbook' })
    expect(loc.src).toBe('passbook')
    expect(loc.needsNormalize).toBe(false)
  })

  it('入帳媒合的非法 src 修正為代收明細', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'matching', src: 'bogus' })
    expect(loc.src).toBe('collection')
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.src).toBeUndefined()
  })

  it('非入帳媒合檢視上的 src 會被清掉', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'refunds', src: 'passbook' })
    expect(loc.src).toBeNull()
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.src).toBeUndefined()
  })

  it('imports=1 在收款工作區有效', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'receivable', imports: '1' })
    expect(loc.imports).toBe(true)
    expect(loc.needsNormalize).toBe(false)
  })

  it('imports=1 在非收款工作區會被清掉', () => {
    const loc = resolveFeesLocation({ ws: 'settlement', view: 'close', imports: '1' })
    expect(loc.imports).toBe(false)
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.imports).toBeUndefined()
  })

  it('非法 view 修正為該工作區第一個檢視', () => {
    const loc = resolveFeesLocation({ ws: 'settlement', view: 'bogus' })
    expect(loc.view).toBe('handover')
    expect(loc.needsNormalize).toBe(true)
  })

  it('非法 ws 退回工作台', () => {
    const loc = resolveFeesLocation({ ws: 'bogus' })
    expect(loc.ws).toBe('workbench')
    expect(loc.needsNormalize).toBe(true)
  })

  it('費用設定仍可由 ws=settings 直達', () => {
    const loc = resolveFeesLocation({ ws: 'settings' })
    expect(loc.ws).toBe('settings')
    expect(loc.view).toBe('templates')
  })

  it('全域搜尋（?search=）未指定 ws 時導向應收帳款', () => {
    const loc = resolveFeesLocation({ search: '王' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('receivable')
    expect(loc.normalizedQuery.search).toBe('王')
  })

  it('正規化 query 保留無關參數並移除 tab', () => {
    const loc = resolveFeesLocation({ tab: 'records', search: '王', foo: 'bar' })
    expect(loc.normalizedQuery).toEqual({
      search: '王',
      foo: 'bar',
      ws: 'billing',
      view: 'receivable',
    })
  })
})
