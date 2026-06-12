<template>
  <div>
    <el-alert
      v-if="settlement.status.value === 'needs_recalc'"
      type="warning"
      :closable="false"
      class="calc-mb"
      title="考勤或設定已變動，部分明細已過期，建議重新計算"
    />

    <!-- 部分失敗持久警示：失敗員工在覆核表中是「不存在」而非標紅，必須在此處理完才前進 -->
    <el-alert
      v-if="calcErrors.length > 0"
      type="error"
      :closable="false"
      class="calc-mb"
      :title="`部分員工薪資計算失敗，共 ${calcErrors.length} 筆——這些員工本月尚無薪資紀錄，請排除原因後重新計算`"
    >
      <ul class="calc-error-list">
        <li v-for="(err, i) in calcErrors" :key="i">
          {{ err.employee_name }}：{{ err.error }}
        </li>
      </ul>
    </el-alert>

    <el-card shadow="never" class="no-hover">
      <div class="calc-body">
        <div>
          <p class="calc-title">計算 {{ q.year }} 年 {{ q.month }} 月全員薪資</p>
          <p class="calc-hint">
            重新計算會保留已存在的手動調整；已封存的紀錄不會被覆蓋。
          </p>
          <p v-if="lastCalculatedAt" class="calc-hint">上次計算：{{ lastCalculatedAt }}</p>
        </div>
        <el-tooltip :content="disabledReason" :disabled="!disabledReason" placement="top">
          <span>
            <el-button
              type="primary"
              size="large"
              :loading="calculating"
              :disabled="!!disabledReason"
              @click="onCalculate"
            >
              計算薪資
            </el-button>
          </span>
        </el-tooltip>
      </div>
    </el-card>

    <div class="step-actions">
      <el-button @click="$emit('next')">略過，直接覆核 →</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { calculate } from '@/api/salary'
import { hasPermission } from '@/utils/auth'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { SalarySettlement } from '@/composables/useSalarySettlement'

const emit = defineEmits<{ (e: 'next'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()
const calculating = ref(false)
const calcErrors = ref<{ employee_name?: string; error?: string }[]>([])

const disabledReason = computed(() => {
    if (!hasPermission('SALARY_WRITE')) return '需要薪資寫入權限（目前為唯讀模式）'
    if (settlement.status.value === 'finalized') return '本月已定案，需先於「定案」步驟退回才能重算'
    return ''
})

const lastCalculatedAt = computed(() => {
    const first = settlement.records.value[0] as { calculated_at?: string } | undefined
    return first?.calculated_at ? new Date(first.calculated_at).toLocaleString('zh-TW') : ''
})

const onCalculate = async () => {
    try {
        await ElMessageBox.confirm(
            `將計算 ${q.year} 年 ${q.month} 月全員薪資。重算會保留手動調整、跳過已封存紀錄，確定執行？`,
            '計算薪資',
            { confirmButtonText: '執行計算', cancelButtonText: '取消', type: 'warning' },
        )
    } catch {
        return // 使用者取消
    }
    calculating.value = true
    try {
        const response = await calculate(q.year, q.month)
        const data = response.data as { errors?: { employee_name?: string; error?: string }[] }
        calcErrors.value = data?.errors ?? []
        await settlement.refresh()
        if (calcErrors.value.length > 0) {
            return // 停留在計算步驟，持久警示列出失敗員工
        }
        ElMessage.success('薪資計算完成')
        emit('next') // 自動進入覆核
    } catch (e) {
        notify(e, 'StepCalculate', null, { prefix: '計算失敗' })
    } finally {
        calculating.value = false
    }
}
</script>

<style scoped>
.calc-mb {
  margin-bottom: var(--space-4);
}

.calc-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.calc-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
}

.calc-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.calc-error-list {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-4);
}

.step-actions {
  margin-top: var(--space-6);
  text-align: right;
}
</style>
