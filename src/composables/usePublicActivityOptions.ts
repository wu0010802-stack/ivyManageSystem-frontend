import { ref } from 'vue'
import type { Schema } from '@/api/_generated/typed'

// 公開報名選項的 codegen 契約型別（/public/bootstrap 回應的對應欄位）。
export type PublicCourseOption = Schema<'PublicCoursesItemOut'>
export type PublicSupplyOption = Schema<'PublicSuppliesItemOut'>
export type PublicCourseVideos = Schema<'PublicBootstrapOut'>['course_videos']

export function usePublicActivityOptions() {
  const courses = ref<PublicCourseOption[]>([])
  const supplies = ref<PublicSupplyOption[]>([])
  const classes = ref<string[]>([])
  const videos = ref<PublicCourseVideos>({})
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
    courses.value = Array.isArray(payload.courses) ? (payload.courses as PublicCourseOption[]) : []
    supplies.value = Array.isArray(payload.supplies) ? (payload.supplies as PublicSupplyOption[]) : []
    // 後端目前會回出重複班名（玫瑰/薔薇/百合 等），這裡 dedupe 保留首次出現順序
    const rawClasses = Array.isArray(payload.classes) ? (payload.classes as string[]) : []
    classes.value = Array.from(new Set(rawClasses))
    videos.value = (payload.videos as PublicCourseVideos) ?? {}
  }

  return { courses, supplies, classes, videos, loading, error, applyOptions }
}
