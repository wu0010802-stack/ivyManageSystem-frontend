<template>
  <FormDialog
    ref="formDialogRef"
    v-model="visible"
    :title="mode === 'create' ? '新增班級' : '編輯班級'"
    size="compact"
    :dirty="isDirty"
    :loading="submitting"
    :disabled="!canSubmit"
    :submit-text="submitText"
    @submit="onSubmit"
    @closed="onClosed"
  >
    <el-form label-position="top" class="form-grid" @submit.prevent>
      <el-form-item label="班名" required class="fg-6" :error="fieldErrors.target_name">
        <el-input v-model="form.target_name" placeholder="例如：玫瑰" />
      </el-form-item>
      <el-form-item label="年級" required class="fg-6">
        <el-select v-model="form.target_grade_id" placeholder="選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="班級代號" class="fg-6 field-class-code" :error="fieldErrors.class_code">
        <el-input v-model="form.class_code" placeholder="例如：大1" maxlength="20" />
        <div class="form-hint">在籍記錄表與班級排序會用到，同一學年不可重複</div>
      </el-form-item>
      <el-form-item label="容量" class="fg-6 field-capacity" :error="fieldErrors.capacity">
        <el-input-number
          v-model="form.capacity"
          :min="CAPACITY_MIN"
          :max="CAPACITY_MAX"
          :value-on-clear="null"
          controls-position="right"
          style="width: 100%"
        />
        <div class="form-hint">{{ CAPACITY_MIN }}–{{ CAPACITY_MAX }} 人；清空＝不設上限</div>
      </el-form-item>
    </el-form>
    <!-- 老師不在這裡改：編班表「老師指派」格子內直接選（避免停用老師讓整份儲存失敗） -->
    <p v-if="mode === 'edit'" class="form-hint plan-class-dialog-teacher-hint">
      班導、副班導、美語老師請在編班表切到「老師指派」，直接點格子設定。
    </p>

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
import { getGrades } from '@/api/classrooms'
import FormDialog from '@/components/common/FormDialog.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>
type ClassCreatePayload = Omit<Schema<'ClassCreateRequest'>, 'base_version'>
type ClassUpdatePayload = Omit<Schema<'ClassUpdateRequest'>, 'base_version'>

interface GradeOption { id: number; name: string }

// 草稿班級編輯 dialog：班名／年級／代號／容量。老師一律在編班表「老師指派」格內設定
// （2026-11 第二輪拿掉這裡的三個老師欄位：一位老師停用就讓改容量也 400）。
// 編輯只送有變動的欄位（後端 exclude_unset：未送＝不改、送 null＝清空）。
// 刪除走同一 dialog 的 footer 按鈕，交由父層呼叫 useYearPlanWorkspace.deleteClass()。

// 與後端 PLAN_CLASS_CAPACITY_MIN／MAX 相同（超出 422）
const CAPACITY_MIN = 1
const CAPACITY_MAX = 200

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  planClass: PlanClass | null
  /** 父層 create/update/delete mutation in-flight：期間鎖定 footer 三鈕與派發短路。 */
  submitting?: boolean
  /** 後端回的欄位錯誤（422 errors[].loc／detail.field），key＝欄位名 */
  fieldErrors?: Record<string, string>
}>(), {
  submitting: false,
  fieldErrors: () => ({}),
})

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

interface FormState {
  target_name: string
  target_grade_id: number | null
  capacity: number | null
  class_code: string | null
}

function emptyForm(): FormState {
  return {
    target_name: '',
    target_grade_id: null,
    capacity: null,
    class_code: null,
  }
}

const form = ref<FormState>(emptyForm())
const formDialogRef = ref<InstanceType<typeof FormDialog> | null>(null)
// 開啟時的快照；dirty＝目前表單與快照不同（關閉前走未儲存確認）
const initial = ref<FormState>(emptyForm())
const isDirty = (): boolean => Object.keys(changedFields()).length > 0

const submitText = computed(() => (props.mode === 'create' ? '建立班級' : '儲存'))

/** 代號去頭尾空白，空白視為未設定（送 null 才會清空）。 */
function normalizeCode(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function normalizedClassCode(): string | null {
  return normalizeCode(form.value.class_code)
}

/**
 * 與開啟時相比有變動的欄位（edit 模式送出的 payload）。el-input-number 清空、
 * el-select 清除會給 undefined，一律正規化成 null，否則 JSON 會整欄丟掉＝不改。
 */
function changedFields(): ClassUpdatePayload {
  const now = form.value
  const was = initial.value
  const out: ClassUpdatePayload = {}
  if (now.target_name !== was.target_name) out.target_name = now.target_name
  if ((now.target_grade_id ?? null) !== was.target_grade_id) out.target_grade_id = now.target_grade_id ?? null
  if ((now.capacity ?? null) !== was.capacity) out.capacity = now.capacity ?? null
  if (normalizeCode(now.class_code) !== normalizeCode(was.class_code)) out.class_code = normalizeCode(now.class_code)
  return out
}

function resetForm(): void {
  if (props.mode === 'edit' && props.planClass) {
    form.value = {
      target_name: props.planClass.target_name,
      target_grade_id: props.planClass.target_grade_id,
      capacity: props.planClass.capacity ?? null,
      class_code: props.planClass.class_code ?? null,
    }
  } else {
    form.value = emptyForm()
  }
  initial.value = { ...form.value }
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

// edit 模式沒有任何變動就不能儲存（避免無意義的 version bump）
const canSubmit = computed(() =>
  form.value.target_name.trim().length > 0
  && form.value.target_grade_id != null
  && (props.mode === 'create' || Object.keys(changedFields()).length > 0),
)

function onSubmit(): void {
  // submitting 短路：UI disabled 之外的第二道防線（同 tick 雙擊 DOM 尚未重繪時）
  if (!canSubmit.value || props.submitting) return
  if (props.mode === 'create') {
    emit('create', {
      target_name: form.value.target_name,
      target_grade_id: form.value.target_grade_id as number,
      capacity: form.value.capacity ?? null,
      class_code: normalizedClassCode(),
    })
  } else if (props.planClass) {
    emit('update', props.planClass.id, changedFields())
  }
}

async function onDelete(): Promise<void> {
  if (!props.planClass || props.submitting) return
  try {
    await ElMessageBox.confirm(
      `確定要刪除班級「${props.planClass.target_name}」嗎？班內學生會改列為待分班。`,
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

.plan-class-dialog-teacher-hint {
  margin: 0;
}
</style>
