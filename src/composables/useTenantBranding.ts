/**
 * 品牌字串的 runtime 單一事實來源（L2 層，fb 叢集擁有）。
 *
 * 三層品牌注入中的第二層：
 *   L1 = HTML head / PWA manifest（LINE 爬蟲不執行 JS）→ nginx `sub_filter` 注入 `{{TB_*}}` token
 *   L2 = 執行中 SPA 的字串 → **本檔**（`GET /api/public/tenant-meta` + 逐欄 fallback）
 *   L3 = 靜態圖像 → URL 不變 + nginx per-tenant overlay（`/brand/<slug>/...`）
 *
 * 為什麼不用 `VITE_*` build 變數：一個 image 服務多租戶，任何 per-tenant 值都不能烤進 bundle。
 *
 * 灰度不變式：`BRANDING_DEFAULTS` 逐字等於改造前的硬編字面，且 `VITE_TENANT_META_ENABLED`
 * 未開時完全不打網路 → 單租戶環境的畫面輸出與改造前相同。
 */

import { readonly, shallowRef, type DeepReadonly, type ShallowRef } from 'vue'
import {
  fetchTenantMeta,
  isTenantMetaEnabled,
  TENANT_META_DISABLED,
  TenantMetaError,
  type TenantMeta,
} from '@/api/tenantMeta'
import { tenantSlugOrPlaceholder } from '@/utils/tenant'
// 三態遮罩（CT-F-01）：與 fc 的 boot 檢查、兩個 axios interceptor 共用**同一款畫面**
// （CT-F-08）。fb 刻意不自建第二款——三種長相不同的「無法識別園所」是使用者的災難。
import { showTenantBlocked } from '@/utils/tenantBlocked'

export interface TenantBrandingManifest {
  name: string
  short_name: string
  description: string
}

/** `TenantMeta` 的「全欄位皆有值」版本。元件一律讀這個型別，不必到處寫 `?.` 與 `??`。 */
export interface TenantBranding {
  slug: string
  school_name: string
  org_name: string
  /** 機構英文銜（公開頁 footer）。與 `school_name_en` 是**不同字串**，勿合併。 */
  org_name_en: string
  /** 園所英文名（公開頁 header 第三行）。 */
  school_name_en: string
  org_prefix: string
  short_name: string
  titles: {
    admin: string
    portal: string
    public: string
    parent: string
    parent_short: string
  }
  /** 三份 PWA manifest 的 name/short_name/description。**與 `titles.*` 是不同字串**（CT-F-02）。 */
  manifest: {
    admin: TenantBrandingManifest
    parent: TenantBrandingManifest
    public: TenantBrandingManifest
  }
  logo_url: string
  theme: { admin_primary: string; parent_primary: string }
  contact: { campus_label: string; address: string; phone: string; phone_display: string }
  map: { lat: number; lng: number }
  share: {
    site_name: string
    og_title: string
    og_description: string
    meta_description: string
    poster_alt: string
    share_text: string
  }
  school_keywords: string[]
  school_aliases: string[]
  liff_id: string
  line_bot_friend_url: string
  public_site_origin: string
}

/**
 * 預設品牌 = **改造前的現行字面**（default tenant 義華 / 常春藤）。
 *
 * ⚠ 這裡的每一個值都同時是「品牌 API 缺欄時的 fallback」與「既有測試的期望值」。
 * 與 `branding/tenants.json` 的 default 條目有 parity 測試把關
 * （`tests/unit/branding/brandingParity.spec.ts`）——改一邊必須改另一邊。
 *
 * `public.webmanifest` 的 name 是「常春藤公開報名」，與 `titles.public`（常春藤才藝報名）
 * 是**不同字串**；`share.og_title`（常春藤教育機構｜課後才藝線上報名）又是第三個字串。
 * 三者刻意不合併（CT-F-02）。
 */
