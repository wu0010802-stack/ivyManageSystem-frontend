<script setup lang="ts">
/**
 * 才藝報名 BottomSheet（snap mid/full，預設 full）。
 *
 * Props:
 *  - modelValue: 開關（v-model）
 *  - formData: 報名表單 { student_id, course_ids, ... }（v-model:form-data）
 *  - children: 子女清單
 *  - availableCourses: 已過濾後的可報名課程
 *  - submitting: 送出中狀態
 *
 * Emits:
 *  - update:modelValue
 *  - update:form-data: 表單變更時整包重發
 *  - submit
 */
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'

interface Child {
  student_id: number
  name: string
}

interface Course {
  id: number
  name: string
  price?: number
  is_full?: boolean
  allow_waitlist?: boolean
}

interface FormData {
  student_id?: number
  course_ids?: number[]
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  formData: FormData
  children?: Child[]
  availableCourses?: Course[]
  submitting?: boolean
  // code review #6：衝堂課程 id 集合（與既有報名或本次其他勾選互衝）。advisory 提示，
  // 不停用 checkbox（衝堂為警告不阻擋報名，與後端 model 設計一致）。
  conflictIds?: Set<number>
}>(), {
  children: () => [],
  availableCourses: () => [],
  submitting: false,
  conflictIds: () => new Set<number>(),
})
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:form-data': [value: FormData]
  'submit': []
}>()

function update(field: string, value: unknown): void {
  emit('update:form-data', { ...props.formData, [field]: value })
}

// 滿額且不開放候補（is_full && allow_waitlist===false）→ 後端 _attach_courses fail-closed
// 對此情形 raise 400，純前端契約缺口；此處鎖住 checkbox 防呆（衝堂 conflictIds 維持只警告不鎖）。
function isLocked(c: Course): boolean {
  return c.is_full === true && c.allow_waitlist === false
}

function toggleCourse(id: number): void {
  // 守衛：額滿不候補課若尚未勾選則不可加入（已勾的不鎖，避免無法取消既有選擇）
  const ids = Array.isArray(props.formData.course_ids) ? [...props.formData.course_ids] : []
  const locked = props.availableCourses.find((c) => c.id === id)
  if (locked && isLocked(locked) && !ids.includes(id)) return
  const idx = ids.indexOf(id)
  if (idx >= 0) ids.splice(idx, 1)
  else ids.push(id)
  update('course_ids', ids)
}
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    title="報名才藝課"
    :snap-points="['mid', 'full']"
    default-snap="full"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <div class="field">
        <label for="activity-student">學生</label>
        <select
          id="activity-student"
          :value="formData.student_id"
          @change="update('student_id', Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="c in children"
            :key="c.student_id"
            :value="c.student_id"
          >{{ c.name }}</option>
        </select>
      </div>
      <fieldset class="field">
        <legend>選擇課程（可複選）</legend>
        <div v-if="availableCourses.length === 0" class="text-muted">無可報名課程</div>
        <label
          v-for="c in availableCourses"
          :key="c.id"
          class="course-pick"
        >
          <input
            type="checkbox"
            :checked="formData.course_ids?.includes(c.id)"
            :disabled="isLocked(c) && !formData.course_ids?.includes(c.id)"
            @change="toggleCourse(c.id)"
          />
          <span class="pick-name">
            {{ c.name }}
            <span v-if="conflictIds.has(c.id)" class="pick-conflict">⚠ 時段衝突</span>
          </span>
          <span class="pick-meta">
            ${{ c.price?.toLocaleString() }}
            <span v-if="c.is_full && c.allow_waitlist === false" class="pick-full-locked">・已額滿・恕不開放候補</span>
            <span v-else-if="c.is_full">・已額滿{{ c.allow_waitlist ? '（候補）' : '' }}</span>
          </span>
        </label>
      </fieldset>
    </div>

    <template #footer>
      <div class="register-footer">
        <button
          type="button"
          class="secondary-btn"
          @click="emit('update:modelValue', false)"
        >取消</button>
        <button
          type="button"
          class="primary-btn"
          :disabled="submitting"
          @click="emit('submit')"
        >{{ submitting ? '送出中...' : '送出報名' }}</button>
      </div>
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field label,
.field legend {
  display: block;
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin-bottom: 4px;
  padding: 0;
}

.field {
  border: none;
  padding: 0;
  margin: 0;
}

.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.course-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 14px;
}

.pick-name {
  flex: 1;
  font-weight: 500;
}

.pick-conflict {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--pt-warning-text-soft, var(--color-warning, #b45309));
  white-space: nowrap;
}

.pick-meta {
  color: var(--pt-text-placeholder);
  font-size: 12px;
}

.pick-full-locked {
  color: var(--pt-warning-text-soft, var(--color-warning, #b45309));
  font-weight: 600;
}

.text-muted {
  color: var(--pt-text-placeholder);
  font-size: 13px;
  text-align: center;
  padding: 12px;
}

.register-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.primary-btn:disabled { opacity: 0.5; }

.secondary-btn {
  padding: 8px 16px;
  background: var(--neutral-0);
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
</style>
