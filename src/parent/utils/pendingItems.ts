/**
 * 「待你處理」清單：把散在各處的待辦計數收斂成一份排序好的清單。
 *
 * 背景（2026-10-08 首頁/待辦改版）：同一筆待簽在首頁曾同時出現在頂部 banner、
 * Bento 小卡與今日動態「晚一些」桶，待繳費更分散在六個地方。現在首頁「待你處理」
 * 與待辦 tab 都只讀這支純函式，文案用白話動詞（繳費／簽收通知／確認才藝候補…），
 * 名稱與圖示取自 parentServices.ts。
 *
 * 排序：逾期款項最前；有確認期限的（才藝候補、簽收、入學文件、活動調查）其次；
 * 一般待繳；最後是「該知道結果」的資訊類（請假審核結果、未讀公告）。
 */
import { formatCurrency } from '@/utils/currency'
import { PARENT_SERVICES } from './parentServices'

/** urgent＝逾期等需立刻處理；action＝待家長動作；info＝該知道的結果 */
export type PendingTone = 'urgent' | 'action' | 'info'

export interface PendingItem {
  key: string
  title: string
  detail: string
  icon: string
  tone: PendingTone
  path: string
  /** 這一項背後的筆數（徽章加總用） */
  count: number
}

export interface PendingSource {
  /** GET /parent/home/summary 的 summary 物件 */
  summary: Record<string, unknown> | null | undefined
  /** 入學文件待簽數（/parent/sign-requests，summary 未聚合） */
  enrollDocCount?: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

interface RankedItem extends PendingItem {
  rank: number
}

export function buildPendingItems({ summary, enrollDocCount = 0 }: PendingSource): PendingItem[] {
  const s = summary ?? {}
  const fees = (s.fees ?? {}) as Record<string, unknown>
  const feeCount = num(fees.outstanding_count)
  const overdue = num(fees.overdue)
  const out: RankedItem[] = []

  if (feeCount > 0) {
    out.push({
      key: 'fees',
      title: PARENT_SERVICES.fees.label,
      detail: overdue > 0
        ? `${feeCount} 筆待繳 · 逾期 ${formatCurrency(overdue)}`
        : `${feeCount} 筆待繳 · 共 ${formatCurrency(num(fees.outstanding))}`,
      icon: PARENT_SERVICES.fees.icon,
      tone: overdue > 0 ? 'urgent' : 'action',
      path: PARENT_SERVICES.fees.route,
      count: feeCount,
      rank: overdue > 0 ? 0 : 5,
    })
  }

  const promotions = num(s.pending_activity_promotions)
  if (promotions > 0) {
    out.push({
      key: 'promotions',
      title: '確認才藝候補',
      detail: `${promotions} 筆候補有名額了，請在期限內確認`,
      icon: PARENT_SERVICES.activity.icon,
      tone: 'action',
      path: PARENT_SERVICES.activity.route,
      count: promotions,
      rank: 1,
    })
  }

  const acks = num(s.pending_event_acks)
  if (acks > 0) {
    out.push({
      key: 'acks',
      title: PARENT_SERVICES.sign.label,
      detail: `${acks} 份待簽收`,
      icon: PARENT_SERVICES.sign.icon,
      tone: 'action',
      path: PARENT_SERVICES.sign.route,
      count: acks,
      rank: 2,
    })
  }

  const docs = num(enrollDocCount)
  if (docs > 0) {
    out.push({
      key: 'enrollDocs',
      title: '簽署入學文件',
      detail: `${docs} 份待簽署`,
      icon: PARENT_SERVICES.enrollDocs.icon,
      tone: 'action',
      path: PARENT_SERVICES.enrollDocs.route,
      count: docs,
      rank: 3,
    })
  }

  const surveys = num(s.pending_survey_count)
  if (surveys > 0) {
    out.push({
      key: 'surveys',
      title: '填活動調查',
      detail: `${surveys} 份待回覆`,
      icon: PARENT_SERVICES.surveys.icon,
      tone: 'action',
      path: PARENT_SERVICES.surveys.route,
      count: surveys,
      rank: 4,
    })
  }

  const leaveReviews = num(s.recent_leave_reviews)
  if (leaveReviews > 0) {
    out.push({
      key: 'leaveReviews',
      title: '看請假結果',
      detail: `${leaveReviews} 筆假單已審核`,
      icon: PARENT_SERVICES.leaves.icon,
      tone: 'info',
      path: PARENT_SERVICES.leaves.route,
      count: leaveReviews,
      rank: 6,
    })
  }

  const announcements = num(s.unread_announcements)
  if (announcements > 0) {
    out.push({
      key: 'announcements',
      title: '看公告',
      detail: `${announcements} 則未讀`,
      icon: PARENT_SERVICES.announce.icon,
      tone: 'info',
      path: PARENT_SERVICES.announce.route,
      count: announcements,
      rank: 7,
    })
  }

  return out
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, title, detail, icon, tone, path, count }) => ({ key, title, detail, icon, tone, path, count }))
}
