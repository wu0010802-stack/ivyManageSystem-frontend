/**
 * 才藝儀表板摘要卡片的組裝。
 *
 * hint 是給業主看的口徑說明，逐條對齊後端
 * `services/activity_service.py` 的 `_compute_stats_summary`、
 * `_compute_attendance_stats` 與 `_compute_dashboard_table`——後端改口徑時這裡要一起改。
 *
 * 用語一律「人次」（同一學生報多門就分開計），對齊統計表欄名與 Excel 匯出。
 */

export interface StatCard {
  label: string
  value: string | number
  hint: string
}

type SummaryStats = Record<string, number | null | undefined>

const money = (v: number | null | undefined) =>
  v != null ? `$${v.toLocaleString()}` : '-'

const numberOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * @param st 後端 `/activity/stats` 的 statistics 區塊
 * @param avgAttendanceRate 已格式化的平均出席率字串（來源為 attendance_stats）
 * @param grandTotal 統計表 `/activity/dashboard-table` 的 grand_total 總計列；
 *   尚未載入時為 null，依賴它的卡片一律顯示 "-"
 */
export function buildStatCards(
  st: SummaryStats,
  avgAttendanceRate: string,
  grandTotal: Record<string, unknown> | null = null,
): StatCard[] {
  const studentCount = numberOrNull(grandTotal?.student_count)
  const participationRatio = numberOrNull(grandTotal?.ratio)
  const pendingReview = numberOrNull(grandTotal?.total_pending_review)

  // 分母為 0 時後端 _display_ratio 一律回 0（歷史學期取不到班級在籍數即為此情形），
  // 直接顯示會被讀成「都沒人報名」。故分母不可信就顯示 "-"。
  const participationValue =
    participationRatio != null && studentCount != null && studentCount > 0
      ? `${participationRatio}%`
      : '-'

  const revenue = numberOrNull(st.totalRevenue)
  const unpaid = numberOrNull(st.totalUnpaid)
  const billed = revenue != null && unpaid != null ? revenue + unpaid : null
  const collectionValue =
    billed != null && billed > 0 && revenue != null
      ? `${Math.round((revenue / billed) * 100)}%`
      : '-'

  return [
    {
      label: '總報名數',
      value: st.totalRegistrations ?? '-',
      hint: '本學期有效報名單的筆數。一位學生同學期只有一張報名單，不論報了幾門課。',
    },
    {
      label: '正式報名',
      value: st.totalEnrollments ?? '-',
      hint: '已錄取的課程報名人次。一位學生報 3 門課計 3，因此通常大於總報名數。',
    },
    {
      label: '待審核人次',
      value: pendingReview ?? '-',
      hint: '公開報名中身分尚未比對通過、待承辦審核的人次。審核前不計入正式報名，也不計入報名率與全園參與率。',
    },
    {
      label: '候補人數',
      value: st.totalWaitlist ?? '-',
      hint: '候補中的課程報名人次，一人候補多門就分開計。候補不計入報名率。',
    },
    {
      label: '今日新增',
      value: st.todayNewRegistrations ?? '-',
      hint: '今天（台北時間）新建立的報名單筆數。',
    },
    {
      label: '未讀提問',
      value: st.unreadInquiries ?? '-',
      hint: '家長端提問中尚未標示已讀的則數。此為全域收件匣，不分學期。',
    },
    {
      label: '報名率',
      value: st.enrollmentRate != null ? `${st.enrollmentRate}%` : '-',
      hint: '課程座位的容量占用率＝正式報名人次 ÷ 本學期所有啟用課程的容量加總（未設容量的課以 30 計）。候補不計入，也不是「全園有幾成學生報了才藝」——那是全園參與率。',
    },
    {
      label: '全園參與率',
      value: participationValue,
      hint: '有報名才藝的在籍學生數 ÷ 全園在籍學生數。分子是不重複的學生（報 3 門仍算 1 人），校外生與未分班的報名不計入。與統計表最下方總計列的參與率同一個數字。',
    },
    {
      label: '平均出席率',
      value: avgAttendanceRate,
      hint: '已上課場次的點名紀錄中，出席筆數所占的比率（未來場次即使先點名也不計入）。',
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
      label: '收款完成率',
      value: collectionValue,
      hint: '已繳金額 ÷ 應收總額（已繳＋待繳）。尚未產生任何應收時顯示「-」。',
    },
  ]
}
