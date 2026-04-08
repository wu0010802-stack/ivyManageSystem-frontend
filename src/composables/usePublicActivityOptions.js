import { ref } from 'vue'
import {
  getPublicCourses,
  getPublicSupplies,
  getPublicClasses,
  getPublicCourseVideos,
} from '@/api/activityPublic'

export function usePublicActivityOptions() {
  const courses = ref([])
  const supplies = ref([])
  const classes = ref([])
  const videos = ref({})
  const loading = ref(false)
  const error = ref(null)

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
      courses.value = coursesRes.data
      supplies.value = suppliesRes.data
      classes.value = classesRes.data
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
