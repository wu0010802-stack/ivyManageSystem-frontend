/**
 * 學費管理任務導向 IA 的導航純邏輯（2026-08-25 UI/UX 改版）。
 *
 * 主導航固定四個工作區（工作台/帳單/對帳/結算），「費用設定」由 PageHeader
 * 右上角進入（ws=settings，不佔主導航）。工作區與次層檢視全部以 route query
 * （?ws=&view=）保存，重新整理與上一頁/下一頁可還原。
 *
 * 舊版 8 個同層 tab 的深連結（?tab=records 等）在此做相容映射，
 * 由 StudentFeeView 以 router.replace 正規化，不讓既有網址失效。
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export type FeeWorkspaceKey = 'workbench' | 'billing' | 'recon' | 'settlement' | 'settings'

export interface FeeWorkspaceViewDef {
  key: string
  label: string
}

/** 主導航（不含 settings：費用設定走 header 入口） */
export const FEE_MAIN_WORKSPACES: { key: FeeWorkspaceKey; label: string }[] = [
  { key: 'workbench', label: '工作台' },
  { key: 'billing', label: '帳單' },
  { key: 'recon', label: '對帳' },
  { key: 'settlement', label: '結算' },
]

/** 各工作區的次層檢視（第一個為預設）；無次層者為空陣列 */
export const FEE_WORKSPACE_VIEWS: Record<FeeWorkspaceKey, FeeWorkspaceViewDef[]> = {
  workbench: [],
  billing: [
    { key: 'records', label: '帳款' },
    { key: 'refunds', label: '退款' },
  ],
  // SPEC-016：代收明細為對帳主來源（預設），存摺明細降為勾稽層，
  // 發單快照提供應收母體（誰該繳而沒繳）
  recon: [
    { key: 'collection', label: '代收明細' },
    { key: 'passbook', label: '存摺明細' },
    { key: 'billslips', label: '發單與未繳' },
  ],
  settlement: [
    { key: 'handover', label: '每日交接' },
    { key: 'close', label: '月結' },
  ],
  settings: [
    { key: 'templates', label: '費用範本' },
    { key: 'billingCodes', label: '銷帳碼' },
  ],
}

/** 舊版 ?tab= 值 → 新工作區/檢視 的相容映射（8 個舊 tab 全數涵蓋） */
export const LEGACY_FEE_TAB_MAP: Record<string, { ws: FeeWorkspaceKey; view?: string }> = {
  records: { ws: 'billing', view: 'records' },
  templates: { ws: 'settings', view: 'templates' },
  refunds: { ws: 'billing', view: 'refunds' },
  // 舊 bankRecon 深連結指的是存摺對帳，SPEC-016 後落在存摺次層
  bankRecon: { ws: 'recon', view: 'passbook' },
  // 預繳自 2026-08-26 起併入帳款（彙總繳費表「預繳」欄），舊深連結導向帳款
  prepayments: { ws: 'billing', view: 'records' },
  cashHandover: { ws: 'settlement', view: 'handover' },
  close: { ws: 'settlement', view: 'close' },
  billingCodes: { ws: 'settings', view: 'billingCodes' },
}

const WORKSPACE_KEYS = new Set<string>([
  'workbench',
  'billing',
  'recon',
  'settlement',
  'settings',
])

function firstString(raw: LocationQuery[string]): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value ? value : null
}

export interface ResolvedFeesLocation {
  ws: FeeWorkspaceKey
  /** 有次層檢視的工作區必為合法 view；無次層者為 null */
  view: string | null
  /** query 是否需要 router.replace 正規化（含舊 tab 映射、非法值修正） */
  needsNormalize: boolean
  /** 正規化後的完整 query（保留 search 等無關參數、移除 tab） */
  normalizedQuery: LocationQueryRaw
}

function resolveView(ws: FeeWorkspaceKey, requested: string | null): string | null {
  const views = FEE_WORKSPACE_VIEWS[ws]
  if (views.length === 0) return null
  if (requested && views.some((v) => v.key === requested)) return requested
  return views[0].key
}

/**
 * 由 route query 解析目前工作區/檢視。
 * 優先序：舊 tab 相容映射 → ws/view 參數 → 全域搜尋（?search= 導向帳款）→ 工作台。
 */
export function resolveFeesLocation(query: LocationQuery): ResolvedFeesLocation {
  const rawTab = firstString(query.tab)
  const rawWs = firstString(query.ws)
  const rawView = firstString(query.view)
  const rawSearch = firstString(query.search)

  let ws: FeeWorkspaceKey
  let requestedView: string | null = rawView

  if (rawTab && LEGACY_FEE_TAB_MAP[rawTab]) {
    ws = LEGACY_FEE_TAB_MAP[rawTab].ws
    requestedView = LEGACY_FEE_TAB_MAP[rawTab].view ?? null
  } else if (rawWs && WORKSPACE_KEYS.has(rawWs)) {
    ws = rawWs as FeeWorkspaceKey
  } else if (rawSearch) {
    // 全域搜尋導航（GlobalSearch 帶 ?search=學生姓名）：直達帳款清單
    ws = 'billing'
    requestedView = 'records'
  } else {
    ws = 'workbench'
  }

  const view = resolveView(ws, requestedView)

  const normalizedQuery: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(query)) {
    if (key === 'tab' || key === 'ws' || key === 'view') continue
    normalizedQuery[key] = value
  }
  normalizedQuery.ws = ws
  if (view) normalizedQuery.view = view

  const needsNormalize =
    rawTab != null || rawWs !== ws || (rawView ?? null) !== view

  return { ws, view, needsNormalize, normalizedQuery }
}
