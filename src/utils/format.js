/**
 * 共用格式化工具
 *
 * money()              — 金額格式化（$1,234 / '-'）
 * formatTime()         — ISO 字串取前 16 字元時間（HH:MM）
 * formatDate()         — ISO 字串轉 YYYY-MM-DD HH:MM（本地時間）
 * formatActivityDate() — ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
 * formatDateTimeTW()   — Asia/Taipei 時區的完整日期時間
 * formatTimeTW()       — Asia/Taipei 時區的 HH:MM
 * todayISO()           — 今日 YYYY-MM-DD（本地）
 * offsetISO()          — 今日 ± n 天的 YYYY-MM-DD
 */

const TAIPEI_TZ = 'Asia/Taipei'

const pad2 = (n) => String(n).padStart(2, '0')

export const money = (val) => {
  if (!val && val !== 0) return '-'
  return '$' + Number(val).toLocaleString()
}

export const formatTime = (isoStr) => {
  if (!isoStr) return '-'
  return isoStr.slice(11, 16)
}

export const formatDate = (isoStr) => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 才藝管理用：ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
export const formatActivityDate = (str) => {
  if (!str) return '-'
  return str.replace('T', ' ').substring(0, 16)
}

// Asia/Taipei 時區的完整日期時間（含秒），不可解析的字串原樣回傳
export const formatDateTimeTW = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-Hant', { hour12: false, timeZone: TAIPEI_TZ })
}

// Asia/Taipei 時區的 HH:MM；解析失敗時退回字串切片
export const formatTimeTW = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16)
  return d.toLocaleTimeString('zh-Hant', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TAIPEI_TZ,
  })
}

// 將 Date 物件轉為「本地時區」的 YYYY-MM-DD
// Why: 不可用 d.toISOString().slice(0, 10)，那會用 UTC，台灣 UTC+8 之後會跨日。
export const dateToLocalISO = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 將 Date 物件轉為「本地時區」的 YYYY-MM
export const dateToLocalISOMonth = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// 今日 YYYY-MM-DD（本地時區）
export const todayISO = () => dateToLocalISO(new Date())

// 今日 ± n 天的 YYYY-MM-DD（本地時區）
export const offsetISO = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return dateToLocalISO(d)
}

// 今月 YYYY-MM（本地時區）
export const thisMonthISO = () => dateToLocalISOMonth(new Date())
