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
      <el-table-column label="回覆" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.reply" type="success" size="small">已回覆</el-tag>
          <span v-else style="color: #94a3b8">—</span>
        </template>
      </el-table-column>
      <el-table-column label="提問時間" min-width="130">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openReplyDialog(row)">
            {{ row.reply ? '編輯回覆' : '回覆' }}
          </el-button>
          <el-button
            v-if="!row.is_read"
            size="small"
            type="primary"
            @click="handleMarkRead(row)"
          >標記已讀</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)" :loading="deletingId === row.id">刪除</el-button>
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

    <el-dialog v-model="replyDialog" title="回覆家長提問"
               width="440px" destroy-on-close>
      <div v-if="replyTarget" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">原始問題：</div>
        <div style="background: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 14px;">
          {{ replyTarget.question }}
        </div>
      </div>
      <el-input v-model="replyText" type="textarea" :rows="4"
                placeholder="請輸入回覆內容..." />
      <template #footer>
        <el-button @click="replyDialog = false">取消</el-button>
        <el-button type="primary" :loading="replying" @click="handleReply">
          送出回覆
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { getInquiries, markInquiryRead, deleteInquiry, replyInquiry } from '@/api/activity'
import { useActivityStore } from '@/stores/activity'
import { formatActivityDate } from '@/utils/format'

const activityStore = useActivityStore()
const list = ref([])
const total = ref(0)
const deletingId = ref(null)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const readFilter = ref(null)

const unreadCount = computed(() => list.value.filter((i) => !i.is_read).length)

const replyDialog = ref(false)
const replyTarget = ref(null)
const replyText = ref('')
const replying = ref(false)

function openReplyDialog(row) {
  replyTarget.value = row
  replyText.value = row.reply || ''
  replyDialog.value = true
}

async function handleReply() {
  if (!replyText.value.trim()) return ElMessage.warning('請輸入回覆內容')
  replying.value = true
  try {
    await replyInquiry(replyTarget.value.id, { reply: replyText.value.trim() })
    ElMessage.success('回覆成功')
    replyDialog.value = false
    fetchList()
    activityStore.fetchSummary({ force: true })
  } catch {
    ElMessage.error('回覆失敗')
  } finally {
    replying.value = false
  }
}

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
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deleteInquiry(row.id)
    ElMessage.success('已刪除')
    fetchList()
    activityStore.fetchSummary({ force: true })
  } catch {
    ElMessage.error('刪除失敗')
  } finally {
    deletingId.value = null
  }
}

onMounted(fetchList)
</script>

<style scoped>
.activity-inquiries { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; display: flex; align-items: center; }
.filters { display: flex; gap: 8px; }
</style>
