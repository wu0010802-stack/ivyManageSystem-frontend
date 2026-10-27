<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listStudentLeaves } from '@/api/studentLeaves'
import { useAllClassroomStore } from '@/stores/classroomAll'
import { labelClassroomsByTerm, type ClassroomLike } from '@/utils/classroomTerm'
import { apiError } from '@/utils/error'
import { buildStudentProfileLink } from '@/utils/studentLinks'
import { useIsMobile } from '@/composables/useIsMobile'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
const STATUS_OPTIONS: { value: string; label: string; type: ElTagType }[] = [
  { value: 'approved', label: '已成立', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'info' },
]
const STATUS_MAP: Record<string, { value: string; label: string; type: ElTagType }> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]))

const { isMobile } = useIsMobile()

const filters = reactive<{ status: string; classroom_id: number | null; dateRange: string[]; q: string }>({
  status: 'approved',
  classroom_id: null,
  dateRange: [],
  q: '',
})
const loading = ref(false)
const loadError = ref(false)
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const classroomStore = useAllClassroomStore()
// 篩的是既有請假紀錄，其 classroom_id 不跟學期 → 班級清單必須跨學期，否則想篩的班不在下拉裡。
const classrooms = computed(() =>
  labelClassroomsByTerm(classroomStore.classrooms as ClassroomLike[]),
)

// 狀態只有兩種且必選一種（後端預設 approved），所以不給「全部」
const statusFilterGroups: FilterGroup[] = [
  { key: 'status', label: '狀態', options: STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value })) },
]
const toolbarFilterValues = computed(() => ({ status: filters.status }))
const onToolbarFilters = (v: Record<string, unknown>) => {
  filters.status = (v.status as string) || 'approved'
  handleSearch()
}

const hasActiveFilter = computed(() =>
  Boolean(filters.classroom_id) || filters.dateRange.length === 2 || Boolean(filters.q.trim()),
)

const leaveCardColumns = [
  { label: '假別', prop: 'leave_type' },
  { label: '期間', prop: '__period' },
  { label: '狀態', prop: '__status' },
  { label: '原因', prop: 'reason', block: true },
]

