<template>
  <div class="activity-changes" :class="{ 'activity-changes--embedded': embedded }">
    <!-- embedded：由 ActivityRegistrationHubView 以「異動紀錄」頁籤嵌入，頁首標題由 hub 提供，
         這裡只留說明文字＋重新整理（後台 IA 重整 M4）。獨立掛載（預設）行為不變。 -->
    <div v-if="embedded" class="changes-embedded-bar">
      <p class="changes-embedded-bar__hint">{{ SUBTITLE }}</p>
      <el-button :loading="loading" @click="fetchList">重新整理</el-button>
    </div>
    <PageHeader v-else :title="PAGE_TERMS.activityChanges" :subtitle="SUBTITLE">
      <template #actions>
        <el-button :loading="loading" @click="fetchList">重新整理</el-button>
      </template>
    </PageHeader>

    <div class="filters">
      <el-input
        v-model="filters.studentName"
        placeholder="學生姓名"
        clearable
        style="width: 140px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select
        v-model="filters.changeType"
        placeholder="異動類型"
        clearable
        style="width: 160px"
        @change="search"
      >
        <el-option v-for="t in changeTypes" :key="t" :label="t" :value="t" />
      </el-select>
      <el-input
        v-model="filters.changedBy"
        placeholder="操作者帳號"
        clearable
        style="width: 140px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        unlink-panels
        range-separator="至"
        start-placeholder="起始日"
        end-placeholder="結束日"
        value-format="YYYY-MM-DD"
        style="width: 260px"
        @change="search"
      />
      <el-button type="primary" @click="search">查詢</el-button>
      <el-button v-if="hasActiveFilters" @click="resetFilters">清除條件</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <template #empty>
        <EmptyState
          v-if="loadError"
          variant="error"
          title="異動紀錄載入失敗"
          :description="loadError"
        >
          <template #action>
            <el-button type="primary" @click="fetchList">重試</el-button>
          </template>
        </EmptyState>
        <EmptyState
          v-else-if="hasActiveFilters"
          variant="inline"
          title="沒有符合條件的異動紀錄"
          description="試著放寬日期範圍，或清除條件後再查。"
        >
          <template #action>
            <el-button @click="resetFilters">清除條件</el-button>
          </template>
        </EmptyState>
        <EmptyState
          v-else-if="!loading"
          variant="inline"
          title="目前還沒有報名異動"
          description="報名被加退課、改繳費狀態或刪除時，會自動記在這裡。"
        />
      </template>
      <el-table-column label="學生姓名" min-width="110">
        <template #default="{ row }">
          <el-button
            v-if="row.registration_id"
            link
            type="primary"
            :aria-label="`打開 ${row.student_name} 的報名詳情`"
            @click="openRegistration(row)"
          >{{ row.student_name }}</el-button>
          <span v-else :title="'這筆報名已不存在，無法開啟'">{{ row.student_name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="異動類型" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="changeTagType(row.change_type)" effect="plain">{{ row.change_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="內容" prop="description" min-width="220" show-overflow-tooltip />
      <el-table-column label="操作者" width="110">
        <template #default="{ row }">{{ row.changed_by || '系統' }}</template>
      </el-table-column>
      <el-table-column label="時間" min-width="140">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 12px; justify-content: flex-end"
      @change="fetchList"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getChanges, getChangesMeta } from '@/api/activity'
import { formatActivityDate } from '@/utils/format'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

defineProps<{ embedded?: boolean }>()

const SUBTITLE =
  '才藝報名的加退課、繳費狀態、候補轉正、刪除等異動，誰在什麼時候改的都查得到。點學生姓名可直接打開那筆報名。'

interface ChangeRow {
  id: number
  student_name: string
  change_type: string
  description: string
  changed_by?: string | null
  created_at?: string | null
  registration_id?: number | null
}

const router = useRouter()
const list = ref<ChangeRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
// 非空＝最近一次載入失敗；空表格據此顯示「載入失敗＋重試」，不讓失敗看起來像「沒有資料」
const loadError = ref('')
const changeTypes = ref<string[]>([])
let fetchSeq = 0

const filters = reactive({
  studentName: '',
  changeType: '',
  changedBy: '',
})
const dateRange = ref<[string, string] | null>(null)

const hasActiveFilters = computed(() =>
  Boolean(filters.studentName || filters.changeType || filters.changedBy || dateRange.value?.[0]),
)

// 退課、刪除、拒絕、放棄候補這類「拿掉東西」的異動標紅，其餘中性；類型清單由後端 meta 提供，比對關鍵字不寫死全集
function changeTagType(type: string): 'danger' | 'info' {
  return /退|刪|移除|拒絕|放棄/.test(type) ? 'danger' : 'info'
}

function openRegistration(row: ChangeRow) {
  router?.push({ path: '/activity/registrations', query: { open: String(row.registration_id) } })
}

async function fetchList() {
  const seq = ++fetchSeq
  loading.value = true
  loadError.value = ''
  try {
    // 空字串不送出，避免後端把 "" 當成有效篩選值
    const res = await getChanges({
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
      ...(filters.studentName ? { student_name: filters.studentName } : {}),
      ...(filters.changeType ? { change_type: filters.changeType } : {}),
      ...(filters.changedBy ? { changed_by: filters.changedBy } : {}),
      ...(dateRange.value?.[0] ? { date_from: dateRange.value[0] } : {}),
      ...(dateRange.value?.[1] ? { date_to: dateRange.value[1] } : {}),
    })
    if (seq !== fetchSeq) return
    const data = res.data as { items: ChangeRow[]; total: number }
    list.value = data.items
    total.value = data.total
  } catch (e) {
    if (seq === fetchSeq) {
      const msg = friendlyError('載入異動紀錄失敗', e)
      list.value = []
      total.value = 0
      loadError.value = msg
      ElMessage.error(msg)
    }
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

function search() {
  // 換條件必回第一頁，否則會停在舊頁碼看到空清單
  page.value = 1
  fetchList()
}

function resetFilters() {
  filters.studentName = ''
  filters.changeType = ''
  filters.changedBy = ''
  dateRange.value = null
  search()
}

async function fetchChangeTypes() {
  try {
    const res = await getChangesMeta()
    changeTypes.value = (res.data as { change_types: string[] }).change_types
  } catch {
    // 下拉選項載入失敗不擋主清單，維持可用（改用手動輸入其他條件）
    changeTypes.value = []
  }
}

onMounted(() => {
  fetchList()
  fetchChangeTypes()
})
</script>

<style scoped>
.activity-changes { padding: 16px; }
.activity-changes--embedded { padding: 0; }
.changes-embedded-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.changes-embedded-bar__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
</style>
