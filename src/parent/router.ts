import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
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
      component: () => import('./views/TodayView.vue'),
      meta: { title: '首頁', tab: 'home' },
    },
    {
      path: '/attendance',
      name: 'parent-attendance',
      component: () => import('./views/AttendanceView.vue'),
      meta: { title: '出席', tab: 'admin', showBack: true },
    },
    {
      path: '/announcements',
      name: 'parent-announcements',
      component: () => import('./views/AnnouncementsView.vue'),
      meta: { title: '公告', tab: 'messages' },
    },
    {
      path: '/leaves',
      name: 'parent-leaves',
      component: () => import('./views/LeavesView.vue'),
      meta: { title: '請假', tab: 'admin', showBack: true },
    },
    {
      path: '/messages',
      name: 'parent-messages',
      component: () => import('./views/MessagesView.vue'),
      meta: { title: '訊息', tab: 'messages' },
    },
    {
      path: '/messages/:threadId',
      name: 'parent-message-thread',
      component: () => import('./views/MessageThreadView.vue'),
      meta: { title: '對話', tab: 'messages', showBack: true },
    },
    {
      path: '/assistant',
      name: 'parent-assistant',
      component: () => import('./views/AssistantView.vue'),
      meta: { title: '常見問題', showBack: true },
    },
    {
      path: '/me',
      name: 'parent-me',
      component: () => import('./views/MeView.vue'),
      meta: { title: '我的', tab: 'me' },
    },
    {
      // P0c-3 個人資料權利專區（個資法 §3 五權 UX）
      path: '/me/privacy-rights',
      name: 'parent-privacy-rights',
      component: () => import('./views/PrivacyRightsView.vue'),
      meta: { title: '個人資料權利', tab: 'me' },
    },
    {
      path: '/more',
      redirect: '/me',
    },
    {
      path: '/fees',
      name: 'parent-fees',
      component: () => import('./views/FeesView.vue'),
      meta: { title: '費用查詢', tab: 'admin', showBack: true },
    },
    {
      path: '/events',
      name: 'parent-events',
      component: () => import('./views/EventsView.vue'),
      meta: { title: '事件簽閱', tab: 'admin', showBack: true },
    },
    {
      path: '/events/:eventId/ack',
      name: 'parent-event-ack',
      component: () => import('./views/EventAckView.vue'),
      meta: { title: '簽收', tab: 'admin', showBack: true },
    },
    {
      path: '/medications',
      name: 'parent-medications',
      component: () => import('./views/MedicationListView.vue'),
      meta: { title: '用藥', tab: 'admin', showBack: true },
    },
    {
      path: '/medications/new',
      name: 'parent-medication-new',
      component: () => import('./views/MedicationFormView.vue'),
      meta: { title: '新增用藥單', tab: 'admin', showBack: true },
    },
    {
      path: '/medications/:id',
      name: 'parent-medication-detail',
      component: () => import('./views/MedicationDetailView.vue'),
      meta: { title: '用藥詳情', tab: 'admin', showBack: true },
    },
    {
      path: '/notifications/preferences',
      name: 'parent-notif-prefs',
      component: () => import('./views/NotificationPrefsView.vue'),
      meta: { title: '通知偏好', tab: 'me', inDrawer: true, showBack: true },
    },
    {
      path: '/activity',
      name: 'parent-activity',
      component: () => import('./views/ActivityView.vue'),
      meta: { title: '才藝課', tab: 'admin', showBack: true },
    },
    {
      path: '/bind-additional',
      name: 'parent-bind-additional',
      component: () => import('./views/BindAdditionalView.vue'),
      meta: { title: '加綁子女', tab: 'me', inDrawer: true, showBack: true },
    },
    {
      path: '/children/:studentId',
      name: 'parent-child-profile',
      component: () => import('./views/ChildProfileView.vue'),
      meta: { title: '孩子檔案', tab: 'admin', showBack: true },
    },
    {
      path: '/children/:studentId/reports',
      name: 'parent-child-reports',
      component: () => import('./views/ChildReportsView.vue'),
      meta: { title: '歷次成長報告', tab: 'admin', showBack: true },
    },
    {
      path: '/children/:studentId/photos',
      name: 'parent-child-photos',
      component: () => import('./views/ChildPhotosView.vue'),
      meta: { title: '照片牆', tab: 'admin', showBack: true },
    },
    {
      path: '/children/:studentId/measurements',
      name: 'parent-child-measurements',
      component: () => import('./views/ChildMeasurementsView.vue'),
      meta: { title: '健康紀錄', tab: 'admin', requiresAuth: true, showBack: true },
    },
    {
      path: '/calendar',
      name: 'parent-calendar',
      component: () => import('./views/CalendarView.vue'),
      meta: { title: '本週行程', tab: 'home', showBack: true },
    },
    {
      path: '/contact-book',
      name: 'parent-contact-book',
      component: () => import('./views/ContactBookView.vue'),
      meta: { title: '聯絡簿', tab: 'home', showBack: true },
    },
    {
      path: '/contact-book/:entryId',
      name: 'parent-contact-book-detail',
      component: () => import('./views/ContactBookDetailView.vue'),
      meta: { title: '聯絡簿詳情', tab: 'home', showBack: true },
    },
    {
      path: '/admin',
      name: 'parent-admin',
      component: () => import('./views/AdminListView.vue'),
      meta: { title: '事務', tab: 'admin' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/home',
    },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - 常春藤家長`
  }
})

export default router
