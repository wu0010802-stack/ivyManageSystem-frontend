/**
 * 公開頁報名表單狀態。從 ActivityPublicView.vue 抽出（A1 拆分 P1）。
 *
 * 包含 form / errors 雙 reactive、validate 規則、即時費用預覽、phone touched UX、
 * 課程/用品 toggle 與生日上下限。不包含送出邏輯（handleSubmit 依賴 view 層 toast/
 * modal/refresh，留在 view）。
 *
 * 使用：
 *   const { form, errors, parentPhoneError, feePreview, validateForm,
 *           clearError, toggleCourse, toggleSupply, resetForm,
 *           normalizeMobile, maxBirthdayISO, minBirthdayISO }
 *     = usePublicRegistrationForm({ courses, supplies, availability })
 */

import { reactive, ref, computed } from 'vue'
import { toggleArrayItem } from '@/utils/arrayUtils'

const TW_MOBILE_RE = /^09\d{8}$/

// 保守 email 格式（與後端 EmailStr 寬嚴不必一致：打錯只是收不到信，無安全後果）
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// 對齊後端 DB String(200)
const EMAIL_MAX_LEN = 200

export function normalizeMobile(raw: unknown) {
  return String(raw || '').replace(/[\s\-().]/g, '')
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function priceOf(name: string, source: { name: string; price?: number | string }[]) {
  const item = source.find((it) => it.name === name)
  return Number(item?.price) || 0
}

const FIELD_FOCUS_ORDER = ['name', 'birthday', 'parent_phone', 'class_name', 'email', 'courses']

/**
 * Finding 3（2026-06-22）：公開報名表單中屬幼兒/家長 PII 的欄位。
 * useFormDraft 的草稿暫存（共用電腦 localStorage、scope 固定 'public'、TTL 7 天）
 * 必須 exclude 這些欄位，避免下一位訪客被提示還原前一位幼兒的姓名/生日/班級/電話。
 * 課程/用品選擇（selectedCourses / selectedSupplies）非 PII，仍可保留以利填表。
 */
export const PUBLIC_DRAFT_PII_FIELDS = [
  'name',
  'birthday',
  'parent_phone',
  'class_name',
  'email',
] as const

export function usePublicRegistrationForm({ courses, supplies, availability }: { courses: { value: { name: string; price?: number | string }[] }; supplies: { value: { name: string; price?: number | string }[] }; availability: { value: Record<string, number> } }) {
  const form = reactive({
    name: '',
    birthday: '',
    parent_phone: '',
    class_name: '',
    email: '',
    selectedCourses: [] as string[],
    selectedSupplies: [] as string[],
  })

  // 各欄位錯誤訊息（送出後填入；使用者開始修改時清除對應欄位）
  const errors = reactive({
    name: '',
    birthday: '',
    parent_phone: '',
    class_name: '',
    email: '',
    courses: '',
  })

  // 手機 onBlur 後才即時校驗,避免使用者剛開始打字就被紅字干擾
  const phoneTouched = ref(false)

  const parentPhoneError = computed(() => {
    if (errors.parent_phone) return errors.parent_phone
    if (!phoneTouched.value || !form.parent_phone) return ''
    return TW_MOBILE_RE.test(normalizeMobile(form.parent_phone))
      ? ''
      : '請輸入 09 開頭的 10 碼手機號碼'
  })

  // 生日輸入上下限（與後端 _validate_birthday_str 同步：20 年內、不可未來）
  const maxBirthdayISO = computed(() => toISODate(new Date()))
  const minBirthdayISO = computed(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 20)
    return toISODate(d)
  })

  // 即時費用預覽（學費 + 用品分項合計）
  // 候補課程仍計入估算（候補實際不收費,但家長對「最大金額」需有預期）
  const feePreview = computed(() => {
    const hasSelection =
      form.selectedCourses.length > 0 || form.selectedSupplies.length > 0
    if (!hasSelection) return null
    const coursesTotal = form.selectedCourses.reduce(
      (sum, name) => sum + priceOf(name, courses.value),
      0,
    )
    const suppliesTotal = form.selectedSupplies.reduce(
      (sum, name) => sum + priceOf(name, supplies.value),
      0,
    )
    const waitlistCount = form.selectedCourses.reduce((n, name) => {
      const remaining = availability.value[name]
      return remaining !== undefined && remaining <= 0 ? n + 1 : n
    }, 0)
    return {
      coursesTotal,
      suppliesTotal,
      total: coursesTotal + suppliesTotal,
      courseCount: form.selectedCourses.length,
      supplyCount: form.selectedSupplies.length,
      waitlistCount,
    }
  })

  function clearError(field: keyof typeof errors) {
    if (errors[field]) errors[field] = ''
  }

  function validateForm() {
    errors.name = ''
    errors.birthday = ''
    errors.parent_phone = ''
    errors.class_name = ''
    errors.email = ''
    errors.courses = ''

    const name = form.name.trim()
    const birthday = form.birthday
    const className = form.class_name
    const parentPhone = normalizeMobile(form.parent_phone)

    if (!name) errors.name = '請輸入幼兒姓名'

    if (!birthday) {
      errors.birthday = '請選擇幼兒生日'
    } else {
      const inputDate = new Date(birthday)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (Number.isNaN(inputDate.getTime())) {
        errors.birthday = '生日格式不正確'
      } else if (inputDate > today) {
        errors.birthday = '生日不可選擇未來日期'
      } else {
        const earliest = new Date(today)
        earliest.setFullYear(earliest.getFullYear() - 20)
        if (inputDate < earliest)
          errors.birthday = '生日超出合理範圍，請再次確認'
      }
    }

    if (!parentPhone) {
      errors.parent_phone = '請輸入家長手機號碼'
    } else if (!TW_MOBILE_RE.test(parentPhone)) {
      errors.parent_phone = '請輸入 09 開頭的 10 碼手機號碼'
    }

    if (!className) errors.class_name = '請選擇寶貝班級'

    const email = form.email.trim()
    if (email && (email.length > EMAIL_MAX_LEN || !EMAIL_RE.test(email))) {
      errors.email = '請輸入有效的 Email，或留空不填'
    }

    // 與後端 model_validator(_require_at_least_one_item) 對齊：
    // 至少一門課程「或」一項用品即可送出（允許「只買用品」的合法流程）。
    if (form.selectedCourses.length === 0 && form.selectedSupplies.length === 0)
      errors.courses = '請至少選擇一門課程或一項用品'

    return FIELD_FOCUS_ORDER.every((f) => !errors[f as keyof typeof errors])
  }

  /**
   * 切換報名課程選擇。額滿（availability=-1）擋「新加」；候補（=0）允許。
   * 已勾選的一律可取消：30s 輪詢後名額被搶（翻成 -1）時若連取消也擋，
   * 該課卡死在表單裡、送出必吃後端 400（查詢/編修頁 onToggleCourse 有同款
   * carve-out；audit C-3，2026-07-02）。
   */
  function toggleCourse(course: { name: string }) {
    if (
      availability.value[course.name] === -1 &&
      !form.selectedCourses.includes(course.name)
    )
      return
    toggleArrayItem(form.selectedCourses, course.name)
  }

  function toggleSupply(supply: { name: string }) {
    toggleArrayItem(form.selectedSupplies, supply.name)
  }

  function resetForm() {
    form.name = ''
    form.birthday = ''
    form.parent_phone = ''
    form.class_name = ''
    form.email = ''
    form.selectedCourses = []
    form.selectedSupplies = []
  }

  return {
    form,
    errors,
    phoneTouched,
    parentPhoneError,
    maxBirthdayISO,
    minBirthdayISO,
    feePreview,
    validateForm,
    clearError,
    toggleCourse,
    toggleSupply,
    resetForm,
    normalizeMobile,
    FIELD_FOCUS_ORDER,
  }
}
