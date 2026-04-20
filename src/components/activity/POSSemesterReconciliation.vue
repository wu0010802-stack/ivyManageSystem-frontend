<template>
  <div class="pos-semester" v-loading="loading">
    <div class="pos-semester__head">
      <AcademicTermSelector />
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
            :type="PAYMENT_STATUS_TAG_TYPE[row.payment_status] || 'info'"
            size="small"
          >
            {{ PAYMENT_STATUS_LABEL[row.payment_status] || row.payment_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="簽核狀態" width="110">
        <template #default="{ row }">
          <el-tag
            :type="APPROVAL_STATUS_TAG_TYPE[row.approval_status] || 'info'"
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

<script setup>
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
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TAG_TYPE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TAG_TYPE,
} from '@/constants/activity'
import { formatTWD } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

const termStore = useAcademicTermStore()

const loading = ref(false)
const items = ref([])
const totals = ref({})
const classroomOptions = ref([])

const filters = reactive({
  classroom_name: '',
  payment_status: '',
  approval_status: '',
})

function formatDate(iso) {
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
  loading.value = true
  try {
    const params = {
      school_year: termStore.school_year,
      semester: termStore.semester,
    }
    if (filters.classroom_name) params.classroom_name = filters.classroom_name
    if (filters.payment_status) params.payment_status = filters.payment_status
    if (filters.approval_status) params.approval_status = filters.approval_status
    const res = await getPOSSemesterReconciliation(params)
    items.value = res.data?.items || []
    totals.value = res.data?.totals || {}
  } catch (err) {
    items.value = []
    totals.value = {}
    ElMessage.error(err?.response?.data?.detail || '讀取學期對帳失敗')
  } finally {
    loading.value = false
  }
}

async function loadClassroomOptions() {
  try {
    const res = await getClassrooms({
      school_year: termStore.school_year,
      semester: termStore.semester,
      is_active: true,
    })
    const rows = res.data?.items || res.data || []
    classroomOptions.value = rows.map((c) => c.name).filter(Boolean)
  } catch {
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

.pos-semester__hint {
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border-left: 3px solid #94a3b8;
  padding: 8px 12px;
  border-radius: 4px;
}

.pos-semester__hint code {
  background: #e2e8f0;
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
  color: #475569;
}

.pos-semester__expand-row {
  display: flex;
  justify-content: space-between;
  max-width: 420px;
}

.pos-semester__text--success {
  color: #059669;
}

.pos-semester__text--warning {
  color: #d97706;
}

.pos-semester__text--danger {
  color: #dc2626;
  font-weight: 600;
}

.pos-semester__text--muted {
  color: #94a3b8;
}

.pos-semester__inactive-tag {
  margin-left: 6px;
}

</style>
