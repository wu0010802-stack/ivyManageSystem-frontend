import { ref, reactive, computed, watch } from 'vue'
import { publicRegister } from '@/api/activityPublic'
import { ElMessage, ElMessageBox } from 'element-plus'
import { toggleArrayItem } from '@/utils/arrayUtils'

const DRAFT_KEY = 'activity_draft'
const TW_MOBILE_RE = /^09\d{8}$/

function normalizeMobile(raw) {
  return String(raw || '').replace(/[\s\-().]/g, '')
}

export function usePublicRegistrationForm({ courses, supplies, availability }) {
  const form = reactive({
    name: '',
    birthday: '',
    parent_phone: '',
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
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(val))
      }
    },
    { deep: true }
  )

  async function loadDraftIfExists() {
    // 草稿含 PII（姓名/生日/手機）→ 改 sessionStorage 避免跨 tab 關閉後仍殘留；
    // 同時清掉舊版本殘留的 localStorage 草稿（升級遷移）。
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* silent */ }
    const raw = sessionStorage.getItem(DRAFT_KEY)
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
      sessionStorage.removeItem(DRAFT_KEY)
    }
  }

  const phoneError = computed(() => {
    if (!form.parent_phone) return ''
    const normalized = normalizeMobile(form.parent_phone)
    if (!TW_MOBILE_RE.test(normalized)) return '請輸入 09 開頭的 10 碼手機號碼'
    return ''
  })

  const canSubmit = computed(() =>
    form.name.trim() &&
    form.birthday &&
    form.class_name &&
    TW_MOBILE_RE.test(normalizeMobile(form.parent_phone)) &&
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
    form.parent_phone = ''
    form.class_name = ''
    form.selectedCourses = []
    form.selectedSupplies = []
    form.notes = ''
    sessionStorage.removeItem(DRAFT_KEY)
  }

  async function handleSubmit(onSuccess) {
    submitting.value = true
    try {
      const res = await publicRegister({
        name: form.name.trim(),
        birthday: form.birthday,
        parent_phone: normalizeMobile(form.parent_phone),
        class: form.class_name,
        courses: form.selectedCourses.map((name) => ({ name, price: '' })),
        supplies: form.selectedSupplies.map((name) => ({ name, price: '' })),
        remark: form.notes.trim(),
      })
      submitResult.value = res.data
      sessionStorage.removeItem(DRAFT_KEY)
      if (onSuccess) await onSuccess()
    } catch (err) {
      ElMessage.error(err.response?.data?.detail || '報名失敗，請稍後再試')
    } finally {
      submitting.value = false
    }
  }

  return {
    form, submitting, submitResult, supplyExpanded,
    canSubmit, totalCost, phoneError,
    toggleCourse, toggleSupply, resetForm, handleSubmit, loadDraftIfExists,
  }
}
