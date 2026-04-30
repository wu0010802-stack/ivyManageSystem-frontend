<script setup>
import { computed, ref } from 'vue'
import { hasPermission } from '@/utils/auth'
import PortfolioTab from '@/components/portfolio/PortfolioTab.vue'
import HealthTab from '@/components/portfolio/HealthTab.vue'

const props = defineProps({
  studentId: { type: Number, required: true },
})

const canPortfolio = computed(() => hasPermission('PORTFOLIO_READ'))
const canHealth = computed(() => hasPermission('STUDENTS_HEALTH_READ'))

const subTab = ref(canPortfolio.value ? 'portfolio' : 'health')
</script>

<template>
  <div class="health-growth-tab">
    <el-tabs v-model="subTab">
      <el-tab-pane v-if="canPortfolio" label="成長歷程" name="portfolio">
        <PortfolioTab v-if="studentId" :student-id="studentId" />
      </el-tab-pane>
      <el-tab-pane v-if="canHealth" label="健康紀錄" name="health">
        <HealthTab v-if="studentId" :student-id="studentId" />
      </el-tab-pane>
    </el-tabs>
    <el-empty
      v-if="!canPortfolio && !canHealth"
      description="您沒有檢視成長歷程或健康紀錄的權限"
    />
  </div>
</template>
