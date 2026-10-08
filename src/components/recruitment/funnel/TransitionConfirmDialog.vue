<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="min(480px, 94vw)"
    :before-close="onCancel"
  >
    <div v-if="warningText" class="transition-warning">
      <el-alert
        :title="warningText"
        :type="mode === 'destructive' ? 'warning' : 'info'"
        :closable="false"
        show-icon
        data-test="transition-warning"
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
            :label="classroomLabel(c)"
          />
        </el-select>
        <div class="field-hint">招生轉入學多在暑假，注意選的是要就讀那個學年的班級。</div>
      </el-form-item>

      <el-form-item v-if="mode === 'deposit'" label="收預繳人員">
        <el-input
          v-model="form.depositCollector"
          placeholder="誰收的（選填）"
          maxlength="50"
          class="collector-input"
          data-test="deposit-collector-input"
        />
        <div class="field-hint">
          這裡只記錄招生端的預繳狀態。實際收款與收據請到「學費管理」登錄。
        </div>
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
        確認
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
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS } from '@/constants/recruitmentFunnel'
import type { Stage } from '@/stores/recruitmentFunnel'

const props = defineProps<{
  modelValue: boolean
  fromStage: Stage
  toStage: Stage
  visitId: number
  childName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', payload: { classroomId?: number; reason?: string; depositCollector?: string }): void
  (e: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/**
 * 每種轉換各有該問的事（2026-09-06 招生流程審查）：
 * - dropdown：轉入學要選班別
 * - deposit：標記已預繳時順手記下誰收的（原本拖曳完全填不到這欄）
 * - destructive：退出或倒退，必填原因
 * - confirm：需要當面確認、但沒有額外欄位要填的轉換
 *
 * 原本只有前三種的一部分有對話框，尤其「拖出退出欄」完全靜默——進退出欄要填原因、
 * 離開卻一聲不響，一手滑就把退費個案復原了。
 */
const mode = computed<'confirm' | 'dropdown' | 'destructive' | 'deposit'>(() => {
  if (props.fromStage === 'deposited' && props.toStage === 'enrolled') return 'dropdown'
  if (props.toStage === 'withdrawn') return 'destructive'
  if (
    props.fromStage === 'enrolled' &&
    FUNNEL_STAGES.indexOf(props.toStage) < FUNNEL_STAGES.indexOf(props.fromStage)
  ) return 'destructive'
  if (props.fromStage === 'visited' && props.toStage === 'deposited') return 'deposit'
  return 'confirm'
})

const title = computed(
  () => `${FUNNEL_STAGE_LABELS[props.fromStage]} → ${FUNNEL_STAGE_LABELS[props.toStage]}`,
)

const warningText = computed(() => {
  if (props.toStage === 'withdrawn' && props.fromStage === 'enrolled') {
    return '將刪除學生檔案（含家長聯絡資料），招生紀錄保留'
  }
  if (props.toStage === 'withdrawn') {
    return '將標記退預繳。若已實際收款，退款要另外到「學費管理」處理'
  }
  if (props.fromStage === 'enrolled') {
    return '此操作會刪除已建立的學生資料（含監護人、異動紀錄）'
  }
  if (props.fromStage === 'withdrawn') {
    return '將取消這筆退預繳／退註冊的標記，卡片回到前一個階段'
  }
  if (props.fromStage === 'deposited' && props.toStage === 'visited') {
    return '將取消預繳標記，卡片退回「已訪視」'
  }
  return ''
})

const form = ref<{ classroomId?: number; reason?: string; depositCollector?: string }>({})

watch([visible, mode], ([v]) => {
  if (v) form.value = {}
})

const canConfirm = computed(() => {
  if (mode.value === 'dropdown') return !!form.value.classroomId
  if (mode.value === 'destructive') return !!(form.value.reason && form.value.reason.trim())
  return true
})

interface ClassroomOption {
  id: number
  name: string
  class_code: string
  school_year?: number | null
  semester?: number | null
}
const classrooms = ref<ClassroomOption[]>([])

/**
 * 班別標籤帶學年學期（2026-09-06）：轉入學多在暑假，同名班級在不同學年各有一個，
 * 只顯示班名與班代碼會選錯。明細 tab 的轉學生對話框早就這樣顯示，兩條路徑對齊。
 */
function classroomLabel(c: ClassroomOption): string {
  if (c.school_year != null && c.semester != null) {
    return `${c.name}（${c.school_year}-${c.semester}）`
  }
  return c.class_code ? `${c.name}（${c.class_code}）` : c.name
}

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
    depositCollector: form.value.depositCollector?.trim() || undefined,
  })
  visible.value = false
}

function onCancel() {
  emit('cancel')
  visible.value = false
}
</script>

<style scoped>
.transition-warning { margin-bottom: 12px; }
.child-info { margin: 8px 0 16px; color: var(--text-secondary); }
.classroom-select { width: 100%; }
.collector-input { width: 100%; }
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
