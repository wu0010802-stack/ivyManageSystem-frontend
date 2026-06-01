/**
 * 共用格式化工具
 *
 * money()              — 金額格式化（委派 currency.formatCurrency → NT$1,234 / —）
 * formatTime()         — ISO 字串取前 16 字元時間（HH:MM）
 * formatDate()         — ISO 字串轉 YYYY-MM-DD HH:MM（本地時間）
 * formatActivityDate() — ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
 * formatDateTimeTW()   — Asia/Taipei 時區的完整日期時間
 * formatTimeTW()       — Asia/Taipei 時區的 HH:MM
 * todayISO()           — 今日 YYYY-MM-DD（本地）
 * offsetISO()          — 今日 ± n 天的 YYYY-MM-DD
 */

import { formatCurrency } from '@/utils/currency'

const TAIPEI_TZ = 'Asia/Taipei'

const pad2 = (n: number) => String(n).padStart(2, '0')

// 委派至全站單一金額 helper（NT$1,234 / —），保留 money 名稱供既有 22 處 call site。
export const money = (val: unknown) => formatCurrency(val)

export const formatTime = (isoStr: unknown) => {
  if (!isoStr) return '-'
  return String(isoStr).slice(11, 16)
}

export const formatDate = (isoStr: unknown) => {
  if (!isoStr) return ''
  const d = new Date(String(isoStr))
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 才藝管理用：ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
export const formatActivityDate = (str: unknown) => {
  if (!str) return '-'
  return String(str).replace('T', ' ').substring(0, 16)
}

// Asia/Taipei 時區的完整日期時間（含秒），不可解析的字串原樣回傳
export const formatDateTimeTW = (iso: unknown) => {
  if (!iso) return '—'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('zh-Hant', { hour12: false, timeZone: TAIPEI_TZ })
}

// Asia/Taipei 時區的 HH:MM；解析失敗時退回字串切片
export const formatTimeTW = (iso: unknown) => {
  if (!iso) return '—'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso).slice(11, 16)
  return d.toLocaleTimeString('zh-Hant', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TAIPEI_TZ,
  })
}

// 將 Date 物件轉為「本地時區」的 YYYY-MM-DD
// Why: 不可用 d.toISOString().slice(0, 10)，那會用 UTC，台灣 UTC+8 之後會跨日。
export const dateToLocalISO = (d: unknown) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 將 Date 物件轉為「本地時區」的 YYYY-MM
export const dateToLocalISOMonth = (d: unknown) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// 今日 YYYY-MM-DD（本地時區）
export const todayISO = () => dateToLocalISO(new Date())

// 今日 ± n 天的 YYYY-MM-DD（本地時區）
export const offsetISO = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return dateToLocalISO(d)
}

// 今月 YYYY-MM（本地時區）
export const thisMonthISO = () => dateToLocalISOMonth(new Date())
