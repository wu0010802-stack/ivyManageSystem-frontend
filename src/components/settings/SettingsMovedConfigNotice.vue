<script setup lang="ts">
/**
 * 「分校設定」頁籤的搬家說明（2026-10-29 後台 IA 重整 S5）。
 *
 * 原本擠在這個頁籤的設定已歸位到各自模組的設定頁；留這一段指路，保留一個版本週期
 * （之後可整段移除）。連結只在使用者進得去目標頁時才給（canAccessRoute）：進不去的
 * 只顯示位置文字，避免點了被路由守衛彈走。
 */
import { computed } from 'vue'
import { canAccessRoute } from '@/utils/auth'

interface MovedItem {
  key: string
  what: string
  where: string
  /** 連結目標；query 部分不參與權限判斷。 */
  to: string
  /** 判斷使用者進不進得去目標頁的路徑（可多個，任一可進即給連結，連結取第一個可進的）。 */
  gatePaths: string[]
}

const MOVED_ITEMS: readonly MovedItem[] = [
  {
    key: 'bus',
    what: '校車座標（校區緯度、經度）',
    where: '娃娃車 › 設定',
    to: '/bus/settings',
    gatePaths: ['/bus/settings'],
  },
  {
    key: 'attendance',
    what: 'Kiosk 打卡機與校內 WiFi 允許 IP',
    where: '出勤核對頁首「打卡設定」',
    to: '/attendance',
    gatePaths: ['/attendance'],
  },
  {
    key: 'gov',
    what: '勞保／健保／勞退單位編號',
    where: '政府申報頁籤列「申報單位設定」',
    to: '/admin/gov-reports/monthly',
    gatePaths: ['/admin/gov-reports/monthly', '/gov-reports'],
  },
  {
    key: 'pos',
    what: 'POS 現金門檻（日結強制盤點、抽屜現金提醒）',
    where: '才藝管理 › 設定 › 收銀設定',
    to: '/activity/settings?tab=cash',
    gatePaths: ['/activity/settings'],
  },
  {
    key: 'salary',
    what: '節慶目標人數生效月、請假配額年度、請半日假不計加班、產假月份年終、未簽約新人截止日、加班抵休',
    where: '薪資設定 › 計算規則開關',
    to: '/salary/settings?tab=rule_switches',
    gatePaths: ['/salary/settings'],
  },
]

const items = computed(() =>
  MOVED_ITEMS.map((item) => {
    const gate = item.gatePaths.find((path) => canAccessRoute(path))
    // gov 有兩個可能的落點（教育部頁／勞健保頁，申報單位設定在兩邊的頁籤列都有），連結取使用者進得去的那個
    const to = item.key === 'gov' && gate ? gate : item.to
    return { ...item, to, linkable: gate !== undefined }
  }),
)
</script>

<template>
  <el-alert
    class="moved-config-notice"
    type="info"
    :closable="false"
    show-icon
    title="部分設定已搬到各模組的設定頁"
    data-test="moved-config-notice"
  >
    <ul class="moved-config-notice__list">
      <li v-for="item in items" :key="item.key" :data-test="`moved-${item.key}`">
        {{ item.what }} →
        <router-link v-if="item.linkable" :to="item.to">{{ item.where }}</router-link>
        <span v-else>{{ item.where }}</span>
      </li>
    </ul>
  </el-alert>
</template>

<style scoped>
.moved-config-notice {
  margin-bottom: 16px;
}
.moved-config-notice__list {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: 1.8;
}
</style>
