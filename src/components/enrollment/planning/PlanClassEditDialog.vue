<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增班級' : '編輯班級'" width="480px" @closed="onClosed">
    <el-form label-width="90px">
      <el-form-item label="班名" required>
        <el-input v-model="form.target_name" placeholder="例如：小班A" />
      </el-form-item>
      <el-form-item label="年級" required>
        <el-select v-model="form.target_grade_id" placeholder="選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="容量">
        <el-input-number v-model="form.capacity" :min="1" :max="200" style="width: 100%" />
      </el-form-item>

      <template v-if="mode === 'edit'">
        <el-form-item label="班導師">
          <el-select v-model="form.head_teacher_id" placeholder="選擇教師" clearable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="副班導">
          <el-select v-model="form.assistant_teacher_id" placeholder="選擇教師" clearable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="美語老師">
          <el-select v-model="form.art_teacher_id" placeholder="選擇教師" clearable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button v-if="mode === 'edit'" type="danger" plain class="delete-btn" @click="onDelete">刪除班級</el-button>
      <span class="footer-spacer" />
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!canSubmit" @click="onSubmit">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getGrades, getTeacherOptions } from '@/api/classrooms'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>
type ClassCreatePayload = Omit<Schema<'ClassCreateRequest'>, 'base_version'>
type ClassUpdatePayload = Omit<Schema<'ClassUpdateRequest'>, 'base_version'>

interface GradeOption { id: number; name: string }
interface TeacherOption { id: number; name: string }

// 草稿班級編輯 dialog：create 模式只給班名/年級/容量（ClassCreateRequest 無教師欄
// 位——教師只能在後續 PATCH 指派）；edit 模式額外開放三教師 select。刪除走同一
// dialog 的 footer 按鈕，交由父層呼叫 useYearPlanWorkspace.deleteClass()。

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  planClass: PlanClass | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  create: [payload: ClassCreatePayload]
  update: [classId: number, payload: ClassUpdatePayload]
  delete: [classId: number]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const grades = ref<GradeOption[]>([])
const teachers = ref<TeacherOption[]>([])

interface FormState {
  target_name: string
  target_grade_id: number | null
  capacity: number | null
  class_code: string | null
  head_teacher_id: number | null
  assistant_teacher_id: number | null
  art_teacher_id: number | null
}

function emptyForm(): FormState {
  return {
    target_name: '',
    target_grade_id: null,
    capacity: null,
    class_code: null,
    head_teacher_id: null,
    assistant_teacher_id: null,
    art_teacher_id: null,
  }
}

const form = ref<FormState>(emptyForm())

function resetForm(): void {
  if (props.mode === 'edit' && props.planClass) {
    form.value = {
      target_name: props.planClass.target_name,
      target_grade_id: props.planClass.target_grade_id,
      capacity: props.planClass.capacity ?? null,
      class_code: props.planClass.class_code ?? null,
      head_teacher_id: props.planClass.head_teacher_id ?? null,
      assistant_teacher_id: props.planClass.assistant_teacher_id ?? null,
      art_teacher_id: props.planClass.art_teacher_id ?? null,
    }
  } else {
    form.value = emptyForm()
  }
}

async function ensureOptionsLoaded(): Promise<void> {
  if (!grades.value.length) {
    try {
      const res = await getGrades()
      grades.value = res.data as GradeOption[]
    } catch {
      // 忽略：select 顯示空清單，使用者可重新打開 dialog 再試
    }
  }
  if (!teachers.value.length) {
    try {
      const res = await getTeacherOptions()
      teachers.value = res.data as TeacherOption[]
    } catch {
      // ditto
    }
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      resetForm()
      void ensureOptionsLoaded()
    }
  },
  { immediate: true },
)

const canSubmit = computed(() => form.value.target_name.trim().length > 0 && form.value.target_grade_id != null)

function onSubmit(): void {
  if (!canSubmit.value) return
  if (props.mode === 'create') {
    emit('create', {
      target_name: form.value.target_name,
      target_grade_id: form.value.target_grade_id as number,
      capacity: form.value.capacity,
      class_code: form.value.class_code,
    })
  } else if (props.planClass) {
    emit('update', props.planClass.id, {
      target_name: form.value.target_name,
      target_grade_id: form.value.target_grade_id,
      capacity: form.value.capacity,
      class_code: form.value.class_code,
      head_teacher_id: form.value.head_teacher_id,
      assistant_teacher_id: form.value.assistant_teacher_id,
      art_teacher_id: form.value.art_teacher_id,
    })
  }
}

async function onDelete(): Promise<void> {
  if (!props.planClass) return
  try {
    await ElMessageBox.confirm(
      `確定要刪除班級「${props.planClass.target_name}」嗎？班內學生會被設回未分班。`,
      '刪除草稿班級',
      { type: 'warning', confirmButtonText: '確定刪除', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  emit('delete', props.planClass.id)
}

function onClosed(): void {
  form.value = emptyForm()
}

defineExpose({ form, onSubmit, onDelete, canSubmit })
</script>

<style scoped>
.footer-spacer {
  flex: 1 1 auto;
}

:deep(.el-dialog__footer) {
  display: flex;
  align-items: center;
}

.delete-btn {
  margin-right: auto;
}
</style>
