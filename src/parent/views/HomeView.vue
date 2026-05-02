<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary, getTodayStatus } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const router = useRouter()
const authStore = useParentAuthStore()

// 兩支 API：summary 走 60s 快取（待辦變動慢），today 走 30s 快取（出席會盤中變）
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

const { data: todayData, refresh: refreshToday } = useCachedAsync(
  'parent/home/today-status',
  async () => (await getTodayStatus()).data,
  { ttl: 30_000 },
)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)
const todayChildren = computed(() => todayData.value?.children || [])

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
  refreshToday(true)
}

const QUICK_ACTIONS = [
  { icon: '📓', label: '聯絡簿', path: '/contact-book' },
  { icon: '📅', label: '本週行程', path: '/calendar' },
  { icon: '📝', label: '請假', path: '/leaves' },
  { icon: '💊', label: '用藥單', path: '/medications' },
]

// 接送狀態文案：對應後端 status (pending/acknowledged/completed)
function dismissalLabel(d) {
  if (!d) return null
  if (d.status === 'pending') return '老師處理中'
  if (d.status === 'acknowledged') return '老師已收到，孩子準備中'
  if (d.status === 'completed') return '已接送'
  return d.status
}
</script>

<template>
  <div class="home-view">
    <div v-if="summaryPending && !summaryData" class="state-block">載入中...</div>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <template v-else-if="summaryData">
      <!-- 1) 推播未啟用 CTA — 視覺分量大，催加好友 -->
      <section v-if="showPushCta" class="push-cta">
        <div class="push-cta-head">
          <span class="push-cta-icon">🔔</span>
          <div>
            <div class="push-cta-title">尚未加 LINE 為好友</div>
            <div class="push-cta-sub">以下通知將收不到推播：</div>
          </div>
        </div>
        <ul class="push-cta-list">
          <li>新公告 / 校外教學簽閱</li>
          <li>老師訊息回覆</li>
          <li>請假審核結果</li>
          <li>接送通知狀態變更</li>
          <li>才藝候補升正式提醒</li>
        </ul>
        <button class="push-cta-btn" type="button" @click="go('/notifications/preferences')">
          前往設定
        </button>
      </section>

      <!-- 2) 今日孩子狀態 — 每個孩子一張小卡，4 種狀態 chip 並列 -->
      <section v-if="todayChildren.length > 0" class="today-section">
        <h3 class="section-title">今日狀態</h3>
        <div v-for="c in todayChildren" :key="c.student_id" class="today-card">
          <div class="today-row">
            <span class="today-name">{{ c.name }}</span>
            <span v-if="c.classroom_name" class="today-class">{{ c.classroom_name }}</span>
          </div>
          <div class="chips">
            <span v-if="c.attendance" class="chip chip-attendance">
              ✓ {{ c.attendance.status }}
            </span>
            <span v-else class="chip chip-muted">尚未到校</span>
            <span v-if="c.leave" class="chip chip-leave">
              📝 {{ c.leave.type }}
            </span>
            <span v-if="c.medication.has_order" class="chip chip-med">
              💊 用藥 {{ c.medication.order_count }} 次
            </span>
            <span v-if="c.dismissal" class="chip chip-pickup">
              🚸 {{ dismissalLabel(c.dismissal) }}
            </span>
          </div>
        </div>
      </section>

      <!-- 3) 今日待辦中心 — 6 項全列 -->
      <section v-if="hasAnyTodos" class="todos-card">
        <h3 class="section-title todos-title">今日待辦</h3>
        <button
          v-if="unpaidCount > 0"
          class="todo-row"
          type="button"
          @click="go('/fees')"
        >
          <span class="todo-icon">💴</span>
          <span class="todo-text">
            待繳費 <strong>{{ unpaidCount }}</strong> 筆
            ／ NT$ {{ formatMoney(unpaidTotal) }}
            <span v-if="overdueAmount > 0" class="todo-warn">
              （逾期 NT$ {{ formatMoney(overdueAmount) }}）
            </span>
          </span>
          <span class="todo-arrow">›</span>
        </button>
        <button
          v-if="unreadMessages > 0"
          class="todo-row"
          type="button"
          @click="go('/messages')"
        >
          <span class="todo-icon">💬</span>
          <span class="todo-text">
            未讀訊息 <strong>{{ unreadMessages }}</strong> 則
          </span>
          <span class="todo-arrow">›</span>
        </button>
        <button
          v-if="pendingAcks > 0"
          class="todo-row"
          type="button"
          @click="go('/events')"
        >
          <span class="todo-icon">📝</span>
          <span class="todo-text">
            待簽閱事件 <strong>{{ pendingAcks }}</strong> 件
          </span>
          <span class="todo-arrow">›</span>
        </button>
        <button
          v-if="unreadAnnouncements > 0"
          class="todo-row"
          type="button"
          @click="go('/announcements')"
        >
          <span class="todo-icon">📢</span>
          <span class="todo-text">
            未讀公告 <strong>{{ unreadAnnouncements }}</strong> 則
          </span>
          <span class="todo-arrow">›</span>
        </button>
        <button
          v-if="recentLeaveReviews > 0"
          class="todo-row"
          type="button"
          @click="go('/leaves')"
        >
          <span class="todo-icon">📋</span>
          <span class="todo-text">
            最近請假審核結果 <strong>{{ recentLeaveReviews }}</strong> 件
          </span>
          <span class="todo-arrow">›</span>
        </button>
        <button
          v-if="pendingPromotions > 0"
          class="todo-row"
          type="button"
          @click="go('/activity')"
        >
          <span class="todo-icon">🎨</span>
          <span class="todo-text">
            才藝候補待確認 <strong>{{ pendingPromotions }}</strong> 件
          </span>
          <span class="todo-arrow">›</span>
        </button>
      </section>
      <section v-else class="todos-empty">
        <span class="todos-empty-icon">✓</span>
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
          class="child-card"
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
            <span class="child-arrow">›</span>
          </div>
        </button>
      </section>

      <!-- 5) 常用操作 -->
      <section class="quick-section">
        <h3 class="section-title">常用操作</h3>
        <div class="quick-grid">
          <button
            v-for="q in QUICK_ACTIONS"
            :key="q.path"
            class="quick-tile"
            type="button"
            @click="go(q.path)"
          >
            <span class="quick-icon">{{ q.icon }}</span>
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
  gap: 16px;
}

