// ── 評量常數 ───────────────────────────────────────────────────────────────
export const ASSESSMENT_TYPES = ['期中', '期末', '學期']

export const DOMAINS = ['身體動作與健康', '語文', '認知', '社會', '情緒', '美感', '綜合']

export const RATINGS = ['優', '良', '需加強']

export const RATING_TAG: Record<string, string> = {
  '優': 'success',
  '良': 'warning',
  '需加強': 'danger',
}

// ── 事件常數 ───────────────────────────────────────────────────────────────
export const INCIDENT_TYPES = ['身體健康', '意外受傷', '行為觀察', '其他']

export const SEVERITIES = ['輕微', '中度', '嚴重']

// 家長端時間軸只顯示事件類型／嚴重程度／發生時間（HEALTH-F13）；
// 描述常含他生姓名，後端不回傳給家長。
export const INCIDENT_PARENT_VISIBILITY_HINT =
  '家長端只會看到事件類型、嚴重程度與發生時間；事件描述與處置方式家長看不到，詳情請另行告知家長。'

// ── 親師溝通常數 ───────────────────────────────────────────────────────────
// 親師溝通紀錄為園內紀錄，後端不回傳給家長端（HEALTH-F13）。
export const COMMUNICATION_PARENT_VISIBILITY_HINT =
  '此為園內紀錄，以下內容家長看不到。'

export const INCIDENT_TYPE_TAG: Record<string, string> = {
  '身體健康': 'warning',
  '意外受傷': 'danger',
  '行為觀察': 'info',
  '其他': '',
}

export const SEVERITY_TAG: Record<string, string> = {
  '輕微': 'success',
  '中度': 'warning',
  '嚴重': 'danger',
}
