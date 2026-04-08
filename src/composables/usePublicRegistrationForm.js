import { ref, reactive, computed, watch } from 'vue'
import { publicRegister } from '@/api/activityPublic'
import { ElMessage, ElMessageBox } from 'element-plus'
import { toggleArrayItem } from '@/utils/arrayUtils'

const DRAFT_KEY = 'activity_draft'

export function usePublicRegistrationForm({ courses, supplies, availability }) {
  const form = reactive({
    name: '',
    birthday: '',
    class_name: '',
    selectedCourses: [],
    selectedSupplies: [],
    notes: '',
  })
  const submitting = ref(false)
  const submitResult = ref(null)
  const supplyExpanded = ref(true)

  // 監聽表單變動，自動存入 localStorage
  watch(
    () => ({ ...form, selectedCourses: [...form.selectedCourses], selectedSupplies: [...form.selectedSupplies] }),
    (val) => {
      const hasContent = val.name || val.birthday || val.class_name || val.selectedCourses.length > 0
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(val))
      }
    },
    { deep: true }
  )

  async function loadDraftIfExists() {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      if (!draft.name && !draft.birthday) return
      await ElMessageBox.confirm(
        '偵測到未完成的報名草稿，是否繼續填寫？',
        '繼續上次的報名',
        { confirmButtonText: '繼續', cancelButtonText: '重新填寫', type: 'info' }
      )
      Object.assign(form, draft)
    } catch {
      // 使用者選擇重新填寫或解析失敗，清除草稿
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  const canSubmit = computed(() =>
    form.name.trim() &&
    form.birthday &&
    form.class_name &&
    form.selectedCourses.length > 0
  )

  const totalCost = computed(() => {
    const courseCost = form.selectedCourses.reduce((sum, name) => {
      const c = courses.value.find(c => c.name === name)
      return sum + (c?.price || 0)
    }, 0)
    const supplyCost = form.selectedSupplies.reduce((sum, name) => {
      const s = supplies.value.find(s => s.name === name)
      return sum + (s?.price || 0)
    }, 0)
    return courseCost + supplyCost
  })

  function toggleCourse(course) {
    if (availability.value[course.name] < 0) return
    toggleArrayItem(form.selectedCourses, course.name)
  }

  function toggleSupply(supply) {
    toggleArrayItem(form.selectedSupplies, supply.name)
  }

  function resetForm() {
    form.name = ''
    form.birthday = ''
    form.class_name = ''
    form.selectedCourses = []
    form.selectedSupplies = []
    form.notes = ''
    localStorage.removeItem(DRAFT_KEY)
  }

  async function handleSubmit(onSuccess) {
    submitting.value = true
    try {
      const res = await publicRegister({
        name: form.name.trim(),
        birthday: form.birthday,
        class_name: form.class_name,
        courses: form.selectedCourses,
        supplies: form.selectedSupplies,
        notes: form.notes.trim(),
      })
      submitResult.value = res.data
      localStorage.removeItem(DRAFT_KEY)
      if (onSuccess) await onSuccess()
    } catch (err) {
      ElMessage.error(err.response?.data?.detail || '報名失敗，請稍後再試')
    } finally {
      submitting.value = false
    }
  }

  return {
    form, submitting, submitResult, supplyExpanded,
    canSubmit, totalCost,
    toggleCourse, toggleSupply, resetForm, handleSubmit, loadDraftIfExists,
  }
}
