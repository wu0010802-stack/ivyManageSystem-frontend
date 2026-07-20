<template>
  <button
    class="gov-data-btn"
    :class="{ active: expanded }"
    @click.stop="emit('toggle')"
  >
    {{ expanded ? '收起詳細資料 ▲' : '詳細資料 ▼' }}
  </button>
  <div
    v-show="expanded"
    class="preschool-gov-detail"
  >
    <div v-if="loading" class="gov-detail-loading">載入政府資料中…</div>
    <div v-else-if="!govData" class="gov-detail-empty">查無政府登記資料（該園可能尚未收錄或名稱格式不同）</div>
    <template v-else>
      <div class="gov-detail-matched-name">
        政府登記名稱：{{ govData.name }}
      </div>
      <div v-if="govData.principal" class="gov-detail-row">
        <span class="gov-detail-label">負責人</span>
        <span class="gov-detail-value">{{ govData.principal }}</span>
      </div>
      <div v-if="govData.phone" class="gov-detail-row">
        <span class="gov-detail-label">電話</span>
        <span class="gov-detail-value">{{ govData.phone }}</span>
      </div>
      <div v-if="govData.address" class="gov-detail-row">
        <span class="gov-detail-label">住址</span>
        <span class="gov-detail-value">{{ govData.address }}</span>
      </div>
      <div v-if="govData.kind" class="gov-detail-row">
        <span class="gov-detail-label">類型</span>
        <span class="gov-detail-value">{{ govData.kind }}</span>
      </div>
      <div v-if="govData.capacity != null" class="gov-detail-row">
        <span class="gov-detail-label">核定人數</span>
        <span class="gov-detail-value">{{ govData.capacity }} 人</span>
      </div>
      <div v-if="govData.prePublicType" class="gov-detail-row">
        <span class="gov-detail-label">準公共幼兒園</span>
        <span class="gov-detail-value">{{ govData.prePublicType }}</span>
      </div>
      <div v-if="govData.approvedDate" class="gov-detail-row">
        <span class="gov-detail-label">核准設立日期</span>
        <span class="gov-detail-value">{{ govData.approvedDate }}</span>
      </div>
      <div v-if="govData.totalAreaSqm != null" class="gov-detail-row">
        <span class="gov-detail-label">全園總面積</span>
        <span class="gov-detail-value">
          {{ sqmToPing(govData.totalAreaSqm) }} 坪
          <template v-if="govData.indoorAreaSqm != null || govData.outdoorAreaSqm != null">
            （<template v-if="govData.indoorAreaSqm != null">室內 {{ sqmToPing(govData.indoorAreaSqm) }}</template>
            <template v-if="govData.indoorAreaSqm != null && govData.outdoorAreaSqm != null"> / </template>
            <template v-if="govData.outdoorAreaSqm != null">室外 {{ sqmToPing(govData.outdoorAreaSqm) }}</template> 坪）
          </template>
        </span>
      </div>
      <div v-if="govData.floor" class="gov-detail-row">
        <span class="gov-detail-label">使用樓層</span>
        <span class="gov-detail-value">{{ govData.floor }}</span>
      </div>
      <div v-if="sanitizeHref(govData.website)" class="gov-detail-row">
        <span class="gov-detail-label">園所網址</span>
        <a
          class="gov-detail-value gov-detail-link"
          :href="sanitizeHref(govData.website)"
          target="_blank"
          rel="noopener noreferrer"
        >{{ govData.website }}</a>
      </div>
      <div v-if="govData.monthlyFee != null" class="gov-detail-row">
        <span class="gov-detail-label">每月收費</span>
        <span class="gov-detail-value">${{ Number(govData.monthlyFee).toLocaleString() }}</span>
      </div>
      <div v-if="govData.shuttle" class="gov-detail-row">
        <span class="gov-detail-label">校車服務</span>
        <span class="gov-detail-value">{{ govData.shuttle }}</span>
      </div>
      <div v-if="govData.afterSchool" class="gov-detail-row">
        <span class="gov-detail-label">課後留園</span>
        <span class="gov-detail-value gov-status-open">有</span>
      </div>
      <div v-if="govData.status" class="gov-detail-row">
        <span class="gov-detail-label">營業狀態</span>
        <span
          class="gov-detail-value"
          :class="String(govData.status).includes('營業') ? 'gov-status-open' : 'gov-status-closed'"
        >{{ govData.status }}</span>
      </div>
      <div class="gov-detail-row">
        <span class="gov-detail-label">裁罰記錄</span>
        <span
          class="gov-detail-value"
          :class="govData.penalties?.length ? 'gov-status-warned' : (govData.hasPenalty ? 'gov-status-warned' : 'gov-status-clean')"
        >
          <template v-if="govData.penalties?.length">{{ govData.penalties.length }} 筆</template>
          <template v-else-if="govData.hasPenalty">有（詳細內容未收錄）</template>
          <template v-else>無</template>
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 選定學校的教育部政府登錄詳情面板：純展示元件，資料由 parent（
// RecruitmentNearbySchoolList）同步組好傳入，本身不打 API。
// 拆分自 RecruitmentAddressHeatmap.vue（2026-07-12 元件邊界拆分），行為零改動。
import type { GovData } from '@/types/recruitmentHeatmap'
import { sanitizeHref } from '@/utils/url'

