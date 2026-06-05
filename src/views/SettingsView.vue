<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useShiftStore } from '@/stores/shift'
import SettingsShiftTab from '@/components/settings/SettingsShiftTab.vue'
import SettingsUsersTab from '@/components/settings/SettingsUsersTab.vue'
import SettingsApprovalTab from '@/components/settings/SettingsApprovalTab.vue'
import SettingsLineTab from '@/components/settings/SettingsLineTab.vue'
import SettingsPermissionsTab from '@/components/settings/SettingsPermissionsTab.vue'
import SettingsObservabilityTab from '@/components/settings/SettingsObservabilityTab.vue'
import DsrRequestsView from '@/views/DsrRequestsView.vue'
import PolicyVersionsView from '@/views/PolicyVersionsView.vue'
import { hasPermission } from '@/utils/auth'

const activeTab = ref('shifts')
const shiftStore = useShiftStore()

onMounted(() => {
  shiftStore.fetchShiftTypes()
})
</script>

<template>
  <div class="settings-page">
    <h2>系統設定</h2>
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="輪班別管理" name="shifts">
        <SettingsShiftTab v-if="activeTab === 'shifts'" />
      </el-tab-pane>
      <el-tab-pane label="審核流程設定" name="approval">
        <SettingsApprovalTab v-if="activeTab === 'approval'" />
      </el-tab-pane>
      <el-tab-pane label="帳號管理" name="accounts">
        <SettingsUsersTab v-if="activeTab === 'accounts'" />
      </el-tab-pane>
      <el-tab-pane label="角色管理" name="permissions">
        <SettingsPermissionsTab v-if="activeTab === 'permissions'" />
      </el-tab-pane>
      <el-tab-pane name="line">
        <template #label>LINE 通知設定 <el-tag type="warning" size="small" style="margin-left:4px;">Beta</el-tag></template>
        <SettingsLineTab v-if="activeTab === 'line'" />
      </el-tab-pane>
      <el-tab-pane label="排程觀測" name="observability" lazy>
        <SettingsObservabilityTab v-if="activeTab === 'observability'" />
      </el-tab-pane>
      <el-tab-pane
        v-if="hasPermission('DSR_MANAGE')"
        label="個資權利請求"
        name="dsr-requests"
      >
        <DsrRequestsView v-if="activeTab === 'dsr-requests'" />
      </el-tab-pane>
      <el-tab-pane
        v-if="hasPermission('DSR_MANAGE')"
        label="隱私政策版本"
        name="policy-versions"
      >
        <PolicyVersionsView v-if="activeTab === 'policy-versions'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}
</style>
