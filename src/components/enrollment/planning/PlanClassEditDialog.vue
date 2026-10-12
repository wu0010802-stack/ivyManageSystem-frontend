<template>
  <FormDialog
    ref="formDialogRef"
    v-model="visible"
    :title="mode === 'create' ? '新增班級' : '編輯班級'"
    :size="mode === 'edit' ? 'standardNarrow' : 'compact'"
    :dirty="isDirty"
    :loading="submitting"
    :disabled="!canSubmit"
    :submit-text="submitText"
    @submit="onSubmit"
    @closed="onClosed"
  >
    <el-form label-position="top" class="form-grid" @submit.prevent>
      <el-form-item label="班名" required class="fg-6">
        <el-input v-model="form.target_name" placeholder="例如：玫瑰" />
      </el-form-item>
      <el-form-item label="年級" required class="fg-6">
        <el-select v-model="form.target_grade_id" placeholder="選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="班級代號" class="fg-6 field-class-code">
        <el-input v-model="form.class_code" placeholder="例如：大1" maxlength="20" />
        <div class="form-hint">在籍記錄表與班級排序會用到，同一學年不可重複</div>
      </el-form-item>
      <el-form-item label="容量" class="fg-6">
        <el-input-number v-model="form.capacity" :min="1" :max="200" controls-position="right" style="width: 100%" />
      </el-form-item>

      <template v-if="mode === 'edit'">
        <el-form-item label="班導" class="fg-4">
          <el-select v-model="form.head_teacher_id" placeholder="選擇老師" clearable filterable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="formatTeacherOptionLabel(t)" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="副班導" class="fg-4">
          <el-select v-model="form.assistant_teacher_id" placeholder="選擇老師" clearable filterable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="formatTeacherOptionLabel(t)" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="美語老師" class="fg-4">
          <el-select v-model="form.art_teacher_id" placeholder="選擇老師" clearable filterable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="formatTeacherOptionLabel(t)" :value="t.id" />
          </el-select>
        </el-form-item>
      </template>
    </el-form>

    <!-- 自訂 footer：刪除放最左、與取消／儲存拉開距離；取消必須走 requestClose 才有 dirty 保護。
         submitting（父層 mutation in-flight）期間鎖住三鈕，防雙擊以同一 base_version 送第二發 -->
    <template #footer>
      <div class="class-dialog-footer">
        <el-button
          v-if="mode === 'edit'"
          type="danger"
          plain
          class="delete-btn"
          :disabled="submitting"
          @click="onDelete"
        >刪除班級</el-button>
        <el-button :disabled="submitting" @click="formDialogRef?.requestClose()">取消</el-button>
        <el-button type="primary" :disabled="!canSubmit || submitting" :loading="submitting" @click="onSubmit">
          {{ submitText }}
        </el-button>
      </div>
    </template>
  </FormDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getGrades, getTeacherOptions } from '@/api/classrooms'
import { formatTeacherOptionLabel } from '@/utils/teacherOption'
import FormDialog from '@/components/common/FormDialog.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>
type ClassCreatePayload = Omit<Schema<'ClassCreateRequest'>, 'base_version'>
type ClassUpdatePayload = Omit<Schema<'ClassUpdateRequest'>, 'base_version'>

interface GradeOption { id: number; name: string }
interface TeacherOption { id: number; name: string; employee_id?: string | null; position?: string | null }

// 草稿班級編輯 dialog：create 模式只給班名/年級/容量（ClassCreateRequest 無教師欄
// 位——教師只能在後續 PATCH 指派）；edit 模式額外開放三教師 select。刪除走同一
// dialog 的 footer 按鈕，交由父層呼叫 useYearPlanWorkspace.deleteClass()。

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  planClass: PlanClass | null
  /** 父層 create/update/delete mutation in-flight：期間鎖定 footer 三鈕與派發短路。 */
  submitting?: boolean
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
const formDialogRef = ref<InstanceType<typeof FormDialog> | null>(null)
// 開啟時的快照；dirty＝目前表單與快照不同（關閉前走未儲存確認）
let snapshot = JSON.stringify(emptyForm())
const isDirty = (): boolean => JSON.stringify(form.value) !== snapshot

const submitText = computed(() => (props.mode === 'create' ? '建立班級' : '儲存'))

/** 代號去頭尾空白，空白視為未設定（送 null 才會清空）。 */
function normalizedClassCode(): string | null {
  return form.value.class_code?.trim() || null
}

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
  snapshot = JSON.stringify(form.value)
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
  // submitting 短路：UI disabled 之外的第二道防線（同 tick 雙擊 DOM 尚未重繪時）
  if (!canSubmit.value || props.submitting) return
  if (props.mode === 'create') {
    emit('create', {
      target_name: form.value.target_name,
      target_grade_id: form.value.target_grade_id as number,
      capacity: form.value.capacity,
      class_code: normalizedClassCode(),
    })
  } else if (props.planClass) {
    emit('update', props.planClass.id, {
      target_name: form.value.target_name,
      target_grade_id: form.value.target_grade_id,
      capacity: form.value.capacity,
      class_code: normalizedClassCode(),
      // el-select clearable 的 × 會把 model 設成 undefined；undefined 會被 JSON
      // 序列化整欄丟棄 → 後端 exclude_unset 視為未變更，清空會靜默失敗，故正規化為 null
      head_teacher_id: form.value.head_teacher_id ?? null,
      assistant_teacher_id: form.value.assistant_teacher_id ?? null,
      art_teacher_id: form.value.art_teacher_id ?? null,
    })
  }
}

async function onDelete(): Promise<void> {
  if (!props.planClass || props.submitting) return
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
.class-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.delete-btn {
  margin-right: auto;
}
</style>
