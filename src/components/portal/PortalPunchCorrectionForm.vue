<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
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

const correctionTypes = [
    { value: 'punch_in',  label: '補上班打卡', description: '有下班記錄，但缺上班記錄' },
    { value: 'punch_out', label: '補下班打卡', description: '有上班記錄，但缺下班記錄' },
    { value: 'both',      label: '補全天打卡', description: '整日無任何打卡記錄' },
]

const form = reactive({
    attendance_date: '',
    correction_type: 'punch_out',
    requested_punch_in_time: '',
    requested_punch_out_time: '',
    reason: '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formRef = ref<any>(null)

const disabledDate = (time: Date) => time.getTime() > Date.now()

const showPunchIn = computed(() =>
    form.correction_type === 'punch_in' || form.correction_type === 'both'
)
const showPunchOut = computed(() =>
    form.correction_type === 'punch_out' || form.correction_type === 'both'
)

const rules = {
    attendance_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
    correction_type: [{ required: true, message: '請選擇補正類型', trigger: 'change' }],
}

const buildDatetime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return null
    return `${dateStr}T${timeStr}:00`
}

const canSubmit = computed(() => !!form.attendance_date)

const submit = async () => {
    try {
        await formRef.value.validate()
    } catch {
        return
    }
    if (showPunchIn.value && !form.requested_punch_in_time) return
    if (showPunchOut.value && !form.requested_punch_out_time) return

    emit('submit', {
        attendance_date: form.attendance_date,
        correction_type: form.correction_type,
        requested_punch_in: buildDatetime(form.attendance_date, form.requested_punch_in_time),
        requested_punch_out: buildDatetime(form.attendance_date, form.requested_punch_out_time),
        reason: form.reason || null,
    })
}

defineExpose({ form })

// 手機改用頂端標籤，避免固定 label-width 把「開始時間」等標籤折行（P1-02）
const { isMobile } = useIsMobile()
</script>

<template>
    <div class="punch-correction-form">
        <el-form ref="formRef" :model="form" :rules="rules" :label-position="isMobile ? 'top' : 'right'"
            :label-width="isMobile ? undefined : '100px'">
            <el-form-item label="申請日期" prop="attendance_date">
                <el-date-picker
                    v-model="form.attendance_date"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="選擇遺漏打卡的日期"
                    :disabled-date="disabledDate"
                    style="width: 100%;"
                />
            </el-form-item>
            <el-form-item label="補正類型" prop="correction_type">
                <el-select v-model="form.correction_type" style="width: 100%;">
                    <el-option
                        v-for="t in correctionTypes"
                        :key="t.value"
                        :label="t.label"
                        :value="t.value"
                    >
                        <div style="display: flex; justify-content: space-between;">
                            <span>{{ t.label }}</span>
                            <span style="color: var(--el-text-color-placeholder); font-size: 12px;">{{ t.description }}</span>
                        </div>
                    </el-option>
                </el-select>
            </el-form-item>
            <el-form-item v-if="showPunchIn" label="申請上班時間" required>
                <el-time-picker
                    v-model="form.requested_punch_in_time"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="選擇申請上班時間"
                    style="width: 100%;"
                />
            </el-form-item>
            <el-form-item v-if="showPunchOut" label="申請下班時間" required>
                <el-time-picker
                    v-model="form.requested_punch_out_time"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="選擇申請下班時間"
                    style="width: 100%;"
                />
            </el-form-item>
            <el-form-item label="說明原因">
                <el-input
                    v-model="form.reason"
                    type="textarea"
                    :rows="3"
                    placeholder="請說明遺忘打卡的原因（選填）"
                />
            </el-form-item>
        </el-form>
        <div class="form-footer">
            <el-button @click="emit('cancel')">取消</el-button>
            <el-button class="submit-btn" type="primary" :loading="loading" :disabled="!canSubmit" @click="submit">送出申請</el-button>
        </div>
    </div>
</template>

<style scoped>
.punch-correction-form {
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
