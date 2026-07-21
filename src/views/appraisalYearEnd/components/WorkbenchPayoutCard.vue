<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { previewAppraisalPayout } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { formatCurrency } from '@/utils/currency'

const props = defineProps<{ year: number }>()
const emit = defineEmits<{ stats: [n: number]; 'stats-error': [] }>()
const loading = ref(false)
const error = ref('')
const count = ref(0)
const totalAmount = ref(0)

// previewAppraisalPayout 回傳裸陣列 PayoutPreviewRow[]（非 { rows: [...] }，見
// schema.d.ts get_preview_api_year_end_appraisal_payout_preview_get）
async function load() {
  loading.value = true
  error.value = ''
  try {
    const rows = (await previewAppraisalPayout(props.year)).data
    count.value = rows.length
    totalAmount.value = rows.reduce((sum, r) => sum + Number(r.total_amount), 0)
    emit('stats', count.value)
  } catch (e) {
    error.value = apiError(e, '載入失敗')
    emit('stats-error')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <el-card shadow="never" data-test="payout-card" class="wb-card">
    <template #header>
      <div class="wb-card__head">
        <span class="wb-card__title">考核年終發放</span>
        <el-tag size="small" type="info">{{ year }} 年</el-tag>
      </div>
      <p class="wb-card__subtitle">考核年終獎金 E 化轉帳</p>
    </template>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else-if="error" class="wb-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="count === 0" description="本年度尚無可發放的考核年終" :image-size="48" />
    <template v-else>
      <p class="wb-card__counts">可發放 {{ count }} 筆、合計 {{ formatCurrency(totalAmount) }}</p>
      <router-link class="wb-card__cta" :to="`/appraisal-year-end/year-end/payout?year=${year}`">前往發放 →</router-link>
    </template>
  </el-card>
</template>

<style scoped>
.wb-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.wb-card__title { font-weight: 600; }
.wb-card__subtitle { font-size: var(--text-xs); color: var(--text-secondary); margin: 2px 0 0; }
.wb-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-card__counts { font-size: var(--text-sm); color: var(--text-secondary); margin: 0; }
.wb-card__cta { display: inline-block; margin-top: var(--space-3); font-size: var(--text-sm); color: var(--el-color-primary); text-decoration: none; }
.wb-card__cta:hover { text-decoration: underline; }
</style>
