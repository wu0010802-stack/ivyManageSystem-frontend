<template>
  <el-dialog
    :model-value="visible"
    width="min(680px, 94vw)"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
  >
    <!-- 序號是系統資訊不是輸入項：移出表單、放標題旁 meta chip（2026-08-28 UX） -->
    <template #header>
      <div class="dlg-header">
        <span class="dlg-title">{{ mode === 'add' ? '新增訪視紀錄' : '編輯訪視紀錄' }}</span>
        <span class="seq-chip" data-test="seq-no-chip">序號 <strong>{{ seqNoDisplay }}</strong></span>
      </div>
    </template>
    <el-form :model="form" :rules="formRules" ref="formRef" label-position="top">
      <p class="required-legend"><span class="req">*</span> 為必填（僅 4 欄），其餘可日後補</p>

      <!-- 基本資料（核心，常駐）：依接待動線排序——先問小孩是誰，再談哪天來（2026-08-28 UX）。
           成對短欄位雙欄，mobile 由 main.css 收回單欄 -->
      <FormSection title="基本資料" :collapsible="false">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="幼生姓名" prop="child_name">
              <el-input v-model="form.child_name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生日" prop="birthday">
              <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" placeholder="選擇生日" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="聯絡人姓名">
              <el-input v-model="form.contact_name" placeholder="家長或主要照顧者" data-test="contact-name-input" />
              <div class="form-hint">轉為學生時用來建立監護人；留空會退回「介紹者」。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="電話">
              <el-input v-model="form.phone" />
              <div class="form-hint form-hint--example">例：0912-345-678</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="參觀日期" prop="month">
              <el-date-picker
                v-model="form.month_raw"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="選擇參觀日期（年月日）"
                style="width:100%"
              />
              <div v-if="form.visit_date" class="form-hint">
                民國：{{ form.visit_date }}（月份：{{ form.month }}）
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否搭乘娃娃車">
              <el-switch v-model="form.rides_bus" active-text="要搭乘" inactive-text="不搭乘" data-test="rides-bus-switch" />
              <div class="form-hint">參觀當下的意願；實際路線與站點仍在「娃娃車路線」頁編排。</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="14">
            <el-form-item label="入學學期" required>
              <div class="enroll-term">
                <el-select v-model="form.target_school_year" style="width:130px">
                  <el-option v-for="y in enrollYearOptions" :key="y" :value="y" :label="`${y} 學年`" />
                </el-select>
                <el-radio-group v-model="form.target_semester">
                  <el-radio-button :value="1">上學期</el-radio-button>
                  <el-radio-button :value="2">下學期</el-radio-button>
                </el-radio-group>
              </div>
              <div class="form-hint">小孩預計入學的學期（預設當前學期，可改）。</div>
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="適讀班級">
              <el-select v-model="form.grade" clearable style="width:100%" @change="onGradeManualChange">
                <el-option v-for="g in GRADES_ORDER" :key="g" :label="g" :value="g" />
              </el-select>
              <div v-if="gradeAutoFilled" class="form-hint form-hint--ok" data-test="grade-auto-hint">
                ✓ 已依生日 × {{ form.target_school_year }} 學年自動判定，可手動修改
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </FormSection>

      <!-- 聯絡與來源 -->
      <FormSection ref="contactRef" data-test="section-contact" title="聯絡與來源" collapsible :default-open="false" :badge-count="sectionErrors.contact" badge-type="error" :summary="contactSummary">
        <el-form-item label="地址">
          <el-input v-model="form.address" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="來源分類">
              <el-select v-model="form.source_category" clearable placeholder="選擇來源（決定獎金點數）" style="width:100%">
                <el-option
                  v-for="c in sourceCategories"
                  :key="c.code"
                  :value="c.code"
                  :label="`${c.label}（${c.points}）`"
                />
              </el-select>
              <div class="form-hint">對應招生獎勵辦法點數表；舊資料未歸類時獎金頁會提示補填。</div>
              <div v-if="splitHint" class="form-hint form-hint--warning">{{ splitHint }}</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="帶參觀老師">
              <el-select v-model="form.tour_guide_employee_id" filterable clearable placeholder="自報生／邀約類獎金歸此人" style="width:100%">
                <el-option
                  v-for="t in teacherOptions"
                  :key="t.id"
                  :value="t.id"
                  :label="t.employee_id ? `${t.name}（${t.employee_id}）` : t.name"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="來源備註">
              <el-autocomplete v-model="form.source" :fetch-suggestions="sourceQuery" clearable style="width:100%" />
              <div class="form-hint">原自由文字來源欄，保留舊資料原文。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="介紹者">
              <el-autocomplete v-model="form.referrer" :fetch-suggestions="referrerQuery" clearable style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </FormSection>

      <!-- 預繳狀態 -->
      <FormSection ref="depositRef" data-test="section-deposit" title="預繳狀態" collapsible :default-open="false" :badge-count="sectionErrors.deposit" badge-type="error" :summary="depositSummary">
        <!-- 狀態欄一律走漏斗狀態機（2026-09-06）：表單直改會繞過事件紀錄、不建學生，
             造成看板與統計對同一筆資料說法相反。編輯模式改唯讀並指路。 -->
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="是否預繳">
              <el-switch
                v-model="form.has_deposit"
                active-text="已預繳"
                inactive-text="未預繳"
                :disabled="stateLocked"
                data-test="has-deposit-switch"
                @change="onDepositChange"
              />
              <div v-if="stateLocked" class="form-hint" data-test="deposit-locked-hint">
                預繳狀態請在「漏斗看板」拖曳卡片變更，才會留下紀錄與原因。
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收預繳人員">
              <el-input v-model="form.deposit_collector" :disabled="!form.has_deposit" placeholder="預繳時填寫" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="已註冊">
              <el-switch v-model="form.enrolled" active-text="是" inactive-text="否" disabled data-test="enrolled-switch" />
              <div class="form-hint" data-test="enrolled-locked-hint">
                註冊要建立學生檔案，只能在漏斗看板把卡片推進到「已註冊」。
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="轉其他學期">
              <el-switch v-model="form.transfer_term" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="depositMismatchText" label="收款對帳">
          <el-alert
            :title="depositMismatchText"
            type="warning"
            :closable="false"
            show-icon
            data-test="deposit-mismatch-alert"
          />
        </el-form-item>
        <template v-if="!form.has_deposit">
          <el-form-item label="未預繳原因">
            <el-select v-model="form.no_deposit_reason" clearable placeholder="請選擇原因" style="width:100%">
              <el-option v-for="r in noDepositReasons" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="原因說明">
            <el-input v-model="form.no_deposit_reason_detail" type="textarea" :rows="2" placeholder="詳細說明（選填）" />
          </el-form-item>
        </template>
      </FormSection>

      <!-- 備註 -->
      <FormSection ref="notesRef" data-test="section-notes" title="備註" collapsible :default-open="false" :badge-count="sectionErrors.notes" badge-type="error" :summary="notesSummary">
        <el-form-item label="備註">
          <el-input v-model="form.notes" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="電訪回應">
          <el-input v-model="form.parent_response" type="textarea" :rows="2" />
        </el-form-item>
      </FormSection>

      <!-- 地址分析同意（常駐，不收合：法律同意不該藏；2026-08-28 UX：大提示框收斂成單行動態 hint） -->
      <FormSection title="地址分析同意" :collapsible="false">
        <el-form-item label="家長同意">
          <el-checkbox v-model="form.geocoding_consent">家長已口頭同意以本住址進行招生區位分析（送至 Google Maps）&mdash; <strong>需明確確認</strong></el-checkbox>
          <div v-if="form.geocoding_consent" class="form-hint form-hint--ok" data-test="consent-hint-ok">
            ✓ 已確認家長口頭同意；本筆將納入招生熱點區位分析。
          </div>
          <div v-else class="form-hint" data-test="consent-hint-off">
            未勾選：本筆不會進入招生熱點區位分析（可日後補勾）。招生人員確認家長口頭同意後再勾選。
          </div>
        </el-form-item>
      </FormSection>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        v-if="mode === 'add'"
        :loading="saving"
        data-test="save-next-btn"
        @click="handleSave('save-next')"
      >儲存並新增下一筆</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave('save')">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive, nextTick, computed } from 'vue'
