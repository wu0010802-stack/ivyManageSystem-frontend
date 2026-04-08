/**
 * 共用格式化工具
 *
 * money()      — 金額格式化（$1,234 / '-'）
 * formatTime() — ISO 字串取前 16 字元時間（HH:MM）
 * formatDate() — ISO 字串轉 YYYY-MM-DD HH:MM
 */

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 才藝管理用：ISO 字串轉 "YYYY-MM-DD HH:MM"，null → '-'
export const formatActivityDate = (str) => {
  if (!str) return '-'
  return str.replace('T', ' ').substring(0, 16)
}
