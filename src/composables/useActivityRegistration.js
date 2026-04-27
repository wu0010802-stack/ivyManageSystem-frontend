import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRegistrations,
  batchUpdatePayment,
  getCourses,
  getClassOptions,
} from '@/api/activity'
import { useAcademicTermStore } from '@/stores/academicTerm'

/**
 * 封裝才藝報名管理的核心狀態與操作。
 * 支援 URL query string 同步，使 F5 後篩選條件保留。
 */
export function useActivityRegistration() {
  const route = useRoute()
  const router = useRouter()
  const termStore = useAcademicTermStore()

  // ── 列表狀態 ────────────────────────────────────────────────
  const list = ref([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const fetchSeq = ref(0)

  // ── 篩選條件（與 URL query 同步）────────────────────────────
  const searchText = ref('')
  const paymentFilter = ref('')
  const courseFilter = ref(null)
  const classroomFilter = ref('')

  // ── 下拉選項 ─────────────────────────────────────────────────
  const courseOptions = ref([])
  const classroomOptions = ref([])

  // ── 批次操作 ─────────────────────────────────────────────────
  const selectedIds = ref([])
  const savingBatch = ref(false)

  // ── 初始化：從 URL query 反序列化篩選條件 ─────────────────────
  function initFromQuery() {
    const q = route.query
    if (q.search) searchText.value = q.search
    if (q.payment_status) paymentFilter.value = q.payment_status
    if (q.course_id) courseFilter.value = Number(q.course_id)
    if (q.classroom_name) classroomFilter.value = q.classroom_name
    if (q.page) page.value = Number(q.page) || 1
    if (q.page_size) pageSize.value = Number(q.page_size) || 20
  }

  // ── 同步篩選條件至 URL query ──────────────────────────────────
  function syncToQuery() {
    const query = {}
    if (searchText.value) query.search = searchText.value
    if (paymentFilter.value) query.payment_status = paymentFilter.value
    if (courseFilter.value) query.course_id = String(courseFilter.value)
    if (classroomFilter.value) query.classroom_name = classroomFilter.value
    if (page.value > 1) query.page = String(page.value)
    if (pageSize.value !== 20) query.page_size = String(pageSize.value)
    router.replace({ query })
  }

  // ── 取得列表 ─────────────────────────────────────────────────
  async function fetchList() {
    syncToQuery()
    const seq = ++fetchSeq.value
    loading.value = true
    try {
      const res = await getRegistrations({
        skip: (page.value - 1) * pageSize.value,
        limit: pageSize.value,
        search: searchText.value || undefined,
        payment_status: paymentFilter.value || undefined,
        course_id: courseFilter.value || undefined,
        classroom_name: classroomFilter.value || undefined,
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      if (seq !== fetchSeq.value) return
      list.value = res.data.items
      total.value = res.data.total
    } catch {
      if (seq === fetchSeq.value) ElMessage.error('載入失敗')
    } finally {
      if (seq === fetchSeq.value) loading.value = false
    }
  }

  // ── 搜尋（重置 page=1，300ms 防抖）────────────────────────
  let _searchTimer = null
  function handleSearch() {
    if (_searchTimer) clearTimeout(_searchTimer)
    _searchTimer = setTimeout(() => {
      page.value = 1
      fetchList()
    }, 300)
  }

  // ── 批次標記「已繳費」─────────────────────────────────────────
  // Why: 批次「未繳費」會一口氣寫多筆全額沖帳 refund，誤操作損失大，後端已禁用。
  // 需要退費請走單筆 PUT /payment（帶 confirm_refund_amount）或 DELETE /payments/{id} 軟刪。
  async function batchMarkPaid(isPaid, onSuccess) {
    if (!isPaid) {
      ElMessage.warning(
        '批次沖帳已停用，請改用單筆繳費明細頁的退費 / 軟刪按鈕逐筆處理。'
      )
      return
    }
    let reason = ''
    try {
      const res = await ElMessageBox.prompt(
        `確定將已選 ${selectedIds.value.length} 筆報名標記為「已繳費」？\n\n系統將自動補齊差額為「系統補齊」付款紀錄。\n\n請輸入操作原因（≥ 5 字，會寫入稽核軌跡）：`,
        '批次更新確認',
        {
          type: 'warning',
          confirmButtonText: '確定',
          inputPattern: /.{5,}/,
          inputErrorMessage: '原因至少 5 字',
        }
      )
      reason = (res?.value || '').trim()
    } catch {
      return
    }
    savingBatch.value = true
    try {
      const res = await batchUpdatePayment(selectedIds.value, reason)
      ElMessage.success(res.data.message)
      selectedIds.value = []
      if (onSuccess) onSuccess()
      await fetchList()
    } catch (e) {
      ElMessage.error(e?.response?.data?.detail || '批次更新失敗')
    } finally {
      savingBatch.value = false
    }
  }

  // ── 載入下拉選項 ─────────────────────────────────────────────
  async function loadOptions() {
    try {
      const [coursesRes, classRes] = await Promise.all([
        getCourses({
          school_year: termStore.school_year,
          semester: termStore.semester,
        }),
        getClassOptions(),
      ])
      courseOptions.value = coursesRes.data.courses || []
      classroomOptions.value = classRes.data.options || []
    } catch {
      ElMessage.warning('篩選選項載入失敗，部分篩選功能暫不可用')
    }
  }

  // 切換學期時自動重新載入
  watch(
    () => [termStore.school_year, termStore.semester],
    () => {
      page.value = 1
      courseFilter.value = null
      loadOptions()
      fetchList()
    }
  )

  return {
    // 列表
    list, total, page, pageSize, loading,
    // 篩選
    searchText, paymentFilter, courseFilter, classroomFilter,
    // 選項
    courseOptions, classroomOptions,
    // 批次
    selectedIds, savingBatch,
    // 方法
    initFromQuery, fetchList, handleSearch, batchMarkPaid, loadOptions,
  }
}
