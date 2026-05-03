<template>
  <el-drawer
    :model-value="show"
    direction="btt"
    size="80%"
    title="用藥執行"
    @update:model-value="$emit('update:show', $event)"
    @open="onOpen"
  >
    <div v-loading="loading" class="med-sheet">
      <div v-if="!loading && pending.length === 0" class="med-empty">
        <el-empty description="今日沒有待執行的用藥" />
      </div>
      <div v-for="item in pending" :key="item.log_id" class="med-row">
        <div class="med-row__head">
          <strong>{{ item.scheduled_time }}</strong>
          <span class="med-row__student">{{ item.student_name }}</span>
        </div>
        <div class="med-row__detail">
          {{ item.medication_name }} — {{ item.dose }}
          <span v-if="item.note" class="med-row__note">（{{ item.note }}）</span>
        </div>
        <div class="med-row__actions">
          <el-button
            type="success"
            size="small"
            :loading="working === item.log_id"
            @click="onAdminister(item.log_id)"
          >
            ✓ 已執行
          </el-button>
          <el-button
            size="small"
            :loading="working === item.log_id"
            @click="onSkip(item.log_id)"
          >
            未執行
          </el-button>
        </div>
      </div>
      <p v-if="error" class="med-error">{{ error }}</p>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listToday, administer, skipLog } from '@/api/portalMedications'

defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'done'])

const loading = ref(false)
const working = ref(null)
const error = ref('')
const pending = ref([])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await listToday()
    const items = []
    for (const g of (res.data?.groups ?? [])) {
      for (const it of (g.items ?? [])) {
        if (it.status === 'pending') items.push(it)
      }
    }
    pending.value = items
  } catch (e) {
    error.value = e?.message || '載入失敗'
  } finally {
    loading.value = false
  }
}

async function onAdminister(logId) {
  working.value = logId
  try {
    await administer(logId, {})
    pending.value = pending.value.filter((i) => i.log_id !== logId)
    emit('done')
    ElMessage.success('已執行')
  } catch (e) {
    error.value = '儲存失敗'
  } finally {
    working.value = null
  }
}

async function onSkip(logId) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('未執行原因（必填）', '備註', {
      confirmButtonText: '確認',
      cancelButtonText: '取消',
      inputValidator: (v) => (v && v.trim() ? true : '請輸入原因'),
    })
    reason = result.value?.trim() || ''
  } catch {
    return // user cancelled
  }
  working.value = logId
  try {
    await skipLog(logId, { reason })
    pending.value = pending.value.filter((i) => i.log_id !== logId)
    emit('done')
    ElMessage.success('已標記為未執行')
  } catch (e) {
    error.value = '儲存失敗'
  } finally {
    working.value = null
  }
}

function onOpen() {
  load()
}
</script>

<style scoped>
.med-sheet {
  padding: 0 16px 24px;
}
.med-empty {
  padding: 40px 0;
}
.med-row {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
}
.med-row__head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin-bottom: 6px;
}
.med-row__student {
  font-weight: 500;
}
.med-row__detail {
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
}
.med-row__note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.med-row__actions {
  display: flex;
  gap: 8px;
}
.med-error {
  color: var(--el-color-danger);
  text-align: center;
  margin-top: 12px;
}
</style>
