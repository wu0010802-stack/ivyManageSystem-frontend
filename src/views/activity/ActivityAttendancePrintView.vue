<template>
  <div class="print-page">
    <!-- 工具列（列印時隱藏） -->
    <div class="toolbar no-print">
      <el-button :icon="Printer" type="primary" @click="doPrint">列印</el-button>
      <el-button @click="closeWin">關閉</el-button>
      <span class="toolbar-hint">若列印視窗未自動彈出，請點「列印」</span>
    </div>

    <div v-if="loading" class="loading-hint">資料載入中…</div>

    <template v-else-if="data">
      <!-- 表頭 -->
      <header class="sheet-header">
        <div class="title-row">
          <h1>才藝點名單</h1>
          <div class="schoolname">{{ schoolName }}</div>
        </div>
        <div class="meta-grid">
          <div><label>課程</label><span>{{ data.course_name }}</span></div>
          <div><label>日期</label><span>{{ formattedDate }}</span></div>
          <div><label>總人數</label><span>{{ data.total }} 人</span></div>
          <div><label>授課老師</label><span class="blank-line"></span></div>
        </div>
        <div v-if="data.notes" class="notes">備註：{{ data.notes }}</div>
      </header>

      <!-- 點名表格 -->
      <table class="roll-table">
        <thead>
          <tr>
            <th style="width: 40px">#</th>
            <th style="width: 90px">班級</th>
            <th>姓名</th>
            <th style="width: 50px">出席</th>
            <th style="width: 50px">缺席</th>
            <th style="width: 50px">請假</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in sortedStudents" :key="s.registration_id">
            <td class="num">{{ i + 1 }}</td>
            <td class="classname">{{ s.class_name || '—' }}</td>
            <td class="name">{{ s.student_name }}</td>
            <td class="check-cell"><span class="box" :class="{ filled: s.is_present === true }"></span></td>
            <td class="check-cell"><span class="box" :class="{ filled: s.is_present === false }"></span></td>
            <td class="check-cell"><span class="box"></span></td>
            <td class="remark-cell">{{ s.attendance_notes || '' }}</td>
          </tr>
          <!-- 補齊空白列至 20 列，方便手寫加人 -->
          <tr v-for="n in paddingRows" :key="`pad-${n}`" class="pad-row">
            <td class="num">{{ sortedStudents.length + n }}</td>
            <td></td><td></td>
            <td class="check-cell"><span class="box"></span></td>
            <td class="check-cell"><span class="box"></span></td>
            <td class="check-cell"><span class="box"></span></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <!-- 頁尾簽名區 -->
      <footer class="sheet-footer">
        <div class="stat-row">
          <span>出席：____ 人</span>
          <span>缺席：____ 人</span>
          <span>請假：____ 人</span>
        </div>
        <div class="sign-row">
          <div class="sign-block">
            <label>授課老師簽名</label>
            <div class="sign-line"></div>
          </div>
          <div class="sign-block">
            <label>主管覆核</label>
            <div class="sign-line"></div>
          </div>
          <div class="sign-block">
            <label>日期</label>
            <div class="sign-line"></div>
          </div>
        </div>
        <div class="print-ts">列印時間：{{ printTime }}</div>
      </footer>
    </template>

    <div v-else class="loading-hint error">載入失敗，請關閉視窗重試。</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Printer } from '@element-plus/icons-vue'
import { getAttendanceSession } from '@/api/activity'
import { POS_ORG_INFO } from '@/constants/pos'

const route = useRoute()
const loading = ref(true)
const data = ref(null)

const schoolName = POS_ORG_INFO.name

const sortedStudents = computed(() => {
  const list = data.value?.students || []
  return [...list].sort((a, b) => {
    const ac = a.class_name || ''
    const bc = b.class_name || ''
    if (ac !== bc) return ac.localeCompare(bc, 'zh-Hant')
    return (a.student_name || '').localeCompare(b.student_name || '', 'zh-Hant')
  })
})

const paddingRows = computed(() => {
  const MIN_ROWS = 20
  const diff = MIN_ROWS - sortedStudents.value.length
  return diff > 0 ? diff : 0
})

const formattedDate = computed(() => {
  const d = data.value?.session_date
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`
})

const printTime = computed(() => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
})

async function load() {
  loading.value = true
  try {
    const sid = route.params.sessionId
    const res = await getAttendanceSession(sid)
    data.value = res.data
  } catch (e) {
    ElMessage.error('載入場次失敗')
    data.value = null
  } finally {
    loading.value = false
  }
}

function doPrint() {
  window.print()
}

function closeWin() {
  window.close()
}

onMounted(async () => {
  await load()
  if (data.value) {
    await nextTick()
    setTimeout(() => window.print(), 300)
  }
})
</script>

<style scoped>
.print-page {
  background: #fff;
  color: #000;
  font-family: 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC', sans-serif;
  padding: 24px 32px;
  max-width: 900px;
  margin: 0 auto;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px dashed #ccc;
}
.toolbar-hint { font-size: 12px; color: #888; }

.loading-hint { text-align: center; padding: 60px; color: #888; }
.loading-hint.error { color: #c33; }

.sheet-header { margin-bottom: 12px; }
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 2px solid #000;
  padding-bottom: 6px;
  margin-bottom: 10px;
}
.title-row h1 { margin: 0; font-size: 22px; letter-spacing: 3px; }
.schoolname { font-size: 13px; color: #333; }

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 24px;
  font-size: 14px;
  padding: 4px 0 8px;
}
.meta-grid label {
  display: inline-block;
  width: 72px;
  color: #555;
  border-right: 1px solid #aaa;
  margin-right: 8px;
  padding-right: 6px;
}
.meta-grid span { font-weight: 600; }
.meta-grid .blank-line {
  display: inline-block;
  min-width: 140px;
  border-bottom: 1px solid #666;
  height: 1em;
}
.notes {
  font-size: 13px;
  color: #333;
  padding: 4px 8px;
  background: #f8f8f8;
  border-left: 3px solid #888;
  margin-bottom: 8px;
}

.roll-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.roll-table th,
.roll-table td {
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: left;
  vertical-align: middle;
  height: 28px;
}
.roll-table th {
  background: #e8e8e8;
  text-align: center;
  font-weight: 600;
}
.roll-table td.num,
.roll-table td.check-cell { text-align: center; }
.roll-table td.classname { text-align: center; color: #333; font-size: 12px; }
.roll-table td.name { font-weight: 600; }
.roll-table .pad-row td { color: #bbb; }

.check-cell .box {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 1.5px solid #000;
}
.check-cell .box.filled {
  background: #000;
}

.sheet-footer { margin-top: 16px; font-size: 13px; }
.stat-row {
  display: flex;
  gap: 24px;
  padding: 8px 0;
  border-bottom: 1px dashed #999;
}
.sign-row {
  display: flex;
  gap: 32px;
  padding: 16px 0 4px;
}
.sign-block { flex: 1; }
.sign-block label {
  display: block;
  font-size: 12px;
  color: #555;
  margin-bottom: 4px;
}
.sign-line {
  height: 28px;
  border-bottom: 1px solid #000;
}
.print-ts {
  text-align: right;
  font-size: 11px;
  color: #888;
  margin-top: 8px;
}

@media print {
  @page {
    size: A4;
    margin: 12mm 14mm;
  }
  .no-print { display: none !important; }
  .print-page {
    padding: 0;
    max-width: none;
  }
  body { background: #fff; }
}
</style>
