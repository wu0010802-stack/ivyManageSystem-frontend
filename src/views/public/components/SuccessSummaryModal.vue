<script setup lang="ts">
/**
 * A1-P5：從 ActivityPublicView 抽出的「報名成功」摘要 modal。
 *
 * 含複製查詢碼 / 編修連結、Web Share API、copyHint 短暫顯示。
 * Summary 物件由 parent 維護(reactive),child 直接 mutate summary.copyHint 顯示複製
 * 結果(預期行為,Vue 3 reactive object cross-component mutation OK)。
 *
 * Props:
 *   summary: { visible, message, studentName, parentPhone,
 *              enrolledCourses, waitlistCourses, selectedSupplies, totalAmount,
 *              queryToken, editUrl, copyHint } — reactive
 * Emits:
 *   close
 */
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import BrandMark from '@/components/brand/BrandMark.vue'

interface CourseItem { name: string; price: number }
interface Summary {
  visible: boolean
  message: string
  studentName: string
  parentPhone: string
  enrolledCourses: CourseItem[]
  waitlistCourses: CourseItem[]
  selectedSupplies: CourseItem[]
  totalAmount: number
  queryToken: string
  editUrl: string
  copyHint: string
  // 家長輸入的通知信箱（來源＝本地 form 值，非 API response）；有值才顯示提示行
  email?: string
}

const props = defineProps<{
  summary: Summary
}>()
defineEmits<{
  (e: 'close'): void
}>()

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    props.summary.copyHint = `已複製${label}`
    setTimeout(() => { props.summary.copyHint = '' }, 2500)
  } catch {
    props.summary.copyHint = '複製失敗，請手動長按文字選取'
    setTimeout(() => { props.summary.copyHint = '' }, 4000)
  }
}

// 2026-07-08 業主指示：暫時停用「分享給家人」按鈕（Web Share API）。
// 恢復時把下方註解與 template 內對應區塊一起打開，並補回 `import { computed } from 'vue'`。
// const canShare = computed(
//   () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
// )
//
// async function shareToken() {
//   if (!canShare.value) return
//   try {
//     await navigator.share({
//       title: '才藝報名查詢碼',
//       text:
//         `查詢碼：${props.summary.queryToken}\n編修連結：${props.summary.editUrl}\n` +
//         '（請勿轉傳給校外人士，僅供家人留存）',
//       url: props.summary.editUrl,
//     })
//   } catch (err) {
//     // 使用者取消分享屬正常流程,不顯示錯誤
//     if (err && (err as { name?: string }).name !== 'AbortError') {
//       props.summary.copyHint = '分享失敗，請改用複製按鈕'
//       setTimeout(() => { props.summary.copyHint = '' }, 4000)
//     }
//   }
// }
</script>

