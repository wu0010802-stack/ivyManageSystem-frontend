<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync, invalidateCachedAsync } from '@/composables/useCachedAsync'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const router = useRouter()
const authStore = useParentAuthStore()

const { data, error, pending, refresh } = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    if (res.data?.me) authStore.setUser(res.data.me)
    return res.data
  },
  { ttl: 60_000 },
)

const me = computed(() => data.value?.me || null)
const children = computed(() => data.value?.children || [])
const summary = computed(() => data.value?.summary || null)

const fees = computed(() => summary.value?.fees || null)
const unpaidCount = computed(() => fees.value?.outstanding_count || 0)
const unpaidTotal = computed(() => fees.value?.outstanding || 0)
const overdueAmount = computed(() => fees.value?.overdue || 0)
const unreadAnnouncements = computed(() => summary.value?.unread_announcements || 0)
const pendingAcks = computed(() => summary.value?.pending_event_acks || 0)
const hasAnyTodos = computed(
  () => unpaidCount.value > 0 || unreadAnnouncements.value > 0 || pendingAcks.value > 0,
)

async function handleLogout() {
  try {
    await logout()
  } catch {
    /* ignore — 即使後端失敗也清前端 */
  }
  invalidateCachedAsync('parent/')
  authStore.clear()
  router.replace('/login')
}

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
</script>

<template>
  <div class="home-view">
    <div v-if="pending && !data" class="state-block">載入中...</div>

    <MobileErrorRetry
      v-else-if="error && !data"
      :error="error"
      @retry="refresh(true)"
    />

    <template v-else-if="data">
      <section v-if="me" class="me-card">
        <div class="me-name">{{ me.name || '家長' }}</div>
        <div class="me-meta">
          <span v-if="me.can_push" class="badge ok">LINE 推播已開啟</span>
          <span v-else class="badge warn">尚未加 LINE 為好友（無法收推播）</span>
        </div>
      </section>

      <section v-if="hasAnyTodos" class="todos-card">
        <h3 class="section-title">今日待辦</h3>
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
      </section>
      <section v-else class="todos-empty">
        <span class="todos-empty-icon">✓</span>
        目前沒有待辦事項
      </section>

      <section class="children-section">
        <h3 class="section-title">我的小孩（{{ children.length }}）</h3>
        <div v-if="children.length === 0" class="empty">
          尚未綁定任何學生，請聯絡園所協助。
        </div>
        <div v-for="c in children" :key="c.guardian_id" class="child-card">
          <div class="child-row">
            <span class="child-name">{{ c.name }}</span>
            <span class="child-classroom">{{ c.classroom_name || '未分班' }}</span>
          </div>
          <div class="child-meta">
            <span v-if="c.guardian_relation">{{ c.guardian_relation }}</span>
            <span v-if="c.is_primary" class="tag primary">主要聯絡人</span>
            <span v-if="c.can_pickup" class="tag pickup">可接送</span>
            <span class="tag status">{{ lifecycleLabel(c.lifecycle_status) }}</span>
          </div>
        </div>
      </section>

      <section class="actions">
        <button class="logout" @click="handleLogout">登出</button>
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

.me-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.me-name {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.me-meta {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.badge.ok {
  background: #e3f4e7;
  color: #3f7d48;
}

.badge.warn {
  background: #fff4e6;
  color: #d97706;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #555;
  margin: 0 0 8px 4px;
}

.todos-card {
  background: #fff;
  border-radius: 12px;
  padding: 8px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.todos-card .section-title {
  margin: 8px 16px 4px;
}

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

.todo-row:active {
  background: #f6f8fa;
}

.todo-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.todo-text {
  flex: 1;
}

.todo-text strong {
  color: #c0392b;
  font-weight: 700;
  margin: 0 2px;
}

.todo-warn {
  color: #c0392b;
  font-size: 12px;
}

.todo-arrow {
  color: #aaa;
  font-size: 18px;
  flex-shrink: 0;
}

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

.children-section {
  display: flex;
  flex-direction: column;
}

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
}

.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.child-name {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.child-classroom {
  font-size: 13px;
  color: #777;
}

.child-meta {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #666;
}

.tag {
  padding: 2px 8px;
  border-radius: 10px;
  background: #f0f2f5;
}

.tag.primary {
  background: #e6f4ea;
  color: #3f7d48;
}

.tag.pickup {
  background: #fff4e6;
  color: #d97706;
}

.tag.status {
  background: #eef0f5;
  color: #555;
}

.actions {
  margin-top: 8px;
}

.logout {
  width: 100%;
  padding: 12px;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  color: #c0392b;
  font-size: 15px;
}
</style>
