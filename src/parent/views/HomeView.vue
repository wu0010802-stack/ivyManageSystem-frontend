<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getMe, getMyChildren } from '../api/profile'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'

const router = useRouter()
const authStore = useParentAuthStore()

const me = ref(null)
const children = ref([])
const loading = ref(true)
const errorMessage = ref('')

async function fetchAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [meRes, childrenRes] = await Promise.all([getMe(), getMyChildren()])
    me.value = meRes.data
    children.value = childrenRes.data?.items || []
    if (meRes.data) authStore.setUser(meRes.data)
  } catch (err) {
    errorMessage.value = err?.displayMessage || '載入失敗，請稍後再試'
  } finally {
    loading.value = false
  }
}

async function handleLogout() {
  try {
    await logout()
  } catch {
    /* ignore — 即使後端失敗也清前端 */
  }
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

onMounted(fetchAll)
</script>

<template>
  <div class="home-view">
    <div v-if="loading" class="state-block">載入中...</div>
    <div v-else-if="errorMessage" class="state-block error">
      {{ errorMessage }}
      <button class="retry" @click="fetchAll">重試</button>
    </div>

    <template v-else>
      <section class="me-card" v-if="me">
        <div class="me-name">{{ me.name || '家長' }}</div>
        <div class="me-meta">
          <span v-if="me.can_push" class="badge ok">LINE 推播已開啟</span>
          <span v-else class="badge warn">尚未加 LINE 為好友（無法收推播）</span>
        </div>
      </section>

      <section class="children-section">
        <h3 class="section-title">我的小孩（{{ children.length }}）</h3>
        <div v-if="children.length === 0" class="empty">
          尚未綁定任何學生，請聯絡園所協助。
        </div>
        <div
          v-for="c in children"
          :key="c.guardian_id"
          class="child-card"
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
          </div>
        </div>
      </section>

      <section class="actions">
        <button class="logout" @click="handleLogout">登出</button>
      </section>

      <p class="footer-note">
        其他功能（出席、公告、請假、費用等）開發中。
      </p>
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

.state-block.error {
  color: #c0392b;
}

.retry {
  display: block;
  margin: 12px auto 0;
  padding: 8px 20px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 6px;
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

.footer-note {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #aaa;
}
</style>
