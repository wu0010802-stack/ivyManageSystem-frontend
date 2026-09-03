<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, CircleCheck, Mute, Refresh, Pointer } from '@element-plus/icons-vue'
import {
  acknowledgeDismissalCall,
  completeDismissalCall,
  cancelPortalDismissalCall,
} from '@/api/dismissalCalls'
import DismissalCallCard from '@/components/dismissal/DismissalCallCard.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import {
  useNowClock,
  isPreArrivalNotice,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
import { usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'

type DismissalCall = DismissalCallView

// ─── 接送提醒 composable（module-singleton，WS 由殼層 PortalLayout 統一管理）───
const {
  activeCalls,
  sortedCalls,
  loading,
  liveAnnounce,
  wsConnected,
  connectionState,
  connectionMessage,
  muted,
  audioUnlocked,
  notificationSupported,
  toggleMute,
  unlockAudio,
  unlockSpeech,
  playAlert,
  cancelPendingSpeech,
  fetchCalls,
  retryWebSocket,
} = usePortalDismissalAlerts()

// 等候時間活著跳（單一 30s 時鐘，供 DismissalCallCard urgency 計算）
const { now } = useNowClock()

// 瀏覽器通知是否已授權（false = 需顯示降級提示）
const notificationPermitted = computed(() => {
  if (!notificationSupported.value) return false
  try { return Notification.permission === 'granted' } catch { return false }
})

// ─── 測試聲音：user gesture 解鎖 AudioContext + speechSynthesis，走與真實通知同一序列 ──
// 先 cancelPendingSpeech 清掉上一次待播，連點「測試」不會堆疊。
const testSound = () => {
  unlockAudio()
  unlockSpeech()
  cancelPendingSpeech()
  playAlert({ student_name: '測試', classroom_name: '小班' })
}

// ─── 確認已收到 ──────────────────────────────────────────
// 教師端不再有獨立「帶出去放學」步驟：按下「我收到了」即視為完成。
// 家長已在門口（或 staff 舊流程建立，arrived_at 已寫入）→ 確認已收到後立即帶出放學。
// 家長預告尚未抵達 → 先標記已收到；待 usePortalDismissalAlerts 收到
// dismissal_call_arrived 事件（家長抵達門口）時自動完成放學，教師不需再操作第二次。
const handleAcknowledge = async (call: DismissalCall) => {
  try {
    await acknowledgeDismissalCall(call.id)
    if (isPreArrivalNotice(call)) {
      const idx = activeCalls.value.findIndex(c => c.id === call.id)
      if (idx !== -1) activeCalls.value[idx].status = 'acknowledged'
      return
    }
    await completeDismissalCall(call.id)
    activeCalls.value = activeCalls.value.filter(c => c.id !== call.id)
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '操作失敗')
  }
}

// ─── 取消通知（誤建／家長改口）───────────────────────────
// 2026-08-24 起教師可自行取消 pending/acknowledged 通知，不必再找管理端。
const handleCancel = async (call: DismissalCall) => {
  try {
    await ElMessageBox.confirm(
      `確定取消 ${call.student_name}（${call.classroom_name}）的接送通知？\n取消後這筆通知即結束，若家長仍會來接請重新建立。`,
      '取消接送通知',
      {
        confirmButtonText: '取消通知',
        cancelButtonText: '返回',
        type: 'warning',
      },
    )
  } catch {
    return // 使用者返回
  }
  try {
    await cancelPortalDismissalCall(call.id)
    activeCalls.value = activeCalls.value.filter(c => c.id !== call.id)
    ElMessage.success('已取消接送通知')
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '操作失敗')
  }
}

// ─── Lifecycle：進頁時補抓一次最新（殼層 WS 持續推播，此為安全網）──
onMounted(() => {
  fetchCalls()
})
</script>

