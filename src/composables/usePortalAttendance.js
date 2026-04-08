import { ref, computed } from 'vue'
import {
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { ElMessage } from 'element-plus'

export function usePortalAttendance() {
  const allSessions = ref([])
  const selectedCourseId = ref(null)
  const selectedSessionId = ref(null)
  const sessionDetail = ref(null)
  const loadingSessions = ref(false)
  const loadingDetail = ref(false)
  const saving = ref(false)

  // 從所有場次提取課程選項（去重）
  const courseOptions = computed(() => {
    const map = {}
    allSessions.value.forEach(s => {
      if (!map[s.course_id]) {
        map[s.course_id] = { id: s.course_id, name: s.course_name }
      }
    })
    return Object.values(map)
  })

  // 依選擇課程篩選場次
  const filteredSessions = computed(() => {
    if (!selectedCourseId.value) return allSessions.value
    return allSessions.value.filter(s => s.course_id === selectedCourseId.value)
  })

  async function loadSessions() {
    loadingSessions.value = true
    selectedSessionId.value = null
    sessionDetail.value = null
    try {
      const res = await getPortalAttendanceSessions()
      allSessions.value = res.data
    } catch {
      ElMessage.error('載入場次失敗')
    } finally {
      loadingSessions.value = false
    }
  }

  async function selectSession(sessionId) {
    selectedSessionId.value = sessionId
    if (!sessionId) {
      sessionDetail.value = null
      return
    }
    loadingDetail.value = true
    sessionDetail.value = null
    try {
      const res = await getPortalAttendanceSession(sessionId)
      // 建立可編輯的學生列表副本，is_present null → false 作為預設
      sessionDetail.value = {
        ...res.data,
        students: res.data.students.map(s => ({
          ...s,
          is_present: s.is_present ?? false,
        })),
      }
    } catch {
      ElMessage.error('載入點名資料失敗')
    } finally {
      loadingDetail.value = false
    }
  }

  async function saveAttendance() {
    if (!sessionDetail.value) return
    saving.value = true
    try {
      const records = sessionDetail.value.students.map(s => ({
        registration_id: s.registration_id,
        is_present: s.is_present,
        notes: s.attendance_notes || '',
      }))
      await batchUpdatePortalAttendance(sessionDetail.value.id, records)
      ElMessage.success('點名已儲存')
      // 重新載入取得最新出席統計
      await selectSession(sessionDetail.value.id)
    } catch {
      ElMessage.error('儲存失敗，請重試')
    } finally {
      saving.value = false
    }
  }

  function togglePresent(student) {
    student.is_present = !student.is_present
  }

  return {
    allSessions, selectedCourseId, selectedSessionId, sessionDetail,
    loadingSessions, loadingDetail, saving,
    courseOptions, filteredSessions,
    loadSessions, selectSession, saveAttendance, togglePresent,
  }
}
