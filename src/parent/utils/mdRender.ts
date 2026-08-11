import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

/**
 * Markdown 快照 → 安全 HTML。用於簽署文件內容渲染（比照
 * src/parent/components/assistant/FaqAnswer.vue 的 marked+DOMPurify 慣例）。
 */
export function renderMd(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string, {
    USE_PROFILES: { html: true },
  })
}

/** Blob（簽名圖）→ data URL 字串，供簽署 API 的 signature_data 欄位使用。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 簽署 gate：捲動到底 + 已勾選閱讀 + 已簽名，三者齊備才可送出。 */
export function canSubmit(
  scrolledToBottom: boolean,
  confirmedRead: boolean,
  hasSignature: boolean,
): boolean {
  return scrolledToBottom && confirmedRead && hasSignature
}
