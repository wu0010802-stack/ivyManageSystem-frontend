<template>
  <div class="survey-list">
    <div class="toolbar">
      <el-tabs v-model="statusTab" @tab-change="fetchData">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="草稿" name="draft" />
        <el-tab-pane label="已發布" name="published" />
        <el-tab-pane label="已結束" name="closed" />
      </el-tabs>
      <el-button v-if="canWrite" type="primary" @click="router.push({ name: 'survey-new' })">建立調查</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border>
      <template #empty>
        <el-empty description="尚無調查資料" />
      </template>
      <el-table-column label="標題" prop="title" min-width="160" />
      <el-table-column label="活動日" prop="event_date" width="110">
        <template #default="{ row }">{{ row.event_date ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="回覆截止" prop="reply_deadline" width="110" />
      <el-table-column label="對象" width="90">
        <template #default="{ row }">{{ row.audience_type === 'all' ? '全園' : '指定班級' }}</template>
      </el-table-column>
      <el-table-column label="回覆進度" width="110">
        <template #default="{ row }">{{ row.replied_count }}/{{ row.denominator }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="router.push({ name: 'survey-detail', params: { id: row.id } })">詳情</el-button>
          <el-button
            v-if="canWrite && row.status !== 'closed'"
            size="small"
            @click="router.push({ name: 'survey-edit', params: { id: row.id } })"
          >編輯</el-button>
          <el-button v-if="canWrite && row.status === 'draft'" size="small" type="primary" @click="onPublish(row)">發布</el-button>
          <el-button v-if="canWrite && row.status === 'published'" size="small" @click="onClose(row)">結束</el-button>
          <el-button v-if="canWrite && row.status === 'draft'" size="small" type="danger" @click="onDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { closeSurvey, deleteSurvey, listSurveys, publishSurvey } from '@/api/surveys'
import { hasPermission } from '@/utils/auth'

interface Row {
  id: number
  title: string
  event_date: string | null
  reply_deadline: string
  audience_type: string
  status: string
  replied_count: number
  denominator: number
}

const rows = ref<Row[]>([])
const statusTab = ref('all')
const loading = ref(false)
const canWrite = hasPermission('SURVEYS_WRITE')
const router = useRouter()

function statusLabel(status: string): string {
  if (status === 'draft') return '草稿'
  if (status === 'published') return '已發布'
  if (status === 'closed') return '已結束'
  return status
}

function statusTagType(status: string): 'info' | 'success' | 'warning' {
  if (status === 'draft') return 'info'
  if (status === 'published') return 'success'
  return 'warning'
}

async function fetchData() {
  loading.value = true
  try {
    const res = await listSurveys(statusTab.value === 'all' ? undefined : { status: statusTab.value })
    const data = res.data as unknown as { items?: Row[] }
    rows.value = data?.items ?? []
  } finally {
    loading.value = false
  }
}

async function onPublish(row: Row) {
  await ElMessageBox.confirm(`發布「${row.title}」並推播給對象家長？`, '發布調查')
  await publishSurvey(row.id)
  ElMessage.success('已發布並推播')
  fetchData()
}

async function onClose(row: Row) {
  await ElMessageBox.confirm(`結束「${row.title}」調查？結束後將無法再收取回覆。`, '結束調查')
  await closeSurvey(row.id)
  ElMessage.success('調查已結束')
  fetchData()
}

async function onDelete(row: Row) {
  await ElMessageBox.confirm(`刪除「${row.title}」草稿？此動作無法復原。`, '刪除調查', { type: 'warning' })
  await deleteSurvey(row.id)
  ElMessage.success('已刪除')
  fetchData()
}

onMounted(fetchData)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
