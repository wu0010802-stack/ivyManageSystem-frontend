<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="480px"
    :before-close="onCancel"
  >
    <div v-if="mode === 'destructive'" class="destructive-warning">
      <el-alert
        :title="destructiveWarningTitle"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>

    <p class="child-info">幼生：{{ childName }}（visit #{{ visitId }}）</p>

    <el-form label-position="top">
      <el-form-item v-if="mode === 'dropdown'" label="班別" required>
        <el-select
          v-model="form.classroomId"
          placeholder="請選擇班級"
          class="classroom-select"
        >
          <el-option
            v-for="c in classrooms"
            :key="c.id"
            :value="c.id"
            :label="`${c.name} (${c.class_code})`"
          />
        </el-select>
      </el-form-item>

      <el-form-item
        v-if="mode === 'destructive'"
        label="原因（必填）"
        required
      >
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="3"
          placeholder="請說明退回原因"
          class="reason-input"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button class="cancel-btn" @click="onCancel">取消</el-button>
      <el-button
        type="primary"
        class="confirm-btn"
        :disabled="!canConfirm"
        @click="onConfirm"
      >
        確認推進
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ElDialog, ElAlert, ElForm, ElFormItem, ElSelect, ElOption,
  ElInput, ElButton,
} from 'element-plus'
import { getClassrooms } from '@/api/classrooms'

type Stage = 'visited' | 'deposited' | 'enrolled' | 'active'

const props = defineProps<{
  modelValue: boolean
  fromStage: Stage
  toStage: Stage
  visitId: number
  childName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', payload: { classroomId?: number; reason?: string }): void
  (e: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const stageOrder: Stage[] = ['visited', 'deposited', 'enrolled', 'active']

const mode = computed<'plain' | 'dropdown' | 'destructive'>(() => {
  if (props.fromStage === 'deposited' && props.toStage === 'enrolled') return 'dropdown'
  if (
    (props.fromStage === 'enrolled' || props.fromStage === 'active') &&
    stageOrder.indexOf(props.toStage) < stageOrder.indexOf(props.fromStage)
  ) return 'destructive'
  return 'plain'
})

const title = computed(() => {
  const labels: Record<Stage, string> = {
    visited: '已訪視',
    deposited: '已預繳',
    enrolled: '已報到',
    active: '已開學',
  }
  return `${labels[props.fromStage]} → ${labels[props.toStage]}`
})

const destructiveWarningTitle = computed(() => {
  if (
    props.fromStage === 'enrolled' &&
    (props.toStage === 'deposited' || props.toStage === 'visited')
  ) {
    return '此操作會刪除已建立的學生資料（含監護人、異動紀錄）'
  }
  if (props.fromStage === 'active') {
    return '此操作會將學生 lifecycle 從 active 退回'
  }
  return '此為 destructive 操作'
})

const form = ref<{ classroomId?: number; reason?: string }>({})

watch([visible, mode], ([v]) => {
  if (v) form.value = {}
})

const canConfirm = computed(() => {
  if (mode.value === 'dropdown') return !!form.value.classroomId
  if (mode.value === 'destructive') return !!(form.value.reason && form.value.reason.trim())
  return true
})

interface ClassroomOption { id: number; name: string; class_code: string }
const classrooms = ref<ClassroomOption[]>([])

watch(
  [visible, mode],
  async ([v, m]) => {
    if (v && m === 'dropdown' && classrooms.value.length === 0) {
      const resp = await getClassrooms()
      classrooms.value = (resp.data as unknown as ClassroomOption[]) ?? []
    }
  },
  { immediate: true },
)

defineExpose({
  get selectedClassroomId() { return form.value.classroomId },
  set selectedClassroomId(v: number | undefined) { form.value.classroomId = v },
})

function onConfirm() {
  if (!canConfirm.value) return
  emit('confirm', {
    classroomId: form.value.classroomId,
    reason: form.value.reason?.trim(),
  })
  visible.value = false
}

function onCancel() {
  emit('cancel')
  visible.value = false
}
</script>

<style scoped>
.destructive-warning { margin-bottom: 12px; }
.child-info { margin: 8px 0 16px; color: #555; }
.classroom-select { width: 100%; }
</style>
