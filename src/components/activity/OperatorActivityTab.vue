<template>
  <div class="operator-activity">
    <div class="operator-activity__head">
      <el-select
        v-model="days"
        size="small"
        style="width: 140px"
        @change="reload"
      >
        <el-option :value="7" label="近 7 天" />
        <el-option :value="30" label="近 30 天" />
        <el-option :value="90" label="近 90 天" />
        <el-option :value="180" label="近 180 天" />
      </el-select>
      <span class="operator-activity__hint">
        💡 共用帳號筆數異常高、個人帳號筆數零？請落實「個人帳號登入」政策（見 docs/sop/pos-operator-policy.md）
      </span>
    </div>

    <el-empty
      v-if="!loading && rows.length === 0"
      :description="`近 ${days} 天無 POS 操作紀錄`"
      :image-size="80"
    />

    <el-table v-else :data="rows" size="small" :max-height="500" v-loading="loading">
      <el-table-column label="帳號" prop="operator" min-width="160">
        <template #default="{ row }">
          <code>{{ row.operator }}</code>
          <el-tag
            v-if="!row.user"
            type="danger"
            size="small"
            effect="plain"
            style="margin-left: 6px"
          >
            無 User row
          </el-tag>
          <el-tag
            v-else-if="row.user && !row.user.is_active"
            type="warning"
            size="small"
            effect="plain"
            style="margin-left: 6px"
          >
            帳號停用
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="顯示名" min-width="120">
        <template #default="{ row }">{{ row.user?.display_name || '—' }}</template>
      </el-table-column>
      <el-table-column label="角色" width="100">
        <template #default="{ row }">{{ row.user?.role || '—' }}</template>
      </el-table-column>
      <el-table-column label="收款" prop="payment_count" width="80" align="right" />
      <el-table-column label="退費" prop="refund_count" width="80" align="right" />
      <el-table-column label="總筆數" width="100" align="right">
        <template #default="{ row }"><strong>{{ row.total_count }}</strong></template>
      </el-table-column>
      <el-table-column label="最後操作時間" min-width="160">
        <template #default="{ row }">{{ row.last_activity_at || '—' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import { getPOSOperatorActivity } from '@/api/activity'

const days = ref<number>(30)
const rows = ref<Record<string, unknown>[]>([])
const loading = ref<boolean>(false)

async function reload() {
  loading.value = true
  try {
    const { data } = await getPOSOperatorActivity(days.value)
    rows.value = (data as { operators?: Record<string, unknown>[] })?.operators || []
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

onMounted(reload)
</script>

<style scoped>
.operator-activity__head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.operator-activity__hint {
  font-size: 13px;
  color: var(--text-secondary);
  flex: 1;
  min-width: 280px;
}
</style>
