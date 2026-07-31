<script setup lang="ts">
/**
 * A1-P7：從 ActivityPublicView 抽出的 Step 2 課程選擇區塊。
 *
 * 包含:
 *  - 「Step 2 選擇才藝課程」標題
 *  - 課程清單 v-for(含名額狀態、衝堂 advisory chip、影片預覽 btn)
 *  - 影片 chip hover 600ms 後浮現 muted autoplay preview (YouTube-style)
 */
import { reactive, computed, onUnmounted } from 'vue'

interface CourseItem {
  name: string
  price?: string | number
  sessions?: number | string
  [key: string]: unknown
}
interface AvailabilityResult { text: string; cssClass: string; full: boolean }
interface AdvisoryChip { severity: string; message: string }

const props = withDefaults(defineProps<{
  courses: CourseItem[]
  selectedCourses: string[]
  videos?: Record<string, string>
  errorMessage?: string
  availabilityState: (course: CourseItem) => AvailabilityResult
  formatSchedule: (course: CourseItem) => string
  courseAdvisory: (course: CourseItem) => AdvisoryChip[]
  isActiveStep?: boolean
}>(), {
  videos: () => ({}),
  errorMessage: '',
  isActiveStep: false,
})

defineEmits<{
  (e: 'toggle', course: CourseItem): void
  (e: 'open-video', title: string, url: string): void
}>()

// C4：每列的 availabilityState 以 name 為鍵記憶一次，避免模板在同一 render
// 對每門課呼叫 availabilityState ~6 次（各 new 物件）→ 任何 reactive 變動
// （如 hover 預覽）觸發 re-render 就整列重算 O(6N)。key 用 course.name 與
// v-for :key="course.name" 一致（name 為課程唯一鍵）。computed 追蹤
// availabilityState 內部的 availability ref 與 courses，依賴變動即重算。
const courseStates = computed(() => {
  const map = new Map<string, AvailabilityResult>()
  for (const course of props.courses) {
    map.set(course.name, props.availabilityState(course))
  }
  return map
})

// 額滿鎖定只擋「新加」：已勾選的課保留可取消，否則 30s 輪詢後名額翻轉
// （-1）時該課卡死在表單、送出必 400（audit C-3，2026-07-02；與
// usePublicRegistrationForm.toggleCourse 守衛及查詢頁 courseLocked 對齊）
function courseLocked(course: CourseItem): boolean {
  return !!courseStates.value.get(course.name)?.full && !props.selectedCourses.includes(course.name)
}

const PREVIEW_W = 320
const PREVIEW_H = 180
const HOVER_DELAY_MS = 600
const EDGE_MARGIN = 8

const hoverPreview = reactive<{
  visible: boolean
  courseName: string
  embedUrl: string
  style: { top: string; left: string }
}>({
  visible: false,
  courseName: '',
  embedUrl: '',
  style: { top: '0px', left: '0px' },
})
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function extractYoutubeId(url: string): string | null {
  const m = String(url || '').match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  )
  return m ? m[1] : null
}

function schedulePreview(courseName: string, url: string, event: MouseEvent | FocusEvent) {
  cancelPreview()
  const id = extractYoutubeId(url)
  if (!id) return
  const target = event.currentTarget as HTMLElement
  hoverTimer = setTimeout(() => {
    const rect = target.getBoundingClientRect()
    let left = rect.right + EDGE_MARGIN
    let top = rect.top + (rect.height - PREVIEW_H) / 2
    if (left + PREVIEW_W > window.innerWidth - EDGE_MARGIN) {
      left = rect.left - PREVIEW_W - EDGE_MARGIN
    }
    if (left < EDGE_MARGIN) {
      left = Math.min(rect.left, window.innerWidth - PREVIEW_W - EDGE_MARGIN)
      top = rect.bottom + EDGE_MARGIN
    }
    top = Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - PREVIEW_H - EDGE_MARGIN))
    hoverPreview.courseName = courseName
    hoverPreview.embedUrl =
      `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0` +
      `&modestbranding=1&rel=0&loop=1&playlist=${id}&playsinline=1`
    hoverPreview.style = { top: `${top}px`, left: `${left}px` }
    hoverPreview.visible = true
  }, HOVER_DELAY_MS)
}

function cancelPreview() {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  hoverPreview.visible = false
  hoverPreview.embedUrl = ''
}

onUnmounted(cancelPreview)
</script>

