<!-- src/components/employee/EmployeeFormSalary.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { Lock, WarningFilled } from '@element-plus/icons-vue'
import { pensionRateToPercent, pensionPercentToRate } from '@/validators/employeeForm'
import { formatCurrency } from '@/utils/currency'
import FormSection from '@/components/common/FormSection.vue'

export interface EmployeeFormSalaryData {
  base_salary?: number | null
  hourly_rate?: number | null
  insurance_salary_level?: number | null
  pension_self_rate?: number | null
  bank_code?: string
  bank_account?: string
  bank_account_name?: string
  no_employment_insurance?: boolean
  health_exempt?: boolean
  skip_payroll_bonuses?: boolean
  bypass_standard_base?: boolean
  skip_payroll_transfer?: boolean
  unreported_for_tax?: boolean
  insurance_salary_override_reason?: string
  labor_insured_salary?: number | null
  health_insured_salary?: number | null
  pension_insured_salary?: number | null
  contract_base_salary?: number | null
  insurance_effective_date?: string
}

const props = withDefaults(defineProps<{
  form: EmployeeFormSalaryData
  isReadonly?: boolean
  readonlyReason?: string
  pendingSuggestion?: boolean
  suggestedSalary?: number | null
  insuranceError?: string | null
}>(), {
  isReadonly: false,
  readonlyReason: '',
  pendingSuggestion: false,
  suggestedSalary: null,
  insuranceError: null,
})
const emit = defineEmits<{
  'apply-suggestion': []
  'dismiss-suggestion': []
  'sync-insurance': []
}>()

const fmtNTD = (n: number | null | undefined) => formatCurrency(n)

// 勞退百分比雙向綁定（0-0.06 ↔ 0-6%）
const pensionPercent = computed({
    get: () => pensionRateToPercent(props.form.pension_self_rate ?? 0),
    set: (v: number) => { props.form.pension_self_rate = pensionPercentToRate(v) },
})

