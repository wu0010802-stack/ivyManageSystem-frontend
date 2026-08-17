<script setup lang="ts">
import { ref, watch } from 'vue'
import { getSignStatusSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'
import SignProgressBar from './SignProgressBar.vue'

const props = defineProps<{ cycle: { id: number; label: string; status: string } | null }>()
const emit = defineEmits<{ stats: [n: number]; 'stats-error': [] }>()
const loading = ref(false)
const error = ref('')
const counts = ref<Record<string, number>>({})

async function load() {
  if (!props.cycle) {
    emit('stats', 0)
    return
  }
  loading.value = true
  error.value = ''
  try {
    const acc = (await getSignStatusSummary(props.cycle.id)).data.counts ?? {}
    counts.value = acc
    const total = Object.values(acc).reduce((s, n) => s + n, 0)
    const pendingSign = total - (acc.FINALIZED ?? 0)
    emit('stats', pendingSign)
  } catch (e) {
    error.value = apiError(e, '載入失敗')
    emit('stats-error')
  } finally {
    loading.value = false
  }
}
// 父層 cycle 把手為非同步取得（掛載當下多半是 null），watch＋immediate 取代
// onMounted：cycle 從 null 變為實值時才真正觸發載入，避免資料永遠停在初始空態
watch(() => props.cycle?.id, load, { immediate: true })
</script>

<template>
  <el-card shadow="never" data-test="appraisal-card" class="wb-card">
    <template #header>
      <div class="wb-card__head">
        <span class="wb-card__title">當期考核</span>
        <el-tag v-if="cycle" size="small" :type="CYCLE_STATUS_TAG[cycle.status] ?? 'info'">
          {{ cycle.label }}（{{ CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status }}）
        </el-tag>
      </div>
      <p class="wb-card__subtitle">本學期教師考核與簽核進度</p>
    </template>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else-if="error" class="wb-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="!cycle" description="本學期尚未建立考核週期" :image-size="48">
      <router-link class="wb-card__cta" to="/appraisal-year-end/appraisal">前往建立 →</router-link>
    </el-empty>
    <template v-else>
      <SignProgressBar :counts="counts" />
      <router-link class="wb-card__cta" :to="`/appraisal-year-end/appraisal?cycle=${cycle.id}&stage=sign&view=kanban`">前往簽核 →</router-link>
    </template>
  </el-card>
</template>

<style scoped>
.wb-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.wb-card__title { font-weight: 600; }
.wb-card__subtitle { font-size: var(--text-xs); color: var(--text-secondary); margin: 2px 0 0; }
.wb-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-card__cta { display: inline-block; margin-top: var(--space-3); font-size: var(--text-sm); color: var(--el-color-primary); text-decoration: none; }
.wb-card__cta:hover { text-decoration: underline; }
</style>