<template>
  <div class="form-section-step" :class="{ 'is-active': isActiveStep }">
      <span class="step-num">2</span>
      <div class="step-title-col">
        <span class="step-title">選擇才藝課程</span>
        <span class="step-desc">至少一門課程；可複選、用品選填、剩餘名額即時顯示</span>
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
        <!-- 死 prop 清理（critique 2026-07-28）：optionsLoading 一路綁到
             usePublicActivityOptions 內從未 set true 的 ref；bootstrap 載入期間
             母頁已改中性 init-loading 面板、不會渲染到這裡，載入分支不可達 -->
        <div v-if="courses.length === 0" class="empty-hint">目前尚無可報名課程</div>
        <div
          v-for="course in courses"
          v-else
          :key="course.name"
          class="course-item"
          :class="{ 'course-item-disabled': courseLocked(course) }"
          :title="courseLocked(course) ? '此課程已額滿，無法再報名' : ''"
        >
          <label class="course-label">
            <input
              type="checkbox"
              name="course"
              :value="course.name"
              :disabled="courseLocked(course)"
              :checked="selectedCourses.includes(course.name)"
              @change="$emit('toggle', course)"
            />
            <span class="course-text course-text--stacked">
              <span class="course-row-main">
                <span class="course-name">{{ course.name }}</span>
                <span
                  v-if="courseStates.get(course.name)?.text"
                  class="qty-display"
                  :class="courseStates.get(course.name)?.cssClass"
                >
                  {{ courseStates.get(course.name)?.text }}
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
            class="video-btn tap-target"
            :aria-label="`觀看 ${course.name} 介紹影片`"
            @click="$emit('open-video', course.name, videos[course.name])"
            @mouseenter="schedulePreview(course.name, videos[course.name], $event)"
            @mouseleave="cancelPreview"
            @focus="schedulePreview(course.name, videos[course.name], $event)"
            @blur="cancelPreview"
          >
            <svg class="icon" aria-hidden="true"><use href="#i-play" /></svg>
            課程介紹
          </button>
        </div>
      </div>
      <div v-if="errorMessage" class="form-error-hint" role="alert">{{ errorMessage }}</div>
    </div>
  </div>

  <transition name="hover-preview">
    <div
      v-if="hoverPreview.visible"
      class="video-hover-preview"
      :style="hoverPreview.style"
      role="presentation"
      aria-hidden="true"
    >
      <iframe
        :src="hoverPreview.embedUrl"
        title="課程預覽"
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        loading="lazy"
      />
      <div class="video-hover-preview-label">{{ hoverPreview.courseName }} · 預覽（無聲）</div>
    </div>
  </transition>
</template>

<style scoped>
/* 本檔 scoped 樣式：因為 parent ActivityPublicView 的 <style scoped> 加的
   data-v-* 不會落到子元件 DOM，導致 form-row / course-item / video-btn 等
   layout class 全部失效（video-btn 變成 374×160 大方塊）。
   這裡複製 parent 中此 template 用到的規則，由子元件自己 scope 套用。 */

.form-section-step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.form-section-step:first-child { padding-top: var(--space-3); }
.form-section-step.is-active .step-num {
  background-color: var(--color-primary-strong);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.form-section-step.is-active .step-title { color: var(--color-primary-strong); }
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  background: transparent;
  color: var(--color-primary-strong);
  font-weight: 700;
  font-size: var(--fs-sm);
  font-family: var(--font-display);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-full);
}
.step-title-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.step-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.01em;
}
.step-desc {
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  line-height: 1.4;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  border-bottom: 1px dashed var(--color-border);
}
.form-row:last-child { border-bottom: 0; }
.form-label-col { display: flex; flex-direction: column; gap: 2px; }
.form-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.4;
}
.form-label .en {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--color-text-subtle);
  font-family: -apple-system, 'Segoe UI', sans-serif;
  letter-spacing: 0.02em;
}
.required-mark { color: var(--color-required); font-weight: 700; }
.form-input-col { width: 100%; }
.form-error-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: var(--fs-xs);
  color: var(--color-danger);
  font-weight: 600;
  line-height: 1.4;
}
.form-error-hint::before {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DC2626' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>");
  background-size: contain;
  background-repeat: no-repeat;
}

.course-list-vertical {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-2);
}
.course-list-vertical:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-md); }

