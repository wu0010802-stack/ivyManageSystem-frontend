<script setup lang="ts">
import { ACTION_LABELS as _ACTION_LABELS, ACTION_TAG_TYPES as _ACTION_TAG_TYPES } from '@/constants/approvalEnums'

// Cast to Record<string, string> so template v-for with dynamic action key works
const ACTION_LABELS = _ACTION_LABELS as Record<string, string>
const ACTION_TAG_TYPES = _ACTION_TAG_TYPES as Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'>

interface ApprovalLog {
  id: number
  action: string
  created_at?: string
  approver_username?: string
  approver_role?: string
  comment?: string
}

withDefaults(defineProps<{
  visible?: boolean
  loading?: boolean
  logs?: ApprovalLog[]
}>(), {
  visible: false,
  loading: false,
  logs: () => [],
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()
const updateVisible = (value: boolean) => emit('update:visible', value)
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="簽核記錄"
    direction="rtl"
    size="420px"
    @update:model-value="updateVisible"
  >
    <div v-loading="loading">
      <el-empty v-if="!loading && logs.length === 0" description="尚無簽核記錄" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="log in logs"
          :key="log.id"
          :timestamp="log.created_at ? new Date(log.created_at).toLocaleString('zh-TW') : ''"
          placement="top"
        >
          <el-card shadow="never" style="padding: 8px 12px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <el-tag :type="ACTION_TAG_TYPES[log.action] || 'info'" size="small">
                {{ ACTION_LABELS[log.action] || log.action }}
              </el-tag>
              <span style="font-weight: 500;">{{ log.approver_username }}</span>
              <el-tag size="small" type="info">{{ log.approver_role }}</el-tag>
            </div>
            <div v-if="log.comment" style="margin-top: 6px; color: var(--text-secondary); font-size: 13px;">
              {{ log.comment }}
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </div>
  </el-drawer>
</template>
