<template>
  <div class="recruitment-module-nav">
    <router-link
      v-for="item in visibleItems"
      :key="item.path"
      :to="item.path"
      class="nav-link"
    >
      <el-button :type="isActive(item) ? 'primary' : 'default'" size="small">
        {{ item.label }}
      </el-button>
    </router-link>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { hasPermission } from '@/utils/auth'

const route = useRoute()

const items = [
  { path: '/recruitment', label: '招生統計', permission: 'RECRUITMENT_READ', exact: true },
]

const visibleItems = computed(() => items.filter((item) => hasPermission(item.permission)))

const isActive = (item) => (
  item.exact
    ? route.path === item.path
    : route.path === item.path || route.path.startsWith(`${item.path}/`)
)
</script>

<style scoped>
.recruitment-module-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.nav-link {
  text-decoration: none;
}
</style>
