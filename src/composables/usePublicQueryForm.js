import { ref, reactive, computed } from 'vue'
import { publicQueryRegistration, publicUpdateRegistration } from '@/api/activityPublic'
import { ElMessage } from 'element-plus'
import { toggleArrayItem } from '@/utils/arrayUtils'

export function usePublicQueryForm({ courses, supplies, availability, registrationOpen }) {
  const queryForm = reactive({ name: '', birthday: '' })
  const queryLoading = ref(false)
  const queryResult = ref(null)
  const editMode = ref(false)
  const editForm = reactive({ selectedCourses: [], selectedSupplies: [], notes: '' })
  const editSubmitting = ref(false)

  const feeChangeSummary = computed(() => {
    if (!queryResult.value || !editMode.value) return null
    const originalTotal = queryResult.value.total_amount || 0
    const newCourseCost = editForm.selectedCourses.reduce((sum, name) => {
      const c = courses.value.find(c => c.name === name)
      return sum + (c?.price || 0)
    }, 0)
    const newSupplyCost = editForm.selectedSupplies.reduce((sum, name) => {
      const s = supplies.value.find(s => s.name === name)
      return sum + (s?.price || 0)
    }, 0)
    const newTotal = newCourseCost + newSupplyCost
    const diff = newTotal - originalTotal
    return { originalTotal, newTotal, diff }
  })

  async function handleQuery() {
    queryLoading.value = true
    queryResult.value = null
    editMode.value = false
    try {
      const res = await publicQueryRegistration(queryForm.name.trim(), queryForm.birthday)
      queryResult.value = res.data
    } catch (err) {
      if (err.response?.status === 404) {
        ElMessage.warning('查無此幼兒的報名資料')
      } else {
        ElMessage.error(err.response?.data?.detail || '查詢失敗')
      }
    } finally {
      queryLoading.value = false
    }
  }

  function enterEditMode() {
    editForm.selectedCourses = queryResult.value.courses.map(c => c.name)
    editForm.selectedSupplies = [...(queryResult.value.supplies || [])]
    editForm.notes = queryResult.value.remark || ''
    editMode.value = true
  }

  function toggleEditCourse(course) {
    if (
      availability.value[course.name] < 0 &&
      !editForm.selectedCourses.includes(course.name)
    ) return
    toggleArrayItem(editForm.selectedCourses, course.name)
  }

  function toggleEditSupply(supply) {
    toggleArrayItem(editForm.selectedSupplies, supply.name)
  }

  async function handleEditSubmit(onSuccess) {
    editSubmitting.value = true
    try {
      await publicUpdateRegistration({
        id: queryResult.value.id,
        name: queryResult.value.name,
        birthday: queryForm.birthday,
        class: queryResult.value.class_name,
        courses: editForm.selectedCourses.map(name => {
          const c = courses.value.find(c => c.name === name)
          return { name, price: String(c?.price ?? 0) }
        }),
        supplies: editForm.selectedSupplies.map(name => {
          const s = supplies.value.find(s => s.name === name)
          return { name, price: String(s?.price ?? 0) }
        }),
        remark: editForm.notes.trim(),
      })
      ElMessage.success('修改成功')
      editMode.value = false
      await handleQuery()
      if (onSuccess) await onSuccess()
    } catch (err) {
      ElMessage.error(err.response?.data?.detail || '修改失敗，請稍後再試')
    } finally {
      editSubmitting.value = false
    }
  }

  return {
    queryForm, queryLoading, queryResult,
    editMode, editForm, editSubmitting, feeChangeSummary,
    handleQuery, enterEditMode, toggleEditCourse, toggleEditSupply, handleEditSubmit,
  }
}
