/**
 * 學費管理任務導向 IA 的導航純邏輯。
 *
 * 2026-09-02 簡化改版：主導航收斂為三個工作區（工作台／收款／結算），
 * 「費用設定」仍以 ws=settings 存在但改為頁籤列右側入口（不再是獨立的
 * 「返回」模式）。原本平行的「帳單」與「對帳」合併為單一「收款」工作區，
 * 次層由 5 個（帳款／退款／代收明細／存摺明細／發單快照）收成 3 個：
 *
 *   - receivable 應收帳款（原 billing/records，含月表與逐筆兩種檢視模式）
 *   - matching   入帳媒合（原 recon/collection ＋ recon/passbook，以 src 切換來源）
 *   - refunds    退款（原 billing/refunds）
 *
 * 原 recon/billslips（發單快照）不再是次層檢視，改為「匯入紀錄」抽屜
 * （query flag `imports=1`），並在有批次未產單時於應收帳款頂端顯示提示條。
 *
 * 所有狀態仍以 route query 保存（?ws=&view=&src=&imports=），重新整理與
 * 上一頁／下一頁可還原。舊網址（2026-08-25 IA 的 ?ws=recon 系列、更早的
 * ?tab= 系列）全數在此做相容映射，由 StudentFeeView 以 router.replace 正規化。
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export type FeeWorkspaceKey = 'workbench' | 'billing' | 'settlement' | 'settings'

export interface FeeWorkspaceViewDef {
  key: string
  label: string
}

/** 主導航（不含 settings：費用設定走頁籤列右側入口） */
export const FEE_MAIN_WORKSPACES: { key: FeeWorkspaceKey; label: string }[] = [
  { key: 'workbench', label: '工作台' },
  { key: 'billing', label: '收款' },
  { key: 'settlement', label: '結算' },
]

