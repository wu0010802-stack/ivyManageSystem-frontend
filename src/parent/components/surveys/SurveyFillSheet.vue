<script setup lang="ts">
/**
 * 活動參加調查填寫 sheet（presentational，不打 api）。
 *
 * Props/Emits 契約見 task-17-brief.md。
 *  - attending 為 null：送出鈕 disabled
 *  - attending === false：隱藏附加題區，送出前清空 answers
 *  - attending === true：逐題渲染必填檢查（single→radio / multi→checkbox / number→input[number] / text→textarea）
 */
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'
import { toast } from '@/parent/utils/toast'

interface Question {
  id: number
  question_text: string
  question_type: string
  options: string[] | null
  is_required: boolean
}

interface Survey {
  survey_id: number
  title: string
  fee_note: string | null
  event_date: string | null
  location: string | null
  reply_deadline: string
  questions: Question[]
}

interface FormData {
  attending: boolean | null
  answers: Record<string, unknown>
  note: string
}

const props = defineProps<{
  modelValue: boolean
  survey: Survey | null
  studentName: string
  formData: FormData
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:form-data': [value: FormData]
  'submit': []
}>()

function update(field: string, value: unknown): void {
  emit('update:form-data', { ...props.formData, [field]: value })
}

function setAttending(v: boolean): void {
  emit('update:form-data', { ...props.formData, attending: v, answers: v ? props.formData.answers : {} })
}

function setAnswer(qid: number, value: unknown): void {
  update('answers', { ...props.formData.answers, [String(qid)]: value })
}

function toggleMulti(qid: number, opt: string): void {
  const cur = (props.formData.answers[String(qid)] as string[] | undefined) ?? []
  setAnswer(qid, cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt])
}

function onSubmit(): void {
  if (props.formData.attending === null) {
    toast.warn('請選擇是否參加')
    return
  }
  if (props.formData.attending) {
    for (const q of props.survey?.questions ?? []) {
      const v = props.formData.answers[String(q.id)]
      if (q.is_required && (v === undefined || v === '' || (Array.isArray(v) && !v.length))) {
        toast.warn(`「${q.question_text}」為必填`)
        return
      }
    }
  } else if (Object.keys(props.formData.answers).length) {
    emit('update:form-data', { ...props.formData, answers: {} })
  }
  emit('submit')
}
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    :title="survey?.title ?? ''"
    :snap-points="['mid', 'full']"
    default-snap="full"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="survey-fill">
      <p v-if="studentName" class="survey-fill-student">{{ studentName }}</p>

      <div class="survey-fill-meta">
        <p v-if="survey?.event_date">📅 {{ survey.event_date }}</p>
        <p v-if="survey?.location">📍 {{ survey.location }}</p>
        <p v-if="survey?.fee_note">💰 {{ survey.fee_note }}</p>
        <p v-if="survey?.reply_deadline" class="survey-fill-deadline">回覆截止：{{ survey.reply_deadline }}</p>
      </div>

      <fieldset class="field survey-fill-attend">
        <legend>是否參加</legend>
        <div class="attend-toggles">
          <button
            type="button"
            class="attend-btn"
            :class="{ active: formData.attending === true }"
            @click="setAttending(true)"
          >參加</button>
          <button
            type="button"
            class="attend-btn"
            :class="{ active: formData.attending === false }"
            @click="setAttending(false)"
          >不參加</button>
        </div>
      </fieldset>

      <div v-if="formData.attending" class="survey-fill-questions">
        <fieldset v-for="q in survey?.questions ?? []" :key="q.id" class="field">
          <legend>{{ q.question_text }}<span v-if="q.is_required" class="required-mark">＊</span></legend>

          <div v-if="q.question_type === 'single'" class="option-list">
            <label v-for="opt in q.options ?? []" :key="opt" class="option-item">
              <input
                type="radio"
                :name="`q-${q.id}`"
                :value="opt"
                :checked="formData.answers[String(q.id)] === opt"
                @change="setAnswer(q.id, opt)"
              />
              <span>{{ opt }}</span>
            </label>
          </div>

          <div v-else-if="q.question_type === 'multi'" class="option-list">
            <label v-for="opt in q.options ?? []" :key="opt" class="option-item">
              <input
                type="checkbox"
                :checked="((formData.answers[String(q.id)] as string[] | undefined) ?? []).includes(opt)"
                @change="toggleMulti(q.id, opt)"
              />
              <span>{{ opt }}</span>
            </label>
          </div>

          <input
            v-else-if="q.question_type === 'number'"
            type="number"
            min="0"
            class="text-input"
            :value="(formData.answers[String(q.id)] as number | string | undefined) ?? ''"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value === '' ? '' : Number(($event.target as HTMLInputElement).value))"
          />

          <textarea
            v-else
            maxlength="500"
            class="text-input"
            rows="3"
            :value="(formData.answers[String(q.id)] as string | undefined) ?? ''"
            @input="setAnswer(q.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </fieldset>
      </div>

      <div class="field">
        <label for="survey-fill-note">備註</label>
        <textarea
          id="survey-fill-note"
          class="text-input"
          maxlength="500"
          rows="3"
          :value="formData.note"
          @input="update('note', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>
    </div>

    <template #footer>
      <div class="survey-fill-footer">
        <button
          type="button"
          class="secondary-btn"
          @click="emit('update:modelValue', false)"
        >取消</button>
        <button
          type="button"
          class="primary-btn"
          :disabled="submitting || formData.attending === null"
          @click="onSubmit"
        >{{ submitting ? '送出中…' : '送出回覆' }}</button>
      </div>
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.survey-fill {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.survey-fill-student {
  font-weight: 600;
  font-size: 14px;
  margin: 0;
}

.survey-fill-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--pt-text-muted);
}
.survey-fill-meta p { margin: 0; }
.survey-fill-deadline {
  color: var(--pt-warning-text-soft, var(--color-warning, #b45309));
  font-weight: 600;
}

.field {
  border: none;
  padding: 0;
  margin: 0;
}
.field legend,
.field > label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin-bottom: 6px;
  padding: 0;
}

.required-mark {
  color: var(--color-danger, #c0392b);
  margin-left: 2px;
}

.attend-toggles {
  display: flex;
  gap: 8px;
}
.attend-btn {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 10px;
  background: var(--neutral-0);
  font-size: 15px;
  font-weight: 600;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  cursor: pointer;
}
.attend-btn.active {
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border-color: var(--m3-primary, var(--brand-primary));
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding: 6px 0;
}

.text-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}

.survey-fill-footer {
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
