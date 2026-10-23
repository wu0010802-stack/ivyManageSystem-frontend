<template>
  <div>
    <PageHeader title="薪資設定" subtitle="獎金規則、節慶發放、才藝老師、系統參數與計算邏輯說明" />
    <el-tabs v-model="tab" type="card">
      <el-tab-pane v-if="canReadSettings" label="獎金設定" name="bonus">
        <BonusConfigPanel v-if="tab === 'bonus'" />
      </el-tab-pane>
      <el-tab-pane label="才藝老師薪資" name="art_teacher">
        <ArtTeacherPayrollPanel v-if="tab === 'art_teacher'" />
      </el-tab-pane>
      <el-tab-pane v-if="canReadSalary" label="節慶發放與未扣餘額" name="festival_payout">
        <FestivalPayoutPanel v-if="tab === 'festival_payout'" />
      </el-tab-pane>
      <el-tab-pane v-if="canViewFullSalary" label="下學期超額獎金" name="semester2_excess">
        <Semester2ExcessPanel v-if="tab === 'semester2_excess'" />
      </el-tab-pane>
      <el-tab-pane label="系統設定" name="system_settings">
        <SystemSettingsPanel v-if="tab === 'system_settings'" />
      </el-tab-pane>
      <el-tab-pane label="薪資邏輯" name="logic">
        <SalaryLogicPanel v-if="tab === 'logic'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import BonusConfigPanel from './BonusConfigPanel.vue'
import ArtTeacherPayrollPanel from './ArtTeacherPayrollPanel.vue'
import SystemSettingsPanel from './SystemSettingsPanel.vue'
import SalaryLogicPanel from './SalaryLogicPanel.vue'
import FestivalPayoutPanel from './FestivalPayoutPanel.vue'
import Semester2ExcessPanel from './Semester2ExcessPanel.vue'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'

const canReadSettings = computed(() => hasPermission('SETTINGS_READ'))
const canReadSalary = computed(() => hasPermission('SALARY_READ'))
const canViewFullSalary = computed(() => canReadSalary.value && hasFullSalaryView())
const tab = ref(canReadSettings.value ? 'bonus' : 'art_teacher')
</script>
