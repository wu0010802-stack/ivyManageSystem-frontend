<script setup lang="ts">
/**
 * 接送人資料表單（presentational + v-model），常用接送人管理與臨時填寫共用。
 *
 * Props:
 *  - modelValue: { personName, personRelation, personPhone, note, photoFile }
 *  - submitting: Boolean，控制送出按鈕 disabled
 *  - hideFooter: Boolean，嵌入更大表單（如建立授權精靈）時隱藏內建送出/取消
 *    按鈕，避免與外層自己的送出按鈕重複
 *
 * Emits:
 *  - update:modelValue(newForm)
 *  - submit
 *  - cancel
 */
import { computed } from 'vue'

interface PickupPersonFormData {
  personName: string
  personRelation: string
  personPhone: string
  note: string
  photoFile: File | null
}

const props = withDefaults(defineProps<{
  modelValue: PickupPersonFormData
  submitting?: boolean
  hideFooter?: boolean
}>(), {
  submitting: false,
  hideFooter: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: PickupPersonFormData]
  'submit': []
  'cancel': []
}>()

const RELATION_OPTIONS = ['父親', '母親', '祖父', '祖母', '外公', '外婆', '保母', '其他']

function update(field: keyof PickupPersonFormData, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] || null
  // 先清空 value 確保使用者可再次選同一檔案
  input.value = ''
  update('photoFile', file)
}

const canSubmit = computed(
  () =>
    !!props.modelValue.personName.trim() &&
    !!props.modelValue.personRelation.trim() &&
    !!props.modelValue.personPhone.trim() &&
    !props.submitting,
)
</script>

<template>
  <div class="pickup-person-form">
    <div class="field">
      <label for="pickup-person-name">接送人姓名</label>
      <input
        id="pickup-person-name"
        type="text"
        maxlength="50"
        :value="modelValue.personName"
        @input="update('personName', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="field">
      <label for="pickup-person-relation">與孩子關係</label>
      <select
        id="pickup-person-relation"
        :value="modelValue.personRelation"
        @change="update('personRelation', ($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>請選擇</option>
        <option v-for="r in RELATION_OPTIONS" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>
    <div class="field">
      <label for="pickup-person-phone">聯絡電話</label>
      <input
        id="pickup-person-phone"
        type="tel"
        maxlength="20"
        :value="modelValue.personPhone"
        @input="update('personPhone', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="field">
      <label for="pickup-person-note">備註（選填）</label>
      <textarea
        id="pickup-person-note"
        :value="modelValue.note"
        rows="2"
        maxlength="200"
        @input="update('note', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
    <div class="field">
      <label for="pickup-person-photo">照片（選填，供老師核對身分）</label>
      <input
        id="pickup-person-photo"
        type="file"
        accept="image/*,.heic,.heif"
        @change="onFileChange"
      />
      <span v-if="modelValue.photoFile" class="photo-selected">
        已選擇：{{ modelValue.photoFile.name }}
      </span>
    </div>
    <div v-if="!hideFooter" class="form-footer">
      <button type="button" class="secondary-btn" @click="emit('cancel')">取消</button>
      <button
        type="button"
        class="primary-btn"
        :disabled="!canSubmit"
        @click="emit('submit')"
      >
        {{ submitting ? '送出中...' : '確認' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pickup-person-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin-bottom: 4px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.photo-selected {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

.form-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 0 0;
  border-top: 1px solid var(--m3-outline-variant, var(--pt-border-light));
  margin-top: 4px;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--m3-primary, var(--brand-primary));
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
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 8px;
  font-size: 14px;
}
</style>
