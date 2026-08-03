/**
 * 公開報名頁行銷文案工具（2026-08-03 文案後台化）。
 *
 * 報名須知條文支援 `**粗體**` 標記：解析成 segment 陣列由模板以 <strong>
 * 渲染，全程走文字插值不經 v-html——公開頁不吃任何未消毒 HTML。
 * 零 import、EP-free；admin 設定頁與公開頁共用，已 pin shared-common
 * （vite.config.js manualChunks，防落 parent-app chunk 的同型回歸）。
 */

export interface CopySegment {
  text: string
  bold: boolean
}

/** 把 `前**重點**後` 解析成 [{前}, {重點,bold}, {後}]；無標記時回單一 segment。 */
export function parseBoldSegments(text: string): CopySegment[] {
  const segments: CopySegment[] = []
  const pattern = /\*\*(.+?)\*\*/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), bold: false })
    }
    segments.push({ text: match[1], bold: true })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false })
  }
  return segments.length ? segments : [{ text: '', bold: false }]
}

/** 後台 textarea（一行一條）→ API 陣列；去空條，全空回 null（後端 NULL=用預設）。 */
export function noticeLinesToItems(text: string): string[] | null {
  const items = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return items.length ? items : null
}

/** API 陣列 → 後台 textarea（一行一條）。 */
export function noticeItemsToLines(items: string[] | null | undefined): string {
  return (items ?? []).join('\n')
}
