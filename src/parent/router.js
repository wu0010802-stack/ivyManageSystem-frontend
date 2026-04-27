import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/login',
      name: 'parent-login',
      component: () => import('./views/LoginView.vue'),
      meta: { title: '登入', public: true },
    },
    {
      path: '/bind',
      name: 'parent-bind',
      component: () => import('./views/BindView.vue'),
      meta: { title: '綁定家長帳號', public: true },
    },
    {
      path: '/home',
      name: 'parent-home',
      component: () => import('./views/HomeView.vue'),
      meta: { title: '首頁' },
    },
    {
      // 兜底
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
