<!-- src/components/employee/EmployeeFormSalary.vue -->
<script setup>
import { computed } from 'vue'
import { Lock, WarningFilled } from '@element-plus/icons-vue'
import { pensionRateToPercent, pensionPercentToRate } from '@/validators/employeeForm'

const props = defineProps({
    form: { type: Object, required: true },
    isReadonly: { type: Boolean, default: false },
    readonlyReason: { type: String, default: '' },
    pendingSuggestion: { type: Boolean, default: false },
    suggestedSalary: { type: Number, default: null },
    insuranceError: { type: String, default: null },
})
const emit = defineEmits(['apply-suggestion', 'dismiss-suggestion', 'sync-insurance'])

const fmtNTD = (n) => `NT$${Number(n).toLocaleString()}`

// 勞退百分比雙向綁定（0-0.06 ↔ 0-6%）
const pensionPercent = computed({
    get: () => pensionRateToPercent(props.form.pension_self_rate),
    set: (v) => { props.form.pension_self_rate = pensionPercentToRate(v) },
})

const fmtRO = (v, currency = false) => {
    if (v == null || v === '') return '—'
    return currency ? fmtNTD(v) : v
}
</script>

<template>
    <!-- 頂部高風險區提示 -->
    <el-alert
        v-if="!isReadonly"
        type="warning"
        :closable="false"
        show-icon
        title="高風險區：薪資 / 投保 / 銀行"
        description="本 tab 變更將觸發強制變更摘要確認對話框。"
        style="margin-bottom: 12px;"
    />
    <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        :title="readonlyReason"
        style="margin-bottom: 12px;"
    />

    <!-- 自動套薪資 banner -->
    <el-alert
        v-if="!isReadonly && pendingSuggestion"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px;"
    >
        <template #default>
            <div>
                <strong><el-icon><WarningFilled /></el-icon> 系統建議：</strong>
                依新職稱建議底薪 {{ fmtNTD(suggestedSalary) }}，目前 {{ fmtNTD(form.base_salary) }}
            </div>
            <div style="margin-top: 8px;">
                <el-button size="small" type="primary" @click="emit('apply-suggestion')">
                    套用底薪並同步投保級距
                </el-button>
                <el-button size="small" @click="emit('dismiss-suggestion')">忽略</el-button>
            </div>
        </template>
    </el-alert>

    <!-- 底薪 / 時薪 -->
    <el-row :gutter="20">
        <el-col :span="12">
            <el-form-item label="底薪" prop="base_salary">
                <template v-if="isReadonly">
                    <span class="readonly-text">{{ fmtRO(form.base_salary, true) }} <el-icon><Lock /></el-icon></span>
                </template>
                <el-input-number v-else v-model="form.base_salary" :min="0" :step="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
        </el-col>
        <el-col :span="12">
            <el-form-item label="時薪" prop="hourly_rate">
                <template v-if="isReadonly">
                    <span class="readonly-text">{{ fmtRO(form.hourly_rate, true) }} <el-icon><Lock /></el-icon></span>
                </template>
                <el-input-number v-else v-model="form.hourly_rate" :min="0" :step="10" controls-position="right" style="width: 100%" />
            </el-form-item>
        </el-col>
    </el-row>

    <!-- 投保級距 / 勞退自提 -->
    <el-row :gutter="20">
        <el-col :span="12">
            <el-form-item label="投保級距" prop="insurance_salary_level" :error="insuranceError">
                <template v-if="isReadonly">
                    <span class="readonly-text">{{ fmtRO(form.insurance_salary_level, true) }} <el-icon><Lock /></el-icon></span>
                </template>
                <template v-else>
                    <el-input-number v-model="form.insurance_salary_level" :min="0" :step="1000" controls-position="right" style="width: 100%" />
                    <el-button
                        v-if="insuranceError"
                        size="small"
                        type="warning"
                        link
                        style="margin-top: 4px;"
                        @click="emit('sync-insurance')"
                    >
                        同步為基本薪資
                    </el-button>
                </template>
            </el-form-item>
        </el-col>
        <el-col :span="12">
            <el-form-item label="勞退自提（%）" prop="pension_self_rate">
                <template v-if="isReadonly">
                    <span class="readonly-text">{{ pensionPercent }}% <el-icon><Lock /></el-icon></span>
                </template>
                <el-input-number v-else v-model="pensionPercent" :min="0" :max="6" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
            </el-form-item>
        </el-col>
    </el-row>

    <!-- 銀行資訊 -->
    <el-row :gutter="20">
        <el-col :span="8">
            <el-form-item label="銀行代碼">
                <el-input v-model="form.bank_code" :readonly="isReadonly" />
            </el-form-item>
        </el-col>
        <el-col :span="8">
            <el-form-item label="銀行帳號">
                <el-input v-model="form.bank_account" :readonly="isReadonly" />
            </el-form-item>
        </el-col>
        <el-col :span="8">
            <el-form-item label="戶名">
                <el-input v-model="form.bank_account_name" :readonly="isReadonly" />
            </el-form-item>
        </el-col>
    </el-row>
</template>

<style scoped>
.readonly-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-light);
    padding: 4px 12px;
    border-radius: 4px;
}
</style>
