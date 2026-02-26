<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const loading = ref(false)
const pendingLeaves = ref([])
const pendingOvertimes = ref([])

const leaveTypeMap = {
  personal: { label: '事假', type: 'warning' },
  sick: { label: '病假', type: 'info' },
  menstrual: { label: '生理假', type: 'info' },
  annual: { label: '特休', type: 'success' },
  maternity: { label: '產假', type: 'success' },
  paternity: { label: '陪產假', type: 'success' },
  official: { label: '公假', type: 'success' },
  marriage: { label: '婚假', type: 'success' },
  bereavement: { label: '喪假', type: 'success' },
  prenatal: { label: '產檢假', type: 'success' },
  paternity_new: { label: '陪產檢及陪產假', type: 'success' },
  miscarriage: { label: '流產假', type: 'success' },
  family_care: { label: '家庭照顧假', type: 'warning' },
  parental_unpaid: { label: '育嬰留職停薪', type: 'info' },
}

const overtimeTypeMap = {
  weekday: { label: '平日', type: '' },
  weekend: { label: '假日', type: 'warning' },
  holiday: { label: '國定假日', type: 'danger' },
}

const money = (val) => {
  if (!val && val !== 0) return '-'
  return '$' + Number(val).toLocaleString()
}

const totalPending = computed(() => pendingLeaves.value.length + pendingOvertimes.value.length)

const fetchPendingLeaves = async () => {
  try {
    const res = await api.get('/leaves', { params: { status: 'pending' } })
    pendingLeaves.value = Array.isArray(res.data) ? res.data : []
  } catch {
    // silent
  }
}

const fetchPendingOvertimes = async () => {
  try {
    const res = await api.get('/overtimes', { params: { status: 'pending' } })
    pendingOvertimes.value = Array.isArray(res.data) ? res.data : []
  } catch {
    // silent
  }
}

const fetchAll = async () => {
  loading.value = true
  await Promise.all([fetchPendingLeaves(), fetchPendingOvertimes()])
  loading.value = false
}

const approveLeave = async (row, approved) => {
  try {
    await api.put(`/leaves/${row.id}/approve?approved=${approved}`)
    ElMessage.success(approved ? '請假已核准' : '請假已駁回')
    fetchPendingLeaves()
  } catch (error) {
    ElMessage.error('操作失敗')
  }
}

const approveOvertime = async (row, approved) => {
  try {
    await api.put(`/overtimes/${row.id}/approve?approved=${approved}`)
    ElMessage.success(approved ? '加班已核准' : '加班已駁回')
    fetchPendingOvertimes()
  } catch (error) {
    ElMessage.error('操作失敗')
  }
}

// ── 附件預覽 ──
const attachDialogVisible = ref(false)
const attachItems = ref([])
const attachLoading = ref(false)

const viewAttachments = async (row) => {
  attachItems.value = []
  attachDialogVisible.value = true
  attachLoading.value = true
  try {
    for (const filename of row.attachment_paths) {
      const res = await api.get(`/leaves/${row.id}/attachments/${filename}`, {
        responseType: 'blob',
      })
      const isImage = /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(filename)
      attachItems.value.push({
        name: filename,
        url: URL.createObjectURL(res.data),
        isImage,
      })
    }
  } catch {
    ElMessage.error('載入附件失敗')
  } finally {
    attachLoading.value = false
  }
}

const closeAttachDialog = () => {
  attachItems.value.forEach(a => URL.revokeObjectURL(a.url))
  attachItems.value = []
  attachDialogVisible.value = false
}

onMounted(fetchAll)
</script>

