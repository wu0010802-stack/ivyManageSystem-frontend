<!-- src/components/calendar/CalendarEventFormDialog.vue
     行事曆事件新增／編輯對話框（原本塞在 CalendarView 裡的 17 欄大表單）。
     依任務分四組：基本資訊／時間／公開對象 常駐，少用的「進階設定」（工作分類、學年學期週次、負責人）
     預設收合；編輯時若進階欄位已有值（例如分校行事曆匯入的事件）自動展開，避免使用者不知道有資料。
     只管表單與驗證：呼叫 API、發布確認、成功後關閉都在使用端（CalendarView）。 -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
import FormSection from '@/components/common/FormSection.vue'
import RecurrenceEditor from './RecurrenceEditor.vue'
import { useFormDirty } from '@/composables/useFormDirty'
import { required } from '@/validators/rules'
import { EVENT_TYPES } from '@/constants/calendarEventTypes'
import {
  EVENT_CATEGORY_OPTIONS,
  EVENT_SEMESTER_OPTIONS,
  EVENT_VISIBILITY_OPTIONS,
} from '@/constants/eventVisibility'
import {
  buildEventPayload,
  countAdvancedFilled,
  createEmptyEventForm,
  eventFormProblem,
  type CalendarEventFormValues,
  type CalendarEventPayload,
  type EmployeeOption,
} from './eventForm'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  /** 開啟時載入的表單值（新增＝預設值＋點選的日期；編輯＝單筆完整資料） */
  initial: CalendarEventFormValues
  saving?: boolean
  employees?: EmployeeOption[]
  /** 編輯時事件已存的負責人姓名：員工名單沒載到時，下拉仍顯示姓名而不是員工代碼 */
  ownerName?: string | null
  /** 員工名單載入失敗：提示無法重新指定負責人，而不是讓下拉靜默變空 */
  employeesError?: boolean
}>(), {
  saving: false,
  employees: () => [],
  ownerName: null,
  employeesError: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: CalendarEventPayload]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<CalendarEventFormValues>(createEmptyEventForm())
const { isDirty, snapshot } = useFormDirty(form)
const formRef = ref<FormInstance>()
const dialogRef = ref<InstanceType<typeof FormDialog>>()

function load() {
  Object.assign(form, createEmptyEventForm(), {
    ...props.initial,
    recurrence_rule: props.initial.recurrence_rule ? { ...props.initial.recurrence_rule } : null,
  })
  snapshot()
}
// 每次開啟重新載入（FormDialog destroy-on-close，內容每次重建；props.initial 此時已是新值）
watch(() => props.modelValue, (open) => { if (open) load() }, { immediate: true })

const eventTypeOptions = EVENT_TYPES.filter(
  (eventType) => !['holiday', 'makeup_workday'].includes(eventType.value),
)

const ownerOptions = computed(() => {
  const list = props.employees.map((emp) => ({
    value: emp.id,
    label: emp.employee_id ? `${emp.name}（${emp.employee_id}）` : emp.name,
  }))
  const id = form.owner_employee_id
  if (id != null && props.ownerName && !list.some((o) => o.value === id)) {
    list.unshift({ value: id, label: props.ownerName })
  }
  return list
})

const visibilityHint = computed(
  () => EVENT_VISIBILITY_OPTIONS.find((o) => o.value === form.visibility)?.hint,
)

// 進階設定：預設展開與否只看「開啟時」的初值；收合時摘要看目前填了幾項
const advancedOpenByDefault = computed(() => countAdvancedFilled(props.initial) > 0)
const advancedFilled = computed(() => countAdvancedFilled(form))
const advancedSummary = computed(() =>
  advancedFilled.value > 0 ? `已設定 ${advancedFilled.value} 項` : '未設定',
)

const rules: FormRules = {
  title: [{ ...required('標題'), whitespace: true }],
  event_date: [required('開始日期', { kind: 'select' })],
  end_date: [{
    trigger: 'change',
    validator: (_rule: unknown, value: unknown, cb: (error?: Error) => void) => {
      if (value && form.event_date && String(value) < form.event_date) {
        cb(new Error('結束日期不可早於開始日期'))
      } else {
        cb()
      }
    },
  }],
}

async function onSubmit() {
  // 必填與日期先後走 EP rules（欄位標紅＋捲到第一個錯誤欄）；ref 未綁定視同驗證失敗（fail-closed）
  const valid = formRef.value ? await formRef.value.validate().catch(() => false) : false
  if (!valid) {
    dialogRef.value?.scrollToFirstError()
    return
  }
  // 最後防線：不依賴 EP 的驗證結果，送出內容本身再確認一次，絕不靜默吞掉
  const problem = eventFormProblem(form)
  if (problem) {
    ElMessage.warning(problem)
    return
  }
  emit('submit', buildEventPayload(form))
}
</script>

