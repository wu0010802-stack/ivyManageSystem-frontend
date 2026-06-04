<template>
  <el-dialog v-model="visible" title="保留座位（暫定編班）" width="420px">
    <p class="child-info">幼生：{{ visit?.child_name }}（visit #{{ visit?.id }}）</p>
    <el-form label-position="top">
      <el-form-item label="暫定年級" required>
        <el-select v-model="form.gradeId" placeholder="請選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :value="g.id" :label="g.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="目標學年（民國）" required>
        <el-input-number
          v-model="form.schoolYear"
          :min="100"
          :max="200"
          controls-position="right"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="目標學期">
        <el-radio-group v-model="form.semester">
          <el-radio-button :value="1">上學期</el-radio-button>
          <el-radio-button :value="2">下學期</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="isReserved" type="warning" plain :loading="busy" @click="release">
        釋放保留
      </el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" :loading="busy" @click="confirm">
        確認保留
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElRadioGroup,
  ElRadioButton,
  ElButton,
  ElMessage,
} from 'element-plus'
import { reserveSeat } from '@/api/recruitmentIntake'
import { getGrades } from '@/api/classrooms'
import { currentRocYear } from '@/utils/academic'

interface VisitLike {
  id: number
  child_name?: string
  has_deposit?: boolean
  provisional_grade_id?: number | null
  target_school_year?: number | null
  target_semester?: number | null
}
interface GradeRow {
  id: number
  name: string
  sort_order?: number
}

const props = defineProps<{ modelValue: boolean; visit: VisitLike | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'reserved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const grades = ref<GradeRow[]>([])
const busy = ref(false)
const form = ref<{ gradeId: number | null; schoolYear: number; semester: 1 | 2 }>({
  gradeId: null,
  schoolYear: currentRocYear(),
  semester: 1,
})

const isReserved = computed(() => props.visit?.provisional_grade_id != null)
const canConfirm = computed(() => form.value.gradeId != null && !!form.value.schoolYear)

watch(
  () => [visible.value, props.visit?.id] as const,
  async ([v]) => {
    if (!v || !props.visit) return
    if (grades.value.length === 0) {
      const resp = await getGrades()
      grades.value = (resp.data as unknown as GradeRow[]) ?? []
    }
    form.value = {
      gradeId: props.visit.provisional_grade_id ?? null,
      schoolYear: props.visit.target_school_year ?? currentRocYear(),
      semester: (props.visit.target_semester as 1 | 2) ?? 1,
    }
  },
  { immediate: true },
)

async function confirm(): Promise<void> {
  if (!canConfirm.value || !props.visit) return
  busy.value = true
  try {
    await reserveSeat(props.visit.id, {
      provisional_grade_id: form.value.gradeId,
      target_school_year: form.value.schoolYear,
      target_semester: form.value.semester,
    })
    ElMessage.success('已保留座位')
    emit('reserved')
    visible.value = false
  } catch {
    ElMessage.error('保留失敗（未預繳者不能保留）')
  } finally {
    busy.value = false
  }
}

async function release(): Promise<void> {
  if (!props.visit) return
  busy.value = true
  try {
    await reserveSeat(props.visit.id, { provisional_grade_id: null })
    ElMessage.success('已釋放保留')
    emit('reserved')
    visible.value = false
  } catch {
    ElMessage.error('釋放失敗')
  } finally {
    busy.value = false
  }
}

defineExpose({ confirm, release, form })
</script>

<style scoped>
.child-info {
  margin: 0 0 16px;
  color: #555;
}
</style>
