<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, Loading, Upload } from '@element-plus/icons-vue'
import {
  createMyLeave,
  uploadMyLeaveAttachments,
  getMyQuotas,
  getMyWorkdayHours,
} from '@/api/portal'
import { getMyLeaveQuotaExpiry } from '@/api/portalLeaveQuotaExpiry'
import {
  LEAVE_TYPES as leaveTypes,
  LEAVE_RULE_HINTS,
  getRequestedCalendarDays,
  leaveRequiresAttachment,
  validateLeaveRules,
} from '@/utils/leaves'
import { apiError } from '@/utils/error'
import { useLeaveHoursCalculator } from '@/composables/useLeaveHoursCalculator'
import FormSection from '@/components/common/FormSection.vue'

withDefaults(defineProps<{
  allEmployees?: Record<string, unknown>[]
}>(), {
  allEmployees: () => [],
})

const emit = defineEmits<{
  'cancel': []
  'submitted': []
}>()

const form = reactive({
  leave_type: '',
  start_date: '',
  end_date: '',
  leave_hours: 8,
  reason: '',
  substitute_employee_id: null,
  is_hospitalized: false,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formRef = ref<any>(null)
const submitLoading = ref(false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fileList = ref<any[]>([])
const uploadRef = ref(null)

const _QUOTA_TYPES_LOCAL = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])

const {
  calcHint, calcBreakdown, calcLoading,
  leaveMode, leaveSingleDate,
  quotaInfo, quotaLoading, quotaExceeded,
  calcTooltipHtml, officeHoursWarning,
  resetCalculatorState,
} = useLeaveHoursCalculator({
  form,
  formRef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchWorkdayHoursFn: ((start: string, end: string) => getMyWorkdayHours({ start_date: start, end_date: end })) as any,
   
  fetchQuotaFn: (async (leaveType: string, year?: number) => {
    if (!leaveType || !_QUOTA_TYPES_LOCAL.has(leaveType)) return null
    const res = await getMyQuotas(year ? { year } : undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.data.find((q: any) => q.leave_type === leaveType) || null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any,
})

const disabledEndDate = (time: Date) => {
  if (!form.start_date) return false
  const s = new Date(form.start_date)
  s.setHours(0, 0, 0, 0)
  return time.getTime() < s.getTime()
}

const afterApplyRemaining = computed(() => {
  if (!quotaInfo.value || !form.leave_hours) return null
  return Math.round((quotaInfo.value.remaining_hours - form.leave_hours) * 10) / 10
})

const requestedCalendarDays = computed(() =>
  getRequestedCalendarDays(form.start_date, form.end_date)
)
const attachmentRequired = computed(() =>
  leaveRequiresAttachment(form.start_date, form.end_date)
)
const selectedLeaveRule = computed(() => (LEAVE_RULE_HINTS as Record<string, string>)[form.leave_type] || '')
const attachmentHint = computed(() => {
  if (!form.start_date || !form.end_date) return '請假超過 2 天時需檢附證明附件'
  return attachmentRequired.value
    ? `本次請假共 ${requestedCalendarDays.value} 天，需檢附證明附件`
    : '僅請假超過 2 天時需檢附證明附件'
})

const canSubmit = computed(() => !quotaExceeded.value)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const quotaInfoAny = computed(() => quotaInfo.value as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const breakdownAny = computed(() => calcBreakdown.value as any[])

// ── 補休到期 warning ──
interface CompExpiryInfo {
  compensatory_balance: number
  earliest_expiring_grant: { expires_at: string; unexpired_hours: number } | null
}
const compExpiryInfo = ref<CompExpiryInfo | null>(null)

const loadCompExpiry = async () => {
  try {
    const res = await getMyLeaveQuotaExpiry()
    compExpiryInfo.value = res.data as CompExpiryInfo
  } catch {
    compExpiryInfo.value = null
  }
}

watch(() => form.leave_type, (newType) => {
  if (newType === 'compensatory' && !compExpiryInfo.value) {
    loadCompExpiry()
  }
})

const rules = {
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  start_date: [{ required: true, message: '請選擇開始時間', trigger: 'change' }],
  end_date: [{ required: true, message: '請選擇結束時間', trigger: 'change' }],
  leave_hours: [
    { required: true, message: '請輸入時數', trigger: 'blur' },
    {
       
      validator: (_rule: unknown, value: number, callback: (err?: Error) => void) => {
        if (value < 0.5) callback(new Error('請假時數至少 0.5 小時'))
        else if (Math.round(value * 2) !== value * 2) callback(new Error('請假時數必須為 0.5 小時的倍數'))
        else callback()
      },
      trigger: 'change',
    },
  ],
}

const resetForm = () => {
  form.leave_type = ''
  form.start_date = ''
  form.end_date = ''
  form.leave_hours = 8
  form.reason = ''
  form.substitute_employee_id = null
  form.is_hospitalized = false
  fileList.value = []
  resetCalculatorState()
}

onMounted(resetForm)

const handleExceed = () => {
  ElMessage.warning(`最多上傳 5 個附件`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleAttachChange = (file: any, newFileList: any[]) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'application/pdf']
  const maxSize = 5 * 1024 * 1024
  if (!allowed.includes(file.raw?.type) && !file.name.match(/\.(heic|heif)$/i)) {
    ElMessage.error(`${file.name}：僅支援 JPG、PNG、GIF、HEIC、PDF 格式`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileList.value = newFileList.filter((f: any) => f.uid !== file.uid)
    return
  }
  if ((file.raw?.size ?? 0) > maxSize) {
    ElMessage.error(`${file.name} 超過 5 MB 限制`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileList.value = newFileList.filter((f: any) => f.uid !== file.uid)
  }
}

const submitLeave = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  if (attachmentRequired.value && fileList.value.length === 0) {
    ElMessage.error('請假超過 2 天時須上傳證明附件，請先選擇檔案')
    return
  }

  const violations = validateLeaveRules({
    leave_type: form.leave_type,
    leave_hours: form.leave_hours,
    start_date: form.start_date,
  })
  if (violations.length > 0) {
    ElMessage.error(violations[0])
    return
  }

  if (quotaExceeded.value) {
    ElMessage.error('剩餘配額不足，無法送出')
    return
  }

  submitLoading.value = true
  try {
    const sd = form.start_date ? form.start_date.substring(0, 10) : ''
    const st = form.start_date && form.start_date.length > 10 ? form.start_date.substring(11, 16) : ''
    const ed = form.end_date ? form.end_date.substring(0, 10) : ''
    const et = form.end_date && form.end_date.length > 10 ? form.end_date.substring(11, 16) : ''

    const res = await createMyLeave({
      leave_type: form.leave_type,
      start_date: sd,
      // 「整天」模式的 picker 是 YYYY-MM-DD（長度 10），上面的 length > 10 判斷因此
      // 恆為 false、st/et 為空字串。後端 validate_hhmm_format 只放行 null，空字串會
      // raise ValueError → 422，整天請假永遠送不出去。與管理端 LeaveView.vue 一致補 || null。
      start_time: st || null,
      end_date: ed,
      end_time: et || null,
      leave_hours: form.leave_hours,
      reason: form.reason,
      substitute_employee_id: form.substitute_employee_id || null,
      is_hospitalized: form.leave_type === 'sick' ? form.is_hospitalized : false,
    })
    const leaveId = res.data.id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawFiles: File[] = fileList.value.map((f: any) => f.raw).filter((f: any): f is File => !!f)
    if (rawFiles.length > 0) {
      const formData = new FormData()
      rawFiles.forEach(f => formData.append('files', f))
      await uploadMyLeaveAttachments(leaveId, formData)
    }

    ElMessage.success('請假申請已送出，待主管核准')
    emit('submitted')
  } catch (error) {
    ElMessage.error(apiError(error, '提交失敗'))
  } finally {
    submitLoading.value = false
  }
}
</script>

<template>
  <div class="portal-leave-form">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="假別" prop="leave_type">
        <el-select v-model="form.leave_type" placeholder="請選擇" style="width: 100%;">
          <el-option v-for="lt in leaveTypes" :key="lt.value" :label="lt.label" :value="lt.value">
            <span>{{ lt.label }}</span>
          </el-option>
        </el-select>
        <div style="margin-top: 5px; font-size: 12px; min-height: 20px;">
          <span v-if="quotaLoading" style="color: var(--el-color-info);">
            <el-icon class="is-loading" style="vertical-align:middle;"><Loading /></el-icon> 查詢配額…
          </span>
          <template v-else-if="quotaInfoAny">
            <el-tag size="small" :type="quotaInfoAny.remaining_hours <= 0 ? 'danger' : quotaInfoAny.remaining_hours < 16 ? 'warning' : 'success'" style="margin-right:6px;">
              剩餘 {{ quotaInfoAny.remaining_hours }}h
            </el-tag>
            <span style="color:var(--el-text-color-secondary);">
              已用 {{ quotaInfoAny.used_hours }}h
              <template v-if="quotaInfoAny.pending_hours > 0">／待審 {{ quotaInfoAny.pending_hours }}h</template>
              ／總計 {{ quotaInfoAny.total_hours }}h
            </span>
            <div v-if="afterApplyRemaining !== null" style="margin-top: 5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="color: var(--el-text-color-secondary);">本次申請 {{ form.leave_hours }}h 後剩餘：</span>
              <el-tag
                size="small"
                :type="afterApplyRemaining >= 16 ? 'success' : afterApplyRemaining > 0 ? 'warning' : 'danger'"
                effect="dark"
              >{{ afterApplyRemaining }}h</el-tag>
              <span v-if="afterApplyRemaining <= 0" style="color: var(--el-color-danger); font-weight: 600;">超出 {{ Math.abs(afterApplyRemaining) }}h</span>
            </div>
          </template>
        </div>
        <div v-if="selectedLeaveRule" style="margin-top: 5px; font-size: 12px; color: var(--el-color-primary); display: flex; align-items: center; gap: 4px;">
          <el-icon><InfoFilled /></el-icon>{{ selectedLeaveRule }}
        </div>
        <div style="margin-top: 5px; font-size: 12px; color: var(--el-color-warning); display: flex; align-items: center; gap: 4px;">
          <el-icon><InfoFilled /></el-icon>{{ attachmentHint }}
        </div>
      </el-form-item>

      <!-- 補休到期提醒：選補休後顯示最早到期 grant 資訊 -->
      <el-alert
        v-if="form.leave_type === 'compensatory' && compExpiryInfo"
        type="warning"
        :closable="false"
        show-icon
        class="comp-expiry-warning"
      >
        <template #title>
          <span>
            補休結餘 {{ compExpiryInfo.compensatory_balance.toFixed(1) }} h
            <template v-if="compExpiryInfo.earliest_expiring_grant">
              ｜將從最早到期 grant 扣（{{ compExpiryInfo.earliest_expiring_grant.expires_at }} 到期，{{ compExpiryInfo.earliest_expiring_grant.unexpired_hours.toFixed(1) }} h）
            </template>
          </span>
        </template>
      </el-alert>

      <el-form-item v-if="form.leave_type === 'sick'" label="住院病假">
        <el-switch v-model="form.is_hospitalized" active-text="住院" inactive-text="未住院" />
        <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
          未住院年度上限 240h；住院最高 2080h（勞工請假規則第 4 條）
        </div>
      </el-form-item>

      <el-form-item label="請假模式">
        <el-radio-group v-model="leaveMode" size="small">
          <el-radio-button value="full">整天</el-radio-button>
          <el-radio-button value="morning">上午</el-radio-button>
          <el-radio-button value="afternoon">下午</el-radio-button>
          <el-radio-button value="custom">自訂時段</el-radio-button>
        </el-radio-group>
        <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
          <template v-if="leaveMode === 'full'">整天或多日請假，只需選日期</template>
          <template v-else-if="leaveMode === 'morning'">僅限單日，自動帶入上班至12:00</template>
          <template v-else-if="leaveMode === 'afternoon'">僅限單日，自動帶入13:00至下班</template>
          <template v-else>自行填入起訖日期時間</template>
        </div>
      </el-form-item>

      <template v-if="leaveMode === 'full'">
        <el-form-item label="開始日期" prop="start_date">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇開始日期" />
        </el-form-item>
        <el-form-item label="結束日期" prop="end_date">
          <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇結束日期" :disabled-date="disabledEndDate" />
        </el-form-item>
      </template>

      <template v-else-if="leaveMode === 'morning' || leaveMode === 'afternoon'">
        <el-form-item label="請假日期" prop="start_date">
          <el-date-picker v-model="leaveSingleDate" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇請假日期" />
          <div v-if="form.start_date && form.end_date" style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
            時段：{{ form.start_date.substring(11, 16) }} – {{ form.end_date.substring(11, 16) }}
            <el-icon v-if="calcLoading" class="is-loading" style="vertical-align: middle; margin-left: 6px;"><Loading /></el-icon>
          </div>
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="開始時間" prop="start_date">
          <el-date-picker v-model="form.start_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" placeholder="例如: 2026-02-23 08:30" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="結束時間" prop="end_date">
          <el-date-picker v-model="form.end_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" placeholder="例如: 2026-02-23 17:30" style="width: 100%;" :disabled-date="disabledEndDate" />
        </el-form-item>
      </template>

      <el-form-item label="請假時數" prop="leave_hours">
        <div style="display: flex; align-items: center; gap: 8px;">
          <el-input-number v-model="form.leave_hours" :min="0.5" :max="240" :step="0.5" disabled />
          <el-tooltip v-if="calcTooltipHtml" placement="right" :content="calcTooltipHtml" raw-content>
            <el-icon style="cursor: help; color: var(--el-color-info); font-size: 16px;"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div style="margin-top:5px;font-size:12px;">
          <span v-if="calcLoading && leaveMode !== 'morning' && leaveMode !== 'afternoon'" style="color:var(--el-color-info);">
            <el-icon class="is-loading" style="vertical-align:middle;"><Loading /></el-icon> 查詢排班中…
          </span>
          <span v-else-if="calcHint" style="color:var(--el-color-info);">{{ calcHint }}</span>
        </div>
        <el-alert
          v-if="officeHoursWarning"
          type="warning"
          :title="officeHoursWarning"
          show-icon :closable="false"
          style="margin-top: 6px;"
        />
        <el-alert
          v-if="quotaExceeded"
          type="error"
          :title="`配額不足，無法送出：申請 ${form.leave_hours}h，超出可用額度 ${Math.round((form.leave_hours - (quotaInfoAny?.remaining_hours ?? 0)) * 10) / 10}h`"
          show-icon :closable="false"
          style="margin-top: 6px;"
        />
      </el-form-item>

      <el-form-item v-if="!calcLoading && breakdownAny.length && breakdownAny.length <= 14" label="每日明細">
        <div class="portal-breakdown">
          <div v-for="day in breakdownAny" :key="day.date" class="pb-row" :class="day.type">
            <span class="pb-date">{{ day.date }}</span>
            <el-tag size="small" :type="day.type==='workday' ? 'info' : day.type==='holiday' ? 'danger' : 'info'" class="pb-tag">
              {{ day.type==='workday' ? (day.shift||'預設班')+(day.work_start?` ${day.work_start}–${day.work_end}`:'') : day.type==='holiday' ? day.holiday_name : '週末' }}
            </el-tag>
            <span class="pb-hours">{{ day.type==='workday' ? `${day.hours}h` : '—' }}</span>
          </div>
        </div>
      </el-form-item>

      <FormSection title="進階（選填）" collapsible :default-open="false">
        <el-form-item label="職務代理人">
          <el-select
            v-model="form.substitute_employee_id"
            filterable clearable
            placeholder="請選擇代理人（選填）"
            style="width: 100%;"
          >
            <el-option v-for="emp in allEmployees" :key="(emp.id as number | string)" :label="(emp.name as string)" :value="(emp.id as number | string)" />
          </el-select>
          <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
            選填：指定代理人後，需代理人接受後主管才能核准假單
          </div>
        </el-form-item>
      </FormSection>

      <el-form-item label="原因" prop="reason">
        <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請輸入請假原因" />
      </el-form-item>

      <el-form-item label="證明附件" :required="attachmentRequired">
        <div class="upload-wrapper">
          <el-upload
            ref="uploadRef"
            v-model:file-list="fileList"
            :auto-upload="false"
            :limit="5"
            accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.pdf"
            multiple list-type="text"
            :on-change="handleAttachChange"
            :on-exceed="handleExceed"
          >
            <el-button size="small" plain>
              <el-icon><Upload /></el-icon>&nbsp;選擇檔案
            </el-button>
          </el-upload>
          <div class="upload-tip">
            請假超過 2 天時必填；其餘情況可選。支援圖片或 PDF，最多 5 個，單檔 5 MB
          </div>
        </div>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="submitLoading" :disabled="!canSubmit" @click="submitLeave">送出申請</el-button>
    </div>
  </div>
</template>

<style scoped>
.portal-leave-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.comp-expiry-warning {
  margin-bottom: var(--space-2);
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}

.upload-wrapper {
  width: 100%;
}

.upload-tip {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.4;
}

.portal-breakdown {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 6px;
  background: var(--el-fill-color-extra-light);
}
.pb-row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; font-size: 12px; }
.pb-row.weekend, .pb-row.holiday { opacity: 0.55; }
.pb-date { min-width: 82px; font-variant-numeric: tabular-nums; }
.pb-tag { flex: 1; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-hours { min-width: 32px; text-align: right; font-weight: 600; color: var(--el-color-primary); }
.pb-row.weekend .pb-hours, .pb-row.holiday .pb-hours { color: var(--el-text-color-secondary); font-weight: 400; }
</style>
