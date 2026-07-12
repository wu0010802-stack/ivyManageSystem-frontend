// 附近幼兒園類型分類與色票：同時供 RecruitmentAddressHeatmap.vue 的地圖引擎
// （marker 上色）與 RecruitmentNearbySchoolList.vue（清單徽章/圖例）使用，
// 抽成共用模組避免兩處色票定義漂移。
// 2026-07-12 拆分自 RecruitmentAddressHeatmap.vue，行為零改動（純搬移）。
import type { NearbySchool } from '@/types/recruitmentHeatmap'

// ── 幼兒園類型色票 ──
export const SCHOOL_TYPE_STYLES = {
  '常春藤': { fill: '#0f7b52', stroke: '#065f40', label: '常春藤' },
  '公立':   { fill: '#eab308', stroke: '#ca8a04', label: '公立' },
  '非營利': { fill: '#7c3aed', stroke: '#6d28d9', label: '非營利' },
  '準公共': { fill: '#d97706', stroke: '#b45309', label: '準公共' },
  '私立':   { fill: '#2563eb', stroke: '#1d4ed8', label: '私立' },
}
export const DEFAULT_SCHOOL_STYLE = { fill: '#64748b', stroke: '#475569', label: '其他' }

export const getSchoolTypeStyle = (type: string | null | undefined) =>
  SCHOOL_TYPE_STYLES[type as keyof typeof SCHOOL_TYPE_STYLES] ?? DEFAULT_SCHOOL_STYLE

// ── 常春藤系列學校識別（最高優先） ──
// 含「常春藤」或指定別名（如明華）的學校皆歸入此類
const IVY_SCHOOL_KEYWORDS = ['常春藤']
const IVY_SCHOOL_ALIASES  = ['明華幼兒園']

const _isIvySchool = (name: unknown): boolean => {
  if (!name) return false
  const n = String(name).replace(/[\s　]/g, '')
  if (IVY_SCHOOL_KEYWORDS.some((kw) => n.includes(kw))) return true
  if (IVY_SCHOOL_ALIASES.some((alias) => n.includes(alias.replace(/[\s　]/g, '')))) return true
  return false
}

/**
 * 從 API 回傳的 school 物件直接取得分類標籤（同步、無 async）。
 * 優先順序：常春藤系列 > 準公共 > school_type（公立/私立/非營利）
 */
export const getSchoolType = (school: NearbySchool | null | undefined): string | null => {
  if (!school) return null
  if (_isIvySchool(school.name)) return '常春藤'
  if (school.pre_public_type) return '準公共'
  return school.school_type || null
}
