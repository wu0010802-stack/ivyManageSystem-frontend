// 附近幼兒園類型分類與色票：同時供 RecruitmentAddressHeatmap.vue 的地圖引擎
// （marker 上色）與 RecruitmentNearbySchoolList.vue（清單徽章/圖例）使用，
// 抽成共用模組避免兩處色票定義漂移。
// 2026-07-12 拆分自 RecruitmentAddressHeatmap.vue，行為零改動（純搬移）。
//
// ── 多租戶（4d/fb）──────────────────────────────────────────────────────────
// 分類的**內部 key** 由品牌字面 `'常春藤'` 改為穩定內部值 `OWN_BRAND = 'own_brand'`。
// 理由：這個 key 同時是色票查表鍵、地圖 marker 分組鍵與圖例 key；用品牌字面當 key，
// 第二間園所的地圖上會出現一個叫「常春藤」的圖例，而且改品牌名等於改資料結構。
// **顯示文字**改讀 `getBranding().short_name`，**識別關鍵字/別名**改讀
// `school_keywords` / `school_aliases`（per-tenant，來源 system_configs `brand.*`）。
//
// ⚠ 語意提醒（open question，fb §9-4）：per-tenant 化後各租戶只認自己的 keywords。
// 若業主要「全平台旗下分校在所有租戶的地圖上都染同色」（連鎖視角），keywords 應改為
// platform 級清單而非 per-tenant——那會改變本檔的資料來源，不是改這裡的邏輯。
import { getBranding } from '@/composables/useTenantBranding'
import type { NearbySchool } from '@/types/recruitmentHeatmap'

/** 「自家品牌校」的穩定內部分類 key。**不是**顯示文字，顯示文字用 `short_name`。 */
export const OWN_BRAND = 'own_brand'

export interface SchoolTypeStyle {
  fill: string
  stroke: string
  label: string
}

/** 自家品牌以外的固定類型（來源為政府登錄資料的既有字面，非品牌，不 per-tenant）。 */
const STATIC_SCHOOL_TYPE_STYLES: Record<string, SchoolTypeStyle> = {
  '公立': { fill: '#eab308', stroke: '#ca8a04', label: '公立' },
  '非營利': { fill: '#7c3aed', stroke: '#6d28d9', label: '非營利' },
  '準公共': { fill: '#d97706', stroke: '#b45309', label: '準公共' },
  '私立': { fill: '#2563eb', stroke: '#1d4ed8', label: '私立' },
}

/** 自家品牌校的色票（綠）。label 為 per-tenant 短名。 */
export const OWN_BRAND_FILL = '#0f7b52'
const OWN_BRAND_STROKE = '#065f40'

export const DEFAULT_SCHOOL_STYLE: SchoolTypeStyle = { fill: '#64748b', stroke: '#475569', label: '其他' }

/**
 * 類型 → 色票的完整對照（自家品牌排第一，維持既有圖例順序）。
 *
 * 這是**函式**而非常數：`label` 取自品牌，品牌是 runtime 才知道的。呼叫端若要在
 * template 迭代，請包 `computed(() => getSchoolTypeStyles())` 以保持響應。
 */
export function getSchoolTypeStyles(): Record<string, SchoolTypeStyle> {
  return {
    [OWN_BRAND]: { fill: OWN_BRAND_FILL, stroke: OWN_BRAND_STROKE, label: getBranding().short_name },
    ...STATIC_SCHOOL_TYPE_STYLES,
  }
}

export const getSchoolTypeStyle = (type: string | null | undefined): SchoolTypeStyle =>
  (type ? getSchoolTypeStyles()[type] : undefined) ?? DEFAULT_SCHOOL_STYLE

// ── 自家品牌系列學校識別（最高優先） ──
// 含 school_keywords 任一關鍵字或 school_aliases 任一別名的學校皆歸入此類。
const _isOwnBrandSchool = (name: unknown): boolean => {
  if (!name) return false
  const n = String(name).replace(/[\s　]/g, '')
  const { school_keywords, school_aliases } = getBranding()
  if (school_keywords.some((kw) => kw && n.includes(kw.replace(/[\s　]/g, '')))) return true
  if (school_aliases.some((alias) => alias && n.includes(alias.replace(/[\s　]/g, '')))) return true
  return false
}

/**
 * 從 API 回傳的 school 物件直接取得分類 key（同步、無 async）。
 * 優先順序：自家品牌系列 > 準公共 > school_type（公立/私立/非營利）
 *
 * ⚠ 回傳的是**內部 key**（`own_brand`），不是顯示文字。要顯示請走
 * `getSchoolTypeStyle(...).label`。
 */
export const getSchoolType = (school: NearbySchool | null | undefined): string | null => {
  if (!school) return null
  if (_isOwnBrandSchool(school.name)) return OWN_BRAND
  if (school.pre_public_type) return '準公共'
  return school.school_type || null
}
