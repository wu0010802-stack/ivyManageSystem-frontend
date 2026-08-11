<template>
  <div class="sign-list-view">
    <SectionHeader title="待簽文件" />
    <EmptyState
      v-if="!loading && pending.length === 0"
      variant="mobile"
      title="目前沒有待簽文件"
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
        <div class="sign-card__meta">{{ item.student_name }} · 已於 {{ formatDate(item.signed_at) }} 簽署</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import SectionHeader from '../components/SectionHeader.vue'
import { listMySignRequests, type SignRequestSummary } from '../api/signDocuments'
import { toast } from '../utils/toast'

const router = useRouter()
const pending = ref<SignRequestSummary[]>([])
const signed = ref<SignRequestSummary[]>([])
const loading = ref(false)

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: '入學契約',
  consent_form: '同意書',
  photo_release: '照片授權書',
  other: '文件',
}
function docTypeLabel(v: string) {
  return DOC_TYPE_LABELS[v] ?? v
}
function formatDate(iso: string | null) {
  return iso ? iso.replace('T', ' ').slice(0, 16) : ''
}

async function load() {
  loading.value = true
  try {
    const { data } = await listMySignRequests()
    pending.value = data.pending
    signed.value = data.signed
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
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
  font-size: 15px;
}

.sign-card__meta {
  font-size: 13px;
  color: var(--pt-text-secondary, #6b7280);
  margin-top: 4px;
}

.sign-card__badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 12px;
  color: var(--pt-warning, #f59e0b);
  font-weight: 600;
}
</style>
