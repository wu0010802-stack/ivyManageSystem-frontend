<template>
  <div class="activity-inquiries">
    <div class="toolbar">
      <h2>
        家長提問
        <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" style="margin-left: 8px" />
      </h2>
      <div class="filters">
        <el-select v-model="readFilter" placeholder="讀取狀態" clearable style="width: 130px" @change="fetchList">
          <el-option label="未讀" :value="false" />
          <el-option label="已讀" :value="true" />
        </el-select>
        <el-button @click="fetchList">重新整理</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column label="狀態" width="70" align="center">
        <template #default="{ row }">
          <el-badge v-if="!row.is_read" is-dot type="danger" />
          <el-icon v-else color="#94a3b8"><Check /></el-icon>
        </template>
      </el-table-column>
      <el-table-column label="姓名" prop="name" width="90" />
      <el-table-column label="電話" prop="phone" width="120" />
      <el-table-column label="問題" prop="question" min-width="200" show-overflow-tooltip />
      <el-table-column label="提問時間" min-width="130">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!row.is_read"
            size="small"
            type="primary"
            @click="handleMarkRead(row)"
          >標記已讀</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">刪除</el-button>
        </template>
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

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { getInquiries, markInquiryRead, deleteInquiry } from '@/api/activity'
import { useActivityStore } from '@/stores/activity'

const activityStore = useActivityStore()
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const readFilter = ref(null)

const unreadCount = computed(() => list.value.filter((i) => !i.is_read).length)

async function fetchList() {
  loading.value = true
  try {
    const params = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (readFilter.value !== null && readFilter.value !== undefined) {
      params.is_read = readFilter.value
    }
    const res = await getInquiries(params)
    list.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

async function handleMarkRead(row) {
  try {
    await markInquiryRead(row.id)
    row.is_read = true
    ElMessage.success('已標記為已讀')
    activityStore.fetchSummary({ force: true })
  } catch {
    ElMessage.error('操作失敗')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('確定要刪除此提問嗎？', '確認刪除', {
      type: 'warning',
      confirmButtonText: '確定刪除',
      confirmButtonClass: 'el-button--danger',
    })
    await deleteInquiry(row.id)
    ElMessage.success('已刪除')
    fetchList()
    activityStore.fetchSummary({ force: true })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('刪除失敗')
  }
}

function formatDate(str) {
  if (!str) return '-'
  return str.replace('T', ' ').substring(0, 16)
}

onMounted(fetchList)
</script>

<style scoped>
.activity-inquiries { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; display: flex; align-items: center; }
.filters { display: flex; gap: 8px; }
</style>