export const BRANDING_DEFAULTS: TenantBranding = Object.freeze({
  slug: 'yihua',
  school_name: '義華幼兒園',
  org_name: '常春藤教育機構',
  // ⚠ 兩個英文名是**不同字面**，來源不同行：
  //   footer（ActivityPublicView.vue:600）「常春藤教育機構 Ivy Educational Institution © …」
  //   header（同檔 :76 / QueryView :26）第三行「Ivy Kindergarten」
  // 合併成一欄會讓 footer 或 header 其中一邊改字，破壞灰度不變式。
  org_name_en: 'Ivy Educational Institution',
  school_name_en: 'Ivy Kindergarten',
  org_prefix: '高雄市私立',
  short_name: '常春藤',
  titles: Object.freeze({
    admin: '常春藤管理系統',
    portal: '常春藤教師入口',
    public: '常春藤才藝報名',
    parent: '常春藤家長 App',
    parent_short: '常春藤家長',
  }),
  manifest: Object.freeze({
    admin: Object.freeze({
      name: '常春藤管理系統',
      short_name: '常春藤管理',
      description: '常春藤教育機構管理與教師入口系統',
    }),
    parent: Object.freeze({
      name: '常春藤家長 App',
      short_name: '家長 App',
      description: '常春藤教育機構家長端',
    }),
    public: Object.freeze({
      name: '常春藤公開報名',
      short_name: '公開報名',
      description: '常春藤教育機構公開活動報名',
    }),
  }),
  logo_url: '/LOGO.png',
  theme: Object.freeze({ admin_primary: '#4f46e5', parent_primary: '#0d9053' }),
  // ⚠ 2026-08 事故修復：這裡**刻意不放**義華的真實地址/電話。
  // `contact.*` 是 `normalizeBranding()` 逐欄 fallback 的對象（見下方），若這裡放
  // 另一間真實園所的真實聯絡資訊，任何新租戶只要忘記在總部「基本資料」/「品牌設定」
  // 頁填地址電話，公開頁的「聯絡主辦單位」就會**借用義華的真實 PII**（renwu 分校
  // 曾實際發生：訪客看到的校名/地址/電話全是義華的）——`ContactInquiryModal.vue`
  // 原本設計是「缺值就隱藏該列」（`v-if="branding.contact.campus_label"`），但因為
  // fallback 永遠給非空字面值，這個 `v-if` 事實上從未真正隱藏過任何一列。
  // 留空字串才能讓 `v-if` 依原設計生效；單租戶灰度模式（未打 tenant-meta API）下
  // 因此會直接隱藏這幾列，而不是顯示假資料——這比借用別間學校的身分安全得多。
  contact: Object.freeze({
    campus_label: '',
    address: '',
    phone: '',
    phone_display: '',
  }),
  // 招生地圖預設中心；原 src/constants/recruitment.ts 的 FALLBACK_SCHOOL_LAT/LNG
  map: Object.freeze({ lat: 22.642, lng: 120.3243 }),
  share: Object.freeze({
    site_name: '常春藤教育機構',
    og_title: '常春藤教育機構｜課後才藝線上報名',
    og_description: '2～5 歲課後才藝課線上報名，額滿為止。手機點開就能填，幾分鐘完成。',
    meta_description:
      '常春藤教育機構課後才藝課線上報名，2～5 歲適齡課程，額滿為止。手機點開就能填，報名後可隨時查詢或修改。',
    poster_alt: '常春藤教育機構課後才藝課程海報',
    share_text: '常春藤教育機構才藝報名海報',
  }),
  school_keywords: Object.freeze(['常春藤']) as unknown as string[],
  school_aliases: Object.freeze(['明華幼兒園']) as unknown as string[],
  liff_id: '',
  line_bot_friend_url: '',
  public_site_origin: '',
}) as TenantBranding

// ── 狀態 ────────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = 'tenant_branding_v1'

/**
 * `shallowRef` + 整物件替換（與 `src/utils/auth.ts` 的 `_userInfoRef` 同款式）：
 * 所有 `computed(() => branding.value.x)` 自動響應，不需要 deep reactive 的開銷。
 */
const _state: ShallowRef<TenantBranding> = shallowRef(loadSnapshot() ?? BRANDING_DEFAULTS)
let _started = false
const _loadedCallbacks: Array<() => void> = []
let _loaded = false

function loadSnapshot(): TenantBranding | null {
  // sessionStorage 快照：第二次載入起無品牌字串閃爍。
  // key 不需要 tenantStorage prefix（sessionStorage per-origin + per-tab 已天然隔離），
  // 但 DEV `?tenant=` override 會共用同一個 origin，故仍比對 slug。
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TenantBranding
    if (!parsed || typeof parsed !== 'object') return null
    const current = tenantSlugOrPlaceholder()
    if (parsed.slug && current !== '__unresolved' && parsed.slug !== current) return null
    return { ...BRANDING_DEFAULTS, ...parsed }
  } catch {
    return null
  }
}

function saveSnapshot(value: TenantBranding): void {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value))
  } catch {
    /* 隱私模式 / 配額滿 → 放棄快照，不影響功能 */
  }
}

