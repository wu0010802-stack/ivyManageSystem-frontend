<script setup lang="ts">
// 審核工作台頂部「其他待簽」：考核、收付款、學費月結、POS 日結不在工作台處理，
// 只顯示等待件數並連到原頁。資料層與規則見 ./otherSignoffs.ts。
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { useOtherSignoffs } from './otherSignoffs'

const router = useRouter()
const { items, hasError, reload } = useOtherSignoffs()

onMounted(reload)
defineExpose({ reload })
</script>

<template>
  <section v-if="items.length > 0" class="other-signoffs" aria-label="其他待簽" data-test="other-signoffs">
    <div class="other-signoffs__head">
      <h3 class="other-signoffs__heading">其他待簽</h3>
      <span class="other-signoffs__sub">這些簽核在各自的頁面處理，點「前往」進入</span>
      <el-button v-if="hasError" link type="primary" data-test="other-signoffs-retry" @click="reload">
        重新載入
      </el-button>
    </div>

    <div class="other-signoffs__grid">
      <el-card
        v-for="item in items"
        :key="item.key"
        class="other-signoffs__card"
        shadow="hover"
        :data-test="`signoff-${item.key}`"
      >
        <div class="other-signoffs__meta">
          <span class="other-signoffs__title">{{ item.title }}</span>
          <span v-if="item.count.status === 'loading'" class="other-signoffs__count" data-test="count-loading">…</span>
          <el-tag
            v-else-if="item.count.status === 'ok'"
            :type="item.count.count > 0 ? 'warning' : 'success'"
            effect="plain"
            data-test="count-ok"
          >
            {{ item.count.count }} {{ item.unit }}
          </el-tag>
          <el-tag v-else-if="item.count.status === 'error'" type="info" effect="plain" data-test="count-error">—</el-tag>
        </div>
        <p class="other-signoffs__desc">
          <template v-if="item.count.status === 'ok'">{{ item.count.detail }}</template>
          <template v-else-if="item.count.status === 'error'">件數載入失敗，仍可前往原頁處理。</template>
          <template v-else>{{ item.hint }}</template>
        </p>
        <el-button link type="primary" :data-test="`goto-${item.key}`" @click="router.push(item.to)">
          前往
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </el-card>
    </div>
  </section>
</template>

<style scoped>
.other-signoffs {
  margin-bottom: var(--space-4);
}

.other-signoffs__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.other-signoffs__heading {
  margin: 0;
  font-size: var(--text-lg);
}

.other-signoffs__sub {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.other-signoffs__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--space-3);
}

.other-signoffs__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.other-signoffs__title {
  font-weight: 600;
}

.other-signoffs__desc {
  margin: var(--space-2) 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
</style>
