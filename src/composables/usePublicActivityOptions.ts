import { ref } from 'vue'

export function usePublicActivityOptions() {
  const courses = ref<unknown[]>([])
  const supplies = ref<unknown[]>([])
  const classes = ref<unknown[]>([])
  const videos = ref<unknown>({})
  const loading = ref(false)
  const error = ref<unknown>(null)

  // 共用填值邏輯：兩公開頁都由 /public/bootstrap 合併端點取資料後用此填入 refs。
  // （原 loadOptions 的 4 支並行個別 GET 已下線，bootstrap 單支 GET 取代。）
  function applyOptions(payload: {
    courses?: unknown
    supplies?: unknown
    classes?: unknown
    videos?: unknown
  }) {
    courses.value = Array.isArray(payload.courses) ? (payload.courses as unknown[]) : []
    supplies.value = Array.isArray(payload.supplies) ? (payload.supplies as unknown[]) : []
    // 後端目前會回出重複班名（玫瑰/薔薇/百合 等），這裡 dedupe 保留首次出現順序
    const rawClasses = Array.isArray(payload.classes) ? payload.classes : []
    classes.value = Array.from(new Set(rawClasses))
    videos.value = payload.videos ?? {}
  }

  return { courses, supplies, classes, videos, loading, error, applyOptions }
}
