<template>
  <div class="sign-detail-view">
    <div v-if="loading" class="sign-detail-view__loading" aria-busy="true">
      <SkeletonBlock variant="card" :count="2" />
    </div>

    <!-- 連線／伺服器失敗 ≠ 找不到文件：失敗給可重試錯誤態，只有 404 才說找不到 -->
    <MobileErrorRetry
      v-else-if="loadError"
      :error="loadErrorMessage(loadError, '文件載入失敗，請檢查網路後重試')"
      @retry="load"
    />

    <template v-else-if="doc">
      <h2 class="sign-detail-view__title">{{ doc.title }}</h2>

      <div v-if="doc.status === 'signed'" class="sign-detail-view__done">
        <p>您已於 {{ formatIsoMinute(doc.signed_at) }} 完成簽署。</p>
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

        <!-- 勾選框要等內部捲動區讀到底才可用；先前沒有任何提示，家長以為壞了 -->
        <div v-if="!scrolledToBottom" class="sign-detail-view__read-hint" data-testid="read-hint">
          <p id="sign-read-hint">請先把上方文件捲動閱讀到最底，才能勾選「我已閱讀」。</p>
          <button
            type="button"
            class="sign-detail-view__to-bottom"
            data-testid="scroll-to-bottom"
            @click="scrollContentToBottom"
          >捲到文件底部</button>
        </div>

        <label class="sign-detail-view__checkbox">
          <input
            v-model="confirmedRead"
            type="checkbox"
            :disabled="!scrolledToBottom"
            :aria-describedby="scrolledToBottom ? undefined : 'sign-read-hint'"
          />
          我已閱讀並瞭解上述文件內容
        </label>

        <div class="sign-detail-view__signature">
          <p class="sign-detail-view__signature-label">請於下方簽名：</p>
          <SignaturePad ref="padRef" :width="320" :height="160" @mouseup="checkSignature" @touchend="checkSignature" @clear="hasSignature = false" />
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

    <EmptyState
      v-else
      variant="mobile"
      title="找不到這份文件"
      description="文件可能已撤回或連結已失效，請回到待簽文件列表確認。"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import SignaturePad from '../components/SignaturePad.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { isNotFoundError, loadErrorMessage } from '../utils/loadError'
import { getMySignRequest, signMyRequest, mySignPdfUrl, type SignRequestDetailOut } from '../api/signDocuments'
import { renderMd, blobToDataUrl, canSubmit } from '../utils/mdRender'
import { toast } from '../utils/toast'
import { invalidateHomeSummary } from '../composables/useHomeSummary'
import { formatIsoMinute } from '@/utils/format'

interface SignaturePadRef {
  isEmpty(): boolean
  toBlob(): Promise<Blob | null>
}

const route = useRoute()
const router = useRouter()

const doc = ref<SignRequestDetailOut | null>(null)
// 初值 true：首屏就是骨架，不先閃「找不到這份文件」
const loading = ref(true)
const loadError = ref<unknown>(null)
const submitting = ref(false)

const scrolledToBottom = ref(false)
const confirmedRead = ref(false)
const hasSignature = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const padRef = ref<SignaturePadRef | null>(null)

const renderedHtml = computed(() => (doc.value ? renderMd(doc.value.content_md) : ''))
const submittable = computed(() => canSubmit(scrolledToBottom.value, confirmedRead.value, hasSignature.value))

function onScroll() {
  const el = contentRef.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
    scrolledToBottom.value = true
  }
}

/** 「捲到文件底部」：直接跳到捲動區底端（與家長自己捲到底等效）。 */
function scrollContentToBottom() {
  const el = contentRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  onScroll()
}

function checkSignature() {
  hasSignature.value = !!(padRef.value && !padRef.value.isEmpty())
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const id = Number(route.params.id)
    const { data } = await getMySignRequest(id)
    doc.value = data
  } catch (err) {
    doc.value = null
    // 404 落到下方「找不到」分支；其餘（斷線、5xx）進可重試錯誤態
    if (!isNotFoundError(err)) loadError.value = err
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
    void invalidateHomeSummary()
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
  font-size: 1.125rem;
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

.sign-detail-view__read-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  margin-top: var(--space-3, 12px);
}
.sign-detail-view__read-hint p { margin: 0; flex: 1 1 200px; }
.sign-detail-view__to-bottom {
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-4, 16px);
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-weight: 600;
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
  font-size: 0.875rem;
  margin-bottom: 8px;
}

.sign-detail-view__submit {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  border-radius: 8px;
  border: none;
  background: var(--pt-primary, #4eb87a);
  color: var(--color-primary-contrast, #fff);
  font-weight: 600;
  font-size: 0.9375rem;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
