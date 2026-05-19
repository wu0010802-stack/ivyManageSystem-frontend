<script setup lang="ts">
interface ApprovalLog {
  id: number
  created_at?: string
  action: string
  approver_username: string
  approver_role: string
  comment?: string
}

const props = withDefaults(defineProps<{
  visible?: boolean
  loading?: boolean
  logs?: ApprovalLog[]
  actionLabels: Record<string, string>
  actionTagTypes: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger' | ''>
}>(), {
  visible: false,
  loading: false,
  logs: () => [],
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const updateVisible = (value: boolean) => emit('update:visible', value)
</script>

<template>
  <el-drawer
    :model-value="props.visible"
    title="簽核記錄"
    direction="rtl"
    size="420px"
    @update:model-value="updateVisible"
  >
    <div v-loading="props.loading">
      <el-empty v-if="!props.loading && props.logs.length === 0" description="尚無簽核記錄" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="log in props.logs"
          :key="log.id"
          :timestamp="log.created_at ? new Date(log.created_at).toLocaleString('zh-TW') : ''"
          placement="top"
        >
          <el-card shadow="never" style="padding: 8px 12px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <el-tag :type="props.actionTagTypes[log.action] || 'info'" size="small">
                {{ props.actionLabels[log.action] || log.action }}
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
