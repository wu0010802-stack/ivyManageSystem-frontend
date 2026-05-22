import { ref } from 'vue'
import api from '@/parent/api'

export type ExportResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'too_large' }

export function useDataExport() {
  const downloading = ref(false)

  async function downloadExport(): Promise<ExportResult> {
    downloading.value = true
    try {
      const resp = await api.get('/parent/me/data-export', { responseType: 'blob' })
      const blob = resp.data as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = resp.headers?.['content-disposition'] as string | undefined
      const match = cd?.match(/filename="?([^";]+)"?/)
      a.download = match?.[1] ?? 'ivy_data_export.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return { ok: true }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      if (status === 413) return { ok: false, reason: 'too_large' }
      throw err
    } finally {
      downloading.value = false
    }
  }

  return { downloading, downloadExport }
}
