<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()

const me = ref(null)

const items = [
  { icon: '📝', title: '請假', path: '/leaves' },
  { icon: '💰', title: '費用查詢', path: '/fees' },
  { icon: '📅', title: '事件簽閱', path: '/events' },
  { icon: '💊', title: '用藥單', path: '/medications' },
  { icon: '🎨', title: '才藝課', path: '/activity' },
  { icon: '🔔', title: '通知偏好', path: '/notifications/preferences' },
  { icon: '➕', title: '加綁子女', path: '/bind-additional' },
]

async function handleLogout() {
  if (!confirm('確定要登出？')) return
  try {
    await logout()
  } catch {
    /* ignore */
  }
  authStore.clear()
  router.replace('/login')
}

onMounted(async () => {
  me.value = authStore.user
  await childrenStore.load()
})
</script>

<template>
  <div class="more-view">
    <div class="card user-card">
      <div class="user-name">{{ me?.name || '家長' }}</div>
      <div class="user-children">
        子女：{{ (childrenStore.items || []).map(c => c.name).join('、') || '尚未綁定' }}
      </div>
      <div v-if="me" class="user-push">
        <span v-if="me.can_push" class="badge ok">✓ LINE 推播已啟用</span>
        <span v-else class="badge warn">⚠ 尚未加 LINE 為好友（無法收推播）</span>
      </div>
    </div>

    <div class="menu-card">
      <router-link
        v-for="item in items"
        :key="item.path"
        :to="item.path"
        class="menu-item"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="title">{{ item.title }}</span>
        <span class="arrow">›</span>
      </router-link>
    </div>

    <button class="logout" @click="handleLogout">登出</button>
  </div>
</template>

<style scoped>
.more-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card,
.menu-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.user-card {
  padding: 16px;
}

.user-name {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.user-children {
  margin-top: 6px;
  color: #666;
  font-size: 13px;
}

.user-push {
  margin-top: 8px;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}
.badge.ok { background: #e6f4ea; color: #3f7d48; }
.badge.warn { background: #fff4e6; color: #d97706; }

.menu-card {
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f2f5;
  text-decoration: none;
  color: #2c3e50;
}

.menu-item:last-child { border-bottom: none; }

.menu-item .icon {
  width: 28px;
  font-size: 20px;
}

.menu-item .title {
  flex: 1;
  font-size: 15px;
}

.menu-item .arrow {
  color: #ccc;
  font-size: 18px;
}

.logout {
  width: 100%;
  padding: 12px;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 12px;
  color: #c0392b;
  font-size: 15px;
}
</style>
