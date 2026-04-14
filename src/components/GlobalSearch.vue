<template>
  <Teleport to="body">
    <Transition name="gs-fade">
      <div v-if="visible" class="gs-overlay" @click.self="close">
        <div class="gs-modal" role="dialog" aria-modal="true" aria-label="全局搜尋">
          <!-- 搜尋輸入框 -->
          <div class="gs-input-wrap">
            <el-icon class="gs-input-icon"><Search /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="gs-input"
              placeholder="搜尋員工、學生、公告、頁面..."
              autocomplete="off"
              @keydown="onKeydown"
            />
            <span v-if="isLoading" class="gs-spinner"></span>
            <kbd class="gs-esc-hint" @click="close">esc</kbd>
          </div>

          <!-- 結果區 -->
          <div class="gs-results" ref="resultsRef">
            <template v-if="query.trim()">
              <!-- 員工 -->
              <template v-if="employeeResults.length">
                <div class="gs-section-title">員工</div>
                <div
                  v-for="(item, idx) in employeeResults"
                  :key="'emp-' + item.id"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === flatIndex('employee', idx) }"
                  @mouseenter="activeIndex = flatIndex('employee', idx)"
                  @click="select(item)"
                >
                  <el-icon class="gs-item-icon"><User /></el-icon>
                  <span class="gs-item-label" v-html="highlight(item.name, query)"></span>
                  <span class="gs-item-sub">{{ item.job_title || item.department || '' }}</span>
                </div>
              </template>

              <!-- 學生 -->
              <template v-if="studentResults.length">
                <div class="gs-section-title">學生</div>
                <div
                  v-for="(item, idx) in studentResults"
                  :key="'stu-' + item.id"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === flatIndex('student', idx) }"
                  @mouseenter="activeIndex = flatIndex('student', idx)"
                  @click="select(item)"
                >
                  <el-icon class="gs-item-icon"><Avatar /></el-icon>
                  <span class="gs-item-label" v-html="highlight(item.name, query)"></span>
                  <span class="gs-item-sub">{{ item.classroom_name || '' }}</span>
                </div>
              </template>

              <!-- 公告 -->
              <template v-if="announcementResults.length">
                <div class="gs-section-title">公告</div>
                <div
                  v-for="(item, idx) in announcementResults"
                  :key="'ann-' + item.id"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === flatIndex('announcement', idx) }"
                  @mouseenter="activeIndex = flatIndex('announcement', idx)"
                  @click="select(item)"
                >
                  <el-icon class="gs-item-icon"><Bell /></el-icon>
                  <span class="gs-item-label" v-html="highlight(item.title, query)"></span>
                </div>
              </template>

              <!-- 頁面 -->
              <template v-if="pageResults.length">
                <div class="gs-section-title">頁面</div>
                <div
                  v-for="(item, idx) in pageResults"
                  :key="'page-' + item.path"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === flatIndex('page', idx) }"
                  @mouseenter="activeIndex = flatIndex('page', idx)"
                  @click="select(item)"
                >
                  <el-icon class="gs-item-icon"><Grid /></el-icon>
                  <span class="gs-item-label" v-html="highlight(item.title, query)"></span>
                  <span class="gs-item-sub">{{ item.path }}</span>
                </div>
              </template>

              <!-- 無結果 -->
              <div
                v-if="!employeeResults.length && !studentResults.length && !announcementResults.length && !pageResults.length && !isLoading"
                class="gs-empty"
              >
                無符合「{{ query }}」的結果
              </div>
            </template>

            <div v-else class="gs-hint">
              輸入關鍵字搜尋員工、學生、公告或頁面
            </div>
          </div>

          <!-- 底部快捷鍵提示 -->
          <div class="gs-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 導航</span>
            <span><kbd>Enter</kbd> 選擇</span>
            <span><kbd>Esc</kbd> 關閉</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, User, Avatar, Bell, Grid } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import { getStudents } from '@/api/students'
import { getAnnouncements } from '@/api/announcements'
import { canAccessRoute } from '@/utils/auth'
import { highlight } from '@/utils/highlight'

