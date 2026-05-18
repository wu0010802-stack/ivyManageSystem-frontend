<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSummaryLogs } from '@/api/appraisal'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  summaryId: { type: Number, default: null },
})
const emit = defineEmits(['update:visible'])

const drawerVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const logs = ref([])
const loading = ref(false)

async function load() {
  if (!props.summaryId) return
  loading.value = true
  try {
    const { data } = await getSummaryLogs(props.summaryId)
    logs.value = data
  } catch (e) {
    ElMessage.error(apiError(e, '載入簽核軌跡失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => [props.visible, props.summaryId], ([v]) => { if (v) load() }, { immediate: true })

const ACTION_LABEL = {
  SIGN_SUPERVISOR: '主管簽核',
  SIGN_ACCOUNTING: '會計簽核',
  FINALIZE: '核定',
  REJECT: '退簽',
  COMMENT: '留言',
  RECOMPUTE: '重算',
}

const ACTION_COLOR = {
  SIGN_SUPERVISOR: 'success',
  SIGN_ACCOUNTING: 'success',
  FINALIZE: 'success',
  REJECT: 'danger',
  COMMENT: 'info',
  RECOMPUTE: 'warning',
}
</script>

<template>
  <el-drawer v-model="drawerVisible" title="簽核軌跡" size="40%"
             data-test="summary-log-drawer">
    <el-timeline v-loading="loading">
      <el-timeline-item v-for="log in logs" :key="log.id"
                        :timestamp="log.created_at" placement="top"
                        :type="ACTION_COLOR[log.action] || 'primary'"
                        :data-test="`log-item-${log.id}`">
        <div class="log-entry">
          <div>
            <el-tag :type="ACTION_COLOR[log.action]" size="small">
              {{ ACTION_LABEL[log.action] || log.action }}
            </el-tag>
            <span class="actor">{{ log.actor_name || `user#${log.actor_id}` }}</span>
          </div>
          <div v-if="log.from_status || log.to_status" class="transition">
            {{ log.from_status || '—' }} → {{ log.to_status || '—' }}
          </div>
          <div v-if="log.reason" class="reason">退簽原因：{{ log.reason }}</div>
          <div v-if="log.comment" class="comment">留言：{{ log.comment }}</div>
        </div>
      </el-timeline-item>
      <el-empty v-if="!loading && logs.length === 0" description="尚無簽核軌跡" />
    </el-timeline>
  </el-drawer>
</template>

<style scoped>
.log-entry { display: flex; flex-direction: column; gap: 4px; }
.actor { margin-left: 8px; font-weight: 600; }
.transition { color: var(--el-text-color-regular); font-size: 13px; }
.reason { color: var(--el-color-danger); font-size: 13px; }
.comment { color: var(--el-text-color-secondary); font-size: 13px; }
</style>