import type { FormInstance } from 'element-plus'
import { GRADES_ORDER, gradeForBirthday } from '@/constants/recruitment'
import { toRocYear, currentRocYear } from '@/utils/academic'
import FormSection from '@/components/common/FormSection.vue'
import { sectionForRecruitmentField } from '@/constants/recruitmentFormSections'

interface VisitForm {
  month_raw?: string | number | null
  visit_date?: string | number | null
  month?: string | number | null
  seq_no?: string | number | null
  child_name?: string | number | null
  grade?: string | number | null
  birthday?: string | number | null
  phone?: string | number | null
  contact_name?: string | number | null
  address?: string | number | null
  source?: string | number | undefined
  referrer?: string | number | undefined
  has_deposit?: string | number | boolean
  rides_bus?: boolean
  deposit_collector?: string | number | null
  enrolled?: string | number | boolean
  transfer_term?: string | number | boolean
  no_deposit_reason?: string | number | null
  no_deposit_reason_detail?: string | number | null
  notes?: string | number | null
  parent_response?: string | number | null
  geocoding_consent?: boolean
  target_school_year?: number
  target_semester?: number
  source_category?: string | null
  tour_guide_employee_id?: number | null
  /** 後端對帳結果（唯讀，僅編輯既有訪視時有值） */
  deposit_mismatch?: string | null
  prepayment_state?: string | null
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  visible: boolean
  mode?: string
  form: VisitForm
  saving?: boolean
  sourceSuggestions?: string[]
  referrerSuggestions?: string[]
  noDepositReasons?: string[]
  sourceCategories?: { code: string; label: string; points: number }[]
  teacherOptions?: { id: number; name: string; employee_id?: string | null; position?: string | null }[]
}>(), {
  mode: 'add',
  saving: false,
  sourceSuggestions: () => [],
  referrerSuggestions: () => [],
  noDepositReasons: () => [],
  sourceCategories: () => [],
  teacherOptions: () => [],
})

