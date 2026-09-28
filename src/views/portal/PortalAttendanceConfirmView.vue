<script setup lang="ts">
/**
 * 教師端「本月出勤確認」（SPEC-026 §3.6）：逐筆對／不對、修正、月簽認（取代紙本考核表）。
 * 回覆只是證詞；班表要雙方都同意後由行政套用。遲到、早退與漏卡仍在「異常確認」處理。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'
import {
  getMyAttendanceConfirmations,
  respondAttendanceConfirmation,
  signoffAttendanceMonth,
} from '@/api/portalAttendanceConfirm'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { todayTaipeiISO } from '@/utils/format'
import {
  AMEND_LABELS,
  amendKindsFor,
  describeSuggestion,
  KIND_LABELS,
  partnerChoices,
  STATUS_LABELS,
  type AmendKind,
  type PortalConfirmationItem,
} from '@/utils/attendanceConfirm'

type ViewData = ApiResponse<'/portal/attendance-confirmations', 'get'>
type RespondBody = ApiBody<'/portal/attendance-confirmations/{item_id}/respond', 'post'>
type AmendBody = NonNullable<RespondBody['amend']>

const LEAVE_OPTIONS = [
  { value: 'personal', label: '事假' },
  { value: 'sick', label: '病假' },
  { value: 'annual', label: '特休' },
  { value: 'compensatory', label: '補休' },
]

interface AmendForm {
  open: boolean
  kind: AmendKind | ''
  partner: number | null
  leaveType: string
  correctionType: 'punch_in' | 'punch_out' | 'both'
  punchIn: string
  punchOut: string
  note: string
  submitting: boolean
  agreeing: boolean
}

const route = useRoute()
const [thisYear, thisMonth] = todayTaipeiISO().split('-').map(Number)
// 比照 PortalAnomalyView.vue 的 _queryInt：不是整數或超出合理範圍（誤帶壞掉的網址、
// 手改網址列）一律退回本月，不要把 NaN／越界值送進 API 查詢參數。
function _queryInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
const year = ref(_queryInt(route.query.year, thisYear, 2000, 2100))
const month = ref(_queryInt(route.query.month, thisMonth, 1, 12))
const data = ref<ViewData | null>(null)
const loading = ref(false)
const signing = ref(false)
const forms = reactive<Record<number, AmendForm>>({})

const items = computed(() => data.value?.items ?? [])
const pending = computed(() => data.value?.pending_count ?? 0)
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const yearOptions = [thisYear - 1, thisYear]

function viewerId(item: PortalConfirmationItem): number | null {
  return item.my_role === 'employee' ? item.employee_id : item.partner_employee_id
}

function formOf(item: PortalConfirmationItem): AmendForm {
  const id = item.id ?? 0
  if (!forms[id]) {
    forms[id] = { open: false, kind: '', partner: null, leaveType: 'personal', correctionType: 'both',
      punchIn: '', punchOut: '', note: '', submitting: false, agreeing: false }
  }
  return forms[id]
}

// 模板內不可寫 TS 型別斷言（本專案模板編譯不支援 `as`），選項清單一律由這裡給
function choicesFor(item: PortalConfirmationItem) {
  const kind = formOf(item).kind
  return kind === 'swap_with' || kind === 'cover_for' ? partnerChoices(item, kind) : []
}

/** 沒有可選對象時，對調／代班選項停用（後端也要求兩人打卡互相吻合）。 */
function kindDisabled(item: PortalConfirmationItem, kind: AmendKind): boolean {
  return (kind === 'swap_with' || kind === 'cover_for') && partnerChoices(item, kind).length === 0
}

