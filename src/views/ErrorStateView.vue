<script setup lang="ts">
/**
 * 共用錯誤狀態頁（403 / 404）。
 *
 * 三條路由共用：/portal/error（PortalLayout 下）、/error（AdminLayout 下）、
 * /:pathMatch(.*)* catch-all（bare 獨立頁）。「回首頁」依身分決定落點（admin 落
 * '/' 後由守衛自動導向第一個有權限的路由）。
 *
 * ⚠ 內容偽造防線（F31）：catch-all 是 noAuth，任何人都能在官方網域組出
 * `/#/x?type=…&feature=…&from=…` 發到 LINE 群釣魚，故 query **一律不得原樣上畫面**：
 * - 型態只認 route.meta.errorType（三條路由皆有宣告），query.type 不採信；
 * - 功能名稱不讀 query.feature，改由 query.from resolve 出的站內真實路由 meta.title 決定；
 * - 原網址只在 from 對應到非錯誤頁的真實路由時顯示，且只顯示 path（不回顯 query string）。
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

const FROM_PATH_MAX = 100

const kind = computed<ErrorKind>(() =>
  route.meta.errorType === 'forbidden' ? 'forbidden' : 'not-found'
)

/** from 只接受站內絕對路徑，且必須 resolve 到非錯誤頁的真實路由；否則視為缺值。 */
const fromRoute = computed(() => {
  const raw = firstOf(route.query.from)
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  try {
    const resolved = router.resolve(raw)
    if (!resolved.matched.length || resolved.meta.errorPage) return null
    return resolved
  } catch {
    return null
  }
})

const feature = computed(() => {
  const title = fromRoute.value?.meta.title
  return typeof title === 'string' ? title : ''
})
const fromPath = computed(() => {
  const path = fromRoute.value?.path ?? ''
  return path.length > FROM_PATH_MAX ? `${path.slice(0, FROM_PATH_MAX)}…` : path
})
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
