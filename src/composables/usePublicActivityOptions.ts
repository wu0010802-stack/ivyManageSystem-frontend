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
      courses.value = coursesRes.data as unknown[]
      supplies.value = suppliesRes.data as unknown[]
      // 後端目前會回出重複班名（玫瑰/薔薇/百合 等），這裡 dedupe 保留首次出現順序
      const rawClasses = Array.isArray(classesRes.data) ? classesRes.data : []
      classes.value = Array.from(new Set(rawClasses))
      videos.value = videosRes.data
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  return { courses, supplies, classes, videos, loading, error, loadOptions }
}
