<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { previewAppraisalPayout } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { formatCurrency } from '@/utils/currency'

// 422 = 「該學年尚無可發放的來源考核資料」的引導空狀態文案。不可直接顯示後端
// detail（如「appraisal_cycle academic_year=113 FIRST 不存在；請先在考核管理建立此
// cycle」）——那是給開發者看的內部訊息，年份換算（發放年 N 對應前一個已完整結束的
// 學年）本身是正確的刻意設計，不是後端 bug，使用者不需要知道 cycle 內部代號
// （2026-07-31 QA 缺陷）。
const NOT_READY_MESSAGE = '本年度尚無可發放的考核年終資料，可切換年份，或前往考核管理建立來源學年的考核週期'

const props = defineProps<{ year: number }>()
const emit = defineEmits<{ stats: [n: number]; 'stats-error': [] }>()
const loading = ref(false)
const error = ref('')
// 422 = 資料態尚未就緒（來源學年 cycle 未建立），非載入失敗：顯示友善空狀態，
// 且不 emit stats-error（避免點亮父層「部分卡片載入失敗」橫幅）
const notReady = ref(false)
const count = ref(0)
const totalAmount = ref(0)

// previewAppraisalPayout 回傳裸陣列 PayoutPreviewRow[]（非 { rows: [...] }，見
// schema.d.ts get_preview_api_year_end_appraisal_payout_preview_get）
async function load() {
  loading.value = true
  error.value = ''
  notReady.value = false
  try {
    const rows = (await previewAppraisalPayout(props.year)).data
    count.value = rows.length
    totalAmount.value = rows.reduce((sum, r) => sum + Number(r.total_amount), 0)
    emit('stats', count.value)
  } catch (e) {
    const status = (e as { response?: { status?: number } } | null)?.response?.status
    if (status === 422) {
      notReady.value = true
      error.value = NOT_READY_MESSAGE
      emit('stats', 0)
    } else {
      error.value = apiError(e, '載入失敗')
      emit('stats-error')
    }
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
    <el-empty v-else-if="notReady" :description="error" :image-size="48" />
    <div v-else-if="error" class="wb-card__error">
      {{ error }} <el-button size="small" text type="primary" @click="load">重試</el-button>
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
