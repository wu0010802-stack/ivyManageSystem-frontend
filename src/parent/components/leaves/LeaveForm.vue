<script setup>
/**
 * 請假申請表單（presentational + v-model）。
 *
 * Props:
 *  - modelValue: 表單狀態物件，必填
 *      { student_id, leave_type, start_date, end_date, reason }
 *  - children: 子女清單（resolve 後傳入）
 *  - pastLimit / futureLimit: 起始日的可選範圍字串（YYYY-MM-DD）
 *  - submitting: Boolean，控制送出按鈕 disabled / 文案
 *
 * Emits:
 *  - update:modelValue(newForm) — v-model 更新
 *  - submit — 送出按鈕點擊（payload 由父層自行讀取 form 處理）
 *  - cancel — 取消按鈕點擊
 *
 * 注意：本元件純 presentational，不接 store 也不打 API。
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  children: { type: Array, default: () => [] },
  pastLimit: { type: String, required: true },
  futureLimit: { type: String, required: true },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit', 'cancel'])

function update(field, value) {
  // 重新發射整個物件，避免父層遺漏其他欄位
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>

<template>
  <div class="leave-form">
    <div class="field">
      <label for="leave-student">學生</label>
      <select
        id="leave-student"
        :value="modelValue.student_id"
        @change="update('student_id', Number($event.target.value))"
      >
        <option
          v-for="c in children"
          :key="c.student_id"
          :value="c.student_id"
        >{{ c.name }}</option>
      </select>
    </div>
    <fieldset class="field radio-fieldset">
      <legend>假別</legend>
      <div class="radio-row">
        <label class="radio">
          <input
            type="radio"
            name="leave_type"
            value="病假"
            :checked="modelValue.leave_type === '病假'"
            @change="update('leave_type', '病假')"
          />病假
        </label>
        <label class="radio">
          <input
            type="radio"
            name="leave_type"
            value="事假"
            :checked="modelValue.leave_type === '事假'"
            @change="update('leave_type', '事假')"
          />事假
        </label>
      </div>
    </fieldset>
    <div class="field">
      <label for="leave-start">起始日</label>
      <input
        id="leave-start"
        type="date"
        :value="modelValue.start_date"
        :min="pastLimit"
        :max="futureLimit"
        @input="update('start_date', $event.target.value)"
      />
    </div>
    <div class="field">
      <label for="leave-end">結束日</label>
      <input
        id="leave-end"
        type="date"
        :value="modelValue.end_date"
        :min="modelValue.start_date"
        :max="futureLimit"
        @input="update('end_date', $event.target.value)"
      />
    </div>
    <div class="field">
      <label for="leave-reason">原因（選填）</label>
      <textarea
        id="leave-reason"
        :value="modelValue.reason"
        rows="3"
        maxlength="500"
        autocomplete="off"
        @input="update('reason', $event.target.value)"
      />
    </div>
    <div class="form-footer">
      <button type="button" class="secondary-btn" @click="emit('cancel')">取消</button>
      <button type="button" class="primary-btn" :disabled="submitting" @click="emit('submit')">
        {{ submitting ? '送出中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.leave-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field label,
.radio-fieldset > legend {
  display: block;
  font-size: 13px;
  color: var(--pt-text-muted);
  margin-bottom: 4px;
  padding: 0;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.radio-fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.radio-row {
  display: flex;
  gap: 16px;
}

.radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.form-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid var(--pt-border-light);
  margin-top: 4px;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
}

.primary-btn:disabled {
  opacity: 0.5;
}

.secondary-btn {
  padding: 8px 16px;
  background: var(--neutral-0);
  color: var(--pt-text-muted);
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  font-size: 14px;
}
</style>
