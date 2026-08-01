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
import { parseLocalISODate, todayTaipeiISO } from '@/utils/format'
import { TW_MOBILE_RE, normalizeMobile } from '@/utils/phone'

// Email 格式。2026-07-31 稽核：原本的 /^[^@\s]+@[^@\s]+\.[^@\s]+$/ 比後端的
// email-validator 寬得多，`wang@gmail..com`、`abc@gmail.com.`、`.abc@gmail.com`、
// `abc@my_domain.com` 都會放行 → 前端不標紅、直接送出，後端 422 打回來，家長只看到
// 一句籠統的送出失敗，完全不知道是那個「選填」的 Email 欄位害的（整筆報名被退）。
// 收緊到：local part 不以句點開頭、domain 各段須以英數起訖、不得有連續句點或結尾句點。
const EMAIL_RE =
  /^[^\s@.][^\s@]*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/
// 對齊後端 DB String(200)
const EMAIL_MAX_LEN = 200

// normalizeMobile 原本在此檔定義；F4 拆分時發現 ActivityPublicQueryView.vue 有一份
// 一模一樣的重複，已收斂至 @/utils/phone 單一事實來源，此處 re-export 維持既有呼叫端
// （import { normalizeMobile } from '@/composables/usePublicRegistrationForm'）相容。
export { normalizeMobile }

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

// 課程優先流程：選課在第 1 步，錯誤聚焦先跳課程再跳寶貝資料欄位
const FIELD_FOCUS_ORDER = ['courses', 'name', 'birthday', 'parent_phone', 'class_name', 'email']

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
  const maxBirthdayISO = computed(() => todayTaipeiISO())
  const minBirthdayISO = computed(() => {
    const d = parseLocalISODate(todayTaipeiISO())
    if (!d) return ''
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

  function clearPersonalDetailErrors() {
    errors.name = ''
    errors.birthday = ''
    errors.parent_phone = ''
    errors.class_name = ''
    errors.email = ''
  }

  function validatePersonalDetails() {
    clearPersonalDetailErrors()

    const name = form.name.trim()
    const birthday = form.birthday
    const className = form.class_name
    const parentPhone = normalizeMobile(form.parent_phone)

    if (!name) errors.name = '請輸入幼兒姓名'

    if (!birthday) {
      errors.birthday = '請選擇幼兒生日'
    } else {
      const inputDate = parseLocalISODate(birthday)
      const today = parseLocalISODate(todayTaipeiISO())
      if (!inputDate) {
        errors.birthday = '生日格式不正確'
      } else if (!today) {
        errors.birthday = '無法判定今日日期，請稍後再試'
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

    return ['name', 'birthday', 'parent_phone', 'class_name', 'email'].every(
      (field) => !errors[field as keyof typeof errors],
    )
  }

  function validateSelections() {
    errors.courses = ''
    if (form.selectedCourses.length === 0)
      errors.courses = '請至少選擇一門課程（用品為選填）'

    return !errors.courses
  }

  function validateForm() {
    // 兩段都執行，送出時一次呈現完整錯誤，不因第一段失敗而漏掉選課提示。
    const detailsValid = validatePersonalDetails()
    const selectionsValid = validateSelections()

    return detailsValid && selectionsValid
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
    validatePersonalDetails,
    validateSelections,
    validateForm,
    clearError,
    toggleCourse,
    toggleSupply,
    resetForm,
    normalizeMobile,
    FIELD_FOCUS_ORDER,
  }
}
