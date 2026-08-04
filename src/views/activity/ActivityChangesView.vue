<template>
  <div class="activity-changes">
    <div class="toolbar">
      <h2>{{ PAGE_TERMS.activityChanges }}</h2>
      <el-button @click="fetchList">重新整理</el-button>
    </div>

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
        placeholder="操作者"
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
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column label="學生姓名" prop="student_name" width="100" />
      <el-table-column label="變更類型" prop="change_type" width="120" />
      <el-table-column label="描述" prop="description" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作者" prop="changed_by" width="100" />
      <el-table-column label="時間" min-width="130">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
    </el-table>

    <el-pagination
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getChanges, getChangesMeta } from '@/api/activity'
import { formatActivityDate } from '@/utils/format'
import { PAGE_TERMS } from '@/constants/moduleTerms'

const list = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const changeTypes = ref<string[]>([])
let fetchSeq = 0

const filters = reactive({
  studentName: '',
  changeType: '',
  changedBy: '',
})
const dateRange = ref<[string, string] | null>(null)

async function fetchList() {
  const seq = ++fetchSeq
  loading.value = true
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
    const data = res.data as { items: Record<string, unknown>[]; total: number }
    list.value = data.items
    total.value = data.total
  } catch (e) {
    if (seq === fetchSeq) ElMessage.error(friendlyError('載入異動紀錄失敗', e))
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
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
</style>
