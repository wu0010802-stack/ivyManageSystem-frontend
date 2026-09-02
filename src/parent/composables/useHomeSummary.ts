// src/parent/composables/useHomeSummary.ts
/**
 * 家長端 `GET /parent/home/summary` 的共用讀取層。
 *
 * summary 一支就帶齊多個計數（未讀公告 / 待繳 / 待簽 / 才藝候補待確認 /
 * 假單審核結果 / 今日用藥單），所以事務頁列徽章、底部 tab 徽章都從這裡拿，
 * 不再各自打 API。
 *
 * 後端仍回傳 unread_messages，但親師訊息已於 2026-08-28 自家長端下架，
 * 前端不再讀取該欄位。
 *
 * 快取鍵刻意與 TodayView 相同：useCachedAsync 對同 key 共用 cache 條目
 * 並 dedupe in-flight 請求，因此首頁與事務頁同時掛載也只會有一次網路請求。
 */
import { computed } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getHomeSummary } from '../api/profile'

export const HOME_SUMMARY_CACHE_KEY = 'parent/today/summary'

export interface HomeBadges {
  unreadAnnouncements: number
  /** 未繳費用「筆數」（非金額） */
  outstandingFees: number
  overdueFees: number
  pendingEventAcks: number
  pendingActivityPromotions: number
  recentLeaveReviews: number
  /** 待回覆的活動調查份數（2026-09-02 併入，原本事務頁自己 cast summary 讀） */
  pendingSurveyCount: number
  /** 今日生效的委託用藥單張數；資訊性，不計入 tab 徽章 */
  activeMedicationOrders: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * @param options.immediate mount 時是否自動抓。ParentLayout 會在登入頁也掛載，
 *   那裡必須傳 false，否則未登入就打 /parent/home/summary 會拿到 401。
 */
export function useHomeSummary(options: { immediate?: boolean } = {}) {
  const { immediate = true } = options
  const { data, error, pending, refresh } = useCachedAsync(
    HOME_SUMMARY_CACHE_KEY,
    async () => {
      const res = await getHomeSummary()
      return res.data
    },
    { ttl: 60_000, immediate },
  )

  const summary = computed<Record<string, unknown> | null>(() => {
    const d = data.value as { summary?: Record<string, unknown> } | null
    return d?.summary ?? null
  })

  const badges = computed<HomeBadges>(() => {
    const s = summary.value ?? {}
    const fees = (s.fees ?? {}) as Record<string, unknown>
    return {
      unreadAnnouncements: num(s.unread_announcements),
      outstandingFees: num(fees.outstanding_count),
      overdueFees: num(fees.overdue),
      pendingEventAcks: num(s.pending_event_acks),
      pendingActivityPromotions: num(s.pending_activity_promotions),
      recentLeaveReviews: num(s.recent_leave_reviews),
      pendingSurveyCount: num(s.pending_survey_count),
      activeMedicationOrders: num(s.active_medication_orders),
    }
  })

  /**
   * 底部「事務」tab 的總數徽章。
   *
   * 只加「需要家長動作或該知道結果」的五項。今日用藥單是資訊性的
   * （家長已經送出、老師照表執行），計進去只會讓紅點天天亮著而失去意義。
   *
   * 刻意不加入首頁待辦清單的另外兩項（入學文件簽署、臨時接送）：那兩支是
   * summary 之外的獨立 API，而 ParentLayout 在登入頁也會掛載，為了徽章
   * 多打兩支請求不划算。因此待辦清單的件數可能比 tab 徽章多，屬已知取捨。
   */
  const adminTabBadge = computed<number>(() => {
    const b = badges.value
    return (
      b.outstandingFees +
      b.pendingEventAcks +
      b.pendingActivityPromotions +
      b.recentLeaveReviews +
      b.pendingSurveyCount
    )
  })

  /**
   * 底部「聯絡簿」tab 徽章。
   *
   * 目前只有未讀公告——後端 summary 尚無「未讀聯絡簿」計數，加上去要另開欄位；
   * 聯絡簿本身的未讀在頁內以「N 則未讀」pill 呈現。
   */
  const contactBookTabBadge = computed<number>(
    () => badges.value.unreadAnnouncements,
  )

  return {
    data,
    error,
    pending,
    refresh,
    summary,
    badges,
    adminTabBadge,
    contactBookTabBadge,
  }
}
