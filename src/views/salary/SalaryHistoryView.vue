<template>
  <div>
    <PageHeader title="薪資總覽與歷史" subtitle="全員月度對帳、發放構成與個人歷月明細">
      <template #actions>
        <el-select v-model="year" style="width: 100px" aria-label="年份">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select v-model="month" style="width: 90px" aria-label="月份">
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
        <el-button @click="showSnapshotDialog = true">月底快照</el-button>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="overviewTabLabel" name="overview">
        <!-- 全員月總覽只需 SALARY_READ（路由已擋）；勿以 EMPLOYEES_READ 再閘 -->
        <SalaryMonthlyOverviewPanel
          :year="year"
          :month="month"
          @scope-change="overviewScope = $event"
        />
      </el-tab-pane>
      <el-tab-pane label="個人歷史" name="personal">
        <SalaryHistoryPanel v-if="canReadEmployees" />
        <EmptyState v-else description="需要員工讀取權限才能查看個人薪資歷史" />
      </el-tab-pane>
    </el-tabs>

    <SalarySnapshotDialog
      v-model="showSnapshotDialog"
      :year="year"
      :month="month"
      :can-write="canWriteSalary"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SalaryMonthlyOverviewPanel from './SalaryMonthlyOverviewPanel.vue'
import SalaryHistoryPanel from './SalaryHistoryPanel.vue'
import SalarySnapshotDialog from './SalarySnapshotDialog.vue'
import { hasPermission } from '@/utils/auth'

const canReadEmployees = computed(() => hasPermission('EMPLOYEES_READ'))
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

// 年月同時控制全員月總覽與月底快照
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const yearOptions = computed(() => [year.value - 2, year.value - 1, year.value, year.value + 1])
const showSnapshotDialog = ref(false)

const activeTab = ref('overview')
// scope=self（非 admin/hr 的 SALARY_READ 角色）時只看得到本人，標籤改「個人月總覽」
const overviewScope = ref('all')
const overviewTabLabel = computed(() => (overviewScope.value === 'self' ? '個人月總覽' : '全員月總覽'))
</script>
