// 招生生活圈熱點地圖（RecruitmentAddressHeatmap.vue 與其拆出的子元件 / composable）共用型別。
// 2026-07-12 拆分自 RecruitmentAddressHeatmap.vue，行為零改動（純搬移）。

export interface NearbySchool {
  name?: string
  place_id?: string
  lat?: number
  lng?: number
  distance_km?: number
  formatted_address?: string
  school_type?: string
  pre_public_type?: string
  owner_name?: string | null
  phone?: string | null
  approved_capacity?: number | null
  monthly_fee?: number | null
  has_penalty?: boolean
  approved_date?: string | null
  total_area_sqm?: number | null
  indoor_area_sqm?: number | null
  outdoor_area_sqm?: number | null
  floor?: number | null
  website?: string | null
  shuttle?: string | null
  has_after_school?: boolean
  is_active?: boolean
  penalties?: unknown[]
  rating?: number | null
  user_rating_count?: number | null
  [key: string]: unknown
}

export interface GovData {
  name?: string
  principal?: string | null
  phone?: string | null
  address?: string | null
  kind?: string | null
  capacity?: number | null
  monthlyFee?: number | null
  hasPenalty?: boolean
  approvedDate?: string | null
  totalAreaSqm?: number | null
  indoorAreaSqm?: number | null
  outdoorAreaSqm?: number | null
  floor?: number | null
  website?: string | null
  prePublicType?: string | null
  shuttle?: string | null
  afterSchool?: boolean
  status?: string
  penalties?: unknown[]
}
