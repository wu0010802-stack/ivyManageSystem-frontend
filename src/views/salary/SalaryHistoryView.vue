<template>
  <div>
    <PageHeader title="薪資歷史" subtitle="歷月薪資紀錄、月底快照與明細回看">
      <template #actions>
        <el-select v-model="snapYear" style="width: 100px" aria-label="快照年份">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select v-model="snapMonth" style="width: 90px" aria-label="快照月份">
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
        <el-button @click="showSnapshotDialog = true">月底快照</el-button>
      </template>
    </PageHeader>
    <SalaryHistoryPanel v-if="canReadEmployees" />
    <EmptyState v-else description="需要員工讀取權限才能查看薪資歷史" />
    <SalarySnapshotDialog
      v-model="showSnapshotDialog"
      :year="snapYear"
      :month="snapMonth"
      :can-write="canWriteSalary"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SalaryHistoryPanel from './SalaryHistoryPanel.vue'
import SalarySnapshotDialog from './SalarySnapshotDialog.vue'
import { hasPermission } from '@/utils/auth'

const canReadEmployees = computed(() => hasPermission('EMPLOYEES_READ'))
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

const now = new Date()
const snapYear = ref(now.getFullYear())
const snapMonth = ref(now.getMonth() + 1)
const yearOptions = computed(() => [snapYear.value - 2, snapYear.value - 1, snapYear.value, snapYear.value + 1])
const showSnapshotDialog = ref(false)
</script>
