/**
 * A1-P6：從 ActivityPublicView 抽出的課程顯示輔助 composable。
 *
 * 集中:
 *  - availabilityState(course)        — 名額顏色語意（剩餘 / 候補 / 額滿）
 *  - formatSchedule(course)            — 「週X 09:30–10:30」字串
 *  - courseAdvisory(course)            — 適齡 + 衝堂 warning 列表
 *  - selectedAdvisories                — 已勾選課程的 advisory 匯總(供 advisory-panel)
 *  - ageInMonths                       — 由 form.birthday 計算
 *
 * Input: { courses, availability, form } reactive refs
 */

import { computed } from 'vue'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function ageMonthsFromBirthday(birthday) {
  if (!birthday) return null
  const b = new Date(birthday)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let months =
    (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months -= 1
  return months >= 0 ? months : null
}

function monthsToYearLabel(m) {
  if (m == null) return ''
  const y = Math.floor(m / 12)
  const mo = m % 12
  if (y === 0) return `${mo} 個月`
  if (mo === 0) return `${y} 歲`
  return `${y} 歲 ${mo} 個月`
}

function hasSchedule(c) {
  return c && c.meeting_weekday != null && !!c.meeting_start_time && !!c.meeting_end_time
}

function schedulesOverlap(a, b) {
  if (!hasSchedule(a) || !hasSchedule(b)) return false
  if (a.meeting_weekday !== b.meeting_weekday) return false
  // "HH:MM" 字串字典序與時間序一致;半開區間判定重疊
  return a.meeting_start_time < b.meeting_end_time && b.meeting_start_time < a.meeting_end_time
}

export function useCourseAdvisory({ courses, availability, form }) {
  const ageInMonths = computed(() => ageMonthsFromBirthday(form.birthday))

  function formatSchedule(course) {
    if (!hasSchedule(course)) return ''
    return `週${WEEKDAY_LABELS[course.meeting_weekday]} ${course.meeting_start_time}–${course.meeting_end_time}`
  }

  // 對單一課程算 advisory(適齡 + 衝堂);僅在課程被勾選時計算衝堂
  function courseAdvisory(course) {
    const warnings = []
    const ageMonths = ageInMonths.value
    if (ageMonths != null) {
      if (course.min_age_months != null && ageMonths < course.min_age_months) {
        warnings.push({
          kind: 'age',
          severity: 'warn',
          message: `建議 ${monthsToYearLabel(course.min_age_months)} 以上`,
        })
      } else if (course.max_age_months != null && ageMonths > course.max_age_months) {
        warnings.push({
          kind: 'age',
          severity: 'warn',
          message: `建議 ${monthsToYearLabel(course.max_age_months)} 以下`,
        })
      }
    }
    if (form.selectedCourses.includes(course.name) && hasSchedule(course)) {
      for (const otherName of form.selectedCourses) {
        if (otherName === course.name) continue
        const other = courses.value.find((c) => c.name === otherName)
        if (other && schedulesOverlap(course, other)) {
          warnings.push({
            kind: 'conflict',
            severity: 'danger',
            message: `與「${otherName}」衝堂`,
          })
        }
      }
    }
    return warnings
  }

  // 已勾選課程的 advisory 匯總(用於 fee-preview 下方提醒區塊)
  const selectedAdvisories = computed(() => {
    const items = []
    for (const name of form.selectedCourses) {
      const course = courses.value.find((c) => c.name === name)
      if (!course) continue
      const w = courseAdvisory(course)
      if (w.length > 0) items.push({ courseName: name, warnings: w })
    }
    return items
  })

  // 名額狀態(顏色語意:充足→中性綠、≤3→紅、候補→黃、額滿→灰)
  function availabilityState(course) {
    const remaining = availability.value[course.name]
    if (remaining === undefined) {
      return { text: '', cssClass: '', full: false }
    }
    if (remaining === -1) {
      return { text: '已額滿', cssClass: 'is-full', full: true }
    }
    if (remaining <= 0) {
      return { text: '額滿·可候補', cssClass: 'is-waiting', full: false }
    }
    if (remaining <= 3) {
      return { text: `剩 ${remaining} 位`, cssClass: 'is-low', full: false }
    }
    return { text: `剩 ${remaining} 位`, cssClass: 'is-available', full: false }
  }

  return {
    ageInMonths,
    formatSchedule,
    courseAdvisory,
    selectedAdvisories,
    availabilityState,
  }
}