<template>
  <div class="portal-dismissal-calls">
    <!-- 無障礙即時宣告：新通知到達時報讀，與 beep/震動/瀏覽器推播對等 -->
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveAnnounce }}</p>

    <!-- sticky 外殼保留（接送通知要一直看得到連線狀態與聲音開關），內容改走共用頁首 -->
    <header class="page-head">
      <PortalPageHeader>
        <template #title>
          接送通知
          <span v-if="activeCalls.length" class="page-head__count">待接送 {{ activeCalls.length }}</span>
        </template>
        <template #actions>
        <el-tag
          :type="wsConnected ? 'success' : 'warning'"
          size="small"
          effect="light"
          class="conn-tag"
        >
          {{ wsConnected ? '即時接收中' : '連線不穩' }}
        </el-tag>
        <div class="sound-ctl">
          <button
            type="button"
            class="sound-ctl__toggle"
            :class="{ 'is-on': !muted }"
            :aria-pressed="muted ? 'false' : 'true'"
            @click="toggleMute"
          >
            <el-icon><component :is="muted ? Mute : Bell" /></el-icon>
            <span>通知聲音{{ muted ? '關' : '開' }}</span>
          </button>
          <button
            v-if="!muted"
            type="button"
            class="sound-ctl__test"
            @click="testSound"
          >測試</button>
        </div>
        </template>
      </PortalPageHeader>
    </header>

    <!-- 音效尚未解鎖提示：iOS/LINE WebView 需 user gesture 才能播聲音 -->
    <div v-if="!audioUnlocked" class="degrade-hint degrade-hint--audio" role="status">
      <el-icon aria-hidden="true"><Pointer /></el-icon>
      <span>點一下畫面以啟用接送提醒音</span>
    </div>

    <!-- 背景推播不可用提示：此裝置/瀏覽器不支援 Notification，或使用者未授權 -->
    <div v-if="!notificationPermitted" class="degrade-hint degrade-hint--notify" role="status">
      <span>此裝置無法背景推播，請保持 App 開啟並開啟聲音</span>
    </div>

    <!-- 連線狀態 banner（reconnecting 黃 / exhausted 紅）-->
    <div
      v-if="connectionState !== 'normal'"
      class="conn-banner"
      :class="`conn-banner--${connectionState}`"
      role="alert"
    >
      <div class="conn-banner__text">
        <template v-if="connectionState === 'reconnecting'">
          <span>即時連線中斷，正在重新連線</span>
          <span class="conn-banner__sub">{{ connectionMessage }}</span>
        </template>
        <template v-else>
          <span>即時連線失敗，目前改用備援接收（每 15 秒更新一次）</span>
          <span class="conn-banner__sub">{{ connectionMessage }}；系統會持續低頻重連</span>
        </template>
      </div>
      <el-button
        v-if="connectionState === 'exhausted'"
        type="danger"
        size="small"
        :icon="Refresh"
        class="conn-banner__btn"
        @click="retryWebSocket"
      >立即重連</el-button>
    </div>

    <div class="dismissal-body" v-loading="loading">
      <!-- 正向空狀態：一天大部分時間就是這個畫面 -->
      <div v-if="activeCalls.length === 0 && !loading" class="empty">
        <el-icon class="empty__ico"><CircleCheck /></el-icon>
        <p class="empty__title">目前都接送完畢</p>
        <p class="empty__sub">沒有正在等待的孩子，新的接送通知會即時出現在這裡</p>
      </div>

      <!-- 待處理列表：最久優先 -->
      <TransitionGroup v-else tag="div" name="dcall-list" class="call-list">
        <DismissalCallCard
          v-for="call in sortedCalls"
          :key="call.id"
          :call="call"
          :now="now"
        >
          <template #action>
            <el-button
              v-if="call.status === 'pending'"
              type="primary"
              class="act-btn"
              @click="handleAcknowledge(call)"
            >我收到了</el-button>
            <!-- acknowledged：教師端已完成操作。家長尚未抵達時等待
                 dismissal_call_arrived 事件自動完成放學，不需教師再次操作。 -->
            <el-button
              v-if="call.status === 'pending' || call.status === 'acknowledged'"
              type="danger"
              plain
              class="act-btn act-btn--cancel"
              @click="handleCancel(call)"
            >取消通知</el-button>
          </template>
        </DismissalCallCard>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.portal-dismissal-calls {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-4);
}

/* 螢幕報讀專用，視覺隱藏（portal app 無全域 sr-only，自帶 scoped 版） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* sticky header：捲動長列表時，連線與聲音狀態恆可見（安全關鍵） */
.page-head {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: var(--space-3) 0;
  margin-bottom: var(--space-3);
  background: var(--bg-color, var(--neutral-50));
}

.page-head :deep(.portal-page-header) {
  margin-bottom: 0;
}
/* 待接送即時計數：老師一眼知道還有幾位待處理 */
.page-head__count {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}


/* ─── 聲音控制：顯性顯示開/關 + 測試 ─── */
.sound-ctl {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.sound-ctl__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--touch-target-min);
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
}
.sound-ctl__toggle.is-on {
  border-color: var(--color-success);
  color: #1a7f4b;
  background: var(--color-success-soft);
}
.sound-ctl__toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.sound-ctl__test {
  min-height: var(--touch-target-min);
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
.sound-ctl__test:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ─── 降級提示（音效 / 推播不可用）─── */
.degrade-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
}
.degrade-hint--audio {
  background-color: var(--color-warning-soft);
  color: var(--text-primary);
  border: 1px solid var(--color-warning);
}
.degrade-hint--notify {
  background-color: var(--neutral-100, #f3f4f6);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

/* ─── 連線狀態 banner ─── */
.conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  border: 1px solid transparent;
}
.conn-banner--reconnecting {
  background-color: var(--color-warning-soft);
  color: var(--text-primary);
  border-color: var(--color-warning);
}
.conn-banner--exhausted {
  background-color: var(--color-danger-soft);
  color: var(--text-primary);
  border-color: var(--color-danger);
}
.conn-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
}
.conn-banner__sub {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-regular);
}
.conn-banner__btn {
  flex-shrink: 0;
  min-height: var(--touch-target-min);
}

/* ─── 正向空狀態 ─── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
}
.empty__ico {
  font-size: 48px;
  color: var(--color-success);
  margin-bottom: var(--space-2);
}
.empty__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
.empty__sub {
  margin: 0;
  max-width: 32ch;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
}

/* ─── 列表 ─── */
.call-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.act-btn {
  min-height: var(--touch-target-min);
  font-weight: var(--font-weight-semibold);
}
/* 卡片 action slot 已用 flex gap 排版；清掉 Element Plus 相鄰按鈕的預設
   margin-left，避免與 gap 疊加（手機直排時更會歪一邊） */
.act-btn--cancel {
  margin-left: 0;
}

/* 卡片進場 / 移除 / 重排序動畫 */
.dcall-list-enter-active {
  transition:
    opacity 0.24s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.dcall-list-move {
  transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.dcall-list-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 560px) {
  .page-head :deep(.portal-page-header__actions) {
    width: 100%;
    justify-content: space-between;
  }
  .act-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dcall-list-enter-active,
  .dcall-list-leave-active,
  .dcall-list-move {
    transition: opacity 0.15s linear;
  }
  .dcall-list-enter-from,
  .dcall-list-leave-to {
    transform: none;
  }
}
</style>
