<template>
  <div class="pos-semester" v-loading="loading">
    <div class="pos-semester__head">
      <AcademicTermSelector size="small" />
      <div class="pos-semester__filters">
        <el-select
          v-model="filters.classroom_name"
          placeholder="全部班級"
          clearable
          size="small"
          class="pos-semester__filter"
          @change="reload"
        >
          <el-option label="全部班級" value="" />
          <el-option
            v-for="c in classroomOptions"
            :key="c"
            :label="c"
            :value="c"
          />
        </el-select>
        <el-select
          v-model="filters.payment_status"
          placeholder="全部繳費狀態"
          clearable
          size="small"
          class="pos-semester__filter"
          @change="reload"
        >
          <el-option label="全部繳費狀態" value="" />
          <el-option
            v-for="(label, key) in PAYMENT_STATUS_LABEL"
            :key="key"
            :label="label"
            :value="key"
          />
        </el-select>
        <el-select
          v-model="filters.approval_status"
          placeholder="全部簽核狀態"
          clearable
          size="small"
          class="pos-semester__filter"
          @change="reload"
        >
          <el-option label="全部簽核狀態" value="" />
          <el-option
            v-for="(label, key) in APPROVAL_STATUS_LABEL"
            :key="key"
            :label="label"
            :value="key"
          />
        </el-select>
        <el-select
          v-model="filters.review_status"
          placeholder="全部審核狀態"
          clearable
          size="small"
          class="pos-semester__filter"
          @change="reload"
        >
          <el-option label="全部審核狀態" value="" />
          <el-option label="僅待審核" value="pending" />
          <el-option label="僅非系統自動比對" value="non_auto" />
        </el-select>
        <el-button size="small" :icon="RefreshRight" @click="reload">
          重新整理
        </el-button>
      </div>
    </div>

    <div v-if="truncated" class="pos-semester__trunc-warn" role="alert">
      ⚠ 報名筆數超過系統單次查詢上限，目前僅載入 {{ items.length }} 筆 / 全學期共
      {{ totalActive }} 筆。以下橫幅與統計卡為「目前載入筆數的部分合計」，<strong>並非全學期總計</strong>；
      請以班級／繳費／簽核狀態篩選縮小範圍後再逐段對帳，以免漏算。
    </div>

    <!-- 核對橫幅（③學期對帳改造，2026-08-16）：應收 → 實收 → 老闆已簽收，一眼看出
         哪個環節還沒對上。 -->
    <div class="pos-semester__banner" :class="{ 'is-balanced': isBalanced }">
      <div class="pos-semester__banner-item">
        <span>當期應收</span>
        <strong>{{ formatTWD(totals.total_amount || 0) }}</strong>
      </div>
      <div class="pos-semester__banner-arrow">→</div>
      <div class="pos-semester__banner-item">
        <span>實收</span>
        <strong>{{ formatTWD(totals.paid_amount || 0) }}</strong>
        <small>
          POS 已簽核 {{ formatTWD(totals.approved_paid_amount || 0) }} ·
          待簽核 {{ formatTWD(totals.pending_paid_amount || 0) }} ·
          非 POS {{ formatTWD(totals.offline_paid_amount || 0) }}
        </small>
      </div>
      <div class="pos-semester__banner-arrow">→</div>
      <div class="pos-semester__banner-item">
        <span>老闆已簽收</span>
        <strong>{{ formatTWD(totals.signoff_total || 0) }}</strong>
      </div>
      <div class="pos-semester__banner-badges">
        <el-tag v-if="(totals.outstanding_amount || 0) > 0" type="danger">
          未收 {{ formatTWD(totals.outstanding_amount || 0) }}
        </el-tag>
        <el-tag v-if="(totals.unsigned_gap || 0) > 0" type="warning">
          未簽收 {{ formatTWD(totals.unsigned_gap || 0) }}
        </el-tag>
        <el-tag v-if="(totals.unsigned_gap || 0) < 0" type="warning">
          簽收超過 POS 實收 {{ formatTWD(Math.abs(totals.unsigned_gap || 0)) }}（可能含非 POS 現金）
        </el-tag>
        <el-tag v-if="isBalanced" type="success" effect="dark">✓ 本期已對平</el-tag>
      </div>
    </div>

    <el-alert
      v-if="(totals.pending_review_count || 0) > 0"
      type="warning"
      :closable="false"
      show-icon
      class="pos-semester__pending-alert"
      @click="applyPendingFilter"
    >
      <template #title>
        待審核報名 {{ totals.pending_review_count }} 筆，待確認應收
        {{ formatTWD(totals.pending_review_amount || 0) }}（未計入上方應收）——點此篩出名單
      </template>
    </el-alert>

    <POSSignoffLedger
      :school-year="termStore.school_year"
      :semester="termStore.semester"
      :pos-net-paid="(totals.approved_paid_amount || 0) + (totals.pending_paid_amount || 0)"
      @changed="reload"
    />

    <el-collapse class="pos-semester__detail-collapse">
      <el-collapse-item title="詳細數字" name="stats">
        <div v-if="truncated" class="pos-semester__stats-caption">
          以下為部分合計（已載入 {{ items.length }} / {{ totalActive }} 筆）
        </div>
        <div class="pos-semester__stats">
          <StatCard
            label="報名筆數"
            :value="String(totals.registration_count || 0)"
            :icon="Tickets"
            color="info"
            variant="filled"
          />
          <StatCard
            label="應繳"
            :value="formatTWD(totals.total_amount || 0)"
            :icon="Wallet"
            color="primary"
            variant="filled"
          />
          <StatCard
            label="已繳"
            :value="formatTWD(totals.paid_amount || 0)"
            :icon="Money"
            color="success"
            variant="filled"
          />
          <StatCard
            label="欠款"
            :value="formatTWD(totals.outstanding_amount || 0)"
            :icon="Warning"
            color="danger"
            variant="filled"
          />
          <StatCard
            label="已簽核金額"
            :value="formatTWD(totals.approved_paid_amount || 0)"
            :icon="CircleCheck"
            color="success"
            variant="filled"
          />
          <StatCard
            label="待簽核金額"
            :value="formatTWD(totals.pending_paid_amount || 0)"
            :icon="Clock"
            color="warning"
            variant="filled"
          />
          <StatCard
            label="非 POS 已繳"
            :value="formatTWD(totals.offline_paid_amount || 0)"
            :icon="Finished"
            color="info"
            variant="filled"
          />
        </div>
        <div v-if="(totals.offline_paid_amount || 0) > 0" class="pos-semester__hint">
          「非 POS 已繳」：直接寫入 paid_amount 但無對應收款紀錄的金額（多為歷史匯入），
          無法判斷簽核狀態。可執行 <code>scripts/backfill_import_payments.py</code> 補齊後即可納入簽核流程。
        </div>
      </el-collapse-item>
      <el-collapse-item title="退課/加報記錄" name="changes">
        <POSRegChangesTimeline
          :school-year="termStore.school_year"
          :semester="termStore.semester"
        />
      </el-collapse-item>
    </el-collapse>

    <el-empty
      v-if="!loading && items.length === 0"
      description="本學期沒有符合條件的報名"
      :image-size="60"
    />

    <!-- 逐學生清單：依班級分組，待審核/未分班群組置頂（③學期對帳改造，2026-08-16） -->
    <el-collapse v-else v-model="activeGroupKeys" class="pos-semester__groups">
      <el-collapse-item
        v-for="g in groups"
        :key="g.key"
        :name="g.key"
        :class="{ 'pos-semester__group--pending': g.pending }"
      >
        <template #title>
          <span class="pos-semester__group-title">
            <strong>{{ g.label }}</strong>
            <span class="pos-semester__group-count">{{ g.items.length }} 人</span>
            <span class="pos-semester__group-sub">
              應繳 {{ formatTWD(g.subtotal.total) }} · 已繳 {{ formatTWD(g.subtotal.paid) }} ·
              欠 {{ formatTWD(g.subtotal.owed) }}
              <template v-if="g.subtotal.pending > 0">
                · 待確認 {{ formatTWD(g.subtotal.pending) }}
              </template>
            </span>
          </span>
        </template>

        <el-table :data="g.items" size="small" :max-height="480" stripe>
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="pos-semester__expand">
                <div class="pos-semester__expand-row">
                  <span>已簽核金額</span>
                  <strong class="pos-semester__text--success">
                    {{ formatTWD(row.approved_paid_amount) }}
                  </strong>
                </div>
                <div class="pos-semester__expand-row">
                  <span>待簽核金額</span>
                  <strong class="pos-semester__text--warning">
                    {{ formatTWD(row.pending_paid_amount) }}
                  </strong>
                </div>
                <div
                  v-if="row.offline_paid_amount > 0"
                  class="pos-semester__expand-row"
                >
                  <span>非 POS 已繳</span>
                  <strong class="pos-semester__text--muted">
                    {{ formatTWD(row.offline_paid_amount) }}
                  </strong>
                </div>
                <div class="pos-semester__expand-row">
                  <span>最後繳費日</span>
                  <strong>{{ row.latest_payment_date || '—' }}</strong>
                </div>
                <div class="pos-semester__expand-row" v-if="row.course_names?.length">
                  <span>課程</span>
                  <span>{{ row.course_names.join('、') }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="學生" prop="student_name" min-width="140" sortable>
            <template #default="{ row }">
              <span>{{ row.student_name }}</span>
              <el-tag
                v-if="row.is_active === false"
                size="small"
                type="info"
                effect="plain"
                class="pos-semester__inactive-tag"
              >
                已離園
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="課程" min-width="160">
            <template #default="{ row }">
              <span v-if="row.course_names?.length">
                {{ row.course_names.join('、') }}
              </span>
              <span v-else class="pos-semester__text--muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="應繳" width="100" align="right" sortable prop="total_amount">
            <template #default="{ row }">{{ formatTWD(row.total_amount) }}</template>
          </el-table-column>
          <el-table-column label="已繳" width="100" align="right" sortable prop="paid_amount">
            <template #default="{ row }">{{ formatTWD(row.paid_amount) }}</template>
          </el-table-column>
          <el-table-column label="欠款" width="100" align="right" sortable prop="owed">
            <template #default="{ row }">
              <span :class="row.owed > 0 ? 'pos-semester__text--danger' : ''">
                {{ formatTWD(row.owed) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="待確認" width="100" align="right" sortable prop="pending_amount">
            <template #default="{ row }">
              <span v-if="row.pending_amount > 0" class="pos-semester__text--warning">
                {{ formatTWD(row.pending_amount) }}
              </span>
              <span v-else class="pos-semester__text--muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="繳費狀態" width="100">
            <template #default="{ row }">
              <el-tag
                :type="(PAYMENT_STATUS_TAG_TYPE[row.payment_status] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger'"
                size="small"
              >
                {{ PAYMENT_STATUS_LABEL[row.payment_status] || row.payment_status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="簽核狀態" width="110">
            <template #default="{ row }">
              <el-tag
                :type="(APPROVAL_STATUS_TAG_TYPE[row.approval_status] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger'"
                size="small"
              >
                {{ APPROVAL_STATUS_LABEL[row.approval_status] || row.approval_status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="比對狀態" width="100">
            <template #default="{ row }">
              <el-tag
                :type="(MATCH_STATUS_TAG_TYPE[row.match_status] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger'"
                size="small"
                :effect="row.match_status === 'matched' ? 'plain' : 'light'"
              >
                {{ MATCH_STATUS_LABEL_SHORT[row.match_status] || row.match_status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最後繳費日" width="110" prop="latest_payment_date">
            <template #default="{ row }">
              {{ row.latest_payment_date || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="報名時間" width="160" sortable prop="created_at">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Finished,
  Money,
  RefreshRight,
  Tickets,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'

import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import StatCard from '@/components/common/StatCard.vue'
import POSSignoffLedger from '@/components/activity/POSSignoffLedger.vue'
import POSRegChangesTimeline from '@/components/activity/POSRegChangesTimeline.vue'
import { getClassrooms } from '@/api/classrooms'
import { getPOSSemesterReconciliation } from '@/api/activity'
import {
  groupReconciliationItems,
  type ReconItem,
} from '@/composables/useSemesterReconGroups'
import {
  APPROVAL_STATUS_LABEL as _APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TAG_TYPE as _APPROVAL_STATUS_TAG_TYPE,
  MATCH_STATUS_LABEL_SHORT as _MATCH_STATUS_LABEL_SHORT,
  MATCH_STATUS_TAG_TYPE as _MATCH_STATUS_TAG_TYPE,
  PAYMENT_STATUS_LABEL as _PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TAG_TYPE as _PAYMENT_STATUS_TAG_TYPE,
} from '@/constants/activity'

const APPROVAL_STATUS_LABEL = _APPROVAL_STATUS_LABEL as Record<string, string>
const APPROVAL_STATUS_TAG_TYPE = _APPROVAL_STATUS_TAG_TYPE as Record<string, string>
const PAYMENT_STATUS_LABEL = _PAYMENT_STATUS_LABEL as Record<string, string>
const PAYMENT_STATUS_TAG_TYPE = _PAYMENT_STATUS_TAG_TYPE as Record<string, string>
const MATCH_STATUS_LABEL_SHORT = _MATCH_STATUS_LABEL_SHORT as Record<string, string>
const MATCH_STATUS_TAG_TYPE = _MATCH_STATUS_TAG_TYPE as Record<string, string>
import { formatTWD } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

const termStore = useAcademicTermStore()

const loading = ref<boolean>(false)
const items = ref<Record<string, unknown>[]>([])
const totals = ref<{
  registration_count?: number
  total_amount?: number
  paid_amount?: number
  outstanding_amount?: number
  approved_paid_amount?: number
  pending_paid_amount?: number
  offline_paid_amount?: number
  signoff_total?: number
  unsigned_gap?: number
  pending_review_count?: number
  pending_review_amount?: number
  [key: string]: unknown
}>({})
const classroomOptions = ref<string[]>([])
// High（2026-06-24 code review）：後端在報名數超過單次查詢上限時回 truncated=true
// + total_active（母體總數），此時 items / totals 只是「已載入筆數的部分合計」。
// 必須保存並顯示，否則對帳者會把部分合計誤當全學期總計而靜默少算。
const truncated = ref<boolean>(false)
const totalActive = ref<number>(0)
// 請求序號守衛（2026-06-29 audit F3）：切學期 / 快速切篩選會連發 reload，較慢回應的
// 舊請求不得最後覆寫較新請求的 items/totals/truncated/totalActive（否則選擇器顯示新
// 學期、金額卻屬舊學期）。僅最新 seq 的回應（成功或失敗）能寫入狀態。
let reloadSeq = 0

const filters = reactive<{
  classroom_name: string
  payment_status: string
  approval_status: string
  review_status: string
}>({
  classroom_name: '',
  payment_status: '',
  approval_status: '',
  review_status: '',
})

// 班級分組（③學期對帳改造，2026-08-16）：待審核/未分班群組置頂，預設展開。
const groups = computed(() => groupReconciliationItems(items.value as ReconItem[]))
const activeGroupKeys = ref<string[]>([])
watch(groups, (next) => {
  activeGroupKeys.value = next.map((g) => g.key)
})

const isBalanced = computed(
  () =>
    (totals.value.outstanding_amount || 0) === 0 &&
    (totals.value.unsigned_gap || 0) === 0 &&
    (totals.value.pending_review_count || 0) === 0 &&
    items.value.length > 0
)

function applyPendingFilter() {
  filters.review_status = 'pending'
  reload()
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-Hant', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  })
}

async function reload() {
  const seq = ++reloadSeq
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      school_year: termStore.school_year,
      semester: termStore.semester,
    }
    if (filters.classroom_name) params.classroom_name = filters.classroom_name
    if (filters.payment_status) params.payment_status = filters.payment_status
    if (filters.approval_status) params.approval_status = filters.approval_status
    if (filters.review_status) params.review_status = filters.review_status
    const res = await getPOSSemesterReconciliation(params)
    // 較新請求已發出 → 丟棄本（過時）回應，不覆寫狀態
    if (seq !== reloadSeq) return
    const resData = res.data as {
      items?: Record<string, unknown>[]
      totals?: Record<string, unknown>
      truncated?: boolean
      total_active?: number
    }
    items.value = resData?.items || []
    totals.value = resData?.totals || {}
    truncated.value = resData?.truncated === true
    totalActive.value = resData?.total_active ?? items.value.length
  } catch (err) {
    if (seq !== reloadSeq) return
    items.value = []
    totals.value = {}
    truncated.value = false
    totalActive.value = 0
    const axiosErr = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '讀取學期對帳失敗')
  } finally {
    if (seq === reloadSeq) loading.value = false
  }
}

// review P3（2026-07-12）：加請求序號守衛（與同檔 reload 的 reloadSeq 同理）。切學期時
// watch 會重載班級選項，較慢的舊學期回應可最後覆寫 → 篩選顯示舊學期班級。過期回應丟棄。
let classroomOptionsSeq = 0
async function loadClassroomOptions() {
  const seq = ++classroomOptionsSeq
  try {
    const res = await getClassrooms({
      school_year: termStore.school_year,
      semester: termStore.semester,
    } as Parameters<typeof getClassrooms>[0])
    if (seq !== classroomOptionsSeq) return
    const resData = res.data as { items?: { name?: string }[] } | { name?: string }[] | null
    const rows = (resData as { items?: { name?: string }[] })?.items ?? (resData as { name?: string }[]) ?? []
    classroomOptions.value = rows.map((c: { name?: string }) => c.name).filter((n): n is string => !!n)
  } catch {
    if (seq !== classroomOptionsSeq) return
    classroomOptions.value = []
  }
}

watch(
  () => [termStore.school_year, termStore.semester],
  () => {
    filters.classroom_name = ''
    filters.payment_status = ''
    filters.approval_status = ''
    filters.review_status = ''
    loadClassroomOptions()
    reload()
  }
)

onMounted(() => {
  loadClassroomOptions()
  reload()
})
</script>

<style scoped>
.pos-semester {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pos-semester__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.pos-semester__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.pos-semester__filter {
  width: 160px;
}

.pos-semester__banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
}

.pos-semester__banner.is-balanced {
  border-color: var(--color-success-soft, #d1fadf);
  background: var(--color-success-soft, #ecfdf3);
}

.pos-semester__banner-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pos-semester__banner-item span {
  font-size: 12px;
  color: var(--text-secondary);
}

.pos-semester__banner-item strong {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.pos-semester__banner-item small {
  font-size: 11px;
  color: var(--text-tertiary);
}

.pos-semester__banner-arrow {
  color: var(--text-tertiary);
  font-size: 18px;
}

.pos-semester__banner-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.pos-semester__pending-alert {
  cursor: pointer;
}

.pos-semester__detail-collapse {
  border: none;
}

.pos-semester__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.pos-semester__hint {
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  border-radius: 4px;
  margin-top: 10px;
}

.pos-semester__trunc-warn {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-danger-hover, #b42318);
  background: var(--color-danger-soft, #fef3f2);
  border: 1px solid var(--color-danger-soft, #fee4e2);
  padding: 10px 14px;
  border-radius: 6px;
}

.pos-semester__stats-caption {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-warning-hover, #b54708);
  margin-bottom: -4px;
}

.pos-semester__hint code {
  background: #e2e8f0;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.pos-semester__groups {
  border: none;
}

.pos-semester__group--pending :deep(.el-collapse-item__header) {
  background: var(--color-danger-soft, #fef3f2);
}

.pos-semester__group-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.pos-semester__group-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.pos-semester__group-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}

.pos-semester__expand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 32px;
  font-size: 13px;
  color: var(--neutral-600);
}

.pos-semester__expand-row {
  display: flex;
  justify-content: space-between;
  max-width: 420px;
}

.pos-semester__text--success {
  color: var(--color-success-hover);
}

.pos-semester__text--warning {
  color: var(--color-warning-hover);
}

.pos-semester__text--danger {
  color: var(--color-danger-hover);
  font-weight: 600;
}

.pos-semester__text--muted {
  color: var(--text-tertiary);
}

.pos-semester__inactive-tag {
  margin-left: 6px;
}

</style>