/** 逐欄 fallback：API 缺欄一律退回 `BRANDING_DEFAULTS`，不會出現空字串或 undefined。 */
export function normalizeBranding(meta: TenantMeta | null | undefined): TenantBranding {
  const d = BRANDING_DEFAULTS
  const m = meta ?? {}
  const pickManifest = (
    src: { name?: string; short_name?: string; description?: string } | undefined,
    fallback: TenantBrandingManifest,
  ): TenantBrandingManifest => ({
    name: src?.name || fallback.name,
    short_name: src?.short_name || fallback.short_name,
    description: src?.description || fallback.description,
  })

  return {
    slug: m.tenant?.slug || d.slug,
    school_name: m.school_name || d.school_name,
    org_name: m.org_name || d.org_name,
    org_name_en: m.org_name_en || d.org_name_en,
    school_name_en: m.school_name_en || d.school_name_en,
    org_prefix: m.org_prefix || d.org_prefix,
    short_name: m.short_name || d.short_name,
    titles: {
      admin: m.titles?.admin || d.titles.admin,
      portal: m.titles?.portal || d.titles.portal,
      public: m.titles?.public || d.titles.public,
      parent: m.titles?.parent || d.titles.parent,
      parent_short: m.titles?.parent_short || d.titles.parent_short,
    },
    manifest: {
      admin: pickManifest(m.manifest?.admin, d.manifest.admin),
      parent: pickManifest(m.manifest?.parent, d.manifest.parent),
      public: pickManifest(m.manifest?.public, d.manifest.public),
    },
    logo_url: m.logo_url || d.logo_url,
    theme: {
      admin_primary: m.theme?.admin_primary || d.theme.admin_primary,
      parent_primary: m.theme?.parent_primary || d.theme.parent_primary,
    },
    contact: {
      campus_label: m.contact?.campus_label || d.contact.campus_label,
      address: m.contact?.address || d.contact.address,
      phone: m.contact?.phone || d.contact.phone,
      phone_display: m.contact?.phone_display || d.contact.phone_display,
    },
    map: {
      lat: typeof m.map?.lat === 'number' ? m.map.lat : d.map.lat,
      lng: typeof m.map?.lng === 'number' ? m.map.lng : d.map.lng,
    },
    share: {
      site_name: m.share?.site_name || d.share.site_name,
      og_title: m.share?.og_title || d.share.og_title,
      og_description: m.share?.og_description || d.share.og_description,
      // L1-only：`TB_META_DESC` 由 nginx sub_filter 就地替換 public.html，
      // 品牌 API 刻意不回傳這欄（4d 裁決 #4 + fb 裁決 (a)）→ 恆用預設值。
      // 保留本欄是因為 `brandingParity.spec.ts` 以它比對 branding/tenants.json 的 token。
      meta_description: d.share.meta_description,
      poster_alt: m.share?.poster_alt || d.share.poster_alt,
      share_text: m.share?.share_text || d.share.share_text,
    },
    school_keywords:
      Array.isArray(m.school_keywords) && m.school_keywords.length
        ? m.school_keywords.slice()
        : d.school_keywords.slice(),
    school_aliases: Array.isArray(m.school_aliases)
      ? m.school_aliases.slice()
      : d.school_aliases.slice(),
    liff_id: m.liff_id || d.liff_id,
    line_bot_friend_url: m.line_bot_friend_url || d.line_bot_friend_url,
    public_site_origin: m.public_site_origin || d.public_site_origin,
  }
}

async function _fetchOnce(): Promise<void> {
  if (_started) return
  _started = true
  // 灰度階段 0：未開啟時完全不打網路，行為與改造前逐字相同。
  if (!isTenantMetaEnabled()) return
  try {
    _state.value = normalizeBranding(await fetchTenantMeta())
    saveSnapshot(_state.value)
    _loaded = true
    _loadedCallbacks.splice(0).forEach((cb) => cb())
  } catch (e) {
    // CT-F-01 錯誤分類。設錯 DNS / 尚未 provision 的 subdomain 若靜默顯示義華品牌，
    // 是最危險的一種錯誤（使用者以為進對了學校）——故 404/403/503 一律 fail-hard。
    if (e instanceof TenantMetaError) {
      if (e.code === TENANT_META_DISABLED) return // 灰度未開，不是錯誤
      if (e.status === 404) return showTenantBlocked('TENANT_NOT_FOUND')
      if (e.status === 403) return showTenantBlocked('TENANT_SUSPENDED')
      if (e.status === 503) return showTenantBlocked('TENANT_PROVISIONING')
    }
    // 網路錯誤 / 5xx → fail-soft，保留 defaults 或 snapshot。
    // 刻意不呼叫 captureException：Sentry / global handler 已涵蓋 unhandled，
    // 且 4xx 洗版是本專案明文禁止的（CLAUDE.md 錯誤監控段）。
  }
}

/**
 * 元件用：回傳唯讀響應式品牌物件，並在首次呼叫時觸發載入。
 *
 * ```ts
 * const { branding } = useTenantBranding()
 * const title = computed(() => branding.value.titles.admin)
 * ```
 */
export function useTenantBranding(): { branding: DeepReadonly<ShallowRef<TenantBranding>> } {
  void _fetchOnce()
  return { branding: readonly(_state) }
}

/** 非元件情境（router guard、純函式模組）用的同步取值。不觸發載入。 */
export function getBranding(): TenantBranding {
  return _state.value
}

/** 品牌載入完成後回呼（已載入則立即執行）。給 router title / document.title 補刷用。 */
export function onBrandingLoaded(cb: () => void): void {
  if (_loaded) {
    cb()
    return
  }
  _loadedCallbacks.push(cb)
}

/** 測試用：重置模組狀態。正式碼不應呼叫。 */
export function __resetBranding(): void {
  _state.value = BRANDING_DEFAULTS
  _started = false
  _loaded = false
  _loadedCallbacks.length = 0
  try {
    sessionStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    /* ignore */
  }
}
