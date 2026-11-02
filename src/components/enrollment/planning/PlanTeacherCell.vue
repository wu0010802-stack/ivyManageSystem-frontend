<template>
  <div class="plan-teacher-cell">
    <!-- 點格子才展開下拉：常駐 24 個下拉框太吵，平常只看姓名 -->
    <!-- 選項分組：原班老師（標「原班」）／帶班老師／其他職務；現值已停用時另有「目前指派」 -->
    <el-select
      v-if="editing"
      ref="selectRef"
      :model-value="teacherId ?? undefined"
      class="teacher-select"
      :placeholder="sourceTeacherName ? `原班：${sourceTeacherName}` : '選擇老師'"
      filterable
      clearable
      automatic-dropdown
      :aria-label="`${className} ${roleLabel}`"
      @change="onChange"
      @visible-change="onVisibleChange"
      @blur="onBlur"
    >
      <el-option-group v-for="group in optionGroups" :key="group.label" :label="group.label">
        <el-option
          v-for="opt in group.options"
          :key="opt.id"
          :label="opt.label"
          :value="opt.id"
          :disabled="opt.disabled"
        >
          <span class="opt-label">{{ opt.label }}</span>
          <span v-if="opt.note" class="opt-note">{{ opt.note }}</span>
        </el-option>
      </el-option-group>
    </el-select>
    <button
      v-else-if="editable"
      type="button"
      class="teacher-trigger"
      :class="{ 'is-empty': !teacherName, 'is-blocking': !teacherName && role === 'head', 'has-error': !!error }"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-label="`${className} ${roleLabel}：${teacherName ?? '未指派'}，點擊選擇老師`"
      @click="startEdit"
    >
      <span class="teacher-name" :title="teacherName ?? undefined">{{ teacherName ?? '未指派' }}</span>
      <span v-if="!teacherName && sourceTeacherName" class="teacher-source">原班：{{ sourceTeacherName }}</span>
    </button>
    <template v-else>
      <span class="teacher-name" :class="{ 'is-empty': !teacherName, 'is-blocking': !teacherName && role === 'head' }">{{ teacherName ?? '未指派' }}</span>
      <span v-if="!teacherName && sourceTeacherName" class="teacher-source">原班：{{ sourceTeacherName }}</span>
    </template>
    <!-- 這一格存檔失敗（例：選到已停用的老師）：錯誤留在格子上，不只是一閃而過的 toast -->
    <span v-if="error && !editing" class="teacher-error" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { TEACHER_ROLE_LABELS, type TeacherOptionGroup, type TeacherRole } from './planHelpers'

// 編班表的班導／副班導／美語老師格：取代「每班開一次對話框選三位老師」。
// 只負責顯示與派發 change(teacherId|null)；PATCH 與樂觀鎖由父層 updateClass 處理。

const props = withDefaults(defineProps<{
  role: TeacherRole
  className: string
  teacherId: number | null
  teacherName: string | null
  sourceTeacherName?: string | null
  editable: boolean
  /** 父層 mutation in-flight：鎖住觸發點，防雙擊以同一 base_version 送第二發 */
  disabled?: boolean
  optionGroups: TeacherOptionGroup[]
  /** 這一格上次存檔失敗的原因（父層依後端 detail.field 對到格子） */
  error?: string | null
}>(), {
  sourceTeacherName: null,
  disabled: false,
  error: null,
})

const emit = defineEmits<{
  change: [teacherId: number | null]
}>()

const roleLabel = computed(() => TEACHER_ROLE_LABELS[props.role])

const editing = ref(false)
const selectRef = ref<{ focus: () => void } | null>(null)

async function startEdit(): Promise<void> {
  if (props.disabled) return
  editing.value = true
  await nextTick()
  selectRef.value?.focus()
}

function onChange(value: unknown): void {
  // clearable 的 × 會給 undefined；JSON 序列化會整欄丟掉 → 後端視為未變更，必須正規化成 null
  const next = typeof value === 'number' ? value : null
  editing.value = false
  if (next === props.teacherId) return
  emit('change', next)
}

function onVisibleChange(visible: boolean): void {
  if (!visible) editing.value = false
}

// Tab 或點別處離開：沒選就收回顯示態（只靠 visible-change 時，Tab 離開會卡在下拉框）
function onBlur(): void {
  editing.value = false
}
</script>

<style scoped>
.plan-teacher-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  /* 固定格寬：展開下拉或長姓名都不撐開整欄 */
  width: 6.5rem;
  max-width: 6.5rem;
  margin: 0 auto;
}

.teacher-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.teacher-trigger.has-error {
  border-color: var(--color-danger);
}

.teacher-error {
  max-width: 100%;
  font-size: var(--text-xs);
  line-height: 1.3;
  white-space: normal;
  color: var(--color-danger-darker);
}

.teacher-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 2px 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.teacher-trigger:hover:not(:disabled),
.teacher-trigger:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  outline: none;
}

.teacher-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 班導未指派會擋發布 → 警示色；副班導／美語只是提醒 → 次要色 */
.teacher-name.is-empty,
.teacher-trigger.is-empty .teacher-name {
  color: var(--text-secondary);
}

.teacher-name.is-blocking,
.teacher-trigger.is-blocking .teacher-name {
  color: var(--color-warning-hover);
  font-weight: var(--font-weight-semibold);
}

.teacher-source {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.teacher-select {
  width: 100%;
}

.opt-note {
  margin-left: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
</style>
