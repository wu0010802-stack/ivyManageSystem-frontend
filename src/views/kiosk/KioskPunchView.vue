<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import NumPad from '@/components/kiosk/NumPad.vue'
import { getKioskRoster, kioskPreview, kioskPunch } from '@/api/kiosk'

interface RosterEntry {
  employee_id: number
  name: string
  has_pin: boolean
  today_state: string
}
interface Preview {
  employee_name: string
  action: string
  will_overwrite: boolean
  current_punch_out: string | null
  server_time: string
}

type Stage = 'roster' | 'pin' | 'confirm' | 'success'

const roster = ref<RosterEntry[]>([])
const stage = ref<Stage>('roster')
const selected = ref<RosterEntry | null>(null)
const pin = ref('')
const preview = ref<Preview | null>(null)
const successText = ref('')
const loading = ref(false)
const noPinWarning = ref(false)

async function loadRoster() {
  const res = await getKioskRoster()
  roster.value = res.data as RosterEntry[]
}
onMounted(loadRoster)

function pickEmployee(e: RosterEntry) {
  if (!e.has_pin) {
    noPinWarning.value = true
    ElMessage.warning('請先到教師入口設定打卡 PIN')
    return
  }
  noPinWarning.value = false
  selected.value = e
  pin.value = ''
  stage.value = 'pin'
}

function actionLabel(a: string) {
  return a === 'punch_in' ? '上班' : '下班'
}

async function submitPin() {
  if (!selected.value || pin.value.length < 4) return
  loading.value = true
  try {
    const res = await kioskPreview({ employee_id: selected.value.employee_id, pin: pin.value })
    preview.value = res.data as Preview
    stage.value = 'confirm'
  } catch {
    ElMessage.error('PIN 錯誤或暫時無法打卡')
    pin.value = ''
  } finally {
    loading.value = false
  }
}

async function confirmPunch() {
  if (!selected.value) return
  loading.value = true
  try {
    const res = await kioskPunch({ employee_id: selected.value.employee_id, pin: pin.value })
    const d = res.data as { employee_name: string; action: string; punch_time: string }
    successText.value = `${d.employee_name}　${actionLabel(d.action)}　${d.punch_time.slice(11, 16)}`
    stage.value = 'success'
    // 打卡已成功：立即排程 reset，不受後續刷新名單影響
    setTimeout(reset, 3000)
  } catch {
    // 僅 kioskPunch 本身失敗才顯示錯誤
    ElMessage.error('打卡失敗，請重試')
  } finally {
    loading.value = false
  }
  // 刷新名單為裝飾性動作，失敗不影響已完成的打卡記錄，不可誤報失敗
  if (stage.value === 'success') {
    try {
      await loadRoster()
    } catch {
      // 名單過期屬 cosmetic，下次 reset 後自愈
    }
  }
}

function reset() {
  stage.value = 'roster'
  selected.value = null
  pin.value = ''
  preview.value = null
  noPinWarning.value = false
}
</script>

<template>
  <div class="kiosk">
    <h1 class="kiosk-title">電子打卡</h1>

    <p v-if="noPinWarning" class="nopin-warning">請先到教師入口設定打卡 PIN</p>

    <div v-if="stage === 'roster'" class="roster">
      <div
        v-for="e in roster"
        :key="e.employee_id"
        class="roster-item"
        :class="{ 'no-pin': !e.has_pin }"
        role="button"
        tabindex="0"
        @click="pickEmployee(e)"
        @keydown.enter.space.prevent="pickEmployee(e)"
      >
        <span class="roster-name">{{ e.name }}</span>
        <span v-if="e.today_state === 'in_only'" class="roster-tag">已上班</span>
        <span v-else-if="e.today_state === 'done'" class="roster-tag">已完成</span>
      </div>
    </div>

    <div v-else-if="stage === 'pin'" class="pin-stage">
      <p class="pin-emp">{{ selected?.name }}</p>
      <p class="pin-dots">{{ '●'.repeat(pin.length) }}</p>
      <NumPad v-model="pin" :maxlength="6" @submit="submitPin" />
      <el-button text @click="reset">取消</el-button>
    </div>

    <div v-else-if="stage === 'confirm'" class="confirm-stage">
      <p class="confirm-emp">{{ preview?.employee_name }}</p>
      <p class="confirm-action">即將記為【{{ actionLabel(preview?.action || '') }}】</p>
      <p class="confirm-time">{{ preview?.server_time.slice(11, 16) }}</p>
      <p v-if="preview?.will_overwrite" class="confirm-overwrite">
        將更新下班時間（原 {{ preview?.current_punch_out?.slice(11, 16) }}）
      </p>
      <el-button type="primary" size="large" :loading="loading" @click="confirmPunch">確認打卡</el-button>
      <el-button text @click="reset">取消</el-button>
    </div>

    <div v-else-if="stage === 'success'" class="success-stage">
      <p class="success-check">✓ 打卡成功</p>
      <p class="success-text">{{ successText }}</p>
      <el-button text @click="reset">返回</el-button>
    </div>
  </div>
</template>

<style scoped>
.kiosk { max-width: 720px; margin: 0 auto; padding: 24px; text-align: center; }
.kiosk-title { font-size: 28px; margin-bottom: 24px; }
.roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; }
.roster-item {
  padding: 24px 12px; border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 12px; cursor: pointer; font-size: 20px;
}
.roster-item.no-pin { opacity: 0.5; }
.roster-tag { display: block; font-size: 13px; color: var(--el-color-success, #67c23a); }
.pin-dots { font-size: 32px; letter-spacing: 8px; min-height: 40px; }
.pin-stage, .confirm-stage, .success-stage { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.confirm-action { font-size: 24px; font-weight: 600; }
.confirm-overwrite { color: var(--el-color-warning, #e6a23c); }
.success-check { font-size: 32px; color: var(--el-color-success, #67c23a); }
.success-text { font-size: 24px; }
.nopin-warning { color: var(--el-color-warning, #e6a23c); font-size: 16px; margin-bottom: 8px; }
</style>
