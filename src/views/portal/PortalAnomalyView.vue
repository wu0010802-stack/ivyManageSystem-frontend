<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getAnomalies, confirmAnomaly as confirmAnomalyApi } from '@/api/portal'
import { apiError } from '@/utils/error'

const loading = ref(false)
const anomalies = ref([])

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const fetchAnomalies = async () => {
  loading.value = true
  try {
    const res = await getAnomalies({ year: query.year, month: query.month })
    anomalies.value = res.data.map(a => ({ ...a, selected_action: '', remark: '', submitting: false }))
  } catch (error) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const confirmAnomaly = async (anomaly) => {
  if (!anomaly.selected_action) {
    ElMessage.warning('請選擇處理方式')
    return
  }

  anomaly.submitting = true
  try {
    const res = await confirmAnomalyApi(anomaly.id, anomaly.selected_action)
    ElMessage.success(res.data.message)
    anomaly.confirmed = true
  } catch (error) {
    ElMessage.error(apiError(error, '處理失敗'))
  } finally {
    anomaly.submitting = false
  }
}

const pendingCount = computed(() => anomalies.value.filter(a => !a.confirmed).length)

onMounted(fetchAnomalies)
</script>

<template>
  <div class="portal-anomaly">
    <div class="page-header">
      <h2>出勤異常確認</h2>
      <div class="query-row">
        <el-select v-model="query.year" style="width: 100px;" @change="fetchAnomalies">
          <el-option v-for="y in [2024,2025,2026,2027]" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="query.month" style="width: 100px;" @change="fetchAnomalies">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
      </div>
    </div>

    <el-alert
      v-if="pendingCount > 0"
      :title="`您有 ${pendingCount} 筆出勤異常需要確認`"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
    />

    <div v-loading="loading">
      <el-card
        v-for="anomaly in anomalies"
        :key="`${anomaly.id}-${anomaly.type}`"
        class="anomaly-card"
        :class="{ confirmed: anomaly.confirmed }"
      >
        <div class="anomaly-header">
          <div class="anomaly-date">
            <span class="date-text">{{ anomaly.date }}</span>
            <el-tag size="small" type="info">星期{{ anomaly.weekday }}</el-tag>
          </div>
          <el-tag :type="anomaly.type === 'late' ? 'warning' : 'danger'" size="default">
            {{ anomaly.type_label }}
          </el-tag>
        </div>

        <div class="anomaly-detail">
          <p class="detail-text">{{ anomaly.detail }}</p>
          <p class="deduction-text">
            預估扣款: <strong>NT$ {{ anomaly.estimated_deduction }}</strong>
          </p>
        </div>

        <template v-if="!anomaly.confirmed">
          <el-divider />
          <div class="anomaly-actions">
            <p style="margin: 0 0 8px 0; font-weight: 600;">請選擇處理方式：</p>
            <el-radio-group v-model="anomaly.selected_action">
              <el-radio value="use_pto">使用特休抵銷</el-radio>
              <el-radio value="accept">接受扣款</el-radio>
              <el-radio value="dispute">提出申訴</el-radio>
            </el-radio-group>

            <el-input
              v-if="anomaly.selected_action === 'dispute'"
              v-model="anomaly.remark"
              type="textarea"
              :rows="2"
              placeholder="請說明申訴原因"
              style="margin-top: 8px;"
            />

            <el-button
              type="primary"
              size="default"
              :loading="anomaly.submitting"
              style="margin-top: 12px;"
              @click="confirmAnomaly(anomaly)"
            >
              確認送出
            </el-button>
          </div>
        </template>

        <div v-else class="confirmed-badge">
          <el-tag type="success" effect="dark">已處理</el-tag>
        </div>
      </el-card>

      <el-empty v-if="!loading && anomalies.length === 0" description="本月無出勤異常">
        <template #image>
          <el-icon :size="60" style="color: #67c23a;"><CircleCheck /></el-icon>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.query-row {
  display: flex;
  gap: 8px;
}

.anomaly-card {
  margin-bottom: var(--space-4);
  transition: opacity 0.3s;
}

.anomaly-card.confirmed {
  opacity: 0.6;
}

.anomaly-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.anomaly-date {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-text {
  font-size: var(--text-lg);
  font-weight: 600;
}

.anomaly-detail {
  background: var(--bg-color-soft);
  padding: var(--space-3) var(--space-4);
  border-radius: 6px;
}

.detail-text {
  margin: 0 0 4px 0;
  font-size: var(--text-base);
}

.deduction-text {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-base);
}

.confirmed-badge {
  margin-top: var(--space-3);
  text-align: right;
}
</style>
