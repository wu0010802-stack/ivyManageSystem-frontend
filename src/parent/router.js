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
      meta: { title: '請假', tab: 'more' },
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
      meta: { title: '對話', tab: 'messages' },
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
      path: '/events/:eventId/ack',
      name: 'parent-event-ack',
      component: () => import('./views/EventAckView.vue'),
      meta: { title: '簽收', tab: 'more' },
    },
    {
      path: '/medications',
      name: 'parent-medications',
      component: () => import('./views/MedicationListView.vue'),
      meta: { title: '用藥', tab: 'more' },
    },
    {
      path: '/medications/new',
      name: 'parent-medication-new',
      component: () => import('./views/MedicationFormView.vue'),
      meta: { title: '新增用藥單', tab: 'more' },
    },
    {
      path: '/medications/:id',
      name: 'parent-medication-detail',
      component: () => import('./views/MedicationDetailView.vue'),
      meta: { title: '用藥詳情', tab: 'more' },
    },
    {
      path: '/notifications/preferences',
      name: 'parent-notif-prefs',
      component: () => import('./views/NotificationPrefsView.vue'),
      meta: { title: '通知偏好', tab: 'more' },
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
      path: '/children/:studentId',
      name: 'parent-child-profile',
      component: () => import('./views/ChildProfileView.vue'),
      meta: { title: '孩子檔案', tab: 'home' },
    },
    {
      path: '/calendar',
      name: 'parent-calendar',
      component: () => import('./views/CalendarView.vue'),
      meta: { title: '本週行程', tab: 'home' },
    },
    {
      path: '/contact-book',
      name: 'parent-contact-book',
      component: () => import('./views/ContactBookView.vue'),
      meta: { title: '聯絡簿', tab: 'home' },
    },
    {
      path: '/contact-book/:entryId',
      name: 'parent-contact-book-detail',
      component: () => import('./views/ContactBookDetailView.vue'),
      meta: { title: '聯絡簿詳情', tab: 'home' },
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