defineProps<{
  expanded: boolean
  govData: GovData | null
  loading: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const sqmToPing = (sqm: number | null | undefined) => (Number(sqm) / 3.30579).toFixed(1)
</script>

<style scoped>
.gov-data-btn {
  margin-top: 6px;
  width: 100%;
  padding: 4px 0;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: #f0f7ff;
  color: var(--color-info-darker);
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gov-data-btn:hover,
.gov-data-btn.active {
  background: var(--color-info-soft);
}

.preschool-gov-detail {
  margin-top: 6px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: #f8fbff;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.gov-detail-matched-name {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
}

.gov-detail-loading,
.gov-detail-empty {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-align: center;
  padding: 4px 0;
}

.gov-detail-row {
  display: flex;
  gap: 6px;
  font-size: 0.78rem;
  align-items: flex-start;
}

.gov-detail-label {
  flex: none;
  width: 56px;
  color: var(--text-secondary);
}

.gov-detail-value {
  color: #1e3a5f;
  word-break: break-word;
  flex: 1;
}

.gov-detail-link { color: var(--color-info-darker); text-decoration: underline; word-break: break-all; }
.gov-detail-link:hover { color: var(--color-info-darker); }

.gov-status-open  { color: #166534; font-weight: 600; }
.gov-status-closed { color: #991b1b; font-weight: 600; }
.gov-status-clean  { color: #166534; }
.gov-status-warned { color: var(--color-warning-darker); font-weight: 600; }

/* v-show 展開動畫：直接在元素上做 max-height transition，不依賴 <Transition>。
   2026-07-20 UI 稽核評估：不改 grid-template-rows 動畫——該法需插入中介 wrapper 且
   對 v-show 的 display:none 切換一樣無法平滑補間，風險大於收益；max-height 動畫僅
   0.25s、面板高度上限 600px 已知，layout 動畫成本可接受，維持現狀。 */
.preschool-gov-detail {
  overflow: hidden;
  transition: opacity 0.2s ease, max-height 0.25s ease;
  max-height: 600px;
}
.preschool-gov-detail[style*="display: none"],
.preschool-gov-detail[style*="display:none"] {
  max-height: 0;
  opacity: 0;
}

/* dark mode：以下元素疊在不翻色的硬編淺底/白卡（finding #2 既有債，非本次範圍），上游
   a11y.css 把 --color-*-darker 翻亮會讓文字塌對比。dark scope 窄覆寫還原可讀：疊白/淺底
   的文字還原深字；自帶硬編淺藍底的 gov 按鈕改用會翻色的 *-soft 底（hover 本就用 *-soft）。 */
html.dark .gov-data-btn { background: var(--color-info-soft); }
html.dark .gov-detail-link,
html.dark .gov-detail-link:hover { color: #1d4ed8; }
html.dark .gov-status-warned { color: #b45309; }
</style>
