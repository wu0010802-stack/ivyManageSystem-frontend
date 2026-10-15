<script setup lang="ts">
/**
 * 打卡核對頁的「月底出勤確認」列（SPEC-026 §3.6）：發送、進度、重新推測、套用雙方已確認。
 * 老師的回覆只是證詞；唯一寫入班表的動作是「套用雙方已確認」（後端逐項走 confirm_shifts）。
 * 不發推播（D4）：發送後請行政口頭提醒老師上系統確認。
 *
 * 「老師自行補登」區塊（SPEC-026 3-3）：老師自行登記的過去日期換班是無輪次項目，輪次進度看不到，
 * 所以獨立於輪次分支另列（沒有任何輪次時也顯示），套用與結案重用同一組流程。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ApiResponse } from '@/api/_generated/typed'
import {
  applyAgreedConfirmations,
  closeConfirmationRound,
  createConfirmationRound,
  dismissConfirmationItem,
  getConfirmationRound,
  listConfirmationRounds,
  listUnroundedConfirmationItems,
  refreshConfirmationRound,
  updateConfirmationRound,
} from '@/api/attendanceConfirmation'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { todayTaipeiISO } from '@/utils/format'
import {
  addWorkdays,
  describeResolution,
  describeSuggestion,
  KIND_LABELS,
  STATUS_LABELS,
  yesterdayISO,
  type ConfirmationItem,
} from '@/utils/attendanceConfirm'

type Round = ApiResponse<'/attendance/confirmation-rounds', 'get'>[number]
type Progress = ApiResponse<'/attendance/confirmation-rounds/{round_id}', 'get'>
type Draft = ApiResponse<'/attendance/confirmation-rounds', 'post'>
type ApplyResult = ApiResponse<'/attendance/confirmation-items/apply-agreed', 'post'>

const props = defineProps<{ start: string; end: string }>()
const emit = defineEmits<{ items: [items: ConfirmationItem[]] }>()

// 行政端項目狀態 tag 顏色（Q4：dismissed 用 info，與「已失效」同色，皆表示不再需要處理）。
const STATUS_TAG_TYPE: Record<ConfirmationItem['status'], 'success' | 'warning' | 'info' | 'danger'> = {
  pending: 'info',
  agreed: 'success',
  disputed: 'warning',
  applied: 'success',
  superseded: 'info',
  dismissed: 'info',
}

const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE') && hasPermission('SCHEDULE'))
const loading = ref(false)
const busy = ref(false)
const round = ref<Round | null>(null)
const detail = ref<Progress | null>(null)
const createOpen = ref(false)
const progressOpen = ref(false)
const applyOpen = ref(false)
const deadlineOpen = ref(false)
const draft = ref<Draft | null>(null)
const applyPlan = ref<ApplyResult | null>(null)
const form = ref(defaultForm())
const deadlineForm = ref({ deadline_date: '' })

function defaultForm() {
  const today = todayTaipeiISO()
  const lastDay = yesterdayISO(today)
  return {
    period_start: props.start,
    period_end: props.end < lastDay ? props.end : lastDay,
    deadline_date: addWorkdays(today, 3),
  }
}

// 套用預覽只帶本輪 agreed 項目（最終審查 M-1）：不帶 item_ids 時後端會列出全租戶所有
// agreed 項目，預覽清單就跟按鈕上的計數對不起來。
const agreedIds = computed(
  () => detail.value?.items.flatMap((i) => (i.status === 'agreed' && i.id != null ? [i.id] : [])) ?? [],
)
const agreedCount = computed(() => agreedIds.value.length)
const agreedItems = computed(() => detail.value?.items.filter((i) => i.status === 'agreed') ?? [])

// ---- 老師自行補登（無輪次）----
const backdated = ref<ConfirmationItem[]>([])
const backdatedError = ref(false)
// 雙方已確認的預設全勾（套用前一定會先預覽並確認）；只記「被取消勾選」的，重讀後新出現的項目才會預設勾選
const unchecked = ref<ReadonlySet<number>>(new Set())
const backdatedAgreed = computed(() => backdated.value.filter((i) => i.status === 'agreed' && i.id != null))
const backdatedSelectedIds = computed(() =>
  backdatedAgreed.value.flatMap((i) => (i.id != null && !unchecked.value.has(i.id) ? [i.id] : [])),
)

function isBackdatedChecked(item: ConfirmationItem): boolean {
  return item.id != null && !unchecked.value.has(item.id)
}

function toggleBackdated(item: ConfirmationItem, checked: unknown) {
  if (item.id == null) return
  const next = new Set(unchecked.value)
  if (checked) next.delete(item.id)
  else next.add(item.id)
  unchecked.value = next
}
const summary = computed(() => {
  const employees = detail.value?.employees ?? []
  return {
    awaiting: employees.filter((e) => e.awaiting_response > 0).length,
    escalated: employees.filter((e) => e.escalated).length,
    signed: employees.filter((e) => e.signed).length,
    total: employees.length,
  }
})
const needsAdmin = computed(
  () => detail.value?.items.filter((i) => i.status === 'disputed' || i.escalated) ?? [],
)
const isClosed = computed(() => round.value?.status === 'closed')
// 本輪進度尚未載入（或讀取失敗、手上仍是別輪的舊進度）時停用「關閉輪次」：
// 確認對話框的筆數來自 detail，沒有它會顯示「0 筆」而誤導行政。
const closeDisabled = computed(() => !detail.value || detail.value.round.id !== round.value?.id)
// 關閉輪次確認對話框逐類列出筆數（Q2）：只算未完成（尚未套用／尚未失效）的項目。
const closeCounts = computed(() => {
  const items = detail.value?.items ?? []
  return {
    pending: items.filter((i) => i.status === 'pending').length,
    agreed: items.filter((i) => i.status === 'agreed').length,
    disputed: items.filter((i) => i.status === 'disputed').length,
  }
})

function errorText(e: unknown): string {
  return apiError(e, '操作失敗，請稍後再試')
}

let seq = 0
async function loadRound() {
  const mine = ++seq
  loading.value = true
  try {
    const res = await listConfirmationRounds({ start_date: props.start, end_date: props.end })
    if (mine !== seq) return
    round.value = res.data.find((r) => r.status === 'open') ?? res.data[0] ?? null
    if (!round.value) {
      detail.value = null
      emit('items', [])
      return
    }
    const progress = await getConfirmationRound(round.value.id)
    if (mine !== seq) return
    detail.value = progress.data
    emit('items', progress.data.items)
  } catch {
    if (mine === seq) ElMessage.error('讀取月底出勤確認失敗')
  } finally {
    if (mine === seq) loading.value = false
  }
}

// 補登清單與輪次各自讀、各自防亂序；讀不到補登清單只顯示一行失敗提示，不影響輪次區塊
let backdatedSeq = 0
async function loadBackdated() {
  const mine = ++backdatedSeq
  try {
    const res = await listUnroundedConfirmationItems({ start_date: props.start, end_date: props.end })
    if (mine !== backdatedSeq) return
    backdated.value = res.data
    backdatedError.value = false
  } catch {
    if (mine !== backdatedSeq) return
    backdated.value = []
    backdatedError.value = true
  }
}

async function load() {
  await Promise.all([loadRound(), loadBackdated()])
}

watch(() => [props.start, props.end], () => void load(), { immediate: true })
// 預覽後若又改動表單（期間起／迄／回覆期限），已預覽的 draft 不再代表目前表單內容，
// 「發送」必須連動失效，逼行政重新預覽才能再按發送——避免發出的是改過而未重新預覽的值。
watch(form, () => { draft.value = null }, { deep: true })

function openCreate() {
  form.value = defaultForm()
  draft.value = null
  createOpen.value = true
}

async function previewDraft() {
  busy.value = true
  try {
    draft.value = (await createConfirmationRound({ ...form.value, dry_run: true })).data
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

async function release() {
  busy.value = true
  try {
    await createConfirmationRound({ ...form.value, dry_run: false })
    ElMessage.success('已發給老師確認，請口頭提醒老師上系統回覆')
    createOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

async function refresh() {
  if (!round.value) return
  busy.value = true
  try {
    const r = (await refreshConfirmationRound(round.value.id)).data
    ElMessage.success(`重新推測完成：新增 ${r.created}、失效 ${r.superseded}、保留 ${r.kept}`)
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

// 預覽的 item_ids 由呼叫端決定：輪次的「套用雙方已確認」帶本輪 agreed，補登區塊帶勾選的；之後共用同一個確認對話框
async function planApplyFor(ids: number[]) {
  busy.value = true
  try {
    applyPlan.value = (await applyAgreedConfirmations({ dry_run: true, item_ids: ids })).data
    applyOpen.value = true
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

const planApply = () => planApplyFor(agreedIds.value)

async function confirmApply() {
  busy.value = true
  try {
    const ids = applyPlan.value?.planned.map((p) => p.item_id) ?? []
    const r = (await applyAgreedConfirmations({ dry_run: false, item_ids: ids })).data
    applyOpen.value = false
    const parts = [`已套用 ${r.applied.length} 筆`]
    if (r.superseded.length) parts.push(`${r.superseded.length} 筆資料已變動，請重新推測`)
    if (r.skipped.length) parts.push(`${r.skipped.length} 筆跳過`)
    if (r.failed.length) parts.push(`${r.failed.length} 筆失敗`)
    if (r.failed.length || r.skipped.length) ElMessage.warning(parts.join('，'))
    else ElMessage.success(parts.join('，'))
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

function openDeadline() {
  if (!round.value) return
  deadlineForm.value = { deadline_date: round.value.deadline_date }
  deadlineOpen.value = true
}

async function saveDeadline() {
  if (!round.value) return
  busy.value = true
  try {
    await updateConfirmationRound(round.value.id, { deadline_date: deadlineForm.value.deadline_date })
    ElMessage.success('已更新回覆期限')
    deadlineOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

async function closeRound() {
  if (!round.value || closeDisabled.value) return
  const counts = closeCounts.value
  const total = counts.pending + counts.agreed + counts.disputed
  // 雙方已確認、尚未套用的調班一關閉就失效、不會寫進班表（影響出勤異常與扣款判讀），特別提醒。
  const applyHint =
    counts.agreed > 0 ? '建議先按「套用雙方已確認」再關閉，否則這些調班不會寫進班表。' : ''
  try {
    await ElMessageBox.confirm(
      `關閉後，本輪 ${total} 筆未完成的項目（待回覆 ${counts.pending}、雙方已確認未套用 ${counts.agreed}、` +
        `轉行政 ${counts.disputed}）都會失效，已送出的請假／補卡申請不受影響。關閉後同一期間可以重新發送。` +
        applyHint,
      '關閉輪次',
      { confirmButtonText: '關閉輪次', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const r = (await closeConfirmationRound(round.value.id)).data
    ElMessage.success(`輪次已關閉，${r.superseded} 筆項目已失效`)
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

async function dismissItem(item: ConfirmationItem) {
  if (item.id == null) return
  let note: string | null
  try {
    const res = await ElMessageBox.prompt('結案說明（選填）', '結案', {
      inputPlaceholder: '例如：該月已封存，已人工處理',
      confirmButtonText: '確定',
      cancelButtonText: '取消',
    })
    // 取消時 prompt 是 reject 不是 resolve；resolve 時型別仍是聯集（MessageBoxInputData | Action），
    // 用 typeof 縮窄避免對字串常值誤取 .value。
    const value = typeof res === 'string' ? '' : res.value.trim()
    note = value ? value : null
  } catch {
    return
  }
  busy.value = true
  try {
    await dismissConfirmationItem(item.id, { note })
    ElMessage.success('已結案')
    await load()
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="confirm-bar" aria-label="月底出勤確認">
    <p v-if="loading" class="confirm-bar__line">讀取月底出勤確認中…</p>
    <template v-else-if="!round">
      <p class="confirm-bar__line">
        此期間尚未發給老師確認。月底匯入打卡後，可請班導／副班導逐筆確認換班與代班。
      </p>
      <el-button v-if="canWrite" type="primary" data-test="open-create" @click="openCreate">
        發給老師確認
      </el-button>
    </template>
    <template v-else>
      <p v-if="isClosed" class="confirm-bar__line" data-test="round-summary">
        確認輪次 #{{ round.id }}（已關閉）：{{ round.period_start }}～{{ round.period_end }}
      </p>
      <p v-else class="confirm-bar__line" data-test="round-summary">
        確認輪次 #{{ round.id }}：{{ round.period_start }}～{{ round.period_end }}，期限
        {{ round.deadline_date }}｜待回覆 {{ summary.awaiting }} 人・逾期 {{ summary.escalated }}
        人・已簽認 {{ summary.signed }}/{{ summary.total }}
      </p>
      <div class="confirm-bar__actions">
        <el-button data-test="open-progress" @click="progressOpen = true">進度</el-button>
        <template v-if="isClosed">
          <el-button v-if="canWrite" type="primary" data-test="open-create" @click="openCreate">
            發給老師確認
          </el-button>
        </template>
        <template v-else>
          <el-button v-if="canWrite" :loading="busy" data-test="refresh" @click="refresh">
            重新推測
          </el-button>
          <el-button v-if="canWrite" data-test="open-deadline" @click="openDeadline">
            改期限
          </el-button>
          <el-button
            v-if="canWrite"
            type="danger"
            plain
            :disabled="closeDisabled"
            data-test="close-round"
            @click="closeRound"
          >
            關閉輪次
          </el-button>
          <el-button
            v-if="canWrite"
            type="primary"
            :disabled="agreedCount === 0"
            :loading="busy"
            data-test="plan-apply"
            @click="planApply"
          >
            套用雙方已確認（{{ agreedCount }}）
          </el-button>
        </template>
      </div>
    </template>

    <div v-if="backdated.length" class="confirm-bar__backdated" data-test="backdated-section">
      <h4 class="confirm-bar__subhead">老師自行補登（{{ backdated.length }}）</h4>
      <p class="confirm-bar__hint">
        老師自行登記的過去日期換班，不屬於任何輪次；對方同意後才能套用，套用時才寫入班表。
      </p>
      <ul class="confirm-bar__list">
        <li v-for="item in backdated" :key="item.id ?? 0" :data-test="`backdated-item-${item.id}`">
          <el-checkbox
            v-if="canWrite && item.status === 'agreed' && item.id != null"
            :model-value="isBackdatedChecked(item)"
            :data-test="`backdated-check-${item.id}`"
            @change="toggleBackdated(item, $event)"
          />
          {{ describeSuggestion(item) }}
          <el-tag size="small" :type="STATUS_TAG_TYPE[item.status]">{{ STATUS_LABELS[item.status] }}</el-tag>
          <p v-if="describeResolution(item)" class="confirm-bar__resolution">{{ describeResolution(item) }}</p>
          <el-button
            v-if="canWrite && item.id != null && (item.status === 'agreed' || item.status === 'disputed')"
            size="small"
            text
            :data-test="`backdated-dismiss-${item.id}`"
            @click="dismissItem(item)"
          >
            {{ item.status === 'agreed' ? '不套用，結案' : '結案' }}
          </el-button>
        </li>
      </ul>
      <el-button
        v-if="canWrite && backdatedAgreed.length"
        type="primary"
        :disabled="backdatedSelectedIds.length === 0"
        :loading="busy"
        data-test="backdated-plan-apply"
        @click="planApplyFor(backdatedSelectedIds)"
      >
        套用選取（{{ backdatedSelectedIds.length }}）
      </el-button>
    </div>
    <p v-else-if="backdatedError" class="confirm-bar__line" data-test="backdated-error">
      讀取老師補登項目失敗，請稍後重新整理。
    </p>

    <el-dialog v-model="createOpen" title="發給老師確認" width="640px">
      <el-form label-position="top" class="confirm-bar__grid">
        <el-form-item label="期間起">
          <el-date-picker v-model="form.period_start" type="date" value-format="YYYY-MM-DD" :clearable="false" />
        </el-form-item>
        <el-form-item label="期間迄">
          <el-date-picker v-model="form.period_end" type="date" value-format="YYYY-MM-DD" :clearable="false" />
        </el-form-item>
        <el-form-item label="回覆期限">
          <el-date-picker v-model="form.deadline_date" type="date" value-format="YYYY-MM-DD" :clearable="false" />
        </el-form-item>
      </el-form>
      <p class="confirm-bar__hint">
        只涵蓋輪值表上的班導與副班導；系統不發推播，請口頭提醒老師上系統確認。
      </p>
      <div v-if="draft" data-test="draft">
        <p>適用 {{ draft.eligible_count }} 人，預計 {{ draft.items.length }} 筆待確認項目。</p>
        <ul class="confirm-bar__list">
          <li v-for="(item, idx) in draft.items" :key="idx">
            {{ KIND_LABELS[item.kind] }}｜{{ describeSuggestion(item) }}
          </li>
        </ul>
      </div>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button :loading="busy" data-test="preview" @click="previewDraft">預覽</el-button>
        <el-button type="primary" :disabled="!draft" :loading="busy" data-test="release" @click="release">
          發送
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deadlineOpen" title="改期限" width="420px">
      <el-form label-position="top">
        <el-form-item label="回覆期限">
          <el-date-picker
            v-model="deadlineForm.deadline_date"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
          />
        </el-form-item>
      </el-form>
      <p class="confirm-bar__hint">只改回覆期限，不改期間；期間發錯請改用「關閉輪次」後重發。</p>
      <template #footer>
        <el-button @click="deadlineOpen = false">取消</el-button>
        <el-button type="primary" :loading="busy" data-test="save-deadline" @click="saveDeadline">
          儲存
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="progressOpen" title="確認進度" size="520px">
      <el-table v-if="detail" :data="detail.employees" data-test="progress-table">
        <el-table-column prop="employee_name" label="老師" />
        <el-table-column label="待回覆" width="80">
          <template #default="{ row }">{{ row.awaiting_response }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.escalated" type="danger">逾期</el-tag>
            <el-tag v-else-if="row.signed" type="success">已簽認</el-tag>
            <el-tag v-else type="info">未簽認</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <h4 class="confirm-bar__subhead">需要行政處理的項目</h4>
      <ul class="confirm-bar__list">
        <li v-for="item in needsAdmin" :key="item.id ?? 0">
          {{ describeSuggestion(item) }}
          <el-tag size="small" :type="STATUS_TAG_TYPE[item.status]">
            {{ item.escalated ? '逾期未回覆' : STATUS_LABELS[item.status] }}
          </el-tag>
          <p v-if="describeResolution(item)" class="confirm-bar__resolution" data-test="needs-admin-resolution">
            {{ describeResolution(item) }}
          </p>
          <el-button
            v-if="canWrite && item.id != null"
            size="small"
            text
            :data-test="`dismiss-${item.id}`"
            @click="dismissItem(item)"
          >
            結案
          </el-button>
        </li>
        <li v-if="!needsAdmin.length">無</li>
      </ul>
      <h4 class="confirm-bar__subhead">雙方已確認、尚未套用</h4>
      <ul class="confirm-bar__list">
        <li v-for="item in agreedItems" :key="item.id ?? 0">
          {{ describeSuggestion(item) }}
          <el-button
            v-if="canWrite && item.id != null"
            size="small"
            text
            :data-test="`dismiss-${item.id}`"
            @click="dismissItem(item)"
          >
            不套用，結案
          </el-button>
        </li>
        <li v-if="!agreedItems.length">無</li>
      </ul>
    </el-drawer>

    <el-dialog v-model="applyOpen" title="套用雙方已確認的調班" width="640px">
      <p>以下調班會寫入當日班別並重新計算出勤；封存月份與資料已變動的項目會自動略過。</p>
      <ul class="confirm-bar__list" data-test="apply-plan">
        <li v-for="p in applyPlan?.planned ?? []" :key="p.item_id">
          {{ p.date }} {{ KIND_LABELS[p.kind] }}：
          <span v-for="c in p.changes" :key="c.employee_id">
            {{ c.employee_name }} {{ c.from_shift?.name ?? '（無）' }} → {{ c.to_shift.name }}；
          </span>
        </li>
      </ul>
      <template #footer>
        <el-button @click="applyOpen = false">取消</el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!applyPlan?.planned.length"
          data-test="confirm-apply"
          @click="confirmApply"
        >
          確認套用
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.confirm-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 0;
}
.confirm-bar__line {
  margin: 0;
  flex: 1 1 320px;
}
.confirm-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.confirm-bar__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0 12px;
}
.confirm-bar__hint {
  margin: 4px 0 8px;
  color: var(--el-text-color-secondary);
}
.confirm-bar__list {
  margin: 4px 0 0;
  padding-left: 18px;
  max-height: 320px;
  overflow-y: auto;
}
.confirm-bar__subhead {
  margin: 16px 0 4px;
}
.confirm-bar__resolution {
  margin: 2px 0 6px;
  color: var(--el-text-color-secondary);
}
.confirm-bar__backdated {
  flex: 1 1 100%;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.confirm-bar__backdated .confirm-bar__subhead {
  margin-top: 0;
}
</style>
