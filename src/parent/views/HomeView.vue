<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import HomeHero from '../components/home/HomeHero.vue'
import TodayStatusCards from '../components/home/TodayStatusCards.vue'

const router = useRouter()
const authStore = useParentAuthStore()

// summary 走 60s 快取（待辦變動慢）；today 狀態移到 TodayStatusCards 內，由 useTodayStatusCache 自管
const {
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  refresh: refreshSummary,
} = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    if (res.data?.me) authStore.setUser(res.data.me)
    return res.data
  },
  { ttl: 60_000 },
)

const todayRef = ref(null)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)

const fees = computed(() => summary.value?.fees || null)
const unpaidCount = computed(() => fees.value?.outstanding_count || 0)
const unpaidTotal = computed(() => fees.value?.outstanding || 0)
const overdueAmount = computed(() => fees.value?.overdue || 0)
const unreadAnnouncements = computed(() => summary.value?.unread_announcements || 0)
const pendingAcks = computed(() => summary.value?.pending_event_acks || 0)
const unreadMessages = computed(() => summary.value?.unread_messages || 0)
const pendingPromotions = computed(() => summary.value?.pending_activity_promotions || 0)
const recentLeaveReviews = computed(() => summary.value?.recent_leave_reviews || 0)

const hasAnyTodos = computed(
  () =>
    unpaidCount.value > 0 ||
    unreadAnnouncements.value > 0 ||
    pendingAcks.value > 0 ||
    unreadMessages.value > 0 ||
    pendingPromotions.value > 0 ||
    recentLeaveReviews.value > 0,
)

const showPushCta = computed(() => me.value && !me.value.can_push)

const lifecycleLabel = (s) => {
  const map = {
    active: '在學',
    enrolled: '在學',
    on_leave: '休學中',
    withdrawn: '已退學',
    transferred: '已轉出',
    graduated: '已畢業',
    prospect: '招生中',
  }
  return map[s] || s || ''
}

