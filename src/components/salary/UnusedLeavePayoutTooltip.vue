<script setup lang="ts">
/**
 * 未休折現證據鏈 tooltip。
 *
 * 懶載入：首次 tooltip 展開時才發請求，避免表格初始化時大量 API 呼叫。
 * 若 API 回傳失敗，顯示「無明細」而非錯誤訊息，保持 UX 穩定。
 *
 * Props:
 *   salaryRecordId — SalaryRecord.id（HR 端用，portal 端傳 0 時停用 detail 呼叫）
 *   amount         — 顯示金額（NT$）
 */
import { ref } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { getUnusedLeavePayoutDetail } from '@/api/leaveQuotaExpiry'

const props = defineProps<{
  salaryRecordId: number
  amount: number
}>()

const logs = ref<Array<Record<string, unknown>>>([])
const loaded = ref(false)
const loading = ref(false)

/** 來源類型中文標籤對照表 */
const SOURCE_LABEL: Record<string, string> = {
  comp_grant_expiry: '補休到期',
  annual_anniversary: '特休週年',
  offboarding: '離職結算',
}

/**
 * 懶載入明細，由 el-tooltip @show 觸發。
 * salaryRecordId <= 0 時不發請求（portal 端尚未取得 record_id 時保護用）。
 */
const loadDetail = async () => {
  if (loaded.value || loading.value || props.salaryRecordId <= 0) return
  loading.value = true
  try {
    const res = await getUnusedLeavePayoutDetail(props.salaryRecordId)
    const data = res.data as { logs?: Array<Record<string, unknown>> }
    logs.value = data.logs ?? []
    loaded.value = true
  } catch {
    logs.value = []
  } finally {
    loading.value = false
  }
}

/** 金額格式化，加千分位 */
const money = (v: number) => `$${Number(v).toLocaleString()}`
</script>

<template>
  <el-tooltip
    placement="top"
    :show-after="200"
    :hide-after="0"
    effect="light"
    @show="loadDetail"
  >
    <template #content>
      <div class="payout-detail">
        <div v-if="loading" class="detail-loading">載入中…</div>
        <div v-else-if="logs.length === 0" class="detail-empty">無明細</div>
        <table v-else class="logs-table">
          <thead>
            <tr>
              <th>來源</th>
              <th>時數</th>
              <th>時薪</th>
              <th>金額</th>
              <th>基準日</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.log_id as number">
              <td>{{ SOURCE_LABEL[log.source_type as string] ?? log.source_type }}</td>
              <td>{{ log.hours }}h</td>
              <td>{{ money(log.hourly_wage as number) }}</td>
              <td>{{ money(log.amount as number) }}</td>
              <td>{{ log.wage_basis_date }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <span class="trigger">
      <span>{{ money(amount) }}</span>
      <el-icon class="info-icon">
        <InfoFilled />
      </el-icon>
    </span>
  </el-tooltip>
</template>

<style scoped>
.payout-detail {
  max-width: 480px;
}

.detail-loading,
.detail-empty {
  padding: 8px 4px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.logs-table {
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.logs-table th,
.logs-table td {
  border: 1px solid var(--el-border-color);
  padding: 4px 8px;
}

.logs-table th {
  background: var(--el-fill-color-light);
  font-weight: 600;
}

.trigger {
  cursor: help;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.info-icon {
  width: 12px;
  height: 12px;
  color: var(--el-color-info);
  flex-shrink: 0;
}
</style>
