/**
 * A2: 公開報名頁專用 router。
 *
 * 與 admin SPA router 內的 /public/activity*.* 兩條路由語義對齊，
 * 但本 router 只掛在 public.html entry 上；未登入家長不需下載
 * admin-core + element-plus + activity-admin 整包。
 *
 * 路由保留 hash mode 與 admin 一致，nginx 只需把 /public/* 路徑
 * 轉發到 public.html 即可（fallback 仍可走 admin index.html，
 * 不破壞既有部署）。
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { getBranding } from '@/composables/useTenantBranding'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/activity',
  },
  {
    path: '/activity',
    name: 'public-activity',
    component: () => import('@/views/public/ActivityPublicView.vue'),
    meta: { title: '課後才藝報名' },
  },
  {
    path: '/activity/query',
    name: 'public-activity-query',
    component: () => import('@/views/public/ActivityPublicQueryView.vue'),
    meta: { title: '查詢 / 修改報名' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta?.title) {
    // 多租戶（4d/fb）：尾綴改讀品牌短名（預設 '常春藤'，單租戶輸出不變）。
    document.title = `${to.meta.title}｜${getBranding().short_name}`
  }
})

export default router
