<script setup lang="ts">
/**
 * 家長端維護中頁面（LIFF 風格）。
 *
 * 觸發路徑：parent axios interceptor 偵測到 503 + detail.code === 'MAINTENANCE_MODE'
 * 時 router.replace 到 /maintenance?message=<後端訊息>。
 *
 * 「重新載入」按鈕直接打 /health/ready：
 *   - 200 → window.reload（重新初始化 parent App）
 *   - 非 200（仍 503）→ parent 的 toast.warn 提示「仍在維護中」
 *
 * 注意：本 view 自己呼叫 /health/ready 時若仍 503，會走 interceptor 的 503 path。
 * Interceptor 的 `router.currentRoute.value.path === '/maintenance'` guard
 * 避免無窮 redirect。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import parentApi from '@/parent/api'
import { toast } from '@/parent/utils/toast'

interface Props {
  message?: string
}
const props = withDefaults(defineProps<Props>(), {
  message: '系統維護中，請稍後再回來',
})

const route = useRoute()
const displayMessage = computed(() => {
  const q = route.query?.message
  if (typeof q === 'string' && q.trim()) return q
  return props.message
})

const refreshing = ref(false)

async function tryRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const r = await parentApi.get('/health/ready')
    if (r.status === 200) {
      window.location.reload()
      return
    }
    toast.warn('仍在維護中，請稍後再試')
  } catch {
    toast.warn('仍在維護中，請稍後再試')
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="parent-maintenance">
    <div class="card">
      <span class="material-symbols-rounded mv-icon" aria-hidden="true">engineering</span>
      <h2>系統升級中</h2>
      <p>{{ displayMessage }}</p>
      <button type="button" :disabled="refreshing" @click="tryRefresh">
        {{ refreshing ? '檢查中…' : '重新載入' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── 維護頁區域 token（語意映射至全域 design-tokens）──
 * 整頁冷調 slate 漸層，與家長 app Bento surface 一致。
 * --mv-heading-color  → 品牌 teal secondary
 * --mv-body-color     → 正文 muted text
 * --mv-btn-bg         → 品牌 teal 主色
 * --mv-btn-hover-bg   → 品牌 teal deep
 */
.parent-maintenance {
  --mv-gradient-start: var(--m3-surface-container-low, #f4f7fa);
  --mv-gradient-end:   var(--m3-surface-container-lowest, #ffffff);
  --mv-heading-color:  var(--brand-secondary, #33aaaa);
  --mv-body-color:     var(--pt-text-muted, #64748b);
  --mv-btn-bg:         var(--brand-secondary, #33aaaa);
  --mv-btn-hover-bg:   var(--ivy-teal-primary, #33aaaa);

  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, var(--mv-gradient-start) 0%, var(--mv-gradient-end) 100%);
  padding: 24px;
}
.card {
  background: var(--pt-surface-card, #ffffff);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: var(--pt-elev-2);
  max-width: 360px;
  width: 100%;
}
.mv-icon {
  font-size: 4rem;
  line-height: 1;
  margin-bottom: 16px;
  display: block;
  color: var(--mv-heading-color);
}
h2 {
  font-size: 1.5rem;
  margin: 0 0 12px;
  color: var(--mv-heading-color);
}
p {
  color: var(--mv-body-color);
  line-height: 1.6;
  margin: 0 0 24px;
  font-size: 0.95rem;
}
button {
  background: var(--mv-btn-bg);
  color: var(--pt-on-accent, #fff);
  border: none;
  padding: 12px 32px;
  border-radius: 24px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  min-width: 140px;
}
button:hover:not(:disabled) {
  background: var(--mv-btn-hover-bg);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
