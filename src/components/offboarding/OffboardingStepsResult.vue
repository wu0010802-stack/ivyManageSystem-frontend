<script setup lang="ts">
import { computed } from 'vue'
import { Check, Minus, Close } from '@element-plus/icons-vue'
import type { ApiResponse } from '@/api/_generated/typed'

type StepResultModel = ApiResponse<'/offboarding/{employee_id}/process', 'post'>['steps'][number]

const STEP_LABELS: Record<string, string> = {
    mark_appraisal: '標記進行中考核',
    leave_snapshot: '特休餘額快照',
    prefill_salary: '預填離職當月薪資',
    revoke_user: '撤銷使用者帳號',
    generate_certificate: '產生離職證明 PDF',
}

const props = defineProps<{
    steps: StepResultModel[]
    /** 重試進行中（父層 process 呼叫中），重試鈕顯示 loading 防連點 */
    retrying?: boolean
}>()

const emit = defineEmits<{
    retry: []
}>()

const hasFailure = computed(() => props.steps.some((s) => s.status === 'failed'))

function stepLabel(step: string): string {
    return STEP_LABELS[step] ?? step
}

/** 狀態的可見文字：語意不得只靠 icon 顏色（螢幕報讀器/色弱皆讀文字） */
const STATUS_LABELS: Record<string, string> = {
    completed: '完成',
    skipped: '已略過',
    failed: '失敗',
}

function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status
}
</script>

<template>
    <div class="offboarding-steps-result">
        <ul class="steps-list">
            <li
                v-for="(step, i) in steps"
                :key="i"
                class="step-item"
                :class="`status-${step.status}`"
            >
                <span class="step-icon">
                    <el-icon v-if="step.status === 'completed'" class="icon-completed" aria-hidden="true">
                        <Check />
                    </el-icon>
                    <el-icon v-else-if="step.status === 'skipped'" class="icon-skipped" aria-hidden="true">
                        <Minus />
                    </el-icon>
                    <el-icon v-else class="icon-failed" aria-hidden="true">
                        <Close />
                    </el-icon>
                </span>
                <span class="step-label">{{ stepLabel(step.step) }}</span>
                <span class="step-status" :class="`step-status--${step.status}`">
                    {{ statusLabel(step.status) }}
                </span>
                <span v-if="step.status === 'failed' && step.error" class="step-error">
                    {{ step.error }}
                </span>
                <span v-if="step.status === 'skipped' && step.payload && step.payload['reason']" class="step-note">
                    {{ step.payload['reason'] }}
                </span>
            </li>
        </ul>

        <div v-if="hasFailure" class="retry-section">
            <el-button type="danger" class="retry-button" :loading="retrying" @click="emit('retry')">
                重試失敗步驟
            </el-button>
        </div>
    </div>
</template>

<style scoped>
.offboarding-steps-result {
    padding: 4px 0;
}

.steps-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.step-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.step-item:last-child {
    border-bottom: none;
}

.step-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
}

.step-label {
    flex: 1;
    font-size: 14px;
    color: var(--el-text-color-primary, #303133);
}

/* 狀態色走 EP semantic token（dark mode 自動翻轉）；文字色用 dark-2 保 AA 對比 */
.icon-completed {
    color: var(--el-color-success);
}
.icon-skipped {
    color: var(--el-color-warning);
}
.icon-failed {
    color: var(--el-color-danger);
}

.step-status {
    font-size: 12px;
    font-weight: 500;
}
.step-status--completed {
    color: var(--el-color-success-dark-2);
}
.step-status--skipped {
    color: var(--el-color-warning-dark-2);
}
.step-status--failed {
    color: var(--el-color-danger-dark-2);
}

.step-error {
    font-size: 12px;
    color: var(--el-color-danger-dark-2);
    margin-left: 8px;
}

.step-note {
    font-size: 12px;
    color: var(--el-text-color-secondary, #909399);
    margin-left: 8px;
}

.retry-section {
    margin-top: 16px;
    text-align: right;
}
</style>