function formatMoney(n) {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

function go(path) {
  router.push(path)
}

function refresh() {
  refreshSummary(true)
  todayRef.value?.refresh()
}

const QUICK_ACTIONS = [
  { icon: 'notebook', label: '聯絡簿', path: '/contact-book', tint: 'contact' },
  { icon: 'calendar', label: '本週行程', path: '/calendar', tint: 'calendar' },
  { icon: 'clipboard', label: '請假', path: '/leaves', tint: 'leave' },
  { icon: 'pill', label: '用藥單', path: '/medications', tint: 'medication' },
]
</script>

<template>
  <div class="home-view">
    <!-- 骨架載入：>300ms 的非同步請求應顯示結構，避免畫面空白 -->
    <template v-if="summaryPending && !summaryData">
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="card" />
    </template>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <template v-else-if="summaryData">
      <!-- 0) Hero 問候卡 — 抽出為 HomeHero 元件（ACD Phase 3.2） -->
      <HomeHero :parent-name="me?.name" :children-count="children.length" />

      <!-- 1) 推播未啟用 CTA — 暖色提醒卡 -->
      <section v-if="showPushCta" class="push-cta">
        <div class="push-cta-head">
          <span class="push-cta-icon" aria-hidden="true">
            <ParentIcon name="bell" size="lg" />
          </span>
          <div>
            <div class="push-cta-title">尚未加 LINE 為好友</div>
            <div class="push-cta-sub">以下通知將收不到推播</div>
          </div>
        </div>
        <ul class="push-cta-list">
          <li>新公告 / 校外教學簽閱</li>
          <li>老師訊息回覆</li>
          <li>請假審核結果</li>
          <li>接送通知狀態變更</li>
          <li>才藝候補升正式提醒</li>
        </ul>
        <button class="push-cta-btn press-scale" type="button" @click="go('/notifications/preferences')">
          前往設定
          <ParentIcon name="chevron-right" size="sm" />
        </button>
      </section>

      <!-- 2) 今日孩子狀態 — 抽出為 TodayStatusCards，內部接 useTodayStatusCache（ACD Phase 3.3） -->
      <TodayStatusCards ref="todayRef" />

      <!-- 3) 今日待辦中心 — 6 項全列 -->
      <section v-if="hasAnyTodos" class="todos-card">
        <h3 class="section-title todos-title">今日待辦</h3>
        <button
          v-if="unpaidCount > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/fees')"
        >
          <span class="todo-icon tint-money"><ParentIcon name="money" size="sm" /></span>
          <span class="todo-text">
            待繳費 <strong>{{ unpaidCount }}</strong> 筆
            ／ NT$ {{ formatMoney(unpaidTotal) }}
            <span v-if="overdueAmount > 0" class="todo-warn">
              （逾期 NT$ {{ formatMoney(overdueAmount) }}）
            </span>
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
        <button
          v-if="unreadMessages > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/messages')"
        >
          <span class="todo-icon tint-message"><ParentIcon name="chat" size="sm" /></span>
          <span class="todo-text">
            未讀訊息 <strong>{{ unreadMessages }}</strong> 則
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
        <button
          v-if="pendingAcks > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/events')"
        >
          <span class="todo-icon tint-event"><ParentIcon name="signature" size="sm" /></span>
          <span class="todo-text">
            待簽閱事件 <strong>{{ pendingAcks }}</strong> 件
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
        <button
          v-if="unreadAnnouncements > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/announcements')"
        >
          <span class="todo-icon tint-announcement"><ParentIcon name="megaphone" size="sm" /></span>
          <span class="todo-text">
            未讀公告 <strong>{{ unreadAnnouncements }}</strong> 則
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
        <button
          v-if="recentLeaveReviews > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/leaves')"
        >
          <span class="todo-icon tint-leave"><ParentIcon name="clipboard" size="sm" /></span>
          <span class="todo-text">
            最近請假審核結果 <strong>{{ recentLeaveReviews }}</strong> 件
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
        <button
          v-if="pendingPromotions > 0"
          class="todo-row press-scale"
          type="button"
          @click="go('/activity')"
        >
          <span class="todo-icon tint-activity"><ParentIcon name="art" size="sm" /></span>
          <span class="todo-text">
            才藝候補待確認 <strong>{{ pendingPromotions }}</strong> 件
          </span>
          <ParentIcon name="chevron-right" size="sm" class="todo-arrow" />
        </button>
      </section>
      <section v-else class="todos-empty">
        <span class="todos-empty-icon" aria-hidden="true">
          <ParentIcon name="check" size="sm" />
        </span>
        目前沒有待辦事項
      </section>

      <!-- 4) 我的孩子 -->
      <section class="children-section">
        <h3 class="section-title">我的小孩（{{ children.length }}）</h3>
        <div v-if="children.length === 0" class="empty">
          尚未綁定任何學生，請聯絡園所協助。
        </div>
        <button
          v-for="c in children"
          :key="c.guardian_id"
          type="button"
          class="child-card press-scale"
          @click="go(`/children/${c.student_id}`)"
        >
          <div class="child-row">
            <span class="child-name">{{ c.name }}</span>
            <span class="child-classroom">{{ c.classroom_name || '未分班' }}</span>
          </div>
          <div class="child-meta">
            <span v-if="c.guardian_relation">{{ c.guardian_relation }}</span>
            <span v-if="c.is_primary" class="tag primary">主要聯絡人</span>
            <span v-if="c.can_pickup" class="tag pickup">可接送</span>
            <span class="tag status">{{ lifecycleLabel(c.lifecycle_status) }}</span>
            <ParentIcon name="chevron-right" size="sm" class="child-arrow" />
          </div>
        </button>
      </section>

      <!-- 5) 常用操作 -->
      <section class="quick-section">
        <h3 class="section-title">常用操作</h3>
        <div class="quick-grid pt-stagger">
          <button
            v-for="q in QUICK_ACTIONS"
            :key="q.path"
            class="quick-tile press-scale"
            type="button"
            @click="go(q.path)"
          >
            <span class="quick-icon" :class="`tint-${q.tint}`">
              <ParentIcon :name="q.icon" size="md" />
            </span>
            <span class="quick-label">{{ q.label }}</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

/* ==========================================================
 * 推播 CTA — 升級為 token-based 暖色卡
 * ========================================================== */
