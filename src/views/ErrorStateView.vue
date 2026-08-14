<script setup lang="ts">
/**
 * 共用錯誤狀態頁（403 / 404）。
 *
 * 三條路由共用：/portal/error（PortalLayout 下）、/error（AdminLayout 下）、
 * /:pathMatch(.*)* catch-all（bare 獨立頁）。型態取 query.type，缺時退回
 * route.meta.errorType；「回首頁」依身分決定落點（admin 落 '/' 後由守衛
 * 自動導向第一個有權限的路由）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUserInfo, clearAuth, isPlatformAdmin } from '@/utils/auth'

type ErrorKind = 'forbidden' | 'not-found'

const route = useRoute()
const router = useRouter()

function firstOf(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : ''
}

const kind = computed<ErrorKind>(() => {
  const q = firstOf(route.query.type)
  if (q === 'forbidden' || q === 'not-found') return q
  return route.meta.errorType === 'forbidden' ? 'forbidden' : 'not-found'
})

const feature = computed(() => firstOf(route.query.feature))
const fromPath = computed(() => firstOf(route.query.from))
const isBare = computed(() => route.meta.bare === true)

const title = computed(() =>
  kind.value === 'forbidden' ? '沒有存取權限' : '找不到這個頁面'
)

const subtitle = computed(() => {
  if (kind.value === 'not-found') return '網址可能已變更或輸入錯誤。'
  return feature.value
    ? `你目前沒有「${feature.value}」的使用權限。`
    : '你目前沒有這個頁面的使用權限。'
})

const homeTarget = computed(() => {
  const user = getUserInfo()
  if (!user) return '/login'
  if (user['role'] === 'teacher') return '/portal/home'
  return isPlatformAdmin() ? '/platform/overview' : '/'
})

function goHome() {
  router.push(homeTarget.value)
}

async function relogin() {
  const target = getUserInfo()?.['role'] === 'teacher' ? '/portal/login' : '/login'
  await clearAuth()
  router.push(target)
}
</script>

<template>
  <div class="error-state" :class="{ 'error-state--bare': isBare }">
    <el-result
      :icon="kind === 'forbidden' ? 'warning' : 'info'"
      :title="title"
      :sub-title="subtitle"
    >
      <template #extra>
        <el-button type="primary" data-test="go-home" @click="goHome">回首頁</el-button>
        <el-button v-if="kind === 'forbidden'" data-test="relogin" @click="relogin">
          重新登入
        </el-button>
      </template>
    </el-result>
    <p v-if="kind === 'forbidden'" class="error-state__hint">
      可能是帳號權限尚未開通或最近有異動；重新登入後才會套用新權限，仍無法存取請聯絡園所管理員。
    </p>
    <p v-if="fromPath" class="error-state__from">原網址：{{ fromPath }}</p>
  </div>
</template>

<style scoped>
.error-state {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 60vh;
  padding: 24px;
  text-align: center;
}

.error-state--bare {
  min-height: 100vh;
  background: var(--el-bg-color-page);
}

.error-state__hint {
  margin: 0;
  max-width: 26em;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.error-state__from {
  margin: 8px 0 0;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  word-break: break-all;
}
</style>
