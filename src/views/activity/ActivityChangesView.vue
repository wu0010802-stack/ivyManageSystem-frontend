<template>
  <div class="activity-changes">
    <div class="toolbar">
      <h2>報名修改紀錄</h2>
      <el-button @click="fetchList">重新整理</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column label="學生姓名" prop="student_name" width="100" />
      <el-table-column label="變更類型" prop="change_type" width="120" />
      <el-table-column label="描述" prop="description" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作者" prop="changed_by" width="100" />
      <el-table-column label="時間" min-width="130">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getChanges } from '@/api/activity'

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

async function fetchList() {
  loading.value = true
  try {
    const res = await getChanges({
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    })
    list.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

function formatDate(str) {
  if (!str) return '-'
  return str.replace('T', ' ').substring(0, 16)
}

onMounted(fetchList)
</script>

<style scoped>
.activity-changes { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
</style>
