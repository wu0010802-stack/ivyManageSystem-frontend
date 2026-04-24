<template>
  <div class="medication-today">
    <div class="page-header">
      <h2>今日用藥任務</h2>
      <div>
        <el-tag type="warning" size="large">待餵 {{ summary.pending }}</el-tag>
        <el-tag type="success" size="large" style="margin-left: 6px">
          已餵 {{ summary.administered }}
        </el-tag>
        <el-tag type="info" size="large" style="margin-left: 6px">
          跳過 {{ summary.skipped }}
        </el-tag>
        <el-button style="margin-left: 12px" @click="reload" :loading="loading">
          重新整理
        </el-button>
      </div>
    </div>

    <el-empty
      v-if="!loading && orders.length === 0"
      description="今日沒有用藥任務"
    />

    <div v-loading="loading" class="order-list">
      <el-card
        v-for="o in orders"
        :key="o.id"
        class="order-card"
        shadow="hover"
      >
        <div class="order-head">
          <span class="student-name">{{ o.student_name }}</span>
          <el-tag>{{ o.medication_name }}</el-tag>
          <span class="dose">劑量：{{ o.dose }}</span>
          <span v-if="o.note" class="note">備註：{{ o.note }}</span>
        </div>

        <div class="log-grid">
          <div
            v-for="lg in o.logs.filter((l) => !l.correction_of)"
            :key="lg.id"
            class="log-row"
          >
            <span class="slot">{{ lg.scheduled_time }}</span>
            <el-tag :type="statusTag(lg.status)" size="large">
              {{ statusLabel(lg.status) }}
            </el-tag>
            <span v-if="lg.administered_at" class="time">
              {{ formatTime(lg.administered_at) }}
            </span>
            <span v-if="lg.skipped_reason" class="skip-reason">
              （{{ lg.skipped_reason }}）
            </span>
            <div class="log-actions">
              <el-button
                v-if="lg.status === 'pending'"
                size="small"
                type="success"
                :disabled="!canAdminister"
                @click="doAdminister(lg.id)"
              >
                餵藥
              </el-button>
              <el-button
                v-if="lg.status === 'pending'"
                size="small"
                :disabled="!canAdminister"
                @click="openSkip(lg.id)"
              >
                跳過
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="skipDialog.visible" title="跳過餵藥" width="420px">
      <el-form :model="skipDialog" label-width="80px">
        <el-form-item label="原因" required>
          <el-input
            v-model="skipDialog.reason"
            placeholder="例：家長取消、學生未到"
            maxlength="200"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skipDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="skipDialog.saving" @click="doSkip">
          確認
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getTodayMedication,
  administerMedication,
  skipMedication,
} from '@/api/studentHealth'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const loading = ref(false)
const orders = ref([])
const summary = reactive({ pending: 0, administered: 0, skipped: 0 })

const canAdminister = computed(() => hasPermission('STUDENTS_MEDICATION_ADMINISTER'))

const skipDialog = reactive({
  visible: false,
  saving: false,
  logId: null,
  reason: '',
})

function statusTag(s) {
  return s === 'administered' ? 'success'
    : s === 'skipped' ? 'info'
    : s === 'correction' ? 'warning'
    : 'warning'
}
function statusLabel(s) {
  return { pending: '待餵', administered: '已餵', skipped: '跳過', correction: '修正' }[s] || s
}
function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

async function reload() {
  loading.value = true
  try {
    const r = await getTodayMedication()
    orders.value = r.data.orders || []
    summary.pending = r.data.pending || 0
    summary.administered = r.data.administered || 0
    summary.skipped = r.data.skipped || 0
  } catch (e) {
    apiError(e, '載入今日用藥失敗')
  } finally {
    loading.value = false
  }
}

async function doAdminister(logId) {
  try {
    await administerMedication(logId, {})
    ElMessage.success('已標記餵藥')
    await reload()
  } catch (e) {
    apiError(e, '餵藥失敗')
  }
}

function openSkip(logId) {
  skipDialog.logId = logId
  skipDialog.reason = ''
  skipDialog.visible = true
}

async function doSkip() {
  if (!skipDialog.reason.trim()) {
    ElMessage.warning('請填寫跳過原因')
    return
  }
  skipDialog.saving = true
  try {
    await skipMedication(skipDialog.logId, {
      skipped_reason: skipDialog.reason.trim(),
    })
    ElMessage.success('已記錄跳過')
    skipDialog.visible = false
    await reload()
  } catch (e) {
    apiError(e, '跳過失敗')
  } finally {
    skipDialog.saving = false
  }
}

onMounted(reload)
</script>

<style scoped>
.medication-today {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.order-card .order-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.student-name {
  font-weight: 600;
  font-size: 16px;
}
.dose,
.note {
  color: #606266;
  font-size: 13px;
}
.log-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 12px;
}
.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.log-row .slot {
  font-weight: 600;
  width: 60px;
  color: #409eff;
}
.log-row .time {
  color: #909399;
  font-size: 13px;
}
.log-row .skip-reason {
  color: #909399;
  font-size: 13px;
}
.log-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
</style>
