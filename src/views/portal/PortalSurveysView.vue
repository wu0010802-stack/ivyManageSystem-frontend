<template>
  <div class="portal-survey-list">
    <PortalPageHeader title="活動調查" />

    <el-table :data="rows" v-loading="loading" border @row-click="onRowClick">
      <template #empty>
        <EmptyState variant="inline" title="尚無調查資料" />
      </template>
      <el-table-column label="標題" prop="title" min-width="160" />
      <el-table-column label="活動日" width="110">
        <template #default="{ row }">{{ row.event_date ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="回覆截止" prop="reply_deadline" width="110" />
      <el-table-column label="狀態" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listPortalSurveys } from '@/api/surveys'
import { friendlyError } from '@/utils/errorMessages'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface Row {
  id: number
  title: string
  event_date: string | null
  reply_deadline: string
  status: string
  fee_note: string | null
}

const rows = ref<Row[]>([])
const loading = ref(false)
const router = useRouter()

function statusLabel(status: string): string {
  if (status === 'published') return '進行中'
  if (status === 'closed') return '已結束'
  return status
}

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'published') return 'success'
  if (status === 'closed') return 'warning'
  return 'info'
}

async function fetchData() {
  loading.value = true
  try {
    const res = await listPortalSurveys()
    const data = res.data as unknown as { items?: Row[] }
    rows.value = data?.items ?? []
  } catch (e) {
    ElMessage.error(friendlyError('載入調查列表失敗', e))
  } finally {
    loading.value = false
  }
}

function onRowClick(row: Row) {
  router.push({ name: 'portal-survey-detail', params: { id: row.id } })
}

onMounted(fetchData)
</script>

<style scoped>
.portal-survey-list :deep(.el-table__row) {
  cursor: pointer;
}
</style>