.course-item {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  padding: 0;
  background-color: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
  line-height: 1.5;
  overflow: hidden;
}
.course-item:hover:not(.course-item-disabled) {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
}
.course-item:has(input:checked) {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.course-label {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  min-width: 0;
}
.course-item input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
  display: grid;
  place-content: center;
  margin: 3px 0 0 0;
  width: 18px;
  height: 18px;
  /* 未勾邊框需達 WCAG 1.4.11 非文字對比 3:1；舊 --color-success-soft（#dcfce7）
     對白底僅 1.07:1，家長看不出卡片可勾選 */
  border: 2px solid var(--color-text-subtle);
  border-radius: 5px;
  background-color: var(--color-surface);
  background-position: center;
  background-repeat: no-repeat;
  background-size: 12px 12px;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.course-item input[type="checkbox"]:checked {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'><path d='M2.5 6.2 5 8.7 9.5 3.3' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
}
.course-item input[type="checkbox"]:disabled {
  border-color: var(--neutral-300);
  background-color: #f3f4f6;
}
.course-item-disabled {
  background-color: #f5f6f8;
  border-style: dashed;
  border-color: var(--neutral-300);
  position: relative;
}
.course-item-disabled::after {
  content: "已額滿";
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  background: var(--text-secondary);
  color: var(--neutral-0);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-full);
  letter-spacing: 0.05em;
  pointer-events: none;
}
.course-item-disabled .course-name { color: var(--text-tertiary); text-decoration: line-through; text-decoration-color: rgba(156, 163, 175, 0.6); }
.course-item-disabled .meta-chip { color: #b0b7bf; background-color: transparent; border-color: #e5e7eb; }
.course-item-disabled .qty-display { display: none; }
.course-item-disabled:hover { border-color: var(--neutral-300); background-color: #f5f6f8; }
.course-item-disabled .course-label { cursor: not-allowed; }
.course-item-disabled input { cursor: not-allowed; }

.course-text {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: var(--fs-base);
  color: var(--color-text);
  min-width: 0;
}
.course-text--stacked {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 6px;
}
.course-row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}
.course-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}
.course-name { font-weight: 600; font-size: var(--fs-base); line-height: 1.4; }
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-full);
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
  letter-spacing: 0.01em;
}
.meta-chip--price {
  color: var(--color-text-muted);
  background-color: var(--color-surface-muted);
  border-color: var(--color-border);
}
.meta-chip--schedule {
  color: var(--color-text-muted);
  background-color: var(--color-surface-muted);
  border-color: var(--color-border);
}
.meta-chip--schedule .icon { color: var(--ivy-teal); flex-shrink: 0; }
.meta-chip--advisory .icon { flex-shrink: 0; }
.meta-chip--danger {
  color: var(--color-danger-darker);
  background-color: var(--color-danger-soft);
  border-color: rgba(220, 38, 38, 0.35);
}
.qty-display {
  font-weight: 600;
  font-size: var(--fs-xs);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-surface-muted);
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.qty-display.is-available { background-color: var(--color-surface-muted); color: var(--color-text-muted); }
.qty-display.is-low { background-color: var(--color-danger-soft); color: var(--color-danger-darker); }
.qty-display.is-waiting { background-color: var(--color-warning-soft); color: var(--color-warning-darker); }
.qty-display.is-full { background-color: #e5e7eb; color: var(--text-secondary); }

.empty-hint {
  grid-column: 1 / -1;
  padding: var(--space-5);
  color: var(--color-text-subtle);
  font-size: var(--fs-sm);
  line-height: 1.6;
  text-align: center;
  background-color: var(--color-surface-muted);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

.video-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: center;
  margin-right: var(--space-3);
  padding: 6px 12px;
  background-color: var(--color-accent-soft);
  color: var(--color-accent);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  min-height: 32px;
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.video-btn:hover { background-color: var(--color-accent); color: var(--neutral-0); transform: scale(1.03); }
.video-btn .icon, .video-btn svg { width: 12px; height: 12px; flex-shrink: 0; }

/* Hover preview popover：320×180、fixed viewport-anchored */
.video-hover-preview {
  position: fixed;
  z-index: 9000;
  width: 320px;
  background: #000;
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.16);
  overflow: hidden;
  pointer-events: none;
}
.video-hover-preview iframe {
  display: block;
  width: 100%;
  height: 180px;
  border: 0;
}
.video-hover-preview-label {
  padding: 6px 12px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.02em;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
}
.hover-preview-enter-active,
.hover-preview-leave-active {
  transition: opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.hover-preview-enter-from,
.hover-preview-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

/* 觸控裝置不觸發 hover preview（避免 iOS 點一下殘留） */
@media (hover: none) {
  .video-hover-preview { display: none; }
}

/* 行動裝置：course-item 內換行讓 video-btn 落到下一列 */
@media (--to-sm) {
  .course-item { flex-wrap: wrap; }
  .course-item-disabled::after { top: 6px; right: 6px; padding: 1px 6px; font-size: 9px; }
  .video-btn { margin: 0 var(--space-4) var(--space-3); }
}
</style>
