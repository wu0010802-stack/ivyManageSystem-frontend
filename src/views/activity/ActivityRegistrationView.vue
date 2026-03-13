<template>
  <div class="activity-registrations">
    <div class="toolbar">
      <h2>報名管理</h2>
      <div class="filters">
        <el-input
          v-model="searchText"
          placeholder="搜尋學生/班級"
          clearable
          style="width: 200px"
          @change="fetchList"
        />
        <el-select v-model="paymentFilter" placeholder="付款狀態" clearable style="width: 130px" @change="fetchList">
          <el-option label="已繳費" value="paid" />
          <el-option label="未繳費" value="unpaid" />
        </el-select>
        <el-button @click="fetchList">搜尋</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column label="學生" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" min-width="80" />
      <el-table-column label="課程" prop="course_names" min-width="160" show-overflow-tooltip />
      <el-table-column label="繳費" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_paid ? 'success' : 'warning'" size="small">
            {{ row.is_paid ? '已繳費' : '未繳費' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="remark" min-width="100" show-overflow-tooltip />
      <el-table-column label="報名時間" min-width="140">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">詳情</el-button>
          <el-button
            size="small"
            type="danger"
            @click="handleDelete(row)"
          >刪除</el-button>
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

    <!-- 詳情抽屜 -->
    <el-drawer v-model="drawerVisible" title="報名詳情" size="560px" destroy-on-close>
      <div v-if="detail" class="detail-body">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="學生姓名">{{ detail.student_name }}</el-descriptions-item>
          <el-descriptions-item label="班級">{{ detail.class_name }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ detail.birthday }}</el-descriptions-item>
          <el-descriptions-item label="Email">{{ detail.email }}</el-descriptions-item>
          <el-descriptions-item label="報名時間" :span="2">{{ formatDate(detail.created_at) }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">付款狀態</div>
        <div class="payment-row">
          <el-tag :type="detail.is_paid ? 'success' : 'warning'">
            {{ detail.is_paid ? '已繳費' : '未繳費' }}
          </el-tag>
          <el-button
            size="small"
            @click="togglePayment"
            :loading="saving"
          >
            切換為{{ detail.is_paid ? '未繳費' : '已繳費' }}
          </el-button>
        </div>

        <div class="section-title">課程（總計：${{ detail.total_amount?.toLocaleString() }}）</div>
        <el-table :data="detail.courses" size="small" border>
          <el-table-column label="課程名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">{{ row.price ? `$${row.price}` : '-' }}</template>
          </el-table-column>
          <el-table-column label="狀態" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'enrolled' ? 'success' : 'info'" size="small">
                {{ row.status === 'enrolled' ? '正式' : '候補' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'waitlist'"
                size="small"
                type="primary"
                @click="handlePromote(row)"
                :loading="saving"
              >升正式</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="section-title">用品</div>
        <el-table :data="detail.supplies" size="small" border>
          <el-table-column label="用品名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">{{ row.price ? `$${row.price}` : '-' }}</template>
          </el-table-column>
        </el-table>

        <div class="section-title">備註</div>
        <div class="remark-row">
          <el-input v-model="remarkText" type="textarea" :rows="2" />
          <el-button size="small" @click="saveRemark" :loading="saving">儲存備註</el-button>
        </div>

        <div class="section-title">修改紀錄</div>
        <el-timeline>
          <el-timeline-item
            v-for="ch in detail.changes"
            :key="ch.id"
            :timestamp="formatDate(ch.created_at)"
          >
            <strong>{{ ch.change_type }}</strong>：{{ ch.description }}
            <span v-if="ch.changed_by" class="change-by">（{{ ch.changed_by }}）</span>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRegistrations, getRegistrationDetail,
  updatePayment, updateRemark, promoteWaitlist, deleteRegistration,
} from '@/api/activity'

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const searchText = ref('')
const paymentFilter = ref('')

const drawerVisible = ref(false)
const detail = ref(null)
const remarkText = ref('')
const saving = ref(false)

async function fetchList() {
  loading.value = true
  try {
    const res = await getRegistrations({
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
      search: searchText.value || undefined,
      payment_status: paymentFilter.value || undefined,
    })
    list.value = res.data.items
    total.value = res.data.total
  } catch (e) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

async function openDetail(row) {
  drawerVisible.value = true
  detail.value = null
  try {
    const res = await getRegistrationDetail(row.id)
    detail.value = res.data
    remarkText.value = res.data.remark || ''
  } catch {
    ElMessage.error('載入詳情失敗')
  }
}

async function togglePayment() {
  if (!detail.value) return
  saving.value = true
  try {
    await updatePayment(detail.value.id, { is_paid: !detail.value.is_paid })
    detail.value.is_paid = !detail.value.is_paid
    ElMessage.success('付款狀態已更新')
    fetchList()
  } catch {
    ElMessage.error('更新失敗')
  } finally {
    saving.value = false
  }
}

async function saveRemark() {
  if (!detail.value) return
  saving.value = true
  try {
    await updateRemark(detail.value.id, { remark: remarkText.value })
    detail.value.remark = remarkText.value
    ElMessage.success('備註已儲存')
  } catch {
    ElMessage.error('儲存失敗')
  } finally {
    saving.value = false
  }
}

async function handlePromote(course) {
  if (!detail.value) return
  saving.value = true
  try {
    await promoteWaitlist(detail.value.id, course.course_id)
    ElMessage.success('已升為正式報名')
    // 重新載入詳情
    const res = await getRegistrationDetail(detail.value.id)
    detail.value = res.data
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '升正式失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`確定要刪除「${row.student_name}」的報名資料嗎？`, '確認刪除', {
      type: 'warning',
      confirmButtonText: '確定刪除',
      confirmButtonClass: 'el-button--danger',
    })
    await deleteRegistration(row.id)
    ElMessage.success('已刪除')
    fetchList()
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
.activity-registrations { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }
.detail-body { padding: 0 4px; }
.section-title { font-weight: 600; margin: 16px 0 8px; font-size: 14px; color: #374151; }
.payment-row { display: flex; align-items: center; gap: 12px; }
.remark-row { display: flex; gap: 8px; align-items: flex-start; }
.change-by { color: #94a3b8; font-size: 12px; }
</style>