<template>
  <div
    v-if="summary.visible"
    class="modal-overlay is-visible"
    role="dialog"
    aria-modal="true"
    aria-labelledby="successModalTitle"
    @click.self="$emit('close')"
  >
    <div class="modal-panel modal-panel--success">
      <div class="modal-header">
        <h3 id="successModalTitle" class="modal-title">
          <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-check" /></svg>
          報名資料已送出
        </h3>
        <button type="button" class="modal-close" aria-label="關閉視窗" @click="$emit('close')">
          <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="success-brand-banner" aria-hidden="true">
          <KawaiiStar :size="22" expression="wink" decorative class="success-brand-star success-brand-star--l" />
          <BrandMark variant="mark-only" :size="64" />
          <KawaiiStar :size="18" expression="smile" decorative class="success-brand-star success-brand-star--r" />
        </div>
        <p class="success-msg">{{ summary.message }}</p>

        <div class="summary-block">
          <div class="summary-row"><span class="summary-label">幼兒姓名</span><span class="summary-value">{{ summary.studentName }}</span></div>
          <div class="summary-row"><span class="summary-label">家長手機</span><span class="summary-value">{{ summary.parentPhone }}</span></div>
        </div>

        <div v-if="summary.enrolledCourses.length > 0" class="summary-section">
          <div class="summary-section-title">
            <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-check" /></svg>
            已報名課程（{{ summary.enrolledCourses.length }}）
          </div>
          <ul class="summary-list">
            <li v-for="c in summary.enrolledCourses" :key="`e-${c.name}`">
              <span>{{ c.name }}</span><span class="summary-amount">${{ c.price }}</span>
            </li>
          </ul>
        </div>

        <div v-if="summary.waitlistCourses.length > 0" class="summary-section is-waitlist">
          <div class="summary-section-title">
            <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-alert" /></svg>
            候補課程（{{ summary.waitlistCourses.length }}）
          </div>
          <ul class="summary-list">
            <li v-for="c in summary.waitlistCourses" :key="`w-${c.name}`">
              <span>{{ c.name }}</span><span class="summary-amount summary-amount--muted">候補中</span>
            </li>
          </ul>
          <p class="summary-note">候補課程不計入應繳金額，校方將儘快與您聯繫。</p>
        </div>

        <div v-if="summary.selectedSupplies.length > 0" class="summary-section">
          <div class="summary-section-title">加購項目</div>
          <ul class="summary-list">
            <li v-for="s in summary.selectedSupplies" :key="`s-${s.name}`">
              <span>{{ s.name }}</span><span class="summary-amount">${{ s.price }}</span>
            </li>
          </ul>
        </div>

        <div class="summary-total">
          <span>預估應繳金額</span>
          <strong>${{ summary.totalAmount }}</strong>
        </div>
        <p class="summary-final-note">本金額不含候補課程；實際金額以園方確認後通知為準。</p>

        <p v-if="summary.email" class="email-notice">
          報名資訊將寄送至 {{ summary.email }}，未收到請檢查垃圾郵件匣。
        </p>

        <div v-if="summary.queryToken" class="success-token-box">
          <div class="token-title">查詢 / 編修專用連結</div>
          <p class="token-hint">
            請<strong>妥善保存以下查詢碼</strong>，後續查詢或修改報名資料時可免去輸入姓名/生日，僅需查詢碼 + 家長手機。
          </p>
          <div class="token-row">
            <span class="token-label">查詢碼</span>
            <input
              class="token-input"
              type="text"
              readonly
              :value="summary.queryToken"
              aria-label="報名查詢碼（唯讀，可選取複製）"
              @focus="($event.target as HTMLInputElement | null)?.select()"
            />
            <button
              type="button"
              class="btn-copy"
              aria-label="複製查詢碼"
              @click="copyToClipboard(summary.queryToken, '查詢碼')"
            >
              <svg width="14" height="14" aria-hidden="true"><use href="#i-copy" /></svg>
              複製
            </button>
          </div>
          <div class="token-row">
            <span class="token-label">編修連結</span>
            <input
              class="token-input token-input--link"
              type="url"
              readonly
              :value="summary.editUrl"
              aria-label="編修連結（唯讀，可選取複製）"
              @focus="($event.target as HTMLInputElement | null)?.select()"
            />
            <button
              type="button"
              class="btn-copy"
              aria-label="複製編修連結"
              @click="copyToClipboard(summary.editUrl, '連結')"
            >
              <svg width="14" height="14" aria-hidden="true"><use href="#i-copy" /></svg>
              複製
            </button>
          </div>
          <!-- 2026-07-08 業主指示：暫時停用「分享給家人」按鈕（連同 script 的 canShare/shareToken 一起註解）
          <div v-if="canShare" class="token-share-row">
            <button
              type="button"
              class="btn btn-outline btn-share"
              @click="shareToken"
            >
              <svg width="16" height="16" aria-hidden="true"><use href="#i-share" /></svg>
              分享給家人（Line / 訊息 / Email）
            </button>
          </div>
          -->
          <div v-if="summary.copyHint" class="token-copy-hint">
            <svg width="12" height="12" aria-hidden="true"><use href="#i-check" /></svg>
            {{ summary.copyHint }}
          </div>
          <p class="token-warn">⚠ 連結含個資識別碼，請勿轉傳他人。</p>
        </div>

        <button type="button" class="btn btn-primary btn-block" @click="$emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.email-notice {
  font-size: 0.85rem;
  color: #4a6b5d;
  background: #eef6f1;
  border-radius: 8px;
  padding: 8px 12px;
  margin: 8px 0;
}
</style>
