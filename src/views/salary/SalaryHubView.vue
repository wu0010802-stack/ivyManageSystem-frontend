<template>
  <div>
    <PageHeader title="薪資管理" subtitle="月結進度與薪資功能入口">
      <template #actions>
        <el-select v-model="query.year" style="width: 100px" aria-label="年份">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px" aria-label="月份">
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
      </template>
    </PageHeader>

    <LoadingPanel v-if="loading" />
    <template v-else>
      <div class="hub-stats">
        <StatCard label="本月狀態" :value="statusMeta.label" :icon="Money" :color="statusMeta.color" />
        <StatCard label="封存進度" :value="`${finalizedCount} / ${records.length} 人`" :icon="Finished" color="info" />
        <StatCard
          label="需注意"
          :value="`${anomalies.size} 筆`"
          :icon="WarningFilled"
          :color="anomalies.size > 0 ? 'warning' : 'success'"
        />
      </div>

      <el-card shadow="never" class="hub-next no-hover">
        <span class="hub-next__hint">{{ statusMeta.hint }}</span>
        <el-button type="primary" @click="goSettle">{{ statusMeta.action }}</el-button>
      </el-card>

      <div class="hub-links">
        <el-card
          v-for="l in links"
          :key="l.path"
          shadow="hover"
          class="hub-link-card"
          role="link"
          tabindex="0"
          @click="router.push(l.path)"
          @keydown.enter="router.push(l.path)"
        >
          <h3>{{ l.title }}</h3>
          <p>{{ l.desc }}</p>
        </el-card>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, toRef, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Money, Finished, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import LoadingPanel from '@/components/common/LoadingPanel.vue'
import { useSalarySettlement, type SettlementStatus } from '@/composables/useSalarySettlement'

const router = useRouter()
const now = new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })
const yearOptions = computed(() => [query.year - 1, query.year, query.year + 1])

const { records, loading, status, anomalies, finalizedCount, refresh } = useSalarySettlement(
    toRef(query, 'year'),
    toRef(query, 'month'),
)
onMounted(refresh)

interface StatusMeta {
    label: string
    hint: string
    action: string
    step: string
    color: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}
const statusMeta = computed<StatusMeta>(() => {
    const metas: Record<SettlementStatus, StatusMeta> = {
        not_calculated: {
            label: '未計算', color: 'info',
            hint: '本月尚未計算薪資，從結算前檢查開始',
            action: '開始月結 →', step: 'precheck',
        },
        needs_recalc: {
            label: '需重算', color: 'warning',
            hint: '考勤或設定已變動，建議重新計算',
            action: '前往重算 →', step: 'calculate',
        },
        reviewing: {
            label: '覆核中', color: 'primary',
            hint: `${anomalies.value.size} 筆需要注意，覆核後即可定案`,
            action: '繼續覆核 →', step: 'review',
        },
        finalized: {
            label: '已定案', color: 'success',
            hint: '本月已全數封存，可匯出轉帳名冊',
            action: '前往匯出 →', step: 'export',
        },
    }
    return metas[status.value]
})

const goSettle = () =>
    router.push({
        path: '/salary/settle',
        query: { year: String(query.year), month: String(query.month), step: statusMeta.value.step },
    })

const links = [
    { path: '/salary/history', title: '薪資歷史', desc: '歷月紀錄、快照與明細回看' },
    { path: '/salary/simulate', title: '薪資試算', desc: '人事談薪情境試算（不寫入）' },
    { path: '/salary/settings', title: '薪資設定', desc: '獎金規則、才藝老師、系統參數' },
]
</script>

<style scoped>
.hub-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.hub-next {
  margin-bottom: var(--space-6);
}

.hub-next :deep(.el-card__body) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
}

.hub-next__hint {
  color: var(--text-secondary);
}

.hub-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.hub-link-card {
  cursor: pointer;
}

.hub-link-card h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
}

.hub-link-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

@media (--to-sm) {
  .hub-stats,
  .hub-links {
    grid-template-columns: 1fr;
  }
}
</style>
