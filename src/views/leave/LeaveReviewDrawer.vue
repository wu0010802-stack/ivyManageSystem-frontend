<!--
  審核抽屜（2026-09-15 UI/UX 改版 mockup 畫面 B）：核准前要看的訊號集中一處——
  附件、代理人、配額、同期間人力、換班——取代原本只能各自散在表格欄位裡看的方式。

  刻意的簡化取捨：駁回、編輯、審核紀錄仍走既有的 LeaveRejectDialog／
  openEditWithDraft／ApprovalLogDrawer（emit 事件交給父層開啟），不在本元件內
  重新實作這些已存在且已測試過的流程，降低重複邏輯與回歸風險。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getLeaveQuotas } from '@/api/leaves'
import { leaveRequiresAttachment } from '@/utils/leaves'

interface QuotaRow {
  remaining_hours: number
  used_hours: number
  pending_hours: number
  total_hours: number
}

const props = defineProps<{
  visible: boolean
  row: Record<string, unknown> | null
  sameDayCount: number
  canApprove: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'approve', row: Record<string, unknown>): void
  (e: 'reject', row: Record<string, unknown>): void
  (e: 'edit', row: Record<string, unknown>): void
  (e: 'logs', row: Record<string, unknown>): void
  (e: 'attachment', row: Record<string, unknown>): void
}>()

const drawerModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ── 日期文字（與 LeaveView.vue 同款格式，刻意就地保留一份小型 helper，
//    避免為了共用 15 行邏輯去動已測試過的 @/utils/leaves 手寫 mock 契約）──
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
function fmtMD(d: unknown): string {
  const s = d as string | undefined
  if (!s) return ''
  const p = s.split('-')
  return p.length < 3 ? s : `${Number(p[1])}/${Number(p[2])}`
}
function fmtWeekday(d: unknown): string {
  const s = d as string | undefined
  if (!s) return ''
  const dt = new Date(`${s}T00:00:00`)
  return Number.isNaN(dt.getTime()) ? '' : `（${WEEKDAY_LABELS[dt.getDay()]}）`
}
const dateRangeLabel = computed(() => {
  const row = props.row
  if (!row) return ''
  const sd = row.start_date
  const ed = row.end_date
  const st = row.start_time as string | undefined
  const et = row.end_time as string | undefined
  if (sd === ed) {
    if (st && et) return `${fmtMD(sd)}${fmtWeekday(sd)} ${st}–${et}`
    return `${fmtMD(sd)}${fmtWeekday(sd)} 整天`
  }
  return `${fmtMD(sd)}${fmtWeekday(sd)} – ${fmtMD(ed)}${fmtWeekday(ed)}`
})

