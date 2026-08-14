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
        <el-button size="small" :icon="RefreshRight" @click="reload">
          重新整理
        </el-button>
      </div>
    </div>

    <div v-if="truncated" class="pos-semester__trunc-warn" role="alert">
      ⚠ 報名筆數超過系統單次查詢上限，目前僅載入 {{ items.length }} 筆 / 全學期共
      {{ totalActive }} 筆。以下統計卡為「目前載入筆數的部分合計」，<strong>並非全學期總計</strong>；
      請以班級／繳費／簽核狀態篩選縮小範圍後再逐段對帳，以免漏算。
    </div>

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

    <el-empty
      v-if="!loading && items.length === 0"
      description="本學期沒有符合條件的報名"
      :image-size="60"
    />
    <el-table
      v-else
      :data="items"
      size="small"
      :max-height="520"
      stripe
    >
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
      <el-table-column label="班級" prop="class_name" width="90" sortable />
      <el-table-column label="課程" min-width="180">
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
      <el-table-column label="最後繳費日" width="110" prop="latest_payment_date">
        <template #default="{ row }">
          {{ row.latest_payment_date || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="報名時間" width="160" sortable prop="created_at">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
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
import { getClassrooms } from '@/api/classrooms'
import { getPOSSemesterReconciliation } from '@/api/activity'
import {
  APPROVAL_STATUS_LABEL as _APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TAG_TYPE as _APPROVAL_STATUS_TAG_TYPE,
  PAYMENT_STATUS_LABEL as _PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TAG_TYPE as _PAYMENT_STATUS_TAG_TYPE,
} from '@/constants/activity'

const APPROVAL_STATUS_LABEL = _APPROVAL_STATUS_LABEL as Record<string, string>
const APPROVAL_STATUS_TAG_TYPE = _APPROVAL_STATUS_TAG_TYPE as Record<string, string>
const PAYMENT_STATUS_LABEL = _PAYMENT_STATUS_LABEL as Record<string, string>
const PAYMENT_STATUS_TAG_TYPE = _PAYMENT_STATUS_TAG_TYPE as Record<string, string>
import { formatTWD } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

const termStore = useAcademicTermStore()

const loading = ref<boolean>(false)
const items = ref<Record<string, unknown>[]>([])
const totals = ref<{ offline_paid_amount?: number; [key: string]: unknown }>({})
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
}>({
  classroom_name: '',
  payment_status: '',
  approval_status: '',
})

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

.pos-semester__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

/* 原本寫死淺色 hex，深色模式下是淺底＋翻轉後的近白字＝看不見。
   改走已為 dark 翻好的 alias（light 值與原 hex 幾乎相同，亮模式外觀不變）。 */
.pos-semester__hint {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-color-soft);
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  border-radius: 4px;
}

.pos-semester__trunc-warn {
  font-size: 13px;
  line-height: 1.6;
  /* 這是「資料截斷可能漏算」的警告，深色下最不能失效：*-hover 是互動態 token，
     a11y.css 的 html.dark 刻意沒翻（多處拿它當背景／邊框），疊深底僅 2.5–3.6:1。
     *-darker 才是 dark 已翻成亮階的高對比文字色。 */
  color: var(--color-danger-darker, #b42318);
  background: var(--color-danger-soft, #fef3f2);
  border: 1px solid var(--color-danger-soft, #fee4e2);
  padding: 10px 14px;
  border-radius: 6px;
}

.pos-semester__stats-caption {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-warning-darker, #b54708);
  margin-bottom: -4px;
}

.pos-semester__hint code {
  background: var(--neutral-200);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
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
  color: var(--color-success-darker);
}

.pos-semester__text--warning {
  color: var(--color-warning-darker);
}

.pos-semester__text--danger {
  color: var(--color-danger-darker);
  font-weight: 600;
}

.pos-semester__text--muted {
  color: var(--text-tertiary);
}

.pos-semester__inactive-tag {
  margin-left: 6px;
}

</style>
