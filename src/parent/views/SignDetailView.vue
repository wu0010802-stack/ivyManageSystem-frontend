<template>
  <div class="sign-detail-view">
    <div v-if="loading" class="sign-detail-view__loading">載入中…</div>

    <template v-else-if="doc">
      <h2 class="sign-detail-view__title">{{ doc.title }}</h2>

      <div v-if="doc.status === 'signed'" class="sign-detail-view__done">
        <p>您已於 {{ formatDate(doc.signed_at) }} 完成簽署。</p>
        <button type="button" class="sign-detail-view__pdf-link" @click="openPdf">
          查看已簽署 PDF
        </button>
      </div>

      <template v-else>
        <div
          ref="contentRef"
          class="sign-detail-view__content"
          @scroll="onScroll"
          v-html="renderedHtml"
        />

        <label class="sign-detail-view__checkbox">
          <input v-model="confirmedRead" type="checkbox" :disabled="!scrolledToBottom" />
          我已閱讀並瞭解上述文件內容
        </label>

        <div class="sign-detail-view__signature">
          <p class="sign-detail-view__signature-label">請於下方簽名：</p>
          <SignaturePad ref="padRef" :width="320" :height="160" @mouseup="checkSignature" @touchend="checkSignature" />
        </div>

        <button
          type="button"
          class="sign-detail-view__submit"
          :disabled="!submittable || submitting"
          @click="submit"
        >
          {{ submitting ? '送出中…' : '確認簽署' }}
        </button>
      </template>
    </template>

    <EmptyState v-else variant="mobile" title="找不到文件" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import SignaturePad from '../components/SignaturePad.vue'
import { getMySignRequest, signMyRequest, mySignPdfUrl, type SignRequestDetailOut } from '../api/signDocuments'
import { renderMd, blobToDataUrl, canSubmit } from '../utils/mdRender'
import { toast } from '../utils/toast'

interface SignaturePadRef {
  isEmpty(): boolean
  toBlob(): Promise<Blob | null>
}

const route = useRoute()
const router = useRouter()

const doc = ref<SignRequestDetailOut | null>(null)
const loading = ref(false)
const submitting = ref(false)

const scrolledToBottom = ref(false)
const confirmedRead = ref(false)
const hasSignature = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const padRef = ref<SignaturePadRef | null>(null)

const renderedHtml = computed(() => (doc.value ? renderMd(doc.value.content_md) : ''))
const submittable = computed(() => canSubmit(scrolledToBottom.value, confirmedRead.value, hasSignature.value))

function formatDate(iso: string | null) {
  return iso ? iso.replace('T', ' ').slice(0, 16) : ''
}

function onScroll() {
  const el = contentRef.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
    scrolledToBottom.value = true
  }
}

function checkSignature() {
  hasSignature.value = !!(padRef.value && !padRef.value.isEmpty())
}

async function load() {
  loading.value = true
  try {
    const id = Number(route.params.id)
    const { data } = await getMySignRequest(id)
    doc.value = data
  } catch {
    doc.value = null
  } finally {
    // loading 必須先變 false 讓模板切換到內容分支、contentRef 才會綁到真實
    // DOM 元素；先前 nextTick 檢查放在 finally 之前，loading 仍是 true、
    // 模板還停在「載入中…」，contentRef 恆為 null，「內容不足一屏自動視為
    // 已讀」永遠不生效（測試揭發此邏輯序問題）。
    loading.value = false
  }
  if (doc.value && doc.value.status !== 'signed') {
    await nextTick()
    // 內容不足一屏（無需捲動）→ 直接視為已讀到底
    const el = contentRef.value
    if (el && el.scrollHeight <= el.clientHeight) {
      scrolledToBottom.value = true
    }
  }
}

async function submit() {
  if (!submittable.value || !padRef.value || !doc.value || submitting.value) return
  submitting.value = true
  try {
    const blob = await padRef.value.toBlob()
    if (!blob) {
      toast.error('簽名讀取失敗，請重新簽名')
      submitting.value = false
      return
    }
    const signatureData = await blobToDataUrl(blob)
    await signMyRequest(doc.value.id, {
      signature_data: signatureData,
      confirmed_read: true,
    })
    toast.success('簽署完成')
    await load()
  } catch (err) {
    const e = err as { response?: { status?: number }; displayMessage?: string }
    if (e.response?.status === 409) {
      toast.warn('已由另一位家長完成簽署')
      router.replace('/sign')
    } else {
      toast.error(e.displayMessage || '簽署失敗，請稍後再試')
    }
  } finally {
    submitting.value = false
  }
}

function openPdf() {
  if (!doc.value) return
  window.open(mySignPdfUrl(doc.value.id), '_blank', 'noopener')
}

onMounted(load)
</script>

<style scoped>
.sign-detail-view {
  padding: 16px;
}

.sign-detail-view__title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 12px;
}

.sign-detail-view__content {
  max-height: 50vh;
  overflow-y: auto;
  border: 1px solid var(--pt-border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  line-height: 1.7;
}

.sign-detail-view__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
  min-height: var(--touch-target-min, 44px);
}

.sign-detail-view__signature {
  margin: 16px 0;
}

.sign-detail-view__signature-label {
  font-size: 14px;
  margin-bottom: 8px;
}

.sign-detail-view__submit {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  border-radius: 8px;
  border: none;
  background: var(--pt-primary, #4eb87a);
  color: #fff;
  font-weight: 600;
  font-size: 15px;
}

.sign-detail-view__submit:disabled {
  background: var(--pt-text-disabled, #cbd5e1);
  cursor: not-allowed;
}

.sign-detail-view__pdf-link {
  min-height: var(--touch-target-min, 44px);
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--pt-primary, #4eb87a);
  background: transparent;
  color: var(--pt-primary, #4eb87a);
}

.sign-detail-view__loading {
  padding: 40px;
  text-align: center;
  color: var(--pt-text-secondary, #6b7280);
}
</style>
