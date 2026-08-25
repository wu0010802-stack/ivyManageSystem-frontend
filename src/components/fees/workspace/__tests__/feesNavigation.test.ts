import { describe, expect, it } from 'vitest'
import {
  FEE_MAIN_WORKSPACES,
  FEE_WORKSPACE_VIEWS,
  LEGACY_FEE_TAB_MAP,
  resolveFeesLocation,
} from '../feesNavigation'

describe('feesNavigation：主導航形狀', () => {
  it('主導航固定四項（工作台/帳單/對帳/結算），費用設定不在其中', () => {
    expect(FEE_MAIN_WORKSPACES.map((w) => w.key)).toEqual([
      'workbench',
      'billing',
      'recon',
      'settlement',
    ])
    expect(FEE_MAIN_WORKSPACES.map((w) => w.label)).toEqual([
      '工作台',
      '帳單',
      '對帳',
      '結算',
    ])
  })

  it('次層檢視定義完整（帳單三項、結算兩項、設定兩項）', () => {
    expect(FEE_WORKSPACE_VIEWS.billing.map((v) => v.key)).toEqual([
      'records',
      'prepayments',
      'refunds',
    ])
    expect(FEE_WORKSPACE_VIEWS.settlement.map((v) => v.key)).toEqual([
      'handover',
      'close',
    ])
    expect(FEE_WORKSPACE_VIEWS.settings.map((v) => v.key)).toEqual([
      'templates',
      'billingCodes',
    ])
  })
})

describe('feesNavigation：舊 tab 深連結相容映射（8 個舊 tab 全數涵蓋）', () => {
  const CASES: [string, string, string | null][] = [
    ['records', 'billing', 'records'],
    ['templates', 'settings', 'templates'],
    ['refunds', 'billing', 'refunds'],
    ['bankRecon', 'recon', null],
    ['prepayments', 'billing', 'prepayments'],
    ['cashHandover', 'settlement', 'handover'],
    ['close', 'settlement', 'close'],
    ['billingCodes', 'settings', 'billingCodes'],
  ]

  it.each(CASES)('?tab=%s → ws=%s / view=%s', (tab, ws, view) => {
    const loc = resolveFeesLocation({ tab })
    expect(loc.ws).toBe(ws)
    expect(loc.view).toBe(view)
    expect(loc.needsNormalize).toBe(true)
    expect(loc.normalizedQuery.tab).toBeUndefined()
    expect(loc.normalizedQuery.ws).toBe(ws)
    if (view) expect(loc.normalizedQuery.view).toBe(view)
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

describe('feesNavigation：ws/view 解析', () => {
  it('無 query 時預設工作台', () => {
    const loc = resolveFeesLocation({})
    expect(loc.ws).toBe('workbench')
    expect(loc.view).toBeNull()
  })

  it('合法 ws+view 直接採用且不需正規化', () => {
    const loc = resolveFeesLocation({ ws: 'billing', view: 'refunds' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('refunds')
    expect(loc.needsNormalize).toBe(false)
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

  it('全域搜尋（?search=）未指定 ws 時導向帳款', () => {
    const loc = resolveFeesLocation({ search: '王' })
    expect(loc.ws).toBe('billing')
    expect(loc.view).toBe('records')
    expect(loc.normalizedQuery.search).toBe('王')
  })

  it('正規化 query 保留無關參數並移除 tab', () => {
    const loc = resolveFeesLocation({ tab: 'records', search: '王', foo: 'bar' })
    expect(loc.normalizedQuery).toEqual({
      search: '王',
      foo: 'bar',
      ws: 'billing',
      view: 'records',
    })
  })
})
