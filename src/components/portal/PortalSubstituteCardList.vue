<script setup lang="ts">
interface SubstituteRequest {
  id: number | string
  requester_name?: string
  leave_type_label?: string
  substitute_status?: string
  start_date?: string
  end_date?: string
  leave_hours?: number | string
  reason?: string | null
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  requests: SubstituteRequest[]
  respondLoading?: boolean
}>(), {
  respondLoading: false,
})

const emit = defineEmits<{
  'respond': [id: number | string, action: string]
}>()

const statusLabel = (s: string | undefined | null) => ({
  pending: '待回應', accepted: '已接受', rejected: '已拒絕', waived: '主管略過', not_required: '—',
} as Record<string, string>)[s ?? ''] || s || ''

const statusTagType = (s: string | undefined | null): 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined => {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'warning', accepted: 'success', rejected: 'danger', waived: 'info', not_required: 'info',
  }
  return (s && map[s]) || undefined
}
</script>

<template>
    <div class="substitute-card-list">
        <div
            v-for="req in requests"
            :key="req.id"
            class="substitute-card"
            data-test="substitute-card"
        >
            <div class="card-row card-top">
                <div class="card-meta">
                    <span class="requester">{{ req.requester_name }}</span>
                    <el-tag size="small">{{ req.leave_type_label }}</el-tag>
                </div>
                <el-tag :type="statusTagType(req.substitute_status)" size="small">
                    {{ statusLabel(req.substitute_status) }}
                </el-tag>
            </div>
            <div class="card-body">
                <div class="info-line">
                    <span class="label">區間</span>
                    <span>{{ req.start_date }} ~ {{ req.end_date }}</span>
                </div>
                <div class="info-line">
                    <span class="label">時數</span>
                    <span>{{ req.leave_hours }} 小時</span>
                </div>
                <div class="info-line reason">
                    <span class="label">原因</span>
                    <span>{{ req.reason || '—' }}</span>
                </div>
            </div>
            <div v-if="req.substitute_status === 'pending'" class="card-actions">
                <el-button
                    type="success"
                    :loading="respondLoading"
                    class="action-btn"
                    data-test="accept-btn"
                    @click="emit('respond', req.id, 'accept')"
                >
                    接受
                </el-button>
                <el-button
                    type="danger"
                    :loading="respondLoading"
                    class="action-btn"
                    data-test="reject-btn"
                    @click="emit('respond', req.id, 'reject')"
                >
                    拒絕
                </el-button>
            </div>
            <div v-else class="card-actions-disabled">已回應</div>
        </div>
    </div>
</template>

<style scoped>
.substitute-card-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.substitute-card {
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.card-row.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.requester {
    font-weight: 600;
    color: var(--text-primary);
}

.card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
}

.info-line {
    display: flex;
    gap: var(--space-2);
}

.info-line .label {
    min-width: 36px;
    color: var(--text-tertiary, var(--text-secondary));
}

.info-line.reason span:last-child {
    flex: 1;
    word-break: break-word;
}

.card-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
}

.action-btn {
    flex: 1;
}

.card-actions-disabled {
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    padding-top: var(--space-2);
}
</style>
