<script setup>
import { ref } from 'vue'
import BonusRatesPanel from './components/BonusRatesPanel.vue'
import PenaltyCatalogPanel from './components/PenaltyCatalogPanel.vue'

const activeTab = ref('bonus_rates')
</script>

<template>
  <div class="appraisal-settings-view">
    <h2>考核設定</h2>
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="年終獎金率" name="bonus_rates">
        <BonusRatesPanel v-if="activeTab === 'bonus_rates'" />
      </el-tab-pane>
      <el-tab-pane label="扣分項目目錄" name="penalty_catalog">
        <PenaltyCatalogPanel v-if="activeTab === 'penalty_catalog'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.appraisal-settings-view {
  padding: var(--space-5);
}

.appraisal-settings-view h2 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-2xl);
  color: var(--text-primary);
}
</style>