const fetchLeaves = async () => {
  loading.value = true
  loadError.value = false
  try {
    const params: {
      status: string
      skip: number
      limit: number
      classroom_id?: number
      start_date?: string
      end_date?: string
      q?: string
    } = {
      status: filters.status,
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filters.classroom_id) params.classroom_id = filters.classroom_id
    if (filters.dateRange.length === 2) {
      params.start_date = filters.dateRange[0]
      params.end_date = filters.dateRange[1]
    }
    if (filters.q.trim()) params.q = filters.q.trim()
    const res = await listStudentLeaves(params)
    items.value = res.data?.items || []
    total.value = res.data?.total ?? items.value.length
  } catch (error) {
    // 清空並標記失敗，畫面顯示錯誤態而不是「沒有請假紀錄」
    loadError.value = true
    items.value = []
    total.value = 0
    ElMessage.error(apiError(error, '載入學生請假紀錄失敗'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchLeaves()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchLeaves()
}

const resetFilters = () => {
  filters.classroom_id = null
  filters.dateRange = []
  filters.q = ''
  handleSearch()
}

// 姓名搜尋打字時延遲送出，避免每打一個字就打一次 API
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => filters.q, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(handleSearch, 300)
})

const formatDate = (s: unknown) => (s ? String(s).replace(/T.*/, '') : '')
const formatPeriod = (row: Record<string, unknown>) => {
  const start = formatDate(row.start_date)
  const end = formatDate(row.end_date)
  return start === end ? start : `${start} ~ ${end}`
}

const emptyTitle = computed(() => (hasActiveFilter.value ? '目前篩選條件下沒有請假紀錄' : '尚無請假紀錄'))

onMounted(() => {
  fetchLeaves()
  classroomStore.fetchClassrooms()
})
</script>

<template>
  <div class="student-leaves-list-view">
    <PageHeader
      title="學生請假紀錄"
      subtitle="家長端提交即自動成立，此頁僅供查閱。如需調整當日出席，請至「學生出席紀錄」。"
    >
      <template #actions>
        <el-button @click="$router.push('/student-attendance')">前往學生出席紀錄</el-button>
      </template>
    </PageHeader>

    <AdminListToolbar
      v-model:search="filters.q"
      search-placeholder="搜尋學生姓名"
      :filters="statusFilterGroups"
      :filter-values="toolbarFilterValues"
      :total="total"
      :shown="items.length"
      @update:filter-values="onToolbarFilters"
    >
      <template #actions>
        <el-select
          v-model="filters.classroom_id"
          clearable
          placeholder="全部班級"
          aria-label="篩選班級"
          class="filter-select"
          @change="handleSearch"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.label" :value="c.id" />
        </el-select>
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="請假期間起"
          end-placeholder="請假期間迄"
          value-format="YYYY-MM-DD"
          aria-label="篩選請假期間"
          class="filter-range"
          @change="handleSearch"
        />
        <el-button v-if="hasActiveFilter" @click="resetFilters">清除篩選</el-button>
      </template>
    </AdminListToolbar>

    <TableSkeleton v-if="loading && !items.length" :columns="6" />
    <EmptyState
      v-else-if="loadError"
      variant="error"
      title="學生請假紀錄載入失敗"
      description="請重新載入；在載入成功前請勿視為沒有請假。"
    >
      <template #action>
        <el-button type="primary" @click="fetchLeaves">重新載入</el-button>
      </template>
    </EmptyState>
    <template v-else>
      <el-table v-if="!isMobile" :data="items" v-loading="loading" stripe style="width: 100%;">
        <template #empty>
          <EmptyState
            :title="emptyTitle"
            :description="hasActiveFilter ? '試著調整班級、請假期間或姓名' : ''"
            variant="inline"
          />
        </template>
        <el-table-column label="學生" width="120">
          <template #default="{ row }">
            <router-link
              v-if="buildStudentProfileLink(row.student_id, 'records')"
              :to="buildStudentProfileLink(row.student_id, 'records')!"
              class="student-link"
            >{{ row.student_name }}</router-link>
            <span v-else>{{ row.student_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="假別" prop="leave_type" width="80" align="center" />
        <el-table-column label="期間" min-width="200">
          <template #default="{ row }">{{ formatPeriod(row) }}</template>
        </el-table-column>
        <el-table-column label="原因" prop="reason" min-width="200" show-overflow-tooltip />
        <el-table-column label="狀態" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_MAP[row.status]?.type || 'info'" size="small">
              {{ STATUS_MAP[row.status]?.label || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ row.created_at ? row.created_at.replace('T', ' ').slice(0, 16) : '' }}
          </template>
        </el-table-column>
      </el-table>
      <AdminListCards
        v-else
        :items="items"
        :columns="leaveCardColumns"
        row-key="id"
        :loading="loading"
        :empty-text="emptyTitle"
      >
        <template #title="{ item }">
          <router-link
            v-if="buildStudentProfileLink(item.student_id as number, 'records')"
            :to="buildStudentProfileLink(item.student_id as number, 'records')!"
            class="student-link"
          >{{ item.student_name }}</router-link>
          <span v-else>{{ item.student_name }}</span>
        </template>
        <template #cell-__period="{ item }">{{ formatPeriod(item) }}</template>
        <template #cell-__status="{ item }">
          <el-tag :type="STATUS_MAP[item.status as string]?.type || 'info'" size="small">
            {{ STATUS_MAP[item.status as string]?.label || item.status }}
          </el-tag>
        </template>
      </AdminListCards>

      <div v-if="total > pageSize" class="pagination-row">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.student-leaves-list-view {
  padding: 0;
}
.filter-select {
  width: 200px;
}
.filter-range {
  width: 280px;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.student-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.student-link:hover {
  text-decoration: underline;
}
</style>
