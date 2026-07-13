<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createMeasurement, updateMeasurement } from '@/api/studentMeasurements'
import FormSection from '@/components/common/FormSection.vue'
import { todayISO } from '@/utils/format'
import { apiError } from '@/utils/error'

// 幼兒園學童常見範圍；超出時提示確認以避免誤輸入污染成長曲線
const PLAUSIBLE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  height_cm: { min: 40, max: 180, label: '身高' },
  weight_kg: { min: 2, max: 80, label: '體重' },
  head_circumference_cm: { min: 25, max: 60, label: '頭圍' },
}

const props = withDefaults(defineProps<{
  modelValue?: boolean
  studentId: number
  measurement?: Record<string, unknown> | null
}>(), {
  modelValue: false,
  measurement: null,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  'saved': [data: unknown]
}>()

const saving = ref(false)

const form = ref<{
  measured_on: string
  height_cm: number | null
  weight_kg: number | null
  head_circumference_cm: number | null
  vision_left: number | null
  vision_right: number | null
  note: string
}>({
  measured_on: '',
  height_cm: null,
  weight_kg: null,
  head_circumference_cm: null,
  vision_left: null,
  vision_right: null,
  note: '',
})

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

watch(
  () => props.measurement,
  (m: Record<string, unknown> | null | undefined) => {
    if (m) {
      form.value = {
        measured_on: (m.measured_on as string) || todayISO(),
        height_cm: (m.height_cm as number | null) ?? null,
        weight_kg: (m.weight_kg as number | null) ?? null,
        head_circumference_cm: (m.head_circumference_cm as number | null) ?? null,
        vision_left: (m.vision_left as number | null) ?? null,
        vision_right: (m.vision_right as number | null) ?? null,
        note: (m.note as string) || '',
      }
    } else {
      form.value = {
        measured_on: todayISO(),
        height_cm: null,
        weight_kg: null,
        head_circumference_cm: null,
        vision_left: null,
        vision_right: null,
        note: '',
      }
    }
  },
  { immediate: true }
)

function disableFutureDates(date: Date) {
  return date > new Date()
}

async function submit() {
  const { height_cm, weight_kg, head_circumference_cm, vision_left, vision_right } = form.value
  const hasAnyValue = [height_cm, weight_kg, head_circumference_cm, vision_left, vision_right].some(
    (v) => v !== null && v !== undefined
  )
  if (!hasAnyValue) {
    ElMessage.warning('請至少填入一項量測數值')
    return
  }

  const outliers: string[] = []
  for (const [field, range] of Object.entries(PLAUSIBLE_RANGES)) {
    const raw = (form.value as Record<string, unknown>)[field]
    if (raw === null || raw === undefined || raw === '') continue
    const n = Number(raw)
    if (isNaN(n)) continue
    if (n < range.min || n > range.max) {
      outliers.push(`${range.label} ${n}（一般範圍 ${range.min}–${range.max}）`)
    }
  }
  if (outliers.length) {
    try {
      await ElMessageBox.confirm(
        `以下數值超出幼兒常見範圍，請確認是否正確：\n\n${outliers.join('\n')}`,
        '數值異常確認',
        { confirmButtonText: '確認儲存', cancelButtonText: '回去修改', type: 'warning' }
      )
    } catch {
      return
    }
  }

  saving.value = true
  try {
    const payload = {
      measured_on: form.value.measured_on,
      height_cm: toNullableNumber(form.value.height_cm),
      weight_kg: toNullableNumber(form.value.weight_kg),
      head_circumference_cm: toNullableNumber(form.value.head_circumference_cm),
      vision_left: toNullableNumber(form.value.vision_left),
      vision_right: toNullableNumber(form.value.vision_right),
      note: form.value.note?.trim() || null,
    }

    let result
    if (props.measurement?.id) {
      result = await updateMeasurement(props.studentId, props.measurement.id as number, payload)
      ElMessage.success('已更新量測紀錄')
    } else {
      result = await createMeasurement(props.studentId, payload)
      ElMessage.success('已新增量測紀錄')
    }

    emit('update:modelValue', false)
    emit('saved', result.data)
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗，請稍後再試'))
  } finally {
    saving.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="measurement?.id ? '編輯量測紀錄' : '新增量測紀錄'"
    width="480px"
    @update:model-value="handleClose"
    @close="handleClose"
  >
    <el-form label-position="top">
      <el-form-item label="量測日期" required>
        <el-date-picker
          v-model="form.measured_on"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="disableFutureDates"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="身高 (cm)">
        <el-input-number
          v-model="form.height_cm"
          :precision="2"
          :min="0"
          :max="300"
          :controls="false"
          style="width: 100%"
          placeholder="選填"
        />
      </el-form-item>

      <el-form-item label="體重 (kg)">
        <el-input-number
          v-model="form.weight_kg"
          :precision="2"
          :min="0"
          :max="300"
          :controls="false"
          style="width: 100%"
          placeholder="選填"
        />
      </el-form-item>

      <el-form-item label="頭圍 (cm)">
        <el-input-number
          v-model="form.head_circumference_cm"
          :precision="2"
          :min="0"
          :max="100"
          :controls="false"
          style="width: 100%"
          placeholder="選填"
        />
      </el-form-item>

      <!-- 視力與備註（選填） -->
      <FormSection data-test="section-extra" title="視力與備註（選填）" collapsible :default-open="false">
        <el-form-item label="左眼視力">
          <el-input-number
            v-model="form.vision_left"
            :precision="2"
            :min="0"
            :max="3"
            :controls="false"
            style="width: 100%"
            placeholder="選填"
          />
        </el-form-item>
        <el-form-item label="右眼視力">
          <el-input-number
            v-model="form.vision_right"
            :precision="2"
            :min="0"
            :max="3"
            :controls="false"
            style="width: 100%"
            placeholder="選填"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="3"
            placeholder="選填"
          />
        </el-form-item>
      </FormSection>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ measurement?.id ? '更新' : '新增' }}
      </el-button>
    </template>
  </el-dialog>
</template>
