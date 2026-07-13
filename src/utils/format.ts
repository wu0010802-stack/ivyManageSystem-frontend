/**
 * 共用格式化工具
 *
 * money()              — 金額格式化（委派 currency.formatCurrency → NT$1,234 / —）
 * formatTime()         — ISO 字串取前 16 字元時間（HH:MM）
 * formatDate()         — ISO 字串轉 YYYY-MM-DD HH:MM（本地時間）
 * formatActivityDate() — ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
 * formatDateTimeTW()   — Asia/Taipei 時區的完整日期時間
 * formatTimeTW()       — Asia/Taipei 時區的 HH:MM
 * fmtPct()             — 百分比格式化（isRatio 控制 0~1 小數 vs 已是百分比數值）
 * todayISO()           — 今日 YYYY-MM-DD（本地）
 * todayTaipeiISO()     — 今日 YYYY-MM-DD（Asia/Taipei）
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

// 將純日期字串解析為瀏覽器本地午夜。`new Date('YYYY-MM-DD')` 依規格會當成
// UTC 午夜，正時區會位移到當日上午，不適合生日等 calendar date 比較。
export const parseLocalISODate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return date
}

// 後端才藝模組的 naive ISO datetime（無 Z / offset）固定代表 Asia/Taipei wall time。
// `new Date(naive)` 會依瀏覽器所在時區解讀，海外裝置會把報名開關與候補期限位移。
// 已明示 Z / ±HH:MM 的字串則保留其原始 instant。
export const parseTaipeiDateTime = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const hasExplicitZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
  const date = new Date(hasExplicitZone ? trimmed : `${trimmed}+08:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatTaipeiDateTimeMinute = (value: unknown): string => {
  const date = value instanceof Date ? value : parseTaipeiDateTime(value)
  if (!date || Number.isNaN(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')} ${valueOf('hour')}:${valueOf('minute')}`
}

// 將 Date 物件轉為「本地時區」的 YYYY-MM
export const dateToLocalISOMonth = (d: unknown) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// 今日 YYYY-MM-DD（本地時區）
export const todayISO = () => dateToLocalISO(new Date())

// 後端才藝公開 API 以 Asia/Taipei 判定生日的「今天」。瀏覽器可能位於其他時區，
// 因此不可沿用 todayISO()，否則台北跨日後前端會把後端合法的今日生日誤判為未來。
export const todayTaipeiISO = (now: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const valueOf = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`
}

// 今日 ± n 天的 YYYY-MM-DD（本地時區）
export const offsetISO = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return dateToLocalISO(d)
}

// 今月 YYYY-MM（本地時區）
export const thisMonthISO = () => dateToLocalISOMonth(new Date())

// 百分比單一格式（預設一位小數）。isRatio=true 表示傳入為 0–1 比值（×100 後顯示）。
// 取代各頁 .toFixed(1)/.toFixed(2)/pctNum/pctRatio 混用。null/非數字 → '—'。
export const fmtPct = (val: unknown, opts: { isRatio?: boolean; digits?: number } = {}) => {
  if (val == null || val === '' || Number.isNaN(Number(val))) return '—'
  const n = Number(val) * (opts.isRatio ? 100 : 1)
  return `${n.toFixed(opts.digits ?? 1)}%`
}
