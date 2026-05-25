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
}>()

const emit = defineEmits<{
    retry: []
}>()

const hasFailure = computed(() => props.steps.some((s) => s.status === 'failed'))

function stepLabel(step: string): string {
    return STEP_LABELS[step] ?? step
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
                    <el-icon v-if="step.status === 'completed'" color="#67c23a">
                        <Check />
                    </el-icon>
                    <el-icon v-else-if="step.status === 'skipped'" color="#e6a23c">
                        <Minus />
                    </el-icon>
                    <el-icon v-else color="#f56c6c">
                        <Close />
                    </el-icon>
                </span>
                <span class="step-label">{{ stepLabel(step.step) }}</span>
                <span v-if="step.status === 'failed' && step.error" class="step-error">
                    {{ step.error }}
                </span>
                <span v-if="step.status === 'skipped' && step.payload && step.payload['reason']" class="step-note">
                    {{ step.payload['reason'] }}
                </span>
            </li>
        </ul>

        <div v-if="hasFailure" class="retry-section">
            <el-button type="danger" class="retry-button" @click="emit('retry')">
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

.step-error {
    font-size: 12px;
    color: #f56c6c;
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
