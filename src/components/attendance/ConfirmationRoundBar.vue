<script setup lang="ts">
/**
 * 打卡核對頁的「月底出勤確認」列（SPEC-026 §3.6）：發送、進度、重新推測、套用雙方已確認。
 * 老師的回覆只是證詞；唯一寫入班表的動作是「套用雙方已確認」（後端逐項走 confirm_shifts）。
 * 不發推播（D4）：發送後請行政口頭提醒老師上系統確認。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/api/_generated/typed'
import {
  applyAgreedConfirmations,
  createConfirmationRound,
  getConfirmationRound,
  listConfirmationRounds,
  refreshConfirmationRound,
} from '@/api/attendanceConfirmation'
import { hasPermission } from '@/utils/auth'
import { todayTaipeiISO } from '@/utils/format'
import {
  addWorkdays,
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

const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE') && hasPermission('SCHEDULE'))
const loading = ref(false)
const busy = ref(false)
const round = ref<Round | null>(null)
const detail = ref<Progress | null>(null)
const createOpen = ref(false)
const progressOpen = ref(false)
const applyOpen = ref(false)
const draft = ref<Draft | null>(null)
const applyPlan = ref<ApplyResult | null>(null)
const form = ref(defaultForm())

function defaultForm() {
  const today = todayTaipeiISO()
  const lastDay = yesterdayISO(today)
  return {
    period_start: props.start,
    period_end: props.end < lastDay ? props.end : lastDay,
    deadline_date: addWorkdays(today, 3),
  }
}

const agreedCount = computed(() => detail.value?.items.filter((i) => i.status === 'agreed').length ?? 0)
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

function errorText(e: unknown): string {
  const detailText = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detailText === 'string' ? detailText : '操作失敗，請稍後再試'
}

let seq = 0
async function load() {
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

async function planApply() {
  busy.value = true
  try {
    applyPlan.value = (await applyAgreedConfirmations({ dry_run: true })).data
    applyOpen.value = true
  } catch (e) {
    ElMessage.error(errorText(e))
  } finally {
    busy.value = false
  }
}

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
      <p class="confirm-bar__line" data-test="round-summary">
        確認輪次 #{{ round.id }}：{{ round.period_start }}～{{ round.period_end }}，期限
        {{ round.deadline_date }}｜待回覆 {{ summary.awaiting }} 人・逾期 {{ summary.escalated }}
        人・已簽認 {{ summary.signed }}/{{ summary.total }}
      </p>
      <div class="confirm-bar__actions">
        <el-button data-test="open-progress" @click="progressOpen = true">進度</el-button>
        <el-button v-if="canWrite" :loading="busy" data-test="refresh" @click="refresh">
          重新推測
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
      </div>
    </template>

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
          {{ describeSuggestion(item) }}（{{ item.escalated ? '逾期未回覆' : STATUS_LABELS[item.status] }}）
        </li>
        <li v-if="!needsAdmin.length">無</li>
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
</style>
