import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/home' },
    {
      path: '/login',
      name: 'parent-login',
      component: () => import('./views/LoginView.vue'),
      meta: { title: '登入', public: true, hideTabBar: true },
    },
    {
      path: '/bind',
      name: 'parent-bind',
      component: () => import('./views/BindView.vue'),
      meta: { title: '綁定家長帳號', public: true, hideTabBar: true },
    },
    {
      path: '/home',
      name: 'parent-home',
      component: () => import('./views/HomeView.vue'),
      meta: { title: '首頁', tab: 'home' },
    },
    {
      path: '/attendance',
      name: 'parent-attendance',
      component: () => import('./views/AttendanceView.vue'),
      meta: { title: '出席', tab: 'attendance' },
    },
    {
      path: '/announcements',
      name: 'parent-announcements',
      component: () => import('./views/AnnouncementsView.vue'),
      meta: { title: '公告', tab: 'announcements' },
    },
    {
      path: '/leaves',
      name: 'parent-leaves',
      component: () => import('./views/LeavesView.vue'),
      meta: { title: '請假', tab: 'leaves' },
    },
    {
      path: '/more',
      name: 'parent-more',
      component: () => import('./views/MoreView.vue'),
      meta: { title: '更多', tab: 'more' },
    },
    {
      path: '/fees',
      name: 'parent-fees',
      component: () => import('./views/FeesView.vue'),
      meta: { title: '費用查詢', tab: 'more' },
    },
    {
      path: '/events',
      name: 'parent-events',
      component: () => import('./views/EventsView.vue'),
      meta: { title: '事件簽閱', tab: 'more' },
    },
    {
      path: '/activity',
      name: 'parent-activity',
      component: () => import('./views/ActivityView.vue'),
      meta: { title: '才藝課', tab: 'more' },
    },
    {
      path: '/bind-additional',
      name: 'parent-bind-additional',
      component: () => import('./views/BindAdditionalView.vue'),
      meta: { title: '加綁子女', tab: 'more' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - 常春藤家長`
  }
})

export default router
