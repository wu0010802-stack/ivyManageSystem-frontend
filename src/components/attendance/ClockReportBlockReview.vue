<script setup lang="ts">
/**
 * ClockReportBlockReview — 打卡鐘報表中「只能推估日期」的區塊人工確認
 *
 * 報表把留白格直接省略，系統只能依欄位位置推算每一格是哪一天；這裡並排顯示報表原文與
 * 推估結果，由行政對照後逐塊勾選「對應正確」。未確認的區塊，該員工整月都不會匯入。
 */
import { computed } from 'vue'
import type { ApiResponse } from '@/api/_generated/typed'

type Block = NonNullable<ApiResponse<'/attendance/upload/preview-clock-report', 'post'>['blocks']>[number]

const props = defineProps<{
  blocks: Block[]
  confirmed: Set<string>
  disabled?: boolean
  dirty?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', blockId: string, checked: boolean): void
  (e: 'reapply'): void
}>()

const LAYOUT_LABEL: Record<Block['layout'], string> = {
  interleaved: '每天兩個欄位',
  grid: '依欄位位置推算（有留白格）',
}

const pendingCount = computed(() => props.blocks.filter(block => !props.confirmed.has(block.block_id)).length)

function onToggle(blockId: string, event: Event) {
  emit('toggle', blockId, (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="clock-block-review" aria-label="推估區塊確認">
    <h4>推估區塊確認（{{ blocks.length }} 個）</h4>
    <p class="clock-block-review__note">
      這些區塊的報表有留白格或兩個欄位並排，日期是系統依欄位位置推算的。請對照原文確認每一天都對得上；
      未確認的區塊，該員工整月都不會匯入。
    </p>
    <article v-for="block in blocks" :key="block.block_id" class="clock-block-review__block" :data-block-id="block.block_id">
      <header>
        <strong>{{ block.source_name }}</strong>
        <span>卡號 {{ block.source_employee_number }} · {{ block.department }} · {{ block.first_day }} 日起 · {{ LAYOUT_LABEL[block.layout] }}</span>
      </header>
      <pre class="clock-block-review__raw" aria-label="報表原文">{{ [block.date_line, ...block.raw_lines].join('\n') }}</pre>
      <table class="clock-block-review__table">
        <caption>推估結果</caption>
        <thead><tr><th>日期</th><th>上班</th><th>下班</th></tr></thead>
        <tbody>
          <tr v-for="proposal in block.proposals" :key="proposal.date">
            <td>{{ proposal.date }}</td><td>{{ proposal.punch_in ?? '缺卡' }}</td><td>{{ proposal.punch_out ?? '缺卡' }}</td>
          </tr>
        </tbody>
      </table>
      <label>
        <input
          type="checkbox"
          :checked="confirmed.has(block.block_id)"
          :disabled="disabled"
          :aria-label="`${block.source_name} ${block.first_day} 日起的推估結果對應正確`"
          @change="onToggle(block.block_id, $event)"
        />
        對應正確
      </label>
    </article>
    <p role="status">
      <template v-if="pendingCount > 0">尚有 {{ pendingCount }} 個區塊未確認；這些員工整月都不會匯入。</template>
      <template v-else>所有區塊皆已確認。</template>
      <template v-if="dirty">確認結果已變更，請重新預覽後再匯入。</template>
    </p>
    <el-button data-reapply :disabled="disabled || !dirty" @click="emit('reapply')">依確認結果重新預覽</el-button>
  </section>
</template>

<style scoped>
.clock-block-review { margin-block: 12px; padding: 12px; border: 1px solid var(--el-color-warning); border-radius: 4px; }
.clock-block-review h4 { margin: 0 0 6px; }
.clock-block-review__note { margin: 0 0 8px; color: var(--el-text-color-secondary, #909399); font-size: 13px; }
.clock-block-review__block { margin-block: 12px; padding-block-end: 12px; border-bottom: 1px solid var(--el-border-color); }
.clock-block-review__block header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-block-end: 6px; }
.clock-block-review__raw { overflow-x: auto; margin: 0 0 8px; padding: 8px; background: var(--el-fill-color-light); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }
.clock-block-review__table { border-collapse: collapse; margin-block-end: 8px; font-size: 13px; }
.clock-block-review__table th, .clock-block-review__table td { padding: 4px 12px; text-align: left; border-bottom: 1px solid var(--el-border-color); }
.clock-block-review__table caption { text-align: left; font-size: 12px; color: var(--el-text-color-secondary, #909399); }
</style>