const router = useRouter()
const employeeStore = useEmployeeStore()

// ---------- state ----------
const visible = ref(false)
const query = ref('')
const activeIndex = ref(-1)
const isLoading = ref(false)
const inputRef = ref(null)
const resultsRef = ref(null)

// 公告快取（首次 fetch 後不重複請求）
const announcementCache = ref(null)
// 學生搜尋結果（debounce 後更新）
const studentResults = ref([])

// ---------- 靜態頁面清單 ----------
const ALL_PAGES = [
  { title: '儀表板', path: '/', accessPath: '/' },
  { title: '審核工作台', path: '/approvals', accessPath: '/approvals' },
  { title: '考勤管理', path: '/attendance', accessPath: '/attendance' },
  { title: '請假管理', path: '/leaves', accessPath: '/leaves' },
  { title: '加班 / 會議', path: '/overtime', accessPath: '/overtime' },
  { title: '員工管理', path: '/employees', accessPath: '/employees' },
  { title: '學生管理', path: '/students', accessPath: '/students' },
  { title: '班級學生管理', path: '/classrooms', accessPath: '/classrooms' },
  { title: '薪資管理', path: '/salary', accessPath: '/salary' },
  { title: '公告管理', path: '/announcements', accessPath: '/announcements' },
  { title: '報表統計', path: '/reports', accessPath: '/reports' },
  { title: '操作紀錄', path: '/audit-logs', accessPath: '/audit-logs' },
  { title: '系統設定', path: '/settings', accessPath: '/settings' },
  { title: '班表管理', path: '/schedule', accessPath: '/schedule' },
  { title: '園務會議', path: '/overtime?tab=meetings', accessPath: '/overtime' },
  { title: '學校行事曆', path: '/calendar', accessPath: '/calendar' },
  { title: '招生統計', path: '/recruitment', accessPath: '/recruitment' },
]

// ---------- computed 搜尋結果 ----------
const employeeResults = computed(() => {
  const q = query.value.trim()
  if (!q) return []
  return employeeStore.employees
    .filter(e =>
      (e.name || '').includes(q) ||
      (e.employee_id || '').toString().includes(q) ||
      (e.job_title || '').includes(q)
    )
    .slice(0, 5)
    .map(e => ({ ...e, _type: 'employee' }))
})

const announcementResults = computed(() => {
  const q = query.value.trim()
  if (!q || !announcementCache.value) return []
  return announcementCache.value
    .filter(a => (a.title || '').includes(q) || (a.content || '').includes(q))
    .slice(0, 3)
    .map(a => ({ ...a, _type: 'announcement' }))
})

const pageResults = computed(() => {
  const q = query.value.trim()
  if (!q) return []
  return ALL_PAGES
    .filter(p => canAccessRoute(p.accessPath || p.path) && p.title.includes(q))
    .map(p => ({ ...p, _type: 'page' }))
})

// ---------- 全域扁平索引（鍵盤導航用）----------
// 順序：員工 → 學生 → 公告 → 頁面
const flatItems = computed(() => [
  ...employeeResults.value,
  ...studentResults.value.map(s => ({ ...s, _type: 'student' })),
  ...announcementResults.value,
  ...pageResults.value,
])

function flatIndex(section, localIdx) {
  const offsets = {
    employee: 0,
    student: employeeResults.value.length,
    announcement: employeeResults.value.length + studentResults.value.length,
    page: employeeResults.value.length + studentResults.value.length + announcementResults.value.length,
  }
  return offsets[section] + localIdx
}

// ---------- 資料載入 ----------
async function loadAnnouncements() {
  if (announcementCache.value !== null) return
  try {
    const res = await getAnnouncements()
    announcementCache.value = res.data?.items ?? res.data ?? []
  } catch {
    announcementCache.value = []
  }
}

// debounce 學生搜尋
let studentTimer = null
function scheduleStudentSearch(q) {
  clearTimeout(studentTimer)
  if (!q.trim()) {
    studentResults.value = []
    return
  }
  studentTimer = setTimeout(async () => {
    isLoading.value = true
    try {
      const res = await getStudents({ search: q, limit: 5 })
      studentResults.value = (res.data?.items ?? res.data ?? []).slice(0, 5)
    } catch {
      studentResults.value = []
    } finally {
      isLoading.value = false
    }
  }, 300)
}

