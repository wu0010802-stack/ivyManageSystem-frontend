<template>
  <el-card class="pos-panel" shadow="never">
    <div class="pos-panel__header">
      <el-radio-group
        :model-value="mode"
        @update:model-value="$emit('update:mode', $event)"
      >
        <el-radio-button
          v-for="m in modeOptions"
          :key="m.value"
          :value="m.value"
        >
          {{ m.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <el-input
      :model-value="searchQuery"
      :placeholder="placeholder"
      clearable
      size="large"
      :prefix-icon="Search"
      autofocus
      @update:model-value="$emit('update:searchQuery', $event)"
      @input="$emit('search')"
      @clear="$emit('search')"
      @keyup.enter="$emit('search')"
    />

    <div class="pos-panel__hint" v-if="!searchQuery">
      <el-icon><InfoFilled /></el-icon>
      <span>
        {{ isRefundMode ? '輸入學生/班級搜尋已繳費報名以退費' : '輸入學生/班級關鍵字開始搜尋未結清報名' }}
      </span>
    </div>

    <el-scrollbar class="pos-panel__results" v-loading="searching">
      <template v-if="mode === 'by-student'">
        <div v-if="groups.length === 0 && searchQuery && !searching" class="pos-panel__empty">
          無結果
        </div>
        <div
          v-for="g in groups"
          :key="g.student_key"
          class="pos-group"
        >
          <div class="pos-group__head">
            <div>
              <div class="pos-group__name">{{ g.student_name }}</div>
              <div class="pos-group__sub">
                {{ g.class_name || '—' }}
                <span v-if="g.birthday">· 生日 {{ g.birthday }}</span>
              </div>
            </div>
            <div class="pos-group__owed">
              欠 {{ formatTWD(g.group_owed_total) }}
            </div>
          </div>
          <div
            v-for="reg in g.registrations"
            :key="reg.id"
            class="pos-reg"
            :class="{ 'pos-reg--selected': isSelected(reg.id) }"
            @click="$emit('toggle', reg, g.student_name)"
          >
            <el-checkbox
              :model-value="isSelected(reg.id)"
              @click.stop
              @change="$emit('toggle', reg, g.student_name)"
            />
            <div class="pos-reg__info">
              <div class="pos-reg__lines">
                <span
                  v-for="(c, i) in reg.courses"
                  :key="`c-${i}`"
                  class="pos-reg__line"
                >
                  {{ c.name }}
                </span>
                <span
                  v-for="(s, i) in reg.supplies"
                  :key="`s-${i}`"
                  class="pos-reg__line pos-reg__line--supply"
                >
                  {{ s.name }}
                </span>
              </div>
              <div class="pos-reg__meta">
                應繳 {{ formatTWD(reg.total_amount) }} · 已繳 {{ formatTWD(reg.paid_amount) }}
              </div>
            </div>
            <div class="pos-reg__owed" :class="{ 'pos-reg__owed--refund': isRefundMode }">
              {{ formatTWD(isRefundMode ? reg.paid_amount : reg.owed) }}
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div
          v-if="registrations.length === 0 && searchQuery && !searching"
          class="pos-panel__empty"
        >
          無結果
        </div>
        <div
          v-for="row in registrations"
          :key="row.id"
          class="pos-reg pos-reg--solo"
          :class="{ 'pos-reg--selected': isSelected(row.id) }"
          @click="handleSingleToggle(row)"
        >
          <el-checkbox
            :model-value="isSelected(row.id)"
            @click.stop
            @change="handleSingleToggle(row)"
          />
          <div class="pos-reg__info">
            <div class="pos-reg__name">{{ row.student_name }} · {{ row.class_name || '—' }}</div>
            <div class="pos-reg__meta">
              {{ row.course_names || '' }}
            </div>
            <div class="pos-reg__meta">
              應繳 {{ formatTWD(row.total_amount) }} · 已繳 {{ formatTWD(row.paid_amount) }}
            </div>
          </div>
          <div class="pos-reg__owed" :class="{ 'pos-reg__owed--refund': isRefundMode }">
            {{ formatTWD(isRefundMode ? (row.paid_amount || 0) : Math.max(0, (row.total_amount || 0) - (row.paid_amount || 0))) }}
          </div>
        </div>
      </template>
    </el-scrollbar>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { InfoFilled, Search } from '@element-plus/icons-vue'

import { POS_MODES, formatTWD } from '@/constants/pos'

const props = defineProps({
  mode: { type: String, required: true },
  searchQuery: { type: String, required: true },
  searching: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] },
  registrations: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  isRefundMode: { type: Boolean, default: false },
})

const emit = defineEmits(['update:mode', 'update:searchQuery', 'search', 'toggle'])

const modeOptions = POS_MODES

const placeholder = computed(() => {
  if (props.isRefundMode) return '輸入學生/班級搜尋可退費報名…'
  return props.mode === 'by-student' ? '輸入學生姓名搜尋…' : '輸入學生/班級搜尋未結清報名…'
})

const isSelected = (id) => props.selectedIds.includes(id)

function handleSingleToggle(row) {
  // 依單筆模式的搜尋結果需要組成 owed / courses 給購物車
  const owed = Math.max(0, (row.total_amount || 0) - (row.paid_amount || 0))
  const normalized = {
    id: row.id,
    student_name: row.student_name,
    class_name: row.class_name || '',
    total_amount: row.total_amount,
    paid_amount: row.paid_amount,
    owed,
    courses: (row.course_names || '')
      .split('、')
      .filter(Boolean)
      .map((name) => ({ name, price: 0, status: 'enrolled' })),
    supplies: [],
  }
  emit('toggle', normalized, row.student_name)
}
</script>

<style scoped>
.pos-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pos-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
}

.pos-panel__header {
  display: flex;
  justify-content: center;
}

.pos-panel__hint {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 13px;
  justify-content: center;
  padding: 8px 0;
}

.pos-panel__results {
  flex: 1;
  min-height: 0;
}

.pos-panel__empty {
  text-align: center;
  color: #94a3b8;
  padding: 32px 0;
}

.pos-group {
  margin-bottom: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}

.pos-group__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #eef0fd;
  border-bottom: 1px solid #e2e8f0;
}

.pos-group__name {
  font-weight: 600;
  font-size: 15px;
  color: #1e293b;
}

.pos-group__sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.pos-group__owed {
  font-weight: 700;
  color: #dc2626;
  font-size: 15px;
}

.pos-reg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #e2e8f0;
  cursor: pointer;
  transition: background 0.15s;
}

.pos-reg:first-child {
  border-top: none;
}

.pos-reg:hover {
  background: #f1f5f9;
}

.pos-reg--solo {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 8px;
}

.pos-reg--selected {
  background: #dcfce7 !important;
  border-color: #10b981 !important;
}

.pos-reg__info {
  flex: 1;
  min-width: 0;
}

.pos-reg__lines {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
  color: #334155;
}

.pos-reg__line {
  background: #e0e7ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.pos-reg__line--supply {
  background: #fef3c7;
  color: #92400e;
}

.pos-reg__name {
  font-weight: 600;
  color: #1e293b;
}

.pos-reg__meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.pos-reg__owed {
  font-weight: 600;
  color: #dc2626;
  font-size: 14px;
  white-space: nowrap;
}

.pos-reg__owed--refund {
  color: #0284c7;
}
</style>