/**
 * 狀態欄鎖定（2026-09-06）：既有訪視的預繳／註冊狀態一律走漏斗 transition，
 * 表單直改會繞過事件紀錄且不會建立學生。新增時仍可標記當場收到的預繳。
 */
const stateLocked = computed(() => props.mode !== 'add')

const DEPOSIT_MISMATCH_TEXT: Record<string, string> = {
  flag_without_credit: '這筆標記為已預繳，但學費管理查不到對應的預繳金。請確認收款是否漏登。',
  credit_without_flag: '學費管理有這筆的預繳金，但招生狀態還停在未預繳。請到漏斗看板把卡片推進到「已預繳」。',
}
const depositMismatchText = computed(() => {
  const key = typeof props.form.deposit_mismatch === 'string' ? props.form.deposit_mismatch : ''
  return DEPOSIT_MISMATCH_TEXT[key] ?? ''
})

// 拆分提示（spec §6）：兄姊均分／邀約拆分是一生兩師，第二列要在獎金頁手動加
const splitHint = computed(() => {
  const code = props.form.source_category
  if (code === 'sibling_split') return '兄姊二人均分：另一位老師的 0.5 點列，請於招生獎金頁「新增歸屬列」補建。'
  if (code === 'invite_success' || code === 'invite_origin') return '邀約拆分（0.6／0.4）：另一位老師的列請於招生獎金頁「新增歸屬列」補建。'
  return ''
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': []
  'save-next': []
}>()

const formRef = ref<FormInstance | null>(null)

// 收合區段 refs + 錯誤徽章 + 送出失敗自動展開含錯區段
type RecruitmentCollapsibleSection = 'contact' | 'deposit' | 'notes'
const contactRef = ref<{ expand: () => void } | null>(null)
const depositRef = ref<{ expand: () => void } | null>(null)
const notesRef = ref<{ expand: () => void } | null>(null)
const sectionRefs: Record<RecruitmentCollapsibleSection, typeof contactRef> = {
  contact: contactRef, deposit: depositRef, notes: notesRef,
}
const sectionErrors = reactive<Record<RecruitmentCollapsibleSection, number>>({ contact: 0, deposit: 0, notes: 0 })
function applyValidationErrors(invalidProps: string[]) {
  ;(Object.keys(sectionErrors) as RecruitmentCollapsibleSection[]).forEach(k => { sectionErrors[k] = 0 })
  for (const prop of invalidProps) {
    const sec = sectionForRecruitmentField(prop)
    if (sec === 'contact' || sec === 'deposit' || sec === 'notes') {
      sectionErrors[sec] += 1
      sectionRefs[sec].value?.expand()
    }
  }
}

const enrollYearOptions = computed(() => {
  const y = currentRocYear()
  return [y + 3, y + 2, y + 1, y, y - 1]
})

const formRules = {
  month: [{ required: true, message: '請選擇參觀日期', trigger: 'blur' }],
  child_name: [{ required: true, message: '請填寫姓名', trigger: 'blur' }],
  // 生日在招生階段就決定適讀班級與入學學期，補填成本高於當場問一句，故列必填。
  birthday: [{ required: true, message: '請選擇生日', trigger: 'change' }],
}

// 序號改由後端依當月順序自動產生（POST /recruitment/records 不帶 seq_no 即自動編號），
// 標題旁 chip 唯讀呈現：新增時尚未有號、編輯時顯示既有號。
const seqNoDisplay = computed(() => {
  const raw = props.form.seq_no
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return props.mode === 'add' ? '自動產生' : '—'
  }
  return String(raw)
})

