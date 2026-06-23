import { ref } from 'vue'
import {
  getPublicCourses,
  getPublicSupplies,
  getPublicClasses,
  getPublicCourseVideos,
} from '@/api/activityPublic'

export function usePublicActivityOptions() {
  const courses = ref<unknown[]>([])
  const supplies = ref<unknown[]>([])
  const classes = ref<unknown[]>([])
  const videos = ref<unknown>({})
  const loading = ref(false)
  const error = ref<unknown>(null)

  // 共用填值邏輯：個別端點（loadOptions）與 /public/bootstrap 合併端點都用此填入 refs。
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

  async function loadOptions() {
    loading.value = true
    error.value = null
    try {
      const [coursesRes, suppliesRes, classesRes, videosRes] = await Promise.all([
        getPublicCourses(),
        getPublicSupplies(),
        getPublicClasses(),
        getPublicCourseVideos(),
      ])
      applyOptions({
        courses: coursesRes.data,
        supplies: suppliesRes.data,
        classes: classesRes.data,
        videos: videosRes.data,
      })
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  return { courses, supplies, classes, videos, loading, error, loadOptions, applyOptions }
}
