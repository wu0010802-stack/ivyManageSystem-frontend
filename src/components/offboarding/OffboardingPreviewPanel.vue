<script setup lang="ts">
import { computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import type { ApiResponse } from '@/api/_generated/typed'

type PreviewType = ApiResponse<'/offboarding/{employee_id}/preview', 'post'>

const props = defineProps<{
    preview: PreviewType
}>()

/**
 * 使用者帳號標籤：將撤銷 → 紅色 danger，通知期保留 → 灰色 info
 */
const accountTagType = computed(() =>
    props.preview.preview.user_account_will_be_revoked ? 'danger' : 'info',
)
const accountTagText = computed(() =>
    props.preview.preview.user_account_will_be_revoked ? '將撤銷' : '通知期保留',
)

/**
 * 特休結算：X 天 × 日薪 Y = $Z
 */
const leaveSnapshot = computed(() => props.preview.preview.leave_snapshot)
const salaryTarget = computed(() => props.preview.preview.salary_record_target)

/**
 * 離職當月薪資狀態文字
 */
const salaryStatusText = computed(() => {
    const { year, month, exists } = salaryTarget.value
    const base = `${year}/${String(month).padStart(2, '0')}`
    return exists ? `${base} 已存在` : `${base} 尚未建立`
})

/**
 * 進行中考核
 */
const inFlightCycles = computed(() => props.preview.preview.appraisal_in_flight_cycles)
</script>

<template>
    <div class="offboarding-preview-panel">
        <el-descriptions :column="1" border>
            <el-descriptions-item label="姓名">
                {{ preview.employee_name }}
            </el-descriptions-item>

            <el-descriptions-item label="離職日">
                {{ preview.resign_date }}
            </el-descriptions-item>

            <el-descriptions-item label="使用者帳號">
                <el-tag :type="accountTagType">{{ accountTagText }}</el-tag>
            </el-descriptions-item>

            <el-descriptions-item label="特休結算">
                {{ leaveSnapshot.special_leave_days }} 天 ×
                日薪 {{ leaveSnapshot.daily_wage.toLocaleString() }} =
                ${{ leaveSnapshot.payout_amount.toLocaleString() }}
            </el-descriptions-item>

            <el-descriptions-item label="離職當月薪資">
                <span>{{ salaryStatusText }}</span>
                <el-tag v-if="salaryTarget.will_be_marked_stale" type="warning" size="small" style="margin-left: 6px;">
                    將標 stale
                </el-tag>
            </el-descriptions-item>

            <el-descriptions-item v-if="inFlightCycles.length > 0" label="進行中考核">
                <span v-for="cycle in inFlightCycles" :key="cycle.cycle_id" style="margin-right: 8px;">
                    {{ cycle.cycle_name }}
                    <span v-if="cycle.current_score != null">（{{ cycle.current_score }} 分）</span>
                </span>
            </el-descriptions-item>
        </el-descriptions>

        <div v-if="preview.warnings && preview.warnings.length > 0" class="warning-box">
            <el-icon color="#f56c6c" style="margin-right: 4px;">
                <WarningFilled />
            </el-icon>
            <span>注意事項：</span>
            <ul>
                <li
                    v-for="(w, i) in preview.warnings"
                    :key="i"
                    class="warning-text"
                >
                    {{ w }}
                </li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.offboarding-preview-panel {
    padding: 4px 0;
}

.warning-box {
    margin-top: 16px;
    padding: 12px 16px;
    background: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 4px;
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
}

.warning-box span {
    font-weight: 600;
    color: #f56c6c;
}

.warning-box ul {
    margin: 4px 0 0 8px;
    padding-left: 16px;
    width: 100%;
}

.warning-text {
    color: #f56c6c;
    margin-bottom: 4px;
}
</style>
