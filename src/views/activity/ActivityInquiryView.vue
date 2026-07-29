<template>
  <div class="activity-inquiries">
    <div class="toolbar">
      <h2>
        家長提問
        <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" style="margin-left: 8px" />
      </h2>
      <div class="filters">
        <el-select v-model="readFilter" placeholder="讀取狀態" clearable style="width: 130px" @change="onFilterChange">
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
      <el-table-column label="聯繫紀錄" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.reply" type="success" size="small">已記錄</el-tag>
          <span v-else style="color: #94a3b8">—</span>
        </template>
      </el-table-column>
      <el-table-column label="提問時間" min-width="130">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canWrite" size="small" @click="openReplyDialog(row)">
            {{ row.reply ? '編輯聯繫紀錄' : '記錄聯繫結果' }}
          </el-button>
          <el-button
            v-if="!row.is_read"
            size="small"
            type="primary"
            :loading="markingReadIds.has(row.id)"
            :disabled="markingReadIds.has(row.id)"
            @click="handleMarkRead(row)"
          >標記已讀</el-button>
          <el-button v-if="canWrite" size="small" type="danger" @click="handleDelete(row)" :loading="deletingId === row.id">刪除</el-button>
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

    <el-dialog v-model="replyDialog" title="記錄聯繫結果"
               width="440px" destroy-on-close>
      <div v-if="replyTarget" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">原始問題：</div>
        <div style="background: var(--bg-color); padding: 8px 12px; border-radius: 6px; font-size: 14px;">
          {{ replyTarget.question }}
        </div>
      </div>
      <el-alert
        title="此處只記錄人工聯繫結果，不會自動傳送訊息給家長。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-input v-model="replyText" type="textarea" :rows="4"
                placeholder="例如：已於 7/17 電話聯繫，家長確認了解。" />
      <template #footer>
        <el-button @click="replyDialog = false">取消</el-button>
        <el-button type="primary" :loading="replying" @click="handleReply">
          儲存紀錄
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { getInquiries, markInquiryRead, deleteInquiry, replyInquiry } from '@/api/activity'
import { useActivityStore } from '@/stores/activity'
import { formatActivityDate } from '@/utils/format'
import { hasPermission } from '@/utils/auth'

interface Inquiry { id: number; is_read: boolean; reply?: string; [key: string]: unknown }

const activityStore = useActivityStore()

// 對齊 ActivityRegistrationView 慣例：READ-only 隱藏聯繫紀錄/刪除
// （標記已讀後端只要 ACTIVITY_READ，不蓋）。
const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))
const list = ref<Inquiry[]>([])
const total = ref(0)
const deletingId = ref<number | null>(null)
// 逐列 pending lock：避免慢網路下同一列連點，API 重送且 unread badge 重複遞減。
const markingReadIds = reactive(new Set<number>())
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const readFilter = ref<boolean | null>(null)

// 全量未讀數（後端 list 回應頂層 unread_count）；欄位缺席時 fallback 回當頁計算（平滑過渡）
const serverUnreadCount = ref<number | null>(null)
const unreadCount = computed(
  () => serverUnreadCount.value ?? list.value.filter((i) => !i.is_read).length,
)

const replyDialog = ref(false)
const replyTarget = ref<Inquiry | null>(null)
const replyText = ref('')
const replying = ref(false)

function openReplyDialog(row: Inquiry) {
  replyTarget.value = row
  replyText.value = (row.reply as string) || ''
  replyDialog.value = true
}

async function handleReply() {
  if (!replyText.value.trim()) return ElMessage.warning('請輸入聯繫結果')
  replying.value = true
  try {
    await replyInquiry(replyTarget.value!.id, { reply: replyText.value.trim() })
    ElMessage.success('聯繫結果已記錄')
    replyDialog.value = false
    fetchList()
    activityStore.fetchSummary({ force: true })
  } catch {
    ElMessage.error('記錄聯繫結果失敗')
  } finally {
    replying.value = false
  }
}

// request-sequence guard：快速切換篩選/分頁時，較慢的舊回應可能在新回應之後才到並
// 覆寫新結果。以遞增序號認領，只有最新一次查詢的回應能寫入 list/total。
let fetchSeq = 0
async function fetchList() {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (readFilter.value !== null && readFilter.value !== undefined) {
      params.is_read = readFilter.value
    }
    const res = await getInquiries(params)
    if (seq !== fetchSeq) return // 已有更新的查詢發出，丟棄這次較舊回應
    const data = res.data as { items: Inquiry[]; total: number; unread_count?: number }
    list.value = data.items
    total.value = data.total
    serverUnreadCount.value = typeof data.unread_count === 'number' ? data.unread_count : null
  } catch {
    if (seq !== fetchSeq) return // 舊查詢的錯誤不干擾較新查詢
    ElMessage.error('載入失敗')
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

// 切換讀取狀態篩選：先把頁碼重置回第 1 頁再查，否則原本停在第 3 頁、新篩選結果不足
// 3 頁時會落在越界空白頁。分頁本身的 @change 不走此函式（page 已由 v-model 更新）。
function onFilterChange() {
  page.value = 1
  fetchList()
}

async function handleMarkRead(row: Inquiry) {
  if (row.is_read || markingReadIds.has(row.id)) return
  markingReadIds.add(row.id)
  try {
    await markInquiryRead(row.id)
    // API pending 期間 fetchList 可能已換成新列並帶回最新 unread_count；只更新目前
    // 清單仍存在且仍未讀的列，避免拿舊 row 再扣一次最新的全量計數。
    const currentRow = list.value.find((item) => item.id === row.id)
    if (currentRow && !currentRow.is_read) {
      currentRow.is_read = true
      // 全量未讀數本地遞減（不重抓 list；下次 fetchList 會以後端為準）
      if (serverUnreadCount.value != null) {
        serverUnreadCount.value = Math.max(0, serverUnreadCount.value - 1)
      }
    } else if (!currentRow) {
      // 切頁／切篩選後本列可能已不在畫面；mutation 成功後重抓目前頁，
      // 由後端 unread_count 校正頁首 badge，避免沿用 commit 前的舊總數。
      await fetchList()
    }
    ElMessage.success('已標記為已讀')
    activityStore.fetchSummary({ force: true })
  } catch {
    ElMessage.error('操作失敗')
  } finally {
    markingReadIds.delete(row.id)
  }
}

async function handleDelete(row: Inquiry) {
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