const fmtRO = (v: number | string | null | undefined, currency = false) => {
    if (v == null || v === '') return '—'
    return currency ? fmtNTD(v as number) : v
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

    <!-- 底薪 -->
    <el-form-item label="底薪" prop="base_salary">
        <template v-if="isReadonly">
            <span class="readonly-text">{{ fmtRO(form.base_salary, true) }} <el-icon><Lock /></el-icon></span>
        </template>
        <el-input-number v-else v-model="form.base_salary" :min="0" :step="1000" controls-position="right" style="width: 100%" />
    </el-form-item>

    <!-- 時薪 -->
    <el-form-item label="時薪" prop="hourly_rate">
        <template v-if="isReadonly">
            <span class="readonly-text">{{ fmtRO(form.hourly_rate, true) }} <el-icon><Lock /></el-icon></span>
        </template>
        <el-input-number v-else v-model="form.hourly_rate" :min="0" :step="10" controls-position="right" style="width: 100%" />
    </el-form-item>

    <!-- 投保級距 -->
    <el-form-item label="投保級距" prop="insurance_salary_level" :error="insuranceError ?? undefined">
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

    <!-- 加保生效日 -->
    <el-form-item label="加保生效日">
      <el-date-picker
        v-model="form.insurance_effective_date" type="date"
        placeholder="選擇日期" style="width:100%"
        value-format="YYYY-MM-DD" clearable
        :readonly="isReadonly"
      />
      <div class="hint" style="text-align:left">僅作記錄，不影響薪資計算</div>
    </el-form-item>

    <!-- 勞退自提 -->
    <el-form-item label="勞退自提（%）" prop="pension_self_rate">
        <template v-if="isReadonly">
            <span class="readonly-text">{{ pensionPercent }}% <el-icon><Lock /></el-icon></span>
        </template>
        <el-input-number v-else v-model="pensionPercent" :min="0" :max="6" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
    </el-form-item>

    <!-- 銀行資訊 -->
    <el-form-item label="銀行代碼">
        <el-input v-model="form.bank_code" :readonly="isReadonly" />
    </el-form-item>
    <el-form-item label="銀行帳號">
        <el-input v-model="form.bank_account" :readonly="isReadonly" />
    </el-form-item>
    <el-form-item label="戶名">
        <el-input v-model="form.bank_account_name" :readonly="isReadonly" />
    </el-form-item>

    <!-- 進階特殊投保／獎金狀態（預設摺疊，僅特殊個案需設定）-->
    <FormSection data-test="section-advanced" title="進階特殊狀況" collapsible :default-open="false" style="margin-top: 12px;">
        <div class="form-hint" style="margin-bottom: 8px;">免就保 / 健保豁免 / 不發紅利 / 分項投保 / 個人合約底薪</div>

        <!-- 計薪行為旗標 -->
        <el-row :gutter="20">
            <el-col :span="6">
                <el-form-item>
                    <template #label>
                        <el-tooltip content="退休再聘等：勞保改算 11.5%（不含就保 1%）" placement="top">
                            <span>免就保</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.no_employment_insurance" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
            <el-col :span="6">
                <el-form-item>
                    <template #label>
                        <el-tooltip content="健保由其他管道（公保/老人健保等）；公司不扣本人+眷屬健保" placement="top">
                            <span>健保豁免</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.health_exempt" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
            <el-col :span="6">
                <el-form-item>
                    <template #label>
                        <el-tooltip content="業主指示不發紅利/節慶/超額/生日禮金；保險仍計算" placement="top">
                            <span>不發獎金</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.skip_payroll_bonuses" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
            <el-col :span="6">
                <el-form-item>
                    <template #label>
                        <el-tooltip content="True=用個人合約底薪（含年資加給）；False=走 PositionSalaryConfig 標準" placement="top">
                            <span>個人合約底薪</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.bypass_standard_base" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
        </el-row>

        <!-- 不薪轉 / 不入稅報（業主指示特殊個案） -->
        <el-row :gutter="20">
            <el-col :span="12">
                <el-form-item>
                    <template #label>
                        <el-tooltip
                            content="薪資仍計算，但不入銀行轉帳名冊（用現金/其他管道支付，如執行長指示不薪轉的個案）"
                            placement="top"
                        >
                            <span>不入轉帳名冊</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.skip_payroll_transfer" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
            <el-col :span="12">
                <el-form-item>
                    <template #label>
                        <el-tooltip
                            content="薪資/保險仍正常計算扣繳，但年度扣繳憑單匯出時排除（國稅局不作帳）"
                            placement="top"
                        >
                            <span>不入稅報</span>
                        </el-tooltip>
                    </template>
                    <el-switch v-model="form.unreported_for_tax" :disabled="isReadonly" />
                </el-form-item>
            </el-col>
        </el-row>

        <!-- 投保覆蓋原因 -->
        <el-row :gutter="20">
            <el-col :span="24">
                <el-form-item label="投保金額調整原因">
                    <el-input
                        v-model="form.insurance_salary_override_reason"
                        placeholder="若投保金額 ≠ 底薪，填寫合規記錄（如：年資加給合約、業主協議、退休再聘等）"
                        maxlength="200" show-word-limit
                        :readonly="isReadonly"
                    />
                </el-form-item>
            </el-col>
        </el-row>

        <!-- 分項投保（議題 B）-->
        <el-form-item>
            <template #label>
                <el-tooltip
                    content="留空=沿用上方「投保級距」；填值=該制度獨立投保。實務常見：勞保 vs 健保 vs 勞退 投保金額不同"
                    placement="top"
                >
                    <span>分項投保（留空 = 沿用投保級距）</span>
                </el-tooltip>
            </template>
            <el-row :gutter="12" style="width: 100%;">
                <el-col :span="8">
                    <el-input-number
                        v-model="form.labor_insured_salary"
                        :min="0" :step="100" placeholder="勞保投保"
                        :value-on-clear="null"
                        controls-position="right" style="width: 100%"
                        :disabled="isReadonly"
                    />
                    <span class="hint">勞保投保金額（清欄/0 = 沿用級距）</span>
                </el-col>
                <el-col :span="8">
                    <el-input-number
                        v-model="form.health_insured_salary"
                        :min="0" :step="100" placeholder="健保投保"
                        :value-on-clear="null"
                        controls-position="right" style="width: 100%"
                        :disabled="isReadonly"
                    />
                    <span class="hint">健保投保金額（清欄/0 = 沿用級距）</span>
                </el-col>
                <el-col :span="8">
                    <el-input-number
                        v-model="form.pension_insured_salary"
                        :min="0" :step="100" placeholder="勞退提繳"
                        :value-on-clear="null"
                        controls-position="right" style="width: 100%"
                        :disabled="isReadonly"
                    />
                    <span class="hint">勞退提繳工資（清欄/0 = 沿用級距）</span>
                </el-col>
            </el-row>
        </el-form-item>
    </FormSection>
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
.hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: center;
}
</style>
