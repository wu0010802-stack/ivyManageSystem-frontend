/**
 * 才藝儀表板摘要卡片的組裝。
 *
 * hint 是給業主看的口徑說明，逐條對齊後端
 * `services/activity_service.py` 的 `_compute_stats_summary`
 * 與 `_compute_attendance_stats`——後端改口徑時這裡要一起改。
 */

export interface StatCard {
  label: string
  value: string | number
  hint: string
}

type SummaryStats = Record<string, number | null | undefined>

const money = (v: number | null | undefined) =>
  v != null ? `$${v.toLocaleString()}` : '-'

/**
 * @param st 後端 `/activity/stats` 的 statistics 區塊
 * @param avgAttendanceRate 已格式化的平均出席率字串（來源為 attendance_stats）
 */
export function buildStatCards(
  st: SummaryStats,
  avgAttendanceRate: string,
): StatCard[] {
  return [
    {
      label: '總報名數',
      value: st.totalRegistrations ?? '-',
      hint: '本學期有效報名單的筆數。一位學生同學期只有一張報名單，不論報了幾門課。',
    },
    {
      label: '正式報名',
      value: st.totalEnrollments ?? '-',
      hint: '已錄取的課程席次數（人次）。一位學生報 3 門課計 3，因此通常大於總報名數。',
    },
    {
      label: '候補人數',
      value: st.totalWaitlist ?? '-',
      hint: '候補中的課程席次數（人次），一人候補多門就分開計。候補不計入報名率。',
    },
    {
      label: '今日新增',
      value: st.todayNewRegistrations ?? '-',
      hint: '今天（台北時間）新建立的報名單筆數。',
    },
    {
      label: '總收入（已繳）',
      value: money(st.totalRevenue),
      hint: '本學期有效報名單的實收金額加總；部分繳費與超收都照實際收到的金額計。',
    },
    {
      label: '待繳金額',
      value: money(st.totalUnpaid),
      hint: '每張報名單「應繳（已錄取課程＋用品）－ 已繳」的不足額加總；某一單超收不會拿去折抵其他單。',
    },
    {
      label: '報名率',
      value: st.enrollmentRate != null ? `${st.enrollmentRate}%` : '-',
      hint: '課程席位的容量占用率＝正式報名席次 ÷ 本學期所有啟用課程的容量加總（未設容量的課以 30 計）。候補不計入，也不是「全園有幾成學生報了才藝」。',
    },
    {
      label: '平均出席率',
      value: avgAttendanceRate,
      hint: '已上課場次的點名紀錄中，出席筆數所占的比率（未來場次即使先點名也不計入）。',
    },
    {
      label: '未讀提問',
      value: st.unreadInquiries ?? '-',
      hint: '家長端提問中尚未標示已讀的則數。此為全域收件匣，不分學期。',
    },
  ]
}
