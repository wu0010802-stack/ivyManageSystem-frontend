<template>
  <div class="portal-survey-list">
    <PortalPageHeader title="活動調查" />

    <!-- 桌機表格；手機用卡片（4 欄含長標題在 390px 會橫向捲，P2-06） -->
    <el-table v-if="!isMobile" :data="rows" v-loading="loading" border @row-click="onRowClick">
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

    <AdminListCards
      v-else
      :items="rows as unknown as Record<string, unknown>[]"
      :columns="surveyCardColumns"
      row-key="id"
      :loading="loading"
      empty-text="尚無調查資料"
      clickable
      @row-click="(item) => onRowClick(item as unknown as Row)"
    >
      <template #title="{ item }">{{ item.title }}</template>
      <template #cell-status="{ item }">
        <el-tag :type="statusTagType(item.status as string)" size="small">
          {{ statusLabel(item.status as string) }}
        </el-tag>
      </template>
    </AdminListCards>
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
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

interface Row {
  id: number
  title: string
  event_date: string | null
  reply_deadline: string
  status: string
  fee_note: string | null
}

const { isMobile } = useIsMobile()

const surveyCardColumns = [
  { label: '活動日', prop: 'event_date', formatter: (i: Record<string, unknown>) => i.event_date ?? '-' },
  { label: '回覆截止', prop: 'reply_deadline' },
  { label: '狀態', prop: 'status' },   // tag → #cell-status
]

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
