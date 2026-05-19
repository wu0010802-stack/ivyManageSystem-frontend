<script setup lang="ts">
import { ref } from 'vue'
import BonusRatesPanel from './components/BonusRatesPanel.vue'
import PenaltyCatalogPanel from './components/PenaltyCatalogPanel.vue'
import ScoringRulesPanel from './components/ScoringRulesPanel.vue'
import YearlyEnrollmentTargetSection from './YearlyEnrollmentTargetSection.vue'

const activeTab = ref('enrollment_targets')
</script>

<template>
  <div class="appraisal-settings-view">
    <el-tabs v-model="activeTab" data-test="settings-sub-tabs">
      <el-tab-pane label="學年目標人數" name="enrollment_targets">
        <YearlyEnrollmentTargetSection v-if="activeTab === 'enrollment_targets'" />
      </el-tab-pane>
      <el-tab-pane label="考核扣分規則" name="scoring_rules">
        <ScoringRulesPanel v-if="activeTab === 'scoring_rules'" />
      </el-tab-pane>
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
  padding: 0;
}
</style>
