<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Loading } from '@element-plus/icons-vue'
import { getMyWorkdayHours } from '@/api/portal'
import { OVERTIME_TYPES as overtimeTypes } from '@/constants/approvalEnums'
import { useIsMobile } from '@/composables/useIsMobile'

const emit = defineEmits<{
  'submit': [payload: Record<string, unknown>]
  'cancel': []
}>()

withDefaults(defineProps<{
  loading?: boolean
}>(), {
  loading: false,
})

const form = reactive({
    overtime_date: '',
    overtime_type: 'weekday',
    start_time: '',
    end_time: '',
    hours: 0,
    reason: '',
    use_comp_leave: false,
})
const typeDetecting = ref(false)
const typeHint = ref('')
const timeError = ref('')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formRef = ref<any>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rules: Record<string, any[]> = {
    overtime_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
    overtime_type: [{ required: true, message: '請選擇類型', trigger: 'change' }],
    hours: [
        { required: true, type: 'number', message: '請填入時數', trigger: 'change' },
        { type: 'number', min: 0.5, message: '至少 0.5 小時', trigger: 'change' },
    ],
}

const _detectOvertimeType = useDebounceFn(async (dateStr) => {
    typeDetecting.value = true
    try {
        const res = await getMyWorkdayHours({ start_date: dateStr, end_date: dateStr })
        const bd = res.data.breakdown
        if (bd && bd.length > 0) {
            const day = bd[0]
            if (day.type === 'holiday') {
                form.overtime_type = 'holiday'
                typeHint.value = `國定假日（${day.holiday_name}）`
            } else if (day.type === 'weekend') {
                form.overtime_type = 'weekend'
                typeHint.value = '假日（週末）'
            } else {
                form.overtime_type = 'weekday'
                typeHint.value = `平日${day.shift ? `（${day.shift}）` : ''}`
            }
        }
    } catch {
        const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
        const d = m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : new Date(dateStr)
        const wd = d.getDay()
        if (wd === 0 || wd === 6) {
            form.overtime_type = 'weekend'
            typeHint.value = '假日（週末）'
        } else {
            form.overtime_type = 'weekday'
            typeHint.value = '平日'
        }
    } finally {
        typeDetecting.value = false
    }
}, 300)

watch(() => form.overtime_date, (dateStr) => {
    if (!dateStr) { typeHint.value = ''; return }
    _detectOvertimeType(dateStr)
})

const calcHours = () => {
    timeError.value = ''
    if (!form.start_time || !form.end_time) return
    if (form.end_time <= form.start_time) {
        timeError.value = '結束時間必須晚於開始時間'
        form.hours = 0
        return
    }
    const [sh, sm] = form.start_time.split(':').map(Number)
    const [eh, em] = form.end_time.split(':').map(Number)
    const minutes = (eh * 60 + em) - (sh * 60 + sm)
    if (minutes < 30) {
        timeError.value = '加班時段不足 30 分鐘，請以 0.5 小時為最小單位'
        form.hours = 0
        return
    }
    form.hours = Math.round(minutes / 60 * 2) / 2
}
watch(() => form.start_time, calcHours)
watch(() => form.end_time, calcHours)

const typeLabel = computed(() => {
    const t = overtimeTypes.find(o => o.value === form.overtime_type)
    return t ? t.label : ''
})

const payPreviewText = computed(() => {
    if (form.use_comp_leave) return '-- (改以補休計算)'
    if (!form.hours || form.hours < 0.5) return '--'
    return '送出後由後端計算'
})

const canSubmit = computed(() =>
    !!form.overtime_date && form.hours >= 0.5 && !timeError.value
)

const submit = async () => {
    try {
        await formRef.value.validate()
    } catch {
        return
    }
    if (form.hours < 0.5) return
    const payload: Record<string, unknown> = {
        overtime_date: form.overtime_date,
        overtime_type: form.overtime_type,
        hours: form.hours,
        reason: form.reason,
        use_comp_leave: form.use_comp_leave,
    }
    if (form.start_time) payload.start_time = form.start_time
    if (form.end_time) payload.end_time = form.end_time
    emit('submit', payload)
}

defineExpose({ form })

// 手機改用頂端標籤，避免固定 label-width 把「開始時間」等標籤折行（P1-02）
const { isMobile } = useIsMobile()
</script>

<template>
    <div class="overtime-form">
        <el-form ref="formRef" :model="form" :rules="rules" :label-position="isMobile ? 'top' : 'right'"
            :label-width="isMobile ? undefined : '80px'">
            <el-form-item label="日期" prop="overtime_date">
                <el-date-picker v-model="form.overtime_date" type="date" value-format="YYYY-MM-DD" placeholder="選擇加班日期" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="類型" prop="overtime_type">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <el-tag v-if="typeDetecting" type="info" size="default">
                        <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 偵測中…
                    </el-tag>
                    <el-tag v-else-if="form.overtime_date" :type="form.overtime_type === 'weekday' ? 'info' : form.overtime_type === 'weekend' ? 'warning' : 'danger'" size="default">
                        {{ typeLabel }}
                    </el-tag>
                    <span v-else style="color: var(--el-text-color-placeholder);">請先選擇日期</span>
                    <span v-if="typeHint" style="font-size: 12px; color: var(--el-text-color-secondary);">{{ typeHint }}</span>
                </div>
            </el-form-item>
            <el-form-item label="開始時間" required>
                <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="選擇開始時間" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="結束時間" required :error="timeError">
                <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="選擇結束時間" style="width: 100%;" />
            </el-form-item>
            <el-form-item label="時數" prop="hours">
                <el-input-number v-model="form.hours" :min="0.5" :max="12" :step="0.5" disabled />
                <span v-if="form.hours > 0" style="margin-left: 8px; font-size: 12px; color: var(--el-text-color-secondary);">
                    由開始/結束時間自動計算
                </span>
            </el-form-item>
            <el-form-item label="預估加班費">
                <span :style="{ color: form.use_comp_leave ? 'var(--el-text-color-secondary)' : 'var(--el-color-success)', fontWeight: '600' }">
                    {{ payPreviewText }}
                </span>
            </el-form-item>
            <el-form-item label="補休方式">
                <div class="comp-leave-choice">
                    <el-radio-group v-model="form.use_comp_leave" aria-label="補休方式">
                        <el-radio-button :value="false">加班費</el-radio-button>
                        <el-radio-button :value="true">補休</el-radio-button>
                    </el-radio-group>
                    <span class="comp-leave-hint">
                        補休以 1:1 累積，核准後即計入當年度補休時數
                    </span>
                </div>
            </el-form-item>
            <el-form-item label="原因">
                <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請輸入加班原因" />
            </el-form-item>
        </el-form>
        <div class="form-footer">
            <el-button @click="emit('cancel')">取消</el-button>
            <el-button class="submit-btn" type="primary" :loading="loading" :disabled="!canSubmit" @click="submit">送出申請</el-button>
        </div>
    </div>
</template>

<style scoped>
/* 補休方式：原本用 el-switch 的 active-text/inactive-text，窄幕會把「加班費」
   「補休」壓成直排單字（P1-02）。改分段選鈕後語意也更清楚。 */
.comp-leave-choice {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
}
.comp-leave-hint {
    font-size: var(--text-xs);
    color: var(--el-text-color-secondary);
}
.overtime-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.form-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-color);
}
</style>