// 切年／月很快時，較慢回來的舊請求可能在新請求之後才 resolve；沒有序號防護會把舊月份
// 資料寫進 data，但下拉已顯示新年月，形成顯示與選取不一致。比照 ConfirmationRoundBar.vue
// 的寫法：每次 load() 領一個序號，只有序號仍是最新的回應才能寫入 data／loading。
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const res = await getMyAttendanceConfirmations({ year: year.value, month: month.value })
    if (seq !== loadSeq) return
    data.value = res.data
  } catch {
    if (seq === loadSeq) ElMessage.error('讀取出勤確認失敗')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch([year, month], () => void load(), { immediate: true })

function replaceItem(updated: PortalConfirmationItem) {
  if (!data.value) return
  const wasPending = data.value.items.find((i) => i.id === updated.id)?.needs_my_response ?? false
  data.value = {
    ...data.value,
    items: data.value.items.map((i) => (i.id === updated.id ? updated : i)),
    pending_count: Math.max(0, data.value.pending_count - (wasPending && !updated.needs_my_response ? 1 : 0)),
  }
}

function errorText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : '送出失敗，請稍後再試'
}

async function agree(item: PortalConfirmationItem) {
  if (item.id == null) return
  const form = formOf(item)
  if (form.agreeing) return
  form.agreeing = true
  try {
    replaceItem((await respondAttendanceConfirmation(item.id, { action: 'agree' })).data)
    ElMessage.success('已回覆')
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    form.agreeing = false
  }
}

function amendPayload(item: PortalConfirmationItem, form: AmendForm): AmendBody | null {
  const note = form.note.trim() || undefined
  switch (form.kind) {
    case 'swap_with':
    case 'cover_for':
      return form.partner ? { kind: form.kind, partner_employee_id: form.partner, ...(note ? { note } : {}) } : null
    case 'leave':
      return { kind: 'leave', leave_type: form.leaveType, ...(note ? { note } : {}) }
    case 'forgot_punch':
      return {
        kind: 'forgot_punch',
        correction_type: form.correctionType,
        ...(form.punchIn ? { requested_punch_in: `${item.date}T${form.punchIn}:00` } : {}),
        ...(form.punchOut ? { requested_punch_out: `${item.date}T${form.punchOut}:00` } : {}),
        ...(note ? { note } : {}),
      }
    case 'other':
      return note ? { kind: 'other', note } : null
    default:
      return null
  }
}

async function submitAmend(item: PortalConfirmationItem) {
  if (item.id == null) return
  const form = formOf(item)
  const amend = amendPayload(item, form)
  if (!amend) {
    ElMessage.warning('請把修正內容填完整')
    return
  }
  form.submitting = true
  try {
    replaceItem((await respondAttendanceConfirmation(item.id, { action: 'amend', amend })).data)
    form.open = false
    ElMessage.success('已送出修正')
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    form.submitting = false
  }
}

async function signoff() {
  signing.value = true
  try {
    const res = await signoffAttendanceMonth({ year: year.value, month: month.value })
    if (data.value) data.value = { ...data.value, signed_at: res.data.signed_at }
    ElMessage.success('已完成本月出勤確認')
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    signing.value = false
  }
}
</script>

