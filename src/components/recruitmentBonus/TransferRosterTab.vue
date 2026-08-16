<template>
  <div v-loading="loading">
    <p v-if="roster?.account_masked" class="mask-hint">
      帳號已遮罩（僅顯示尾四碼）：完整帳號需要完整薪資檢視權限。
    </p>
    <el-table :data="roster?.rows || []" stripe style="width: 100%">
      <el-table-column label="帳號" min-width="200">
        <template #default="{ row }">
          <template v-if="row.missing_account">
            <el-tag type="warning" size="small">未填帳號</el-tag>
          </template>
          <template v-else>{{ row.bank_code ? `${row.bank_code}-` : '' }}{{ row.bank_account }}</template>
        </template>
      </el-table-column>
      <el-table-column label="戶名" min-width="120">
        <template #default="{ row }">{{ row.bank_account_name || row.employee_name }}</template>
      </el-table-column>
      <el-table-column label="金額" width="140" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
      </el-table-column>
    </el-table>
    <div class="roster-total">合計 <strong>{{ formatCurrency(roster?.total_amount || 0) }}</strong></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import { getTransferRoster } from '@/api/recruitmentBonus'
import type { Schema } from '@/api/_generated/typed'

const props = defineProps<{ campaignId: number }>()
const roster = ref<Schema<'RecruitmentBonusRosterOut'> | null>(null)
const loading = ref(false)

const reload = async () => {
  loading.value = true
  try {
    roster.value = (await getTransferRoster(props.campaignId)).data
  } catch (e) {
    ElMessage.error(friendlyError('載入轉帳名冊失敗', e))
  } finally {
    loading.value = false
  }
}
onMounted(reload)
defineExpose({ reload })
</script>

<style scoped>
.mask-hint { color: var(--el-text-color-secondary); font-size: 13px; margin-bottom: var(--space-2); }
.roster-total { text-align: right; margin-top: var(--space-3); font-size: 15px; }
</style>
