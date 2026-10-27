<template>
  <div class="sign-list-view">
    <SectionHeader title="待簽的入學文件" />
    <!-- 三態：載入中 → 載入失敗（可重試）→ 空狀態；失敗不得畫成「沒有待簽文件」 -->
    <div v-if="loading && !hasData" class="sign-list-view__cards">
      <SkeletonBlock variant="card" :count="2" />
    </div>
    <MobileErrorRetry
      v-else-if="loadError && !hasData"
      :error="loadErrorMessage(loadError, '待簽文件載入失敗，請檢查網路後重試')"
      @retry="load"
    />
    <EmptyState
      v-else-if="pending.length === 0"
      variant="mobile"
      title="目前沒有待簽的入學文件"
      description="有新文件時會透過 LINE 通知您"
    />
    <div v-else class="sign-list-view__cards">
      <button
        v-for="item in pending"
        :key="item.id"
        type="button"
        class="sign-card sign-card--pending"
        @click="goDetail(item.id)"
      >
        <div class="sign-card__title">{{ item.title }}</div>
        <div class="sign-card__meta">{{ item.student_name }} · {{ docTypeLabel(item.doc_type) }}</div>
        <div class="sign-card__badge">待簽</div>
      </button>
    </div>

    <SectionHeader v-if="signed.length" title="已簽文件" />
    <div v-if="signed.length" class="sign-list-view__cards">
      <button
        v-for="item in signed"
        :key="item.id"
        type="button"
        class="sign-card sign-card--signed"
        @click="goDetail(item.id)"
      >
        <div class="sign-card__title">{{ item.title }}</div>
        <div class="sign-card__meta">{{ item.student_name }} · 已於 {{ formatIsoMinute(item.signed_at) }} 簽署</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import SectionHeader from '../components/SectionHeader.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { listMySignRequests, type SignRequestSummary } from '../api/signDocuments'
import { toast } from '../utils/toast'
import { loadErrorMessage } from '../utils/loadError'
import { formatIsoMinute } from '@/utils/format'

const router = useRouter()
const pending = ref<SignRequestSummary[]>([])
const signed = ref<SignRequestSummary[]>([])
// 初值 true：首屏在 onMounted 發請求前就先畫骨架，不閃「目前沒有待簽文件」
const loading = ref(true)
const loadError = ref<unknown>(null)
const hasData = computed(() => pending.value.length > 0 || signed.value.length > 0)

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: '入學契約',
  consent_form: '同意書',
  photo_release: '照片授權書',
  other: '文件',
}
function docTypeLabel(v: string) {
  return DOC_TYPE_LABELS[v] ?? v
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const { data } = await listMySignRequests()
    pending.value = data.pending
    signed.value = data.signed
  } catch (err) {
    loadError.value = err
    // 已有資料（重新整理失敗）時畫面維持舊清單，只用 toast 告知
    if (hasData.value) toast.error(loadErrorMessage(err, '載入失敗'))
  } finally {
    loading.value = false
  }
}

function goDetail(id: number) {
  router.push(`/sign/${id}`)
}

onMounted(load)
</script>

<style scoped>
.sign-list-view {
  padding: 16px;
}

.sign-list-view__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.sign-card {
  display: block;
  width: 100%;
  text-align: left;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--pt-border, #e5e7eb);
  background: var(--pt-surface, #fff);
  cursor: pointer;
  min-height: var(--touch-target-min, 44px);
  position: relative;
}

.sign-card--pending {
  border-left: 4px solid var(--pt-warning, #f59e0b);
}

.sign-card--signed {
  opacity: 0.85;
}

.sign-card__title {
  font-weight: 600;
  font-size: 0.9375rem;
}

.sign-card__meta {
  font-size: 0.8125rem;
  color: var(--pt-text-secondary, #6b7280);
  margin-top: 4px;
}

.sign-card__badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 0.75rem;
  color: var(--pt-warning, #f59e0b);
  font-weight: 600;
}
</style>