<template>
  <div class="attendance-confirm">
    <PortalPageHeader title="本月出勤確認">
      <template #actions>
        <el-select v-model="year" style="width: 100px" aria-label="年">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <el-select v-model="month" style="width: 90px" aria-label="月">
          <el-option v-for="m in monthOptions" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
      </template>
    </PortalPageHeader>

    <el-alert v-if="pending > 0" type="warning" :closable="false" show-icon
      :title="`還有 ${pending} 筆需要你回覆`" class="attendance-confirm__alert" />

    <div v-loading="loading">
      <EmptyState v-if="!loading && !items.length" variant="mobile"
        description="本月沒有需要確認的換班或代班。確認無誤後按下方「本月出勤確認完成」即可。" />
      <el-card v-for="item in items" :key="item.id ?? 0" class="attendance-confirm__card" shadow="never">
        <div class="attendance-confirm__head">
          <el-tag size="small">{{ KIND_LABELS[item.kind] }}</el-tag>
          <el-tag size="small" :type="item.status === 'agreed' ? 'success' : item.status === 'disputed' ? 'warning' : 'info'">
            {{ STATUS_LABELS[item.status] }}
          </el-tag>
          <el-tag v-if="item.escalated" size="small" type="danger">已逾期</el-tag>
        </div>
        <p class="attendance-confirm__text">{{ describeSuggestion(item, viewerId(item)) }}</p>
        <div v-if="item.needs_my_response || (item.status === 'pending' && item.can_repair)" class="attendance-confirm__actions">
          <el-button v-if="item.can_agree && item.needs_my_response" type="primary"
            :loading="formOf(item).agreeing" :data-test="`agree-${item.id}`" @click="agree(item)">對</el-button>
          <el-button :data-test="`amend-${item.id}`" @click="formOf(item).open = !formOf(item).open">
            不對，改成…
          </el-button>
        </div>
        <div v-if="formOf(item).open" class="attendance-confirm__form">
          <el-radio-group v-model="formOf(item).kind" class="attendance-confirm__kinds">
            <el-radio v-for="k in amendKindsFor(item)" :key="k" :value="k"
              :disabled="kindDisabled(item, k)" :data-test="`amend-kind-${k}`">{{ AMEND_LABELS[k] }}</el-radio>
          </el-radio-group>
          <el-select v-if="formOf(item).kind === 'swap_with' || formOf(item).kind === 'cover_for'"
            v-model="formOf(item).partner" placeholder="選擇同事">
            <el-option v-for="c in choicesFor(item)" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select v-if="formOf(item).kind === 'leave'" v-model="formOf(item).leaveType" placeholder="假別">
            <el-option v-for="o in LEAVE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <template v-if="formOf(item).kind === 'forgot_punch'">
            <el-select v-model="formOf(item).correctionType">
              <el-option label="補上班打卡" value="punch_in" />
              <el-option label="補下班打卡" value="punch_out" />
              <el-option label="補全天打卡" value="both" />
            </el-select>
            <el-time-picker v-if="formOf(item).correctionType !== 'punch_out'" v-model="formOf(item).punchIn"
              value-format="HH:mm" format="HH:mm" placeholder="上班時間" />
            <el-time-picker v-if="formOf(item).correctionType !== 'punch_in'" v-model="formOf(item).punchOut"
              value-format="HH:mm" format="HH:mm" placeholder="下班時間" />
          </template>
          <el-input v-model="formOf(item).note" type="textarea" :rows="2" maxlength="500"
            :placeholder="formOf(item).kind === 'other' ? '請說明實際情況（必填）' : '補充說明（選填）'"
            :data-test="`amend-note-${item.id}`" />
          <el-button type="primary" :loading="formOf(item).submitting"
            :data-test="`amend-submit-${item.id}`" @click="submitAmend(item)">送出修正</el-button>
        </div>
      </el-card>
    </div>

    <p class="attendance-confirm__hint">
      遲到、早退與漏卡請到
      <router-link :to="{ path: '/portal/anomalies', query: { year, month } }">異常確認</router-link>
      處理。
    </p>

    <div class="attendance-confirm__footer">
      <span v-if="data?.signed_at">已完成本月出勤確認（{{ data.signed_at.slice(0, 16).replace('T', ' ') }}）</span>
      <el-button v-else type="success" :disabled="pending > 0" :loading="signing" data-test="signoff" @click="signoff">
        本月出勤確認完成
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.attendance-confirm__alert,
.attendance-confirm__card {
  margin-bottom: 12px;
}
.attendance-confirm__head {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.attendance-confirm__text {
  margin: 8px 0;
  line-height: 1.6;
}
.attendance-confirm__actions,
.attendance-confirm__form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.attendance-confirm__form {
  margin-top: 8px;
}
.attendance-confirm__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  width: 100%;
}
.attendance-confirm__hint {
  color: var(--el-text-color-secondary);
}
.attendance-confirm__footer {
  position: sticky;
  bottom: 0;
  padding: 12px 0;
  background: var(--el-bg-color);
  display: flex;
  justify-content: flex-end;
}
</style>
