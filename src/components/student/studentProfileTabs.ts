/**
 * 學生檔案（StudentDetailPanel）一級頁籤的 key 與「舊 key → 新 key」對照
 * （後台 IA 重整 S6，2026-10-29）。
 *
 * 為什麼集中在這裡：學生檔案的網址（`/students/profile/:id?tab=&sub=&group=`）被書籤、站內連結
 * （出席／請假／評量／事件頁的「看他檔案」）與總覽卡片的 goto-tab 共用；每次整併頁籤都要保證舊 key
 * 仍到得了對的內容。對照表只此一份，元件與測試都吃它，不再各寫一份漂移。
 *
 * 現行一級頁籤（10 個 → 仍 10 個，但不再有第二、三層巢狀）：
 *   overview 總覽／basic 基本資料／records 教務紀錄（出席、請假、評量、事件、異動）／fees 學費／
 *   activity 才藝報名／health 健康／growth 成長（七個區塊攤平）／disability_docs 鑑定文件／
 *   lifecycle 在校歷程／communication 家長溝通。
 *
 * `sub` = 頁籤內的區塊 key（records 與 growth 各自一組，兩組互不重疊所以共用同一個 query 名）。
 * `group` 只剩舊書籤相容（原「健康類／成長類」分組），不再寫進網址。
 */

export const STUDENT_TAB_KEYS = [
  'overview',
  'basic',
  'records',
  'fees',
  'activity',
  'health',
  'growth',
  'disability_docs',
  'lifecycle',
  'communication',
] as const

/** 教務紀錄「分類表格」的區塊（出席 2026-10-29 自獨立頁籤併入）。 */
export const RECORDS_SECTIONS = ['attendance', 'leave', 'incident', 'assessment', 'change_log'] as const

/** 成長頁籤的區塊（原「健康類」的成長歷程／量測曲線／作品集＋原「成長類」四個子頁籤）。 */
export const GROWTH_SECTIONS = [
  'portfolio',
  'milestones',
  'timeline',
  'photo_gallery',
  'growth_report',
  'measurements',
  'work_samples',
] as const

export type RecordsSection = (typeof RECORDS_SECTIONS)[number]
export type GrowthSection = (typeof GROWTH_SECTIONS)[number]

/** 元件間傳「請切到某區塊」用；nonce 讓同一個區塊重複請求也能再觸發一次。 */
export interface SectionRequest {
  section: string
  nonce: number
}

const SECTIONS_BY_TAB: Record<string, readonly string[]> = {
  records: RECORDS_SECTIONS,
  growth: GROWTH_SECTIONS,
}

/** `sub` 是否屬於該頁籤的區塊（不屬於＝忽略，例如從別的頁籤殘留在網址上的 sub）。 */
export function sectionBelongsTo(tab: string, sub: string): boolean {
  return !!sub && !!SECTIONS_BY_TAB[tab]?.includes(sub)
}

interface LegacyRule {
  tab: string
  /** 舊 key 隱含的區塊（優先於網址上的 ?sub=） */
  sub?: string
  /** 該頁籤沒權限看時依序再試的頁籤 */
  fallbacks?: string[]
}

/**
 * 舊一級頁籤 key → 新 key。
 * `health_growth_profile`（2026-09-09 合併頁籤）依 ?group= 分流，見 resolveStudentTab。
 */
export const LEGACY_STUDENT_TAB_MAP: Readonly<Record<string, LegacyRule>> = {
  // 家長管理本來就在基本資料裡（更早期的整併）
  guardians: { tab: 'basic' },
  // 2026-10-29 S6：出席紀錄併入教務紀錄的「出席」區塊
  attendance: { tab: 'records', sub: 'attendance' },
  // 2026-10-29 S6：原「健康／成長」兩個一級頁籤（2026-09-09 曾合併成 health_growth_profile）
  health_growth: { tab: 'health', fallbacks: ['growth'] },
  growth_profile: { tab: 'growth' },
  // 更早期四個原獨立頁籤（整併進 growth_profile 的子頁籤）
  milestones: { tab: 'growth', sub: 'milestones' },
  timeline: { tab: 'growth', sub: 'timeline' },
  photo_gallery: { tab: 'growth', sub: 'photo_gallery' },
  growth_report: { tab: 'growth', sub: 'growth_report' },
}

export interface ResolvedStudentTab {
  /** 依序候選：呼叫端取第一個「有權限看」的；全都看不到就退回總覽 */
  candidates: string[]
  /** 頁籤內區塊；沒有則空字串 */
  sub: string
  /** 原 key 是舊名（呼叫端據此把網址改寫成新 key） */
  legacy: boolean
}

/**
 * 把網址上的 tab（可能是舊 key）解析成現行頁籤＋區塊。權限無關，純函式。
 * @param rawTab 網址的 ?tab=（或 initialTab／defaultTab／goto-tab 的值）
 * @param query  網址的 ?sub=、?group=（沒有網址情境，如抽屜或 goto-tab，傳空物件）
 */
export function resolveStudentTab(
  rawTab: string,
  query: { sub?: string; group?: string } = {},
): ResolvedStudentTab {
  const raw = (rawTab || '').trim()
  const sub = (query.sub || '').trim()
  const group = (query.group || '').trim()

  if (raw === 'health_growth_profile') {
    if (group === 'growth') {
      return { candidates: ['growth', 'health'], sub: sectionBelongsTo('growth', sub) ? sub : '', legacy: true }
    }
    return { candidates: ['health', 'growth'], sub: '', legacy: true }
  }

  const rule = LEGACY_STUDENT_TAB_MAP[raw]
  if (rule) {
    const ownSub = rule.sub ?? (sectionBelongsTo(rule.tab, sub) ? sub : '')
    return { candidates: [rule.tab, ...(rule.fallbacks ?? [])], sub: ownSub, legacy: true }
  }

  return { candidates: [raw], sub: sectionBelongsTo(raw, sub) ? sub : '', legacy: false }
}
