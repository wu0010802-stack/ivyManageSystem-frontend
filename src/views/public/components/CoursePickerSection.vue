<script setup>
/**
 * A1-P7：從 ActivityPublicView 抽出的 Step 2 課程選擇區塊。
 *
 * 包含:
 *  - 「Step 2 選擇才藝課程」標題
 *  - 課程清單 v-for(含名額狀態、適齡/衝堂 advisory chip、影片預覽 btn)
 *
 * Props:
 *  - courses: array — 課程列表（包含 name / price / sessions / meeting_X / min_age_months / max_age_months）
 *  - optionsLoading: boolean — 課程載入中時顯示「載入中…」
 *  - selectedCourses: array — form.selectedCourses（已勾選課程名陣列）
 *  - videos: object — { courseName: videoUrl } 影片預覽連結
 *  - errorMessage: string — errors.courses
 *  - availabilityState: fn (course) => { text, cssClass, full } — 從 useCourseAdvisory 取
 *  - formatSchedule: fn (course) => string
 *  - courseAdvisory: fn (course) => warning[]
 *
 * Emits:
 *  - toggle(course) — 切換課程選擇（parent 呼叫 composable.toggleCourse + clearError）
 *  - open-video(courseName, videoUrl) — 點影片按鈕
 */
defineProps({
  courses: { type: Array, required: true },
  optionsLoading: { type: Boolean, default: false },
  selectedCourses: { type: Array, required: true },
  videos: { type: Object, default: () => ({}) },
  errorMessage: { type: String, default: '' },
  availabilityState: { type: Function, required: true },
  formatSchedule: { type: Function, required: true },
  courseAdvisory: { type: Function, required: true },
})

defineEmits(['toggle', 'open-video'])
</script>

<template>
  <div class="form-section-step">
    <span class="step-num">2</span>
    <div class="step-title-col">
      <span class="step-title">選擇才藝課程</span>
      <span class="step-desc">可複選；剩餘名額即時顯示</span>
    </div>
  </div>

  <div class="form-row" :class="{ 'has-error': !!errorMessage }">
    <div class="form-label-col">
      <span class="form-label">
        <span class="required-mark">*</span>
        才藝課班別 <span class="en">Courses</span>
      </span>
    </div>
    <div class="form-input-col">
      <div
        id="courseListGroup"
        class="course-list-vertical"
        role="group"
        aria-label="才藝課程選項"
        tabindex="-1"
      >
        <div v-if="optionsLoading" class="empty-hint">載入中…</div>
        <div v-else-if="courses.length === 0" class="empty-hint">目前尚無可報名課程</div>
        <div
          v-for="course in courses"
          v-else
          :key="course.name"
          class="course-item"
          :class="{ 'course-item-disabled': availabilityState(course).full }"
          :title="availabilityState(course).full ? '此課程已額滿，無法再報名' : ''"
        >
          <label class="course-label">
            <input
              type="checkbox"
              name="course"
              :value="course.name"
              :disabled="availabilityState(course).full"
              :checked="selectedCourses.includes(course.name)"
              @change="$emit('toggle', course)"
            />
            <span class="course-text course-text--stacked">
              <span class="course-row-main">
                <span class="course-name">{{ course.name }}</span>
                <span
                  v-if="availabilityState(course).text"
                  class="qty-display"
                  :class="availabilityState(course).cssClass"
                >
                  {{ availabilityState(course).text }}
                </span>
              </span>
              <span class="course-row-meta">
                <span class="meta-chip meta-chip--price">
                  <template v-if="course.sessions">{{ course.sessions }} 堂 · </template>NT$ {{ course.price }}
                </span>
                <span v-if="formatSchedule(course)" class="meta-chip meta-chip--schedule">
                  <svg class="icon" width="12" height="12" aria-hidden="true"><use href="#i-calendar" /></svg>
                  {{ formatSchedule(course) }}
                </span>
                <span
                  v-for="(w, i) in courseAdvisory(course)"
                  :key="`${course.name}-adv-${i}`"
                  class="meta-chip meta-chip--advisory"
                  :class="`meta-chip--${w.severity}`"
                  role="status"
                >
                  <svg class="icon" width="12" height="12" aria-hidden="true"><use href="#i-alert" /></svg>
                  {{ w.message }}
                </span>
              </span>
            </span>
          </label>
          <button
            v-if="videos[course.name]"
            type="button"
            class="video-btn"
            :aria-label="`觀看 ${course.name} 介紹影片`"
            @click="$emit('open-video', course.name, videos[course.name])"
          >
            <svg class="icon" aria-hidden="true"><use href="#i-play" /></svg>
            課程介紹
          </button>
        </div>
      </div>
      <div v-if="errorMessage" class="form-error-hint" role="alert">{{ errorMessage }}</div>
    </div>
  </div>
</template>
