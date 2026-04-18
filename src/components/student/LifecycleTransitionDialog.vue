<template>
  <el-dialog
    v-model="visible"
    title="變更學生生命週期狀態"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-alert
      v-if="currentLabel"
      :title="`目前狀態：${currentLabel}`"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    />
    <el-alert
      v-if="allowedTargets.length === 0"
      type="warning"
      title="目前狀態為終態，無可用的後續轉移"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="formRules"
      label-width="90px"
      :disabled="allowedTargets.length === 0"
    >
      <el-form-item label="轉移至" prop="to_status">
        <el-select v-model="form.to_status" placeholder="請選擇目標狀態" style="width: 100%">
          <el-option
            v-for="opt in allowedTargets"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="生效日期" prop="effective_date">
        <el-date-picker
          v-model="form.effective_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="留空為今日"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="原因" prop="reason">
        <el-select
          v-model="form.reason"
          placeholder="請選擇或自行輸入"
          filterable
          allow-create
          default-first-option
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="r in reasonOptions"
            :key="r"
            :label="r"
            :value="r"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="備註" prop="notes">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="選填補充說明"
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="isTerminalTarget"
      type="warning"
      :title="terminalWarning"
      :closable="false"
      style="margin-top: 8px"
    />
    <el-alert
      v-if="isReactivate"
      type="info"
      title="復學：系統會清除 withdrawal_date、恢復 is_active，並寫入「復學」異動紀錄。畢業 (graduated) 為終態無法復學。"
      :closable="false"
      style="margin-top: 8px"
    />

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="allowedTargets.length === 0"
        @click="handleSubmit"
      >
        確認轉移
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { transitionStudentLifecycle } from '@/api/students'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  studentId: { type: Number, default: null },
  currentStatus: { type: String, default: 'active' },
})
const emit = defineEmits(['update:modelValue', 'transitioned'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const STATUS_LABELS = {
  prospect: '招生中',
  enrolled: '已報到',
  active: '在學',
  on_leave: '休學',
  transferred: '轉出',
  withdrawn: '退學',
  graduated: '畢業',
}

// 合法轉移表（同步後端 ALLOWED_TRANSITIONS）
const ALLOWED_TRANSITIONS = {
  prospect: ['enrolled', 'withdrawn'],
  enrolled: ['active', 'withdrawn'],
  active: ['on_leave', 'transferred', 'withdrawn', 'graduated'],
  on_leave: ['active', 'withdrawn'],
  withdrawn: ['active'],
  transferred: [],
  graduated: [],
}

const REASON_BY_TARGET = {
  on_leave: ['家庭因素', '健康因素', '其他'],
  active: ['復學', '其他'],
  withdrawn: ['家庭因素', '健康因素', '搬遷', '轉往他園', '其他'],
  transferred: ['家庭因素', '健康因素', '搬遷', '轉往他園', '其他'],
  graduated: ['正常畢業'],
  enrolled: ['新生報名', '招生轉化', '其他'],
}

const currentLabel = computed(() => STATUS_LABELS[props.currentStatus] || props.currentStatus)

const allowedTargets = computed(() =>
  (ALLOWED_TRANSITIONS[props.currentStatus] || []).map((value) => ({
    value,
    label: STATUS_LABELS[value] || value,
  })),
)

const isTerminalTarget = computed(() =>
  ['withdrawn', 'transferred', 'graduated'].includes(form.to_status),
)

const isReactivate = computed(
  () =>
    form.to_status === 'active' &&
    ['withdrawn', 'on_leave'].includes(props.currentStatus),
)

const terminalWarning = computed(() => {
  const map = {
    withdrawn: '轉為「退學」將停用學生帳號、取消進行中接送通知，並軟刪該生當學期才藝報名。',
    transferred: '轉為「轉出」為終態，將停用學生帳號並取消進行中接送通知。',
    graduated: '轉為「畢業」為終態，將停用學生帳號並取消進行中接送通知。',
  }
  return map[form.to_status] || ''
})

const reasonOptions = computed(() => REASON_BY_TARGET[form.to_status] || [])

const emptyForm = () => ({
  to_status: '',
  effective_date: '',
  reason: '',
  notes: '',
})
const form = reactive(emptyForm())
const formRef = ref(null)
const submitting = ref(false)

const formRules = {
  to_status: [{ required: true, message: '請選擇目標狀態', trigger: 'change' }],
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
}

// to_status 變更時，若 reason 不在新的 option 內，清掉
watch(
  () => form.to_status,
  () => {
    if (form.reason && !reasonOptions.value.includes(form.reason)) {
      form.reason = ''
    }
  },
)

async function handleSubmit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      to_status: form.to_status,
      effective_date: form.effective_date || null,
      reason: form.reason || null,
      notes: form.notes || null,
    }
    const { data } = await transitionStudentLifecycle(props.studentId, payload)
    ElMessage.success(data.message || '狀態已更新')
    emit('transitioned', data)
    visible.value = false
  } catch (err) {
    ElMessage.error(err.displayMessage || '狀態轉移失敗')
  } finally {
    submitting.value = false
  }
}
</script>