// ── 適讀班級依生日自動判定（可手動覆寫）─────────────────────
// 只在「班級為空」或「上一次就是自動帶入」時寫入，不覆蓋使用者手選值；
// 換一筆資料（form 物件替換）即重置狀態。
const gradeAutoFilled = ref(false)
watch(() => props.form, () => { gradeAutoFilled.value = false })
watch(
  () => [props.form.birthday, props.form.target_school_year] as const,
  ([birthday, year]) => {
    if (typeof birthday !== 'string' || !birthday || typeof year !== 'number') return
    const suggested = gradeForBirthday(birthday, year)
    if (!suggested) return
    if (!props.form.grade || gradeAutoFilled.value) {
      props.form.grade = suggested
      gradeAutoFilled.value = true
    }
  },
)
function onGradeManualChange() {
  gradeAutoFilled.value = false
}

// ── 收合區摘要（badge 錯誤優先，FormSection 內建讓位）────────
const isFilled = (v: unknown): boolean =>
  typeof v === 'boolean' ? v : v !== null && v !== undefined && String(v).trim() !== ''
const summaryText = (vals: unknown[]): string => {
  const n = vals.filter(isFilled).length
  return n > 0 ? `已填 ${n} 項` : '未填'
}
const contactSummary = computed(() => summaryText([
  props.form.address, props.form.source_category, props.form.tour_guide_employee_id,
  props.form.source, props.form.referrer,
]))
const depositSummary = computed(() => summaryText([
  props.form.has_deposit, props.form.deposit_collector, props.form.enrolled,
  props.form.transfer_term, props.form.no_deposit_reason, props.form.no_deposit_reason_detail,
]))
const notesSummary = computed(() => summaryText([props.form.notes, props.form.parent_response]))

// -------- 日期轉換（西元 ↔ 民國）--------
const isoToRoc = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${toRocYear(parseInt(y))}.${m}.${d}`
}
const isoToRocMonth = (iso: string) => {
  if (!iso) return ''
  const [y, m] = iso.split('-')
  return `${toRocYear(parseInt(y))}.${m}`
}

// 監聽 month_raw（YYYY-MM-DD）→ 同步 visit_date 與 month（民國格式）
watch(
  () => props.form.month_raw,
  (iso) => {
    const isoStr = iso as string | null | undefined
    if (isoStr) {
      props.form.visit_date = isoToRoc(isoStr)
      props.form.month = isoToRocMonth(isoStr.substring(0, 7))
    } else {
      props.form.visit_date = ''
      props.form.month = ''
    }
  },
)

// -------- autocomplete 建議列表 --------
const _makeSuggestions = (list: string[], query: string, cb: (items: { value: string }[]) => void) => {
  const q = (query || '').trim().toLowerCase()
  const items = list
    .filter((v) => !q || v.toLowerCase().includes(q))
    .map((v) => ({ value: v }))
  cb(items)
}

const sourceQuery = (query: string, cb: (items: { value: string }[]) => void) =>
  _makeSuggestions(props.sourceSuggestions, query, cb)
const referrerQuery = (query: string, cb: (items: { value: string }[]) => void) =>
  _makeSuggestions(props.referrerSuggestions, query, cb)

const onDepositChange = (val: unknown) => {
  if (val) {
    props.form.no_deposit_reason = null
    props.form.no_deposit_reason_detail = ''
  } else {
    props.form.deposit_collector = ''
  }
}

const handleSave = async (kind: 'save' | 'save-next' = 'save') => {
  const formEl = formRef.value
  if (!formEl) return
  formEl.validate(async (valid, invalidFields) => {
    if (!valid) {
      const invalidProps = Object.keys(invalidFields ?? {})
      applyValidationErrors(invalidProps)
      await nextTick()
      if (invalidProps[0]) formEl.scrollToField(invalidProps[0])
      return
    }
    if (kind === 'save-next') emit('save-next')
    else emit('save')
  })
}

defineExpose({ formRef, applyValidationErrors })
</script>

<style scoped>
.required-legend { font-size: var(--text-xs); color: var(--el-text-color-secondary); margin: 0 0 var(--space-3); }
.form-hint--warning { color: var(--el-color-warning); }
.form-hint--ok { color: var(--el-color-success); }
.required-legend .req { color: var(--el-color-danger); }
.enroll-term { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
.dlg-header { display: flex; align-items: center; gap: var(--space-3); }
.dlg-title { font-size: var(--text-lg); font-weight: 600; color: var(--el-text-color-primary); }
.seq-chip {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px;
  border-radius: var(--radius-full); font-size: var(--text-xs); white-space: nowrap;
  color: var(--el-text-color-secondary); background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
</style>
