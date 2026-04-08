import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 才藝點名 Drawer 共用邏輯
 *
 * @param {Object} options
 * @param {Function} options.getSessionFn  - 取得場次詳情的 API 函式，接受 session id
 * @param {Function} options.updateFn      - 批次儲存點名的 API 函式，接受 (id, records)
 */
export function useActivityAttendanceDrawer({ getSessionFn, updateFn }) {
  const drawerVisible = ref(false)
  const drawerLoading = ref(false)
  const drawerSession = ref(null)
  const saveLoading = ref(false)

  // 未點名學生排最前，其餘維持原順序
  const sortedStudents = computed(() => {
    if (!drawerSession.value) return []
    return [...drawerSession.value.students].sort((a, b) => {
      const aNone = a.is_present === null
      const bNone = b.is_present === null
      if (aNone && !bNone) return -1
      if (!aNone && bNone) return 1
      return 0
    })
  })

  const drawerTitle = computed(() => {
    if (!drawerSession.value) return '點名'
    return `點名｜${drawerSession.value.course_name}｜${drawerSession.value.session_date}`
  })

  const drawerPresentCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === true).length
      : 0
  )

  const drawerAbsentCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === false).length
      : 0
  )

  const drawerUnmarkedCount = computed(() =>
    drawerSession.value
      ? drawerSession.value.students.filter(s => s.is_present === null).length
      : 0
  )

  async function openDrawer(row) {
    drawerVisible.value = true
    drawerLoading.value = true
    drawerSession.value = null
    try {
      const res = await getSessionFn(row.id)
      drawerSession.value = res.data
    } catch {
      ElMessage.error('載入點名資料失敗')
      drawerVisible.value = false
    } finally {
      drawerLoading.value = false
    }
  }

  function setAllPresent(value) {
    if (!drawerSession.value) return
    drawerSession.value.students.forEach(s => {
      s.is_present = value
    })
  }

  async function handleSave(onSuccess) {
    if (!drawerSession.value) return
    const records = drawerSession.value.students
      .filter(s => s.is_present !== null)
      .map(s => ({
        registration_id: s.registration_id,
        is_present: s.is_present,
        notes: s.attendance_notes || '',
      }))
    saveLoading.value = true
    try {
      await updateFn(drawerSession.value.id, records)
      ElMessage.success('點名儲存成功')
      drawerVisible.value = false
      if (onSuccess) onSuccess()
    } catch (e) {
      const msg = e?.response?.data?.detail || '儲存失敗'
      ElMessage.error(msg)
    } finally {
      saveLoading.value = false
    }
  }

  return {
    drawerVisible,
    drawerLoading,
    drawerSession,
    saveLoading,
    sortedStudents,
    drawerTitle,
    drawerPresentCount,
    drawerAbsentCount,
    drawerUnmarkedCount,
    openDrawer,
    setAllPresent,
    handleSave,
  }
}