<template>
  <div class="approval-page" v-loading="loading">
    <div class="page-header">
      <h2>審核工作台</h2>
      <el-tag v-if="totalPending > 0" type="danger" effect="dark" size="large">
        {{ totalPending }} 項待審核
      </el-tag>
      <el-tag v-else type="success" effect="dark" size="large">
        全部已處理
      </el-tag>
    </div>

    <!-- Pending Leaves -->
    <el-card class="section-card leave-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>待審請假</span>
          <el-badge :value="pendingLeaves.length" :type="pendingLeaves.length > 0 ? 'warning' : 'success'" />
        </div>
      </template>

      <el-table v-if="pendingLeaves.length > 0" :data="pendingLeaves" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" width="100" />
        <el-table-column label="假別" width="90">
          <template #default="{ row }">
            <el-tag :type="leaveTypeMap[row.leave_type]?.type || 'info'" size="small">
              {{ leaveTypeMap[row.leave_type]?.label || row.leave_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="日期" min-width="160">
          <template #default="{ row }">
            {{ row.start_date }}
            <template v-if="row.end_date !== row.start_date"> ~ {{ row.end_date }}</template>
          </template>
        </el-table-column>
        <el-table-column label="時數" width="80">
          <template #default="{ row }">{{ row.leave_hours }}h</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="150" show-overflow-tooltip />
        <el-table-column label="附件" width="80" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.attachment_paths && row.attachment_paths.length > 0"
              link
              type="primary"
              size="small"
              @click="viewAttachments(row)"
              title="查看附件"
            >
              <el-icon><Paperclip /></el-icon>
              {{ row.attachment_paths.length }}
            </el-button>
            <span v-else style="color: var(--text-secondary); font-size: 12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ row.created_at ? row.created_at.replace('T', ' ').slice(0, 16) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="success" size="small" circle @click="approveLeave(row, true)" title="核准">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button type="danger" size="small" circle @click="approveLeave(row, false)" title="駁回">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="沒有待審核的請假申請" :image-size="60" />
    </el-card>

    <!-- Pending Overtimes -->
    <el-card class="section-card overtime-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>待審加班</span>
          <el-badge :value="pendingOvertimes.length" :type="pendingOvertimes.length > 0 ? 'warning' : 'success'" />
        </div>
      </template>

      <el-table v-if="pendingOvertimes.length > 0" :data="pendingOvertimes" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" width="100" />
        <el-table-column prop="overtime_date" label="日期" width="120" />
        <el-table-column label="類型" width="100">
          <template #default="{ row }">
            <el-tag :type="overtimeTypeMap[row.overtime_type]?.type || ''" size="small">
              {{ overtimeTypeMap[row.overtime_type]?.label || row.overtime_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="時間" width="130">
          <template #default="{ row }">
            {{ row.start_time || '-' }} ~ {{ row.end_time || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="時數" width="80">
          <template #default="{ row }">{{ row.hours }}h</template>
        </el-table-column>
        <el-table-column label="加班費" width="110">
          <template #default="{ row }">
            <strong>{{ money(row.overtime_pay) }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ row.created_at ? row.created_at.replace('T', ' ').slice(0, 16) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="success" size="small" circle @click="approveOvertime(row, true)" title="核准">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button type="danger" size="small" circle @click="approveOvertime(row, false)" title="駁回">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="沒有待審核的加班申請" :image-size="60" />
    </el-card>

    <!-- 附件預覽 Dialog -->
    <el-dialog
      v-model="attachDialogVisible"
      title="假單附件"
      width="640px"
      :before-close="closeAttachDialog"
    >
      <div v-if="attachLoading" style="display:flex;align-items:center;gap:8px;padding:24px;justify-content:center;color:var(--text-secondary);">
        <el-icon class="is-loading"><Loading /></el-icon> 載入中…
      </div>
      <div v-else-if="attachItems.length === 0" style="text-align:center;padding:24px;color:var(--text-secondary);">
        無附件
      </div>
      <div v-else class="attach-grid">
        <div v-for="(item, i) in attachItems" :key="i" class="attach-item">
          <el-image
            v-if="item.isImage"
            :src="item.url"
            :preview-src-list="attachItems.filter(a => a.isImage).map(a => a.url)"
            :initial-index="attachItems.filter(a => a.isImage).findIndex(a => a.url === item.url)"
            fit="cover"
            class="attach-thumb"
          />
          <a
            v-else
            :href="item.url"
            :download="item.name"
            class="attach-file"
          >
            <el-icon :size="32"><Document /></el-icon>
            <span class="attach-file__name">{{ item.name }}</span>
            <span class="attach-file__hint">點擊下載</span>
          </a>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.approval-page {
  padding: 0;
}

.section-card {
  margin-bottom: var(--space-5);
}

.leave-card {
  border-left: 4px solid #409EFF;
}

.overtime-card {
  border-left: 4px solid var(--color-warning);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-lg);
  font-weight: 600;
}

.attach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.attach-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.attach-thumb {
  width: 100%;
  height: 140px;
  display: block;
}

.attach-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  text-decoration: none;
  color: var(--text-primary);
  height: 140px;
  transition: background-color 0.2s;
}

.attach-file:hover {
  background-color: var(--bg-color-soft);
}

.attach-file__name {
  font-size: 12px;
  text-align: center;
  word-break: break-all;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-file__hint {
  font-size: 12px;
  color: var(--color-primary);
}
</style>