function formatCreatedAt(v: unknown): string {
  const s = String(v || '')
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

// ── 附件 ──
const hasAttachment = computed(() => Boolean((props.row?.attachment_paths as string[] | undefined)?.length))
const attachmentCount = computed(() => (props.row?.attachment_paths as string[] | undefined)?.length || 0)
const needsAttachment = computed(() => {
  const row = props.row
  if (!row) return false
  return row.status === 'pending'
    && leaveRequiresAttachment(row.start_date, row.end_date)
    && !hasAttachment.value
})

// ── 代理人 ──
const substituteClass = computed<'ok' | 'warn' | 'info'>(() => {
  const row = props.row
  if (!row) return 'info'
  const s = row.substitute_status as string | undefined
  if (!s || s === 'not_required') return 'info'
  if (s === 'accepted' || s === 'waived') return 'ok'
  if (row.status === 'pending' && (s === 'pending' || s === 'rejected')) return 'warn'
  return 'info'
})
const substituteIcon = computed(() => ({ ok: '✓', warn: '!', info: 'i' }[substituteClass.value]))
const substituteText = computed(() => {
  const row = props.row
  if (!row) return ''
  const name = row.substitute_employee_name as string | undefined
  if (!name) return '不需代理人'
  const s = row.substitute_status as string | undefined
  const label = ({ pending: '待回應', accepted: '已接受', rejected: '已拒絕', waived: '主管略過', not_required: '不需代理' } as Record<string, string>)[s || ''] || s
  return `代理人 ${name}（${label}）`
})

// ── 配額（開啟時才查，避免每列都打 API）──
const quota = ref<QuotaRow | null>(null)
const quotaLoading = ref(false)

async function loadQuota() {
  const row = props.row
  quota.value = null
  if (!row || !row.employee_id || !row.leave_type) return
  quotaLoading.value = true
  try {
    const year = Number(String(row.start_date || '').slice(0, 4)) || new Date().getFullYear()
    const res = await getLeaveQuotas({ employee_id: row.employee_id, year, leave_type: row.leave_type })
    const data = (res as { data: QuotaRow[] }).data
    quota.value = Array.isArray(data) && data.length ? data[0] : null
  } catch {
    quota.value = null
  } finally {
    quotaLoading.value = false
  }
}

watch(
  () => [props.visible, props.row?.id],
  ([visible]) => {
    if (visible && props.row) loadQuota()
  },
  { immediate: true },
)

const quotaShort = computed(() => {
  const row = props.row
  if (!quota.value || !row || row.status !== 'pending') return 0
  const need = Number(row.leave_hours) || 0
  const over = need - quota.value.remaining_hours
  return over > 0 ? over : 0
})
const quotaClass = computed<'ok' | 'warn' | 'info'>(() => {
  if (!quota.value) return 'info'
  return quotaShort.value > 0 ? 'warn' : 'ok'
})
const quotaIcon = computed(() => ({ ok: '✓', warn: '!', info: 'i' }[quotaClass.value]))

const sameDayClass = computed<'warn' | 'info'>(() => (props.sameDayCount >= 3 ? 'warn' : 'info'))

// 模板內插值不支援 TS `as` 轉型，型別窄化改在這裡做
const relatedSwap = computed(() => props.row?.related_swap as { id: number; swap_date: string } | null | undefined)
</script>

<template>
  <el-drawer v-model="drawerModel" :with-header="false" size="440px" destroy-on-close>
    <template v-if="row">
      <div class="lrd-header">
        <h3>{{ row.employee_name }}<span class="lrd-header__type">・{{ row.leave_type_label }}</span></h3>
        <el-tag v-if="row.status === 'approved'" type="success" size="small">已核准</el-tag>
        <el-tag v-else-if="row.status === 'rejected'" type="danger" size="small">已駁回</el-tag>
        <el-tag v-else type="warning" size="small">待審核</el-tag>
      </div>
      <div class="lrd-sub">假單 #{{ row.id }}<template v-if="row.created_at">・{{ formatCreatedAt(row.created_at) }} 送出</template></div>

      <div class="lrd-kv">
        <span class="lrd-k">日期</span><span>{{ dateRangeLabel }}</span>
        <span class="lrd-k">時數</span><span>{{ row.leave_hours }}h</span>
        <span class="lrd-k">原因</span><span>{{ row.reason || '—' }}</span>
      </div>

      <div class="lrd-checklist">
        <div class="lrd-check-title">核准前檢查</div>

        <div class="lrd-check-item" :class="needsAttachment ? 'bad' : 'ok'" data-test="lrd-check-attachment">
          <span class="lrd-check-icon">{{ needsAttachment ? '!' : '✓' }}</span>
          <div class="lrd-check-body">
            <div>{{ needsAttachment ? '證明附件尚未附上' : (hasAttachment ? `已附 ${attachmentCount} 份附件` : '不需證明附件') }}</div>
            <small v-if="needsAttachment">請假超過 2 個曆日，核准前需補上證明附件</small>
          </div>
          <el-button v-if="hasAttachment" link type="primary" size="small" @click="emit('attachment', row)">查看</el-button>
        </div>

        <div class="lrd-check-item" :class="substituteClass" data-test="lrd-check-substitute">
          <span class="lrd-check-icon">{{ substituteIcon }}</span>
          <div class="lrd-check-body"><div>{{ substituteText }}</div></div>
        </div>

        <div class="lrd-check-item" :class="quotaClass" data-test="lrd-check-quota">
          <span class="lrd-check-icon">{{ quotaIcon }}</span>
          <div class="lrd-check-body">
            <div v-if="quotaLoading">查詢配額中…</div>
            <div v-else-if="quota">
              剩餘 {{ quota.remaining_hours }}h
              <template v-if="quotaShort > 0">，本次將超出 {{ quotaShort }}h</template>
            </div>
            <div v-else>此假別無年度配額限制</div>
          </div>
        </div>

        <div class="lrd-check-item" :class="sameDayClass" data-test="lrd-check-sameday">
          <span class="lrd-check-icon">{{ sameDayCount >= 3 ? '!' : 'i' }}</span>
          <div class="lrd-check-body">
            <div>{{ sameDayCount > 0 ? `同期間還有 ${sameDayCount} 人請假` : '同期間無其他人請假' }}</div>
          </div>
        </div>

        <div v-if="row.related_swap" class="lrd-check-item info" data-test="lrd-check-swap">
          <span class="lrd-check-icon">i</span>
          <div class="lrd-check-body">
            <div v-if="relatedSwap">綁定換班申請 #{{ relatedSwap.id }}（{{ relatedSwap.swap_date }}）</div>
          </div>
        </div>
      </div>

      <div v-if="row.status === 'rejected' && row.rejection_reason" class="lrd-rejected-note">
        <strong>駁回原因：</strong>{{ row.rejection_reason }}
      </div>

      <div class="lrd-actions-bottom">
        <el-button link @click="emit('logs', row)">審核紀錄</el-button>
        <el-button link @click="emit('edit', row)">編輯假單</el-button>
      </div>
    </template>

    <template v-if="row && (row.status === 'pending' || row.status === 'rejected')" #footer>
      <div class="lrd-footer">
        <el-button v-if="row.status === 'pending'" type="danger" @click="emit('reject', row)">駁回</el-button>
        <el-tooltip v-if="needsAttachment" content="請假超過 2 天需檢附證明附件後才能核准" placement="top">
          <span><el-button type="success" disabled>核准</el-button></span>
        </el-tooltip>
        <el-button v-else type="success" :disabled="!canApprove" @click="emit('approve', row)">核准</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.lrd-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 4px 0;
}
.lrd-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.lrd-header__type {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.lrd-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}
.lrd-kv {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 6px 12px;
  font-size: 13px;
  margin-bottom: 16px;
}
.lrd-k { color: var(--el-text-color-secondary); }
.lrd-checklist {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 16px;
}
.lrd-check-title {
  background: var(--el-fill-color-light);
  padding: 6px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.lrd-check-item {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12.5px;
}
.lrd-check-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--el-color-info);
}
.lrd-check-item.bad .lrd-check-icon { background: var(--el-color-danger); }
.lrd-check-item.warn .lrd-check-icon { background: var(--el-color-warning); }
.lrd-check-item.ok .lrd-check-icon { background: var(--el-color-success); }
.lrd-check-body small {
  display: block;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.lrd-rejected-note {
  margin: 0 0 16px;
  padding: 10px 12px;
  background: var(--el-color-danger-light-9);
  border-radius: 6px;
  font-size: 13px;
}
.lrd-actions-bottom {
  display: flex;
  gap: 12px;
}
.lrd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