// ---------- query 監聽 ----------
watch(query, (newQ) => {
  activeIndex.value = -1
  scheduleStudentSearch(newQ)
})

// ---------- 開啟 / 關閉 ----------
function open() {
  visible.value = true
  query.value = ''
  activeIndex.value = -1
  studentResults.value = []
  // 預載資料
  employeeStore.fetchEmployees()
  loadAnnouncements()
  nextTick(() => inputRef.value?.focus())
}

function close() {
  visible.value = false
  clearTimeout(studentTimer)
}

// ---------- 選擇項目 ----------
function select(item) {
  const type = item._type
  if (type === 'employee') router.push('/employees')
  else if (type === 'student') router.push('/students')
  else if (type === 'announcement') router.push('/announcements')
  else if (type === 'page') router.push(item.path)
  close()
}

// ---------- 鍵盤導航 ----------
function onKeydown(e) {
  const total = flatItems.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = total ? (activeIndex.value + 1) % total : -1
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = total ? (activeIndex.value - 1 + total) % total : -1
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && activeIndex.value < total) {
      select(flatItems.value[activeIndex.value])
    }
  } else if (e.key === 'Escape') {
    close()
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = resultsRef.value?.querySelector('.gs-item--active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// ---------- 全域快捷鍵 Ctrl+K / ⌘+K ----------
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    visible.value ? close() : open()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearTimeout(studentTimer)
})

// ---------- 對外暴露 ----------
defineExpose({ open })
</script>

<style scoped>
/* ===== Overlay ===== */
.gs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

/* ===== Modal ===== */
.gs-modal {
  background: var(--surface-color, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: min(640px, calc(100vw - 32px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== Input ===== */
.gs-input-wrap {
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color-light, #e5e7eb);
  gap: 10px;
  flex-shrink: 0;
}

.gs-input-icon {
  font-size: 18px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  padding: 16px 0;
  background: transparent;
  color: var(--text-primary, #111827);
}

.gs-input::placeholder {
  color: var(--text-tertiary, #9ca3af);
}

.gs-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color-light, #e5e7eb);
  border-top-color: var(--color-primary, #409eff);
  border-radius: 50%;
  animation: gs-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes gs-spin {
  to { transform: rotate(360deg); }
}

.gs-esc-hint {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border-color-light, #e5e7eb);
  border-radius: 4px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}

/* ===== Results ===== */
.gs-results {
  overflow-y: auto;
  padding: 8px 0;
  flex: 1;
}

.gs-section-title {
  padding: 6px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, #9ca3af);
}

.gs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 8px;
  transition: background 0.1s;
}

.gs-item:hover,
.gs-item--active {
  background: var(--color-primary-lighter, #ecf5ff);
}

.gs-item-icon {
  font-size: 16px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-item-label {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-item-sub {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-empty,
.gs-hint {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-tertiary, #9ca3af);
  font-size: 14px;
}

/* ===== Footer ===== */
.gs-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color-light, #e5e7eb);
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-footer kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--border-color-light, #d1d5db);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--bg-color, #f9fafb);
  color: var(--text-secondary, #4b5563);
}

/* ===== Transition ===== */
.gs-fade-enter-active,
.gs-fade-leave-active {
  transition: opacity 0.15s ease;
}
.gs-fade-enter-active .gs-modal,
.gs-fade-leave-active .gs-modal {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.gs-fade-enter-from,
.gs-fade-leave-to {
  opacity: 0;
}
.gs-fade-enter-from .gs-modal,
.gs-fade-leave-to .gs-modal {
  transform: translateY(-8px);
  opacity: 0;
}
</style>

<!-- 全域 mark 樣式（不加 scoped 才能套用到 v-html 內部） -->
<style>
.search-highlight {
  background-color: #fef08a;
  color: #92400e;
  border-radius: 2px;
  padding: 0 1px;
  font-style: normal;
}
</style>
