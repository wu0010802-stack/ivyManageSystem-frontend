<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSummaryLogs } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { formatDateTimeTW } from '@/utils/format'
import { ACTION_LABEL } from '@/constants/appraisalYearEnd'

interface SummaryLog { id: number; action?: string; created_at?: string; actor_name?: string; actor_id?: number; from_status?: string; to_status?: string; reason?: string; comment?: string }

const props = defineProps<{
  summaryId?: number | null
}>()

const logs = ref<SummaryLog[]>([])
const loading = ref(false)

async function load() {
  if (!props.summaryId) return
  loading.value = true
  try {
    const { data } = await getSummaryLogs(props.summaryId as number)
    logs.value = data
  } catch (e) {
    ElMessage.error(apiError(e, '載入簽核軌跡失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.summaryId, (id) => { if (id) load() }, { immediate: true })

// ACTION_LABEL 從 ../labels 集中載入（P2 i18n 過渡）

// P1-11：三個簽核階段需可視區分（原本同色 success）。
// 主管簽 / 會計簽 / 核定 用 primary / warning / success 三色。
type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const ACTION_COLOR: Record<string, TagType> = {
  SIGN_SUPERVISOR: 'primary',
  SIGN_ACCOUNTING: 'warning',
  FINALIZE: 'success',
  REJECT: 'danger',
  COMMENT: 'info',
  RECOMPUTE: 'info',
}
</script>

<template>
  <el-timeline v-loading="loading" data-test="summary-log-timeline">
    <el-timeline-item v-for="log in logs" :key="log.id"
                      :timestamp="formatDateTimeTW(log.created_at)" placement="top"
                      :type="ACTION_COLOR[log.action ?? ''] || 'primary'"
                      :data-test="`log-item-${log.id}`">
      <div class="log-entry">
        <div>
          <el-tag :type="ACTION_COLOR[log.action ?? '']" size="small"
                  :data-test="`log-action-tag-${log.id}`">
            {{ (ACTION_LABEL as Record<string, string>)[log.action ?? ''] || log.action }}
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
</template>

<style scoped>
.log-entry { display: flex; flex-direction: column; gap: var(--space-1); }
.actor { margin-left: var(--space-2); font-weight: 600; }
.transition { color: var(--el-text-color-regular); font-size: 13px; }
.reason { color: var(--el-color-danger); font-size: 13px; }
.comment { color: var(--el-text-color-secondary); font-size: 13px; }
</style>
