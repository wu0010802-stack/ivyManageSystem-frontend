<script setup lang="ts">
/**
 * 首頁的班級提醒卡：連續缺席、近期生日、過敏注意。
 *
 * 2026-09-14 首頁整併：本卡原本還有聯絡簿／點名／接送／用藥四格 KPI，與同頁
 * 功能格指的是同一批入口，並存等於首頁同一個功能進得去兩次，已移除。留下的
 * 三條提醒全系統只有這裡看得到，不隨功能格的班級切換過濾——逐班各一張、標了
 * 班名，漏看過敏或連續缺席的代價比多看一張卡高。
 */
import { computed } from 'vue'
import { WarningFilled, Present } from '@element-plus/icons-vue'

interface ClassroomCard {
  classroom_id?: number | string
  classroom_name?: string
  student_count?: number
  consecutive_absences?: { student_id?: number; student_name?: string; days?: number }[]
  upcoming_birthdays_7d?: { student_id?: number; student_name?: string; days_until?: number }[]
  allergy_alerts?: { student_id?: number; student_name?: string; allergens?: { allergen?: string }[] }[]
  [key: string]: unknown
}

const props = defineProps<{
  card: ClassroomCard
}>()

const consecutiveAbsences = computed(() => props.card.consecutive_absences || [])
const upcomingBirthdays = computed(() => props.card.upcoming_birthdays_7d || [])
const allergyAlerts = computed(() => props.card.allergy_alerts || [])
</script>

<template>
  <div class="pt-card classroom-ops">
    <div class="header">
      <div class="title">{{ card.classroom_name }}</div>
      <div class="meta">{{ card.student_count }} 位學生</div>
    </div>

    <div v-if="consecutiveAbsences.length" class="alert-row">
      <span class="alert-label alert-label--warn"><el-icon aria-hidden="true"><WarningFilled /></el-icon>連續缺席</span>
      <span class="alert-content">
        <span v-for="a in consecutiveAbsences" :key="a.student_id" class="chip warn">
          {{ a.student_name }}（{{ a.days }} 天）
        </span>
      </span>
    </div>

    <div v-if="upcomingBirthdays.length" class="alert-row">
      <span class="alert-label alert-label--happy"><el-icon aria-hidden="true"><Present /></el-icon>近期生日</span>
      <span class="alert-content">
        <span v-for="b in upcomingBirthdays" :key="b.student_id" class="chip happy">
          {{ b.student_name }}（{{ b.days_until === 0 ? '今天' : `${b.days_until} 天後` }}）
        </span>
      </span>
    </div>

    <div v-if="allergyAlerts.length" class="alert-row">
      <span class="alert-label alert-label--danger"><el-icon aria-hidden="true"><WarningFilled /></el-icon>過敏注意</span>
      <span class="alert-content">
        <span v-for="a in allergyAlerts" :key="a.student_id" class="chip danger">
          {{ a.student_name }}：{{ (a.allergens || []).map(x => x.allergen).join('、') }}
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.classroom-ops {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.header { display: flex; justify-content: space-between; align-items: baseline; }
.title { font-size: var(--text-lg); font-weight: 600; color: var(--pt-text-strong); }
.meta { font-size: var(--text-sm); color: var(--pt-text-muted); }

.alert-row {
  display: flex; gap: var(--space-2); align-items: flex-start;
  font-size: var(--text-sm);
}
.alert-label {
  width: 88px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--pt-text-muted);
  flex-shrink: 0;
  line-height: 1.5;
}
.alert-label .el-icon { font-size: 15px; }
.alert-label--warn .el-icon { color: var(--color-warning-darker); }
.alert-label--happy .el-icon { color: var(--color-tint-activity-fg); }
.alert-label--danger .el-icon { color: var(--color-danger-darker); }
.alert-content { flex: 1; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center;
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
}
.chip.warn { background: var(--color-warning-lighter); color: var(--color-warning); }
.chip.happy { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }
.chip.danger { background: var(--color-danger-lighter); color: var(--color-danger); }
</style>