.push-cta {
  background: var(--pt-gradient-warm);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px 16px;
  box-shadow: var(--pt-elev-1);
}
.push-cta-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.push-cta-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(217, 119, 6, 0.18);
  color: var(--pt-warning-text-mid);
  flex-shrink: 0;
}
.push-cta-title {
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-warning-text);
}
.push-cta-sub {
  font-size: var(--text-xs, 12px);
  color: var(--pt-warning-text-mid);
  margin-top: 2px;
}
.push-cta-list {
  margin: 10px 0 12px 56px;
  padding: 0;
  list-style: disc;
  color: var(--pt-warning-text);
  font-size: var(--text-xs, 12px);
  line-height: 1.6;
}
.push-cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding: 12px;
  background: var(--pt-warning-text-mid);
  color: var(--neutral-0);
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.02em;
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.32);
  cursor: pointer;
}

/* ==========================================================
 * 區塊標題 — 統一 .section-title
 * ========================================================== */
.section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 0 0 8px 4px;
  letter-spacing: 0.02em;
}

/* ==========================================================
 * 待辦中心（icon tint + refined surface）
 * ========================================================== */
.todos-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 6px 0 4px;
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  overflow: hidden;
}
.todos-title { margin: 12px 16px 6px; }
.todo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--pt-border-light);
  text-align: left;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  cursor: pointer;
}
.todos-card .todo-row:first-of-type {
  border-top: none;
}
.todo-row:active { background: var(--pt-surface-mute-soft); }

/* Icon tint container（取代純色 currentColor，給類型視覺對應） */
.todo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
.todo-icon.tint-money       { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg); }
.todo-icon.tint-message     { background: var(--pt-tint-message);      color: var(--pt-tint-message-fg); }
.todo-icon.tint-event       { background: var(--pt-tint-event);        color: var(--pt-tint-event-fg); }
.todo-icon.tint-announcement{ background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.todo-icon.tint-leave       { background: var(--pt-tint-leave);        color: var(--pt-tint-leave-fg); }
.todo-icon.tint-activity    { background: var(--pt-tint-activity);     color: var(--pt-tint-activity-fg); }

.todo-text { flex: 1; line-height: 1.45; }
.todo-text strong {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold, 700);
  margin: 0 2px;
  font-variant-numeric: tabular-nums;
}
.todo-warn { color: var(--color-danger); font-size: var(--text-xs, 12px); }
.todo-arrow { color: var(--pt-text-disabled); flex-shrink: 0; }

.todos-empty {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 18px 16px;
  text-align: center;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-placeholder);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}
.todos-empty-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full, 9999px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  vertical-align: middle;
}

/* ==========================================================
 * 子女區
 * ========================================================== */
.children-section { display: flex; flex-direction: column; }
.empty {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 24px 16px;
  text-align: center;
  color: var(--pt-text-placeholder);
  font-size: var(--text-base, 14px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}
.child-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  width: 100%;
  text-align: left;
  display: block;
  cursor: pointer;
}
.child-card:active {
  background: var(--pt-surface-mute-soft);
}
.child-arrow {
  margin-left: auto;
  color: var(--pt-text-disabled);
  background: transparent;
  padding: 0;
  flex-shrink: 0;
}
.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.child-name {
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-strong);
}
.child-classroom { font-size: var(--text-sm, 13px); color: var(--pt-text-faint); }
.child-meta {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-soft);
  align-items: center;
}
.tag {
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: var(--pt-surface-mute);
  font-weight: var(--font-weight-medium, 500);
}
.tag.primary { background: var(--brand-primary-soft); color: var(--brand-primary); }
.tag.pickup { background: var(--color-warning-soft); color: var(--pt-warning-text-mid); }
.tag.status { background: var(--pt-surface-mute-warm); color: var(--pt-text-muted); }

/* ==========================================================
 * 常用操作（quick tiles，icon tint 化）
 * ========================================================== */
.quick-section {
  display: flex;
  flex-direction: column;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quick-tile {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 6px 12px;
  border: var(--pt-hairline);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: var(--pt-elev-1);
  cursor: pointer;
}
.quick-tile:active { background: var(--pt-surface-mute-soft); }
.quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
}
.quick-icon.tint-contact     { background: var(--pt-tint-contact);     color: var(--pt-tint-contact-fg); }
.quick-icon.tint-calendar    { background: var(--pt-tint-calendar);    color: var(--pt-tint-calendar-fg); }
.quick-icon.tint-leave       { background: var(--pt-tint-leave);       color: var(--pt-tint-leave-fg); }
.quick-icon.tint-medication  { background: var(--pt-tint-medication);  color: var(--pt-tint-medication-fg); }
.quick-label {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-muted);
  font-weight: var(--font-weight-medium, 500);
}
</style>
