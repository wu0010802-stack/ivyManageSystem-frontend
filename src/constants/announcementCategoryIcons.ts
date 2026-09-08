// 公告分類圖示挑選清單。
//
// 後端 AnnouncementCategory.icon 存的是 Material Symbols icon 名稱字串
// （見 alembic/versions/20260908_anncat01_announcement_categories.py 預設值
// "campaign"），但後台 admin console 未載入 Material Symbols 字型（該字型僅
// src/parent/** 家長端自架子集，見 scripts/gen-parent-icon-font.mjs）。專案內
// 已 grep 過現有圖示元件/清單（M3Icon.vue 為家長端專用、無 admin 版 icon picker），
// 故此處新增一份最小策展清單：value 為存進後端的 Material Symbols 名稱（後續如
// 家長/教師端要顯示分類圖示，沿用同一批合法名稱即可），preview 借用既有
// @element-plus/icons-vue（admin 全站慣用）供後台挑選時視覺參考，不代表最終渲染。
import type { Component } from 'vue'
import {
  Promotion,
  Trophy,
  Calendar,
  InfoFilled,
  WarningFilled,
  WarnTriangleFilled,
  Food,
  FirstAidKit,
  Van,
  User,
  Star,
  Bell,
  Clock,
  School,
  Flag,
  ChatRound,
} from '@element-plus/icons-vue'

export interface AnnouncementCategoryIconOption {
  /** Material Symbols 圖示名稱（存進 AnnouncementCategory.icon） */
  value: string
  label: string
  /** 後台挑選 UI 用的視覺參考圖示（Element Plus，非最終渲染依據） */
  preview: Component
}

export const ANNOUNCEMENT_CATEGORY_ICON_OPTIONS: AnnouncementCategoryIconOption[] = [
  { value: 'campaign', label: '宣傳', preview: Promotion },
  { value: 'celebration', label: '慶祝', preview: Trophy },
  { value: 'event', label: '活動', preview: Calendar },
  { value: 'info', label: '資訊', preview: InfoFilled },
  { value: 'warning', label: '警示', preview: WarningFilled },
  { value: 'priority_high', label: '緊急', preview: WarnTriangleFilled },
  { value: 'restaurant', label: '餐點', preview: Food },
  { value: 'medical_services', label: '健康', preview: FirstAidKit },
  { value: 'directions_bus', label: '交通', preview: Van },
  { value: 'groups', label: '人員', preview: User },
  { value: 'star', label: '重點', preview: Star },
  { value: 'notifications', label: '通知', preview: Bell },
  { value: 'schedule', label: '行事曆', preview: Clock },
  { value: 'school', label: '校務', preview: School },
  { value: 'flag', label: '標記', preview: Flag },
  { value: 'forum', label: '溝通', preview: ChatRound },
]

/** 後端 migration 的預設分類圖示（見 _DEFAULT_CATEGORY_ICON）；找不到自訂圖示時的 fallback。 */
export const DEFAULT_ANNOUNCEMENT_CATEGORY_ICON = 'campaign'

const ICON_PREVIEW_MAP: Record<string, Component> = Object.fromEntries(
  ANNOUNCEMENT_CATEGORY_ICON_OPTIONS.map((o) => [o.value, o.preview]),
)

/** 依 icon 字串取後台預覽用元件；不在策展清單內（例如舊資料/其他來源）一律 fallback InfoFilled。 */
export const previewIconFor = (icon: string | null | undefined): Component =>
  (icon && ICON_PREVIEW_MAP[icon]) || InfoFilled
