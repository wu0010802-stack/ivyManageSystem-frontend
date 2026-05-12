<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createMilestone, updateMilestone, MILESTONE_TYPES } from '@/api/studentMilestones'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  studentId: { type: Number, required: true },
  milestone: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const saving = ref(false)

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const form = ref({
  milestone_type: 'custom',
  achieved_on: todayISO(),
  title: '',
  icon: '✨',
  description: '',
})

function getDefaultIcon(type) {
  const found = MILESTONE_TYPES.find((t) => t.value === type)
  return found ? found.icon : '✨'
}

function handleTypeChange(val) {
  form.value.icon = getDefaultIcon(val)
}

watch(
  () => props.milestone,
  (m) => {
    if (m) {
      form.value = {
        milestone_type: m.milestone_type || 'custom',
        achieved_on: m.achieved_on || todayISO(),
        title: m.title || '',
        icon: m.icon || getDefaultIcon(m.milestone_type || 'custom'),
        description: m.description || '',
      }
    } else {
      form.value = {
        milestone_type: 'custom',
        achieved_on: todayISO(),
        title: '',
        icon: '✨',
        description: '',
      }
    }
  },
  { immediate: true }
)

function disableFutureDates(date) {
  return date > new Date()
}

async function submit() {
  if (!form.value.title?.trim()) {
    ElMessage.warning('請輸入里程碑標題')
    return
  }

  saving.value = true
  try {
    const payload = {
      milestone_type: form.value.milestone_type,
      achieved_on: form.value.achieved_on,
      title: form.value.title.trim(),
      icon: form.value.icon?.trim() || null,
      description: form.value.description?.trim() || null,
    }

    let result
    if (props.milestone?.id) {
      result = await updateMilestone(props.studentId, props.milestone.id, payload)
      ElMessage.success('已更新里程碑')
    } else {
      result = await createMilestone(props.studentId, payload)
      ElMessage.success('已新增里程碑')
    }

    emit('update:modelValue', false)
    emit('saved', result.data)
  } catch (e) {
    const msg = e?.response?.data?.detail || '儲存失敗，請稍後再試'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}

defineExpose({ form, handleTypeChange })
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="milestone?.id ? '編輯里程碑' : '新增里程碑'"
    width="500px"
    @update:model-value="handleClose"
    @close="handleClose"
  >
    <el-form label-width="100px" label-position="right">
      <el-form-item label="類型" required>
        <el-select
          v-model="form.milestone_type"
          style="width: 100%"
          @change="handleTypeChange"
        >
          <el-option
            v-for="t in MILESTONE_TYPES"
            :key="t.value"
            :label="`${t.icon} ${t.label}`"
            :value="t.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="達成日期" required>
        <el-date-picker
          v-model="form.achieved_on"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="disableFutureDates"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="標題" required>
        <el-input
          v-model="form.title"
          maxlength="120"
          show-word-limit
          placeholder="請輸入里程碑標題"
        />
      </el-form-item>

      <el-form-item label="圖示">
        <el-input
          v-model="form.icon"
          maxlength="40"
          placeholder="emoji 或符號，例如 🌟"
        />
      </el-form-item>

      <el-form-item label="說明">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          maxlength="2000"
          show-word-limit
          placeholder="選填，詳細描述"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ milestone?.id ? '更新' : '新增' }}
      </el-button>
    </template>
  </el-dialog>
</template>