<template>
  <FormDialog
    ref="dialogRef"
    v-model="visible"
    :title="mode === 'edit' ? '編輯事件' : '新增事件'"
    size="standardNarrow"
    :dirty="isDirty"
    :loading="saving"
    :submit-text="mode === 'edit' ? '儲存' : '新增事件'"
    required-legend="* 為必填"
    data-test="calendar-event-dialog"
    @submit="onSubmit"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <FormSection title="基本資訊" data-test="section-basic">
        <div class="form-grid">
          <el-form-item label="標題" prop="title" class="fg-8">
            <el-input v-model="form.title" placeholder="例：期末教學會議" />
          </el-form-item>
          <el-form-item label="類型" class="fg-4">
            <el-select v-model="form.event_type" style="width: 100%">
              <el-option
                v-for="item in eventTypeOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="地點" class="fg-12">
            <el-input v-model="form.location" placeholder="例：會議室A" />
          </el-form-item>
          <el-form-item label="說明" class="fg-12">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="事件說明..." />
          </el-form-item>
        </div>
      </FormSection>

      <FormSection title="時間" data-test="section-time">
        <div class="form-grid">
          <el-form-item label="開始日期" prop="event_date" class="fg-6">
            <el-date-picker
              v-model="form.event_date"
              type="date"
              placeholder="選擇日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="結束日期" prop="end_date" class="fg-6">
            <el-date-picker
              v-model="form.end_date"
              type="date"
              placeholder="多日事件才需要選"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="全天事件" class="fg-12">
            <el-switch v-model="form.is_all_day" aria-label="全天事件" />
          </el-form-item>
          <template v-if="!form.is_all_day">
            <el-form-item label="開始時間" class="fg-6" data-test="start-time-item">
              <el-time-picker
                v-model="form.start_time"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="開始時間"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="結束時間" class="fg-6" data-test="end-time-item">
              <el-time-picker
                v-model="form.end_time"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="結束時間"
                style="width: 100%"
              />
            </el-form-item>
          </template>
          <el-form-item label="重複" class="fg-12">
            <RecurrenceEditor v-model="form.recurrence_rule" />
          </el-form-item>
        </div>
      </FormSection>

      <FormSection title="公開對象" data-test="section-audience">
        <div class="form-grid">
          <el-form-item label="可見範圍" class="fg-12">
            <div class="visibility-field">
              <el-radio-group v-model="form.visibility">
                <el-radio-button
                  v-for="opt in EVENT_VISIBILITY_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-radio-button>
              </el-radio-group>
              <el-alert
                v-if="form.visibility === 'parent'"
                title="此事件將對「家長端」公開顯示，請確認內容不含內部事項（薪資、對帳、考核、負責人分工等）。"
                type="warning"
                :closable="false"
                show-icon
                class="visibility-warning"
                data-test="parent-visibility-warning"
              />
              <div v-else class="visibility-hint">{{ visibilityHint }}</div>
            </div>
          </el-form-item>
        </div>
      </FormSection>

      <FormSection
        title="進階設定"
        collapsible
        :default-open="advancedOpenByDefault"
        :summary="advancedSummary"
        data-test="section-advanced"
      >
        <div class="form-grid">
          <el-form-item label="工作分類" class="fg-6">
            <el-select v-model="form.category" style="width: 100%">
              <el-option
                v-for="opt in EVENT_CATEGORY_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="負責人" class="fg-6">
            <el-select
              v-model="form.owner_employee_id"
              clearable
              filterable
              :placeholder="employeesError ? '員工名單載入失敗' : '選擇負責員工（可空）'"
              style="width: 100%"
            >
              <el-option
                v-for="opt in ownerOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <div v-if="employeesError" class="field-hint field-hint--error" data-test="employees-error">
              員工名單載入失敗，目前只能保留原負責人；關閉後重新開啟可再試一次。
            </div>
          </el-form-item>
          <el-form-item label="學年度" class="fg-4">
            <el-input-number
              v-model="form.academic_year"
              :min="100"
              :max="200"
              :controls="false"
              placeholder="例：115"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="學期" class="fg-4">
            <el-select v-model="form.semester" clearable placeholder="選擇學期" style="width: 100%">
              <el-option
                v-for="opt in EVENT_SEMESTER_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="週次" class="fg-4">
            <el-input-number
              v-model="form.week_no"
              :min="0"
              :max="60"
              :controls="false"
              placeholder="第幾週"
              style="width: 100%"
            />
          </el-form-item>
        </div>
      </FormSection>
    </el-form>
  </FormDialog>
</template>

<style scoped>
.visibility-field {
  width: 100%;
}

.visibility-warning {
  margin-top: 8px;
}

.visibility-hint {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.field-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.field-hint--error {
  color: var(--el-color-danger);
}
</style>