/** 各工作區的次層檢視（第一個為預設）；無次層者為空陣列 */
export const FEE_WORKSPACE_VIEWS: Record<FeeWorkspaceKey, FeeWorkspaceViewDef[]> = {
  workbench: [],
  billing: [
    { key: 'receivable', label: '應收帳款' },
    { key: 'matching', label: '入帳媒合' },
    { key: 'refunds', label: '退款' },
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

/**
 * 入帳媒合的兩個來源（SPEC-016 語意不變，只是從同層檢視降為同頁切換）：
 * 代收明細為對帳主來源（預設），存摺明細為勾稽層。
 */
export const FEE_MATCHING_SOURCES: FeeWorkspaceViewDef[] = [
  { key: 'collection', label: '代收明細' },
  { key: 'passbook', label: '存摺明細' },
]

const DEFAULT_MATCHING_SOURCE = 'collection'

/** 導航目標：工作區＋檢視（＋入帳媒合來源／匯入紀錄抽屜） */
export interface FeeNavTarget {
  ws: FeeWorkspaceKey
  view?: string
  src?: string
  imports?: boolean
}

/** 舊版 ?tab= 值 → 新工作區/檢視 的相容映射（8 個舊 tab 全數涵蓋） */
export const LEGACY_FEE_TAB_MAP: Record<string, FeeNavTarget> = {
  records: { ws: 'billing', view: 'receivable' },
  templates: { ws: 'settings', view: 'templates' },
  refunds: { ws: 'billing', view: 'refunds' },
  // 舊 bankRecon 深連結指的是存摺對帳，現落在入帳媒合的存摺來源
  bankRecon: { ws: 'billing', view: 'matching', src: 'passbook' },
  // 預繳自 2026-08-26 起併入應收帳款（月表「預繳」欄），舊深連結導向應收帳款
  prepayments: { ws: 'billing', view: 'receivable' },
  cashHandover: { ws: 'settlement', view: 'handover' },
  close: { ws: 'settlement', view: 'close' },
  billingCodes: { ws: 'settings', view: 'billingCodes' },
}

/**
 * 2026-08-25 IA 的 ?ws=&view= 值 → 2026-09-02 IA 的相容映射。
 * key 為 `<舊 ws>` 或 `<舊 ws>/<舊 view>`（後者優先）。
 */
export const LEGACY_FEE_WS_VIEW_MAP: Record<string, FeeNavTarget> = {
  recon: { ws: 'billing', view: 'matching', src: 'collection' },
  'recon/collection': { ws: 'billing', view: 'matching', src: 'collection' },
  'recon/passbook': { ws: 'billing', view: 'matching', src: 'passbook' },
  // 發單快照降為「匯入紀錄」抽屜：導向應收帳款並直接開抽屜
  'recon/billslips': { ws: 'billing', view: 'receivable', imports: true },
  'billing/records': { ws: 'billing', view: 'receivable' },
  'billing/prepayments': { ws: 'billing', view: 'receivable' },
}

const WORKSPACE_KEYS = new Set<string>([
  'workbench',
  'billing',
  'settlement',
  'settings',
])

const MATCHING_SOURCE_KEYS = new Set<string>(FEE_MATCHING_SOURCES.map((s) => s.key))

function firstString(raw: LocationQuery[string]): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value ? value : null
}

export interface ResolvedFeesLocation {
  ws: FeeWorkspaceKey
  /** 有次層檢視的工作區必為合法 view；無次層者為 null */
  view: string | null
  /** 入帳媒合的資料來源；非該檢視時為 null */
  src: string | null
  /** 匯入紀錄抽屜是否開啟（只在收款工作區有意義） */
  imports: boolean
  /** query 是否需要 router.replace 正規化（含舊網址映射、非法值修正） */
  needsNormalize: boolean
  /** 正規化後的完整 query（保留 search 等無關參數） */
  normalizedQuery: LocationQueryRaw
}

function resolveView(ws: FeeWorkspaceKey, requested: string | null): string | null {
  const views = FEE_WORKSPACE_VIEWS[ws]
  if (views.length === 0) return null
  if (requested && views.some((v) => v.key === requested)) return requested
  return views[0].key
}

/**
 * 由 route query 解析目前工作區／檢視。
 * 優先序：舊 tab 相容映射 → 舊 ws/view 相容映射 → ws/view 參數
 *         → 全域搜尋（?search= 導向應收帳款）→ 工作台。
 */
export function resolveFeesLocation(query: LocationQuery): ResolvedFeesLocation {
  const rawTab = firstString(query.tab)
  const rawWs = firstString(query.ws)
  const rawView = firstString(query.view)
  const rawSrc = firstString(query.src)
  const rawImports = firstString(query.imports)
  const rawSearch = firstString(query.search)

  let ws: FeeWorkspaceKey
  let requestedView: string | null = rawView
  let requestedSrc: string | null = rawSrc
  let requestedImports = rawImports === '1'

  const legacyWsView = rawWs
    ? (LEGACY_FEE_WS_VIEW_MAP[`${rawWs}/${rawView ?? ''}`] ??
      LEGACY_FEE_WS_VIEW_MAP[rawWs])
    : undefined

  if (rawTab && LEGACY_FEE_TAB_MAP[rawTab]) {
    const target = LEGACY_FEE_TAB_MAP[rawTab]
    ws = target.ws
    requestedView = target.view ?? null
    requestedSrc = target.src ?? null
    requestedImports = target.imports ?? false
  } else if (legacyWsView) {
    ws = legacyWsView.ws
    requestedView = legacyWsView.view ?? null
    requestedSrc = legacyWsView.src ?? null
    requestedImports = legacyWsView.imports ?? requestedImports
  } else if (rawWs && WORKSPACE_KEYS.has(rawWs)) {
    ws = rawWs as FeeWorkspaceKey
  } else if (rawSearch) {
    // 全域搜尋導航（GlobalSearch 帶 ?search=學生姓名）：直達應收帳款
    ws = 'billing'
    requestedView = 'receivable'
  } else {
    ws = 'workbench'
  }

  const view = resolveView(ws, requestedView)

  // src 只在收款／入帳媒合有意義；預設 collection 不寫進網址（避免 URL 抖動）
  const isMatching = ws === 'billing' && view === 'matching'
  const src = isMatching
    ? requestedSrc && MATCHING_SOURCE_KEYS.has(requestedSrc)
      ? requestedSrc
      : DEFAULT_MATCHING_SOURCE
    : null

  // 匯入紀錄抽屜只在收款工作區有意義
  const imports = ws === 'billing' && requestedImports

  const normalizedQuery: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(query)) {
    if (key === 'tab' || key === 'ws' || key === 'view') continue
    if (key === 'src' || key === 'imports') continue
    normalizedQuery[key] = value
  }
  normalizedQuery.ws = ws
  if (view) normalizedQuery.view = view
  if (src && src !== DEFAULT_MATCHING_SOURCE) normalizedQuery.src = src
  if (imports) normalizedQuery.imports = '1'

  const expectedSrc = src && src !== DEFAULT_MATCHING_SOURCE ? src : null
  const needsNormalize =
    rawTab != null ||
    legacyWsView != null ||
    rawWs !== ws ||
    (rawView ?? null) !== view ||
    (rawSrc ?? null) !== expectedSrc ||
    (rawImports ?? null) !== (imports ? '1' : null)

  return { ws, view, src, imports, needsNormalize, normalizedQuery }
}