.state-block {
  text-align: center;
  padding: 40px 16px;
  color: #666;
}

/* 推播 CTA */
.push-cta {
  background: linear-gradient(135deg, #fff7ed 0%, #fee9c2 100%);
  border: 1px solid #f59e0b;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.push-cta-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.push-cta-icon {
  font-size: 28px;
  line-height: 1;
}
.push-cta-title {
  font-size: 15px;
  font-weight: 600;
  color: #92400e;
}
.push-cta-sub {
  font-size: 12px;
  color: #b45309;
  margin-top: 2px;
}
.push-cta-list {
  margin: 8px 0 8px 38px;
  padding: 0;
  list-style: disc;
  color: #92400e;
  font-size: 12px;
  line-height: 1.5;
}
.push-cta-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  background: #d97706;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}
.push-cta-btn:active {
  background: #b45309;
}

/* 區塊標題 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #555;
  margin: 0 0 8px 4px;
}

/* 今日狀態 */
.today-section {
  display: flex;
  flex-direction: column;
}
.today-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.today-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.today-name {
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
}
.today-class {
  font-size: 12px;
  color: #888;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: #f0f2f5;
  color: #555;
}
.chip-attendance { background: #dcfce7; color: #166534; }
.chip-leave      { background: #fef3c7; color: #92400e; }
.chip-med        { background: #ddd6fe; color: #5b21b6; }
.chip-pickup     { background: #dbeafe; color: #1d4ed8; }
.chip-muted      { background: #f3f4f6; color: #888; }

/* 待辦 */
.todos-card {
  background: #fff;
  border-radius: 12px;
  padding: 8px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.todos-title { margin: 8px 16px 4px; }
.todo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-top: 1px solid #f0f0f0;
  text-align: left;
  font-size: 14px;
  color: #2c3e50;
  cursor: pointer;
}
.todo-row:active { background: #f6f8fa; }
.todo-icon { font-size: 20px; flex-shrink: 0; }
.todo-text { flex: 1; }
.todo-text strong {
  color: #c0392b;
  font-weight: 700;
  margin: 0 2px;
}
.todo-warn { color: #c0392b; font-size: 12px; }
.todo-arrow { color: #aaa; font-size: 18px; flex-shrink: 0; }

.todos-empty {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  font-size: 14px;
  color: #888;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.todos-empty-icon {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e3f4e7;
  color: #3f7d48;
  text-align: center;
  line-height: 22px;
  margin-right: 6px;
  font-weight: 700;
}

/* 子女區 */
.children-section { display: flex; flex-direction: column; }
.empty {
  background: #fff;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  color: #888;
  font-size: 14px;
}
.child-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  width: 100%;
  border: none;
  text-align: left;
  display: block;
  cursor: pointer;
}
.child-card:active {
  background: #f6f8fa;
}
.child-arrow {
  margin-left: auto;
  color: #aaa;
  font-size: 18px;
  background: transparent;
  padding: 0;
}
.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.child-name { font-size: 16px; font-weight: 600; color: #2c3e50; }
.child-classroom { font-size: 13px; color: #777; }
.child-meta {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #666;
}
.tag { padding: 2px 8px; border-radius: 10px; background: #f0f2f5; }
.tag.primary { background: #e6f4ea; color: #3f7d48; }
.tag.pickup { background: #fff4e6; color: #d97706; }
.tag.status { background: #eef0f5; color: #555; }

/* 常用操作 */
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
  background: #fff;
  border-radius: 12px;
  padding: 14px 6px;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.quick-tile:active { background: #f6f8fa; }
.quick-icon { font-size: 24px; }
.quick-label { font-size: 12px; color: #555; }
</style>
