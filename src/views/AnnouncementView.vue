<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormItemRule, FormRules } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncementParentRecipients,
  replaceAnnouncementParentRecipients,
  getAnnouncementRecipients,
  getAnnouncementReaders,
} from '@/api/announcements'
import { getAnnouncementCategories } from '@/api/announcementCategories'
import { getStudents } from '@/api/students'
import {
  buildParentRecipientsPayload,
  resolveParentScope,
  type ParentRecipientItem,
} from '@/utils/announcementScope'
import { buildParentPushConfirm, type ParentScopeSnapshot } from '@/utils/announcementPushConfirm'
import { useEmployeeStore } from '@/stores/employee'
import { useAllClassroomStore } from '@/stores/classroomAll'
import { labelClassroomsByTerm, type ClassroomLike } from '@/utils/classroomTerm'
import { Top, Document } from '@element-plus/icons-vue'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { formatDate } from '@/utils/format'
import { required } from '@/validators/rules'
import { useTableFilters } from '@/composables/useTableFilters'
import { useFormDirty } from '@/composables/useFormDirty'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import FormSection from '@/components/common/FormSection.vue'
import { previewIconFor } from '@/constants/announcementCategoryIcons'
import type { Schema } from '@/api/_generated/typed'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import AnnouncementStatusTag from '@/views/announcement/AnnouncementStatusTag.vue'
import AnnouncementAudienceTags from '@/views/announcement/AnnouncementAudienceTags.vue'
import AnnouncementReadCell, { type ReaderRow } from '@/views/announcement/AnnouncementReadCell.vue'
import {
  ATTACHMENT_MAX,
  ATTACHMENT_MAX_MB,
  useAnnouncementAttachments,
  type AttachmentItem,
} from '@/views/announcement/useAnnouncementAttachments'

// embedded：由 AnnouncementHubView 以頁籤嵌入時為 true——頁首（標題）由 hub 統一提供，
// 這裡只留「新增公告」動作列，避免同頁出現兩個標題。獨立掛載（預設）行為不變。
defineProps<{ embedded?: boolean }>()

// 手機版（≤767.98px）：清單改卡片視圖（比照 EmployeeListView 範式）
const { isMobile } = useIsMobile()

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

type AnnouncementCategoryRow = Schema<'AnnouncementCategoryOut'>
type CategoryBrief = Schema<'AnnouncementCategoryBriefOut'>

interface AnnouncementItem {
  id: number
  title: string
  content: string
  priority: string
  is_pinned: boolean
  recipient_count?: number
  parent_recipient_count?: number
  read_count?: number
  parent_read_count?: number
  read_preview?: { employee_id: number; name: string }[]
  created_by_name?: string
  created_at?: string
  publish_at?: string | null
  expires_at?: string | null
  status?: 'scheduled' | 'active' | 'expired'
  attachments?: AttachmentItem[]
  category?: CategoryBrief | null
  [key: string]: unknown
}

// ── 清單載入 ──────────────────────────────────────────────────────────────
// 載入失敗要顯示成錯誤（可重試），不能讓使用者看到「尚無公告」而誤以為真的沒有。
// useTableFilters 不攔截錯誤，且搜尋／換頁／篩選都在它內部呼叫 fetch、呼叫端接不到 rejection，
// 所以在 apiFunc 這一層統一處理：失敗時回空清單（不留上一頁的舊列）並標記 loadError。
const loadError = ref(false)
let listRequestSeq = 0
const fetchAnnouncementPage = async (params: Record<string, unknown>) => {
  const seq = ++listRequestSeq
  try {
    const res = await getAnnouncements(params)
    if (seq === listRequestSeq) loadError.value = false
    return res
  } catch (error) {
    // 只有最新一次請求能決定錯誤狀態，過時請求的失敗不得蓋掉較新的成功
    if (seq === listRequestSeq) {
      loadError.value = true
      ElMessage.error(apiError(error, '載入公告失敗'))
    }
    return { data: { items: [], total: 0 } }
  }
}

const {
  searchQuery: annSearch,
  items: rawAnnouncements,
  total: annTotal,
  page: annPage,
  pageSize: annPageSize,
  loading,
  fetch: fetchAnnouncements,
  setPage: annSetPage,
  setExtraParams,
} = useTableFilters({ apiFunc: fetchAnnouncementPage, initialPageSize: 50 })

const announcements = computed(() => rawAnnouncements.value as AnnouncementItem[])

const annFilterValues = ref<Record<string, unknown>>({})
const onAnnFilterChange = (v: Record<string, unknown>) => {
  annFilterValues.value = v
  return setExtraParams({ priority: v.priority })
}
const hasActiveFilter = computed(() => Boolean(annSearch.value) || Boolean(annFilterValues.value.priority))
const clearFilters = () => {
  annSearch.value = ''
  void onAnnFilterChange({})
}

const dialogVisible = ref(false)
const isEdit = ref(false)
const recipientSettingsLoading = ref(false)
const recipientSettingsReady = ref(true)
let recipientHydrationEpoch = 0
const employeeStore = useEmployeeStore()
const classroomStore = useAllClassroomStore()
const employeeOptions = computed(() =>
  (employeeStore.employees as { id: number; name: string; department?: string; job_title?: string }[]).map(e => ({
    value: e.id,
    label: `${e.name}（${e.department || e.job_title || ''}）`,
  }))
)
// 跨學期班級：公告要發給「學生現在所在的班」，而學生名單不跟學期。只拿當期班級的話，
// 暑假期間學生已編入下學年班級 → 指定班級選不到人、學生分組全變「未分班」。
const classroomOptions = computed(() =>
  labelClassroomsByTerm((classroomStore.classrooms || []) as ClassroomLike[]).map(c => ({
    value: c.id,
    label: c.label,
  }))
)

// 公告分類（anncat01）：下拉選單資料源，新公告預設帶入該 tenant 的 is_default 分類。
const categories = ref<AnnouncementCategoryRow[]>([])
const fetchCategories = async () => {
  try {
    const res = await getAnnouncementCategories()
    categories.value = res.data.items
  } catch (error) {
    ElMessage.warning(apiError(error, '載入公告分類失敗'))
  }
}
const defaultCategoryId = computed(
  () => categories.value.find((c) => c.is_default)?.id ?? null,
)

// 公告受眾範圍獨立權限碼（2026-09-08 anncat01）：SCHOOL_WRITE 控「全部家長／校園」，
// CLASS_WRITE 控「指定班級」；scope='student'（指定學生）與既有 preserved
// guardian/classroom 項不受影響，仍只需基礎 ANNOUNCEMENTS_WRITE。
const canScopeSchool = computed(() => hasPermission('ANNOUNCEMENTS_SCHOOL_WRITE'))
const canScopeClass = computed(() => hasPermission('ANNOUNCEMENTS_CLASS_WRITE'))

const priorityOptions: { value: string; label: string; type: ElTagType }[] = [
  { value: 'normal', label: '一般', type: 'info' },
  { value: 'important', label: '重要', type: 'warning' },
  { value: 'urgent', label: '緊急', type: 'danger' },
]

const priorityMap: Record<string, { value: string; label: string; type: ElTagType }> = Object.fromEntries(priorityOptions.map(p => [p.value, p]))

const annFilterGroups = computed(() => [
  { key: 'priority', label: '優先級', options: priorityOptions.map((o) => ({ label: o.label, value: o.value })) },
])

// ── 附件（狀態與送出結算見 useAnnouncementAttachments）──────────────────────
const {
  existingAttachments,
  attachmentFileList,
  attachmentSlotsLeft,
  hasAttachmentChanges,
  resetAttachments,
  handleAttachmentChange,
  handleAttachmentRemove,
  handleAttachmentExceed,
  handleAttachmentBefore,
  markAttachmentForDelete,
  syncAttachments,
} = useAnnouncementAttachments()

// ── 已讀名單（點開才載入，依公告 id 快取）──────────────────────────────────
const readersCache = ref<Record<number, { items: ReaderRow[]; total: number; loaded: boolean }>>({})
const readersLoading = ref<Record<number, boolean>>({})
const readersError = ref<Record<number, boolean>>({})

const ensureReadersLoaded = async (annId: number, force = false) => {
  if (!force && readersCache.value[annId]?.loaded) return
  readersLoading.value[annId] = true
  readersError.value[annId] = false
  try {
    const res = await getAnnouncementReaders(annId, { page: 1, page_size: 50 })
    const data = res.data as { items?: ReaderRow[]; total?: number }
    readersCache.value[annId] = {
      items: data.items || [],
      total: data.total ?? 0,
      loaded: true,
    }
  } catch (error) {
    readersError.value[annId] = true
    ElMessage.error(apiError(error, '載入已讀名單失敗'))
  } finally {
    readersLoading.value[annId] = false
  }
}

const readCellProps = (row: AnnouncementItem) => ({
  readCount: row.read_count ?? 0,
  parentReadCount: row.parent_read_count ?? 0,
  preview: row.read_preview ?? [],
  readers: readersCache.value[row.id]?.items ?? [],
  loading: readersLoading.value[row.id] ?? false,
  error: readersError.value[row.id] ?? false,
})

// parent_visibility: 'off' | 'all' | 'classroom' | 'custom'
// 後端 scope 支援 all/classroom/student/guardian；custom 對應 student 層級，
// guardian／混排 rows 以 preservedParentItems 原樣保留避免 replace-all 洗掉既有設定
const form = reactive<{
  id: number | null
  title: string
  content: string
  priority: string
  category_id: number | null
  is_pinned: boolean
  restrict_recipients: boolean
  target_employee_ids: number[]
  parent_visibility: string
  parent_target_classroom_ids: number[]
  parent_target_student_ids: number[]
  publish_at: string | null
  expires_at: string | null
}>({
  id: null,
  title: '',
  content: '',
  priority: 'normal',
  category_id: null,
  is_pinned: false,
  restrict_recipients: false,
  target_employee_ids: [],
  parent_visibility: 'off',
  parent_target_classroom_ids: [],
  parent_target_student_ids: [],
  publish_at: null,
  expires_at: null,
})

const preservedParentItems = ref<ParentRecipientItem[]>([])
// 編輯時讀到的原始家長對象；用來判斷這次送出會不會有人收到新的 LINE 通知
const initialParentScope = ref<ParentScopeSnapshot | null>(null)

// 學生選項：首次切到「指定學生」才載入（名冊百人級，全量 + 班級分組本地過濾）
const studentOptionsLoading = ref(false)
const studentOptionsLoaded = ref(false)
const studentOptionGroups = ref<{ label: string; options: { value: number; label: string }[] }[]>([])

const ensureStudentOptions = async () => {
  if (studentOptionsLoaded.value) return
  studentOptionsLoading.value = true
  try {
    const res = await getStudents({ is_active: true, limit: 500, skip: 0 })
    const items = ((res.data as { items?: { id: number; name?: string | null; classroom_id?: number | null }[] })?.items) || []
    const classroomLabel = new Map(classroomOptions.value.map((c) => [c.value, c.label]))
    const byClass = new Map<string, { value: number; label: string }[]>()
    for (const s of items) {
      // 「查不到班級」≠「沒有班級」：前者仍是有班的孩子（停用班／清單未涵蓋的學期），
      // 混標成「未分班」會讓人以為名冊壞了。
      const key =
        s.classroom_id == null
          ? '未分班'
          : classroomLabel.get(s.classroom_id) ?? '其他班級'
      if (!byClass.has(key)) byClass.set(key, [])
      byClass.get(key)!.push({ value: s.id, label: s.name || `#${s.id}` })
    }
    studentOptionGroups.value = [...byClass.entries()].map(([label, options]) => ({ label, options }))
    studentOptionsLoaded.value = true
  } catch (error) {
    ElMessage.warning(apiError(error, '載入學生名單失敗'))
  } finally {
    studentOptionsLoading.value = false
  }
}

watch(() => form.parent_visibility, (v) => {
  if (v === 'custom') void ensureStudentOptions()
})

// ── 未儲存保護 ────────────────────────────────────────────────────────────
// 附件不在 form 內，待上傳／待刪除也算未儲存的變更。
const { isDirty: formDirty, snapshot: snapshotForm } = useFormDirty(form)
const isFormDirty = () => formDirty.value || hasAttachmentChanges.value

const resetForm = () => {
  form.id = null
  form.title = ''
  form.content = ''
  form.priority = 'normal'
  form.category_id = defaultCategoryId.value
  form.is_pinned = false
  form.restrict_recipients = false
  form.target_employee_ids = []
  form.parent_visibility = 'off'
  form.parent_target_classroom_ids = []
  form.parent_target_student_ids = []
  form.publish_at = null
  form.expires_at = null
  preservedParentItems.value = []
  initialParentScope.value = null
  resetAttachments()
}

const openAdd = () => {
  recipientHydrationEpoch += 1
  recipientSettingsLoading.value = false
  recipientSettingsReady.value = true
  resetForm()
  snapshotForm()
  isEdit.value = false
  dialogVisible.value = true
}

const openEdit = async (row: AnnouncementItem) => {
  const requestEpoch = ++recipientHydrationEpoch
  recipientSettingsLoading.value = true
  recipientSettingsReady.value = false
  form.id = row.id
  form.title = row.title
  form.content = row.content
  form.priority = row.priority
  form.category_id = row.category?.id ?? null
  form.is_pinned = row.is_pinned
  form.publish_at = (row.publish_at as string | null) ?? null
  form.expires_at = (row.expires_at as string | null) ?? null
  // 先以預設值打開（顯示 loading 期間可互動）
  form.target_employee_ids = []
  form.restrict_recipients = false
  form.parent_visibility = 'off'
  form.parent_target_classroom_ids = []
  form.parent_target_student_ids = []
  preservedParentItems.value = []
  initialParentScope.value = null
  resetAttachments([...(row.attachments ?? [])])
  snapshotForm()
  isEdit.value = true
  dialogVisible.value = true

  try {
    const [recRes, parentRes] = await Promise.all([
      getAnnouncementRecipients(row.id),
      getAnnouncementParentRecipients(row.id),
    ])
    if (requestEpoch !== recipientHydrationEpoch || form.id !== row.id || !dialogVisible.value) return
    const empIds: number[] = (recRes.data as { employee_ids?: number[] })?.employee_ids || []
    form.target_employee_ids = empIds
    form.restrict_recipients = empIds.length > 0

    const items = ((parentRes.data as { items?: ParentRecipientItem[] })?.items) || []
    const scope = resolveParentScope(items)
    form.parent_visibility = scope.visibility
    form.parent_target_classroom_ids = scope.classroomIds
    form.parent_target_student_ids = scope.studentIds
    preservedParentItems.value = scope.preservedItems
    initialParentScope.value = {
      visibility: scope.visibility,
      classroomIds: [...scope.classroomIds],
      studentIds: [...scope.studentIds],
    }
    recipientSettingsReady.value = true
  } catch (error) {
    if (requestEpoch !== recipientHydrationEpoch) return
    ElMessage.warning(apiError(error, '讀取員工／家長對象設定失敗'))
    form.parent_visibility = 'unchanged'
  } finally {
    if (requestEpoch === recipientHydrationEpoch) {
      recipientSettingsLoading.value = false
      // 讀回來的對象設定是「原始值」不是使用者的修改，重拍快照避免一打開就被當成未儲存
      snapshotForm()
    }
  }
}

const invalidateRecipientHydration = () => {
  recipientHydrationEpoch += 1
  recipientSettingsLoading.value = false
  recipientSettingsReady.value = false
}

// 受眾讀取失敗：此時送出會以預設值（全員／家長關閉）覆寫原設定，所以整個送出被擋住
const recipientSettingsFailed = computed(
  () => isEdit.value && !recipientSettingsLoading.value && form.parent_visibility === 'unchanged',
)
const submitBlocked = computed(
  () => recipientSettingsLoading.value || (isEdit.value && !recipientSettingsReady.value),
)

const buildParentRecipients = () => buildParentRecipientsPayload({
  visibility: form.parent_visibility,
  classroomIds: form.parent_target_classroom_ids,
  studentIds: form.parent_target_student_ids,
  preservedItems: preservedParentItems.value,
})

// ── 表單驗證（單一來源：inline 規則與送出前守衛共用同一份訊息）──────────────
const fieldErrors = computed(() => ({
  title: form.title.trim() ? '' : '請輸入標題',
  content: form.content.trim() ? '' : '請輸入內容',
  target_employee_ids:
    form.restrict_recipients && form.target_employee_ids.length === 0
      ? '已選「指定員工」，請至少選擇一位員工'
      : '',
  parent_target_classroom_ids:
    form.parent_visibility === 'classroom' && form.parent_target_classroom_ids.length === 0
      ? '已選「指定班級」對家長公開，請至少勾選一個班級'
      : '',
  parent_target_student_ids:
    form.parent_visibility === 'custom'
    && form.parent_target_student_ids.length === 0
    && preservedParentItems.value.length === 0
      ? '已選「指定學生」對家長公開，請至少選擇一位學生'
      : '',
  // 後端同樣要求到期晚於發佈（_validate_schedule），先在前端攔下
  expires_at:
    form.publish_at && form.expires_at && form.expires_at <= form.publish_at
      ? '到期時間必須晚於發佈時間'
      : '',
}))

const fieldRule = (key: keyof typeof fieldErrors.value, trigger: 'blur' | 'change' = 'change'): FormItemRule => ({
  validator: (_rule: unknown, _value: unknown, cb: (error?: Error) => void) => {
    const message = fieldErrors.value[key]
    if (message) cb(new Error(message))
    else cb()
  },
  trigger,
})

const formRules: FormRules = {
  title: [required('標題'), fieldRule('title', 'blur')],
  content: [required('內容'), fieldRule('content', 'blur')],
  target_employee_ids: [fieldRule('target_employee_ids')],
  parent_target_classroom_ids: [fieldRule('parent_target_classroom_ids')],
  parent_target_student_ids: [fieldRule('parent_target_student_ids')],
  expires_at: [fieldRule('expires_at')],
}

const formRef = ref<FormInstance>()
const formDialogRef = ref<InstanceType<typeof FormDialog>>()

// 無法取得 el-form 實例時（尚未掛載）回 true，交給 handleSubmit 內的純邏輯守衛把關
const validateFormUi = async (): Promise<boolean> => {
  const f = formRef.value
  if (!f || typeof f.validate !== 'function') return true
  return f.validate().then((ok) => ok !== false, () => false)
}

// 預定發佈：發佈時間在未來 → 按鈕與成功訊息改說「排程」，避免以為按下就立刻出去
const isScheduledPublish = computed(() => {
  if (!form.publish_at) return false
  const t = new Date(form.publish_at)
  return !Number.isNaN(t.getTime()) && t > new Date()
})
const submitText = computed(() => {
  if (isEdit.value) return '更新公告'
  return isScheduledPublish.value ? '排程發佈' : '發佈公告'
})

const submitLoading = ref(false)

const handleSubmit = async () => {
  if (submitLoading.value || submitBlocked.value) return
  // 驗證與確認視窗期間也算送出中：連點／Enter 不會在 await 空檔重入而重複建立公告
  submitLoading.value = true
  const wasEdit = isEdit.value
  try {
    if (!(await validateFormUi())) {
      await nextTick()
      formDialogRef.value?.scrollToFirstError()
      return
    }
    const problem = Object.values(fieldErrors.value).find(Boolean)
    if (problem) {
      ElMessage.warning(problem)
      return
    }
    const pushConfirm = buildParentPushConfirm({
      isEdit: isEdit.value,
      visibility: form.parent_visibility,
      classroomIds: form.parent_target_classroom_ids,
      studentIds: form.parent_target_student_ids,
      initial: initialParentScope.value,
      publishAt: form.publish_at,
    })
    if (pushConfirm) {
      try {
        await ElMessageBox.confirm(pushConfirm.message, pushConfirm.title, {
          confirmButtonText: pushConfirm.confirmButtonText,
          cancelButtonText: '再檢查一下',
          type: 'warning',
        })
      } catch {
        return // 使用者取消
      }
    }
    const recipientIds = form.restrict_recipients ? form.target_employee_ids : []
    let announcementId = form.id
    if (isEdit.value) {
      await updateAnnouncement(form.id!, {
        title: form.title,
        content: form.content,
        priority: form.priority,
        category_id: form.category_id,
        is_pinned: form.is_pinned,
        target_employee_ids: recipientIds,
        publish_at: form.publish_at,
        expires_at: form.expires_at,
      })
    } else {
      const res = await createAnnouncement({
        title: form.title,
        content: form.content,
        priority: form.priority,
        category_id: form.category_id,
        is_pinned: form.is_pinned,
        target_employee_ids: recipientIds.length > 0 ? recipientIds : null,
        publish_at: form.publish_at,
        expires_at: form.expires_at,
      })
      const resData = res.data as { id?: number; announcement?: { id?: number } }
      announcementId = resData?.id ?? resData?.announcement?.id ?? null
      // 公告已建立：立刻把對話框轉成「編輯這則」，之後附件／家長端任一步失敗再按送出
      // 也只會更新同一則，不會再 create 出重複公告。
      if (announcementId) {
        form.id = announcementId
        isEdit.value = true
      }
    }
    // 本體已存檔：以目前內容重拍快照，之後只有再改動才算「未儲存」
    snapshotForm()

    // 本體之後的步驟（附件、家長端對象）逐項結算；任何一項失敗都不關對話框，
    // 公告已存在（已轉為編輯模式），使用者修正後再按「更新公告」即可。
    const incomplete: string[] = []
    if (announcementId) {
      const attachmentFailures = await syncAttachments(announcementId)
      if (attachmentFailures.length > 0) incomplete.push(`附件：${attachmentFailures.join('、')}`)

      // 家長端 scope 同步（plan A.5）：公告本體已存檔，附件失敗也照常同步
      const parentRecipients = buildParentRecipients()
      if (parentRecipients !== null) {
        try {
          await replaceAnnouncementParentRecipients(announcementId, parentRecipients)
          initialParentScope.value = {
            visibility: form.parent_visibility,
            classroomIds: [...form.parent_target_classroom_ids],
            studentIds: [...form.parent_target_student_ids],
          }
        } catch (e) {
          incomplete.push(`家長端對象：${apiError(e, '設定失敗')}`)
        }
      }
    }

    void fetchAnnouncements()
    if (incomplete.length > 0) {
      ElMessage.error(`公告已存檔，但有項目未完成（${incomplete.join('；')}）。請修正後再按「更新公告」重試`)
      return
    }
    ElMessage.success(wasEdit ? '公告已更新' : isScheduledPublish.value ? '公告已排程，到時間會自動發佈' : '公告已發佈')
    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(apiError(error, wasEdit ? '更新公告失敗' : '發佈公告失敗'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row: AnnouncementItem) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除公告「${row.title}」嗎？刪除後員工與家長端都看不到，且無法復原。`,
      '確認刪除',
      {
        confirmButtonText: '刪除公告',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await deleteAnnouncement(row.id)
    ElMessage.success('公告已刪除')
    void fetchAnnouncements()
  } catch (e) {
    if (e !== 'cancel' && (e as { message?: string })?.message !== 'cancel') {
      ElMessage.error(friendlyError('刪除公告失敗', e))
    }
  }
}

const togglePin = async (row: AnnouncementItem) => {
  try {
    await updateAnnouncement(row.id, { is_pinned: !row.is_pinned })
    ElMessage.success(row.is_pinned ? '已取消置頂' : '已置頂')
    void fetchAnnouncements()
  } catch (error) {
    ElMessage.error(friendlyError('更新置頂狀態失敗', error))
  }
}

const CONTENT_PREVIEW_LENGTH = 60
const contentPreview = (content: unknown) => {
  const text = typeof content === 'string' ? content : ''
  return text.length > CONTENT_PREVIEW_LENGTH ? `${text.slice(0, CONTENT_PREVIEW_LENGTH)}...` : text
}

// 手機卡片的 slot 參數是泛型 record，轉回公告列型別
const asAnnouncement = (item: Record<string, unknown>) => item as unknown as AnnouncementItem

// 手機卡片欄位（__ 前綴為 slot-only 欄）。內容在卡片改為全文（block），
// 表格版的 60 字截斷是為了塞進窄欄，卡片沒有這個限制
const announcementCardColumns = [
  { label: '狀態', prop: '__status' },
  { label: '優先級', prop: '__priority' },
  { label: '對象', prop: '__audience' },
  { label: '發佈者', prop: 'created_by_name' },
  { label: '建立時間', prop: '__created', formatter: (r: Record<string, unknown>) => formatDate(r.created_at as string) },
  { label: '已讀', prop: '__read' },
  { label: '內容', prop: 'content', block: true },
]

onMounted(() => {
  void fetchAnnouncements()
  fetchCategories()
  employeeStore.fetchEmployees()
  classroomStore.fetchClassrooms()
})
</script>

<template>
  <div class="announcement-view" :class="{ 'is-load-error': loadError }">
    <div v-if="embedded" class="announcement-embedded-actions">
      <AdminCreateButton @click="openAdd">新增公告</AdminCreateButton>
    </div>
    <PageHeader v-else title="公告管理">
      <template #actions>
        <AdminCreateButton @click="openAdd">新增公告</AdminCreateButton>
      </template>
    </PageHeader>

    <AdminListToolbar
      v-model:search="annSearch"
      search-placeholder="搜尋公告標題"
      :filters="annFilterGroups"
      :filter-values="annFilterValues"
      :total="annTotal"
      @update:filter-values="onAnnFilterChange"
    />

    <!-- 載入失敗：明說失敗並給重試，不顯示成「尚無公告」 -->
    <EmptyState
      v-if="loadError"
      variant="error"
      title="公告載入失敗"
      description="請重新載入；在載入成功前，請勿當作沒有公告。"
      data-test="announcement-load-error"
    >
      <template #action>
        <el-button type="primary" :loading="loading" @click="fetchAnnouncements()">重新載入</el-button>
      </template>
    </EmptyState>

    <template v-else>
      <el-table v-if="!isMobile" :data="announcements" v-loading="loading" stripe border style="width: 100%" max-height="600">
        <template #empty>
          <EmptyState
            variant="inline"
            :title="hasActiveFilter ? '找不到符合條件的公告' : '尚無公告'"
            :description="hasActiveFilter ? '試試調整搜尋文字或優先級篩選' : '按「新增公告」建立第一則公告'"
            data-test="announcement-empty"
          >
            <template v-if="hasActiveFilter" #action>
              <el-button @click="clearFilters">清除條件</el-button>
            </template>
          </EmptyState>
        </template>

        <el-table-column label="置頂" width="64" align="center">
          <template #default="{ row }">
            <el-button
              :type="row.is_pinned ? 'warning' : 'default'"
              size="small"
              circle
              :title="row.is_pinned ? '取消置頂' : '置頂'"
              :aria-label="`${row.is_pinned ? '取消置頂' : '置頂'}：${row.title}`"
              @click="togglePin(row)"
            >
              <el-icon><Top /></el-icon>
            </el-button>
          </template>
        </el-table-column>

        <el-table-column label="優先級" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="priorityMap[row.priority]?.type || 'info'" size="small">
              {{ priorityMap[row.priority]?.label || row.priority }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="分類" width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.category" class="category-option">
              <el-icon :size="14" :color="row.category.color || undefined">
                <component :is="previewIconFor(row.category.icon)" />
              </el-icon>
              {{ row.category.name }}
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="狀態" width="140" align="center">
          <template #default="{ row }">
            <AnnouncementStatusTag :status="row.status" :publish-at="row.publish_at" />
          </template>
        </el-table-column>

        <el-table-column label="標題" prop="title" min-width="200">
          <template #default="{ row }">
            <span class="title-cell">{{ row.title }}</span>
          </template>
        </el-table-column>

        <el-table-column label="內容預覽" min-width="200">
          <template #default="{ row }">
            <span class="content-preview">{{ contentPreview(row.content) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="發佈者" prop="created_by_name" width="100" />

        <el-table-column label="對象" width="130" align="center">
          <template #default="{ row }">
            <AnnouncementAudienceTags
              :employee-count="row.recipient_count"
              :has-parents="Boolean(row.parent_recipient_count)"
            />
          </template>
        </el-table-column>

        <el-table-column label="已讀情形" min-width="200">
          <template #default="{ row }">
            <AnnouncementReadCell
              v-bind="readCellProps(row)"
              @show="ensureReadersLoaded(row.id)"
              @retry="ensureReadersLoaded(row.id, true)"
            />
          </template>
        </el-table-column>

        <el-table-column label="建立時間" width="150">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" align="center" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" text type="primary" @click="openEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <AdminListCards
        v-else
        :items="(announcements as unknown as Record<string, unknown>[])"
        :columns="announcementCardColumns"
        row-key="id"
        :loading="loading"
      >
        <template #empty>
          <EmptyState
            variant="mobile"
            :title="hasActiveFilter ? '找不到符合條件的公告' : '尚無公告'"
            :description="hasActiveFilter ? '試試調整搜尋文字或優先級篩選' : '按右上角「新增公告」建立第一則公告'"
            data-test="announcement-empty"
          >
            <template v-if="hasActiveFilter" #action>
              <el-button @click="clearFilters">清除條件</el-button>
            </template>
          </EmptyState>
        </template>
        <template #title="{ item }">
          <el-icon v-if="item.is_pinned" class="card-pin-icon"><Top /></el-icon>{{ item.title }}
        </template>
        <template #cell-__status="{ item }">
          <AnnouncementStatusTag :status="asAnnouncement(item).status" :publish-at="asAnnouncement(item).publish_at" />
        </template>
        <template #cell-__priority="{ item }">
          <el-tag :type="priorityMap[item.priority as string]?.type || 'info'" size="small">
            {{ priorityMap[item.priority as string]?.label || item.priority }}
          </el-tag>
        </template>
        <template #cell-__audience="{ item }">
          <AnnouncementAudienceTags
            :employee-count="asAnnouncement(item).recipient_count"
            :has-parents="Boolean(asAnnouncement(item).parent_recipient_count)"
          />
        </template>
        <template #cell-__read="{ item }">
          <AnnouncementReadCell
            compact
            v-bind="readCellProps(asAnnouncement(item))"
            @show="ensureReadersLoaded(asAnnouncement(item).id)"
            @retry="ensureReadersLoaded(asAnnouncement(item).id, true)"
          />
        </template>
        <template #actions="{ item }">
          <!-- 手機觸控：用預設尺寸（32px 高），不用 small -->
          <el-button text :type="item.is_pinned ? 'warning' : 'primary'" @click="togglePin(asAnnouncement(item))">
            {{ item.is_pinned ? '取消置頂' : '置頂' }}
          </el-button>
          <el-button text type="primary" @click="openEdit(asAnnouncement(item))">編輯</el-button>
          <el-button text type="danger" @click="handleDelete(asAnnouncement(item))">刪除</el-button>
        </template>
      </AdminListCards>

      <el-pagination
        v-if="annTotal > annPageSize"
        class="announcement-pagination"
        background
        layout="total, prev, pager, next"
        :total="annTotal"
        :page-size="annPageSize"
        :current-page="annPage"
        @current-change="annSetPage"
      />
    </template>

    <!-- Add/Edit Dialog：依寫作順序分區——內容 → 分類與對象 → 發佈設定 -->
    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="isEdit ? '編輯公告' : '新增公告'"
      size="standardNarrow"
      :dirty="isFormDirty"
      :loading="submitLoading"
      :disabled="submitBlocked"
      :submit-text="submitText"
      :enter-submit="false"
      fullscreen-on-mobile
      required-legend="* 為必填"
      @submit="handleSubmit"
      @closed="invalidateRecipientHydration"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" @submit.prevent>
        <FormSection title="公告內容" :collapsible="false">
          <div class="form-grid">
            <el-form-item label="標題" prop="title" class="fg-12">
              <el-input v-model="form.title" placeholder="請輸入公告標題" maxlength="200" show-word-limit />
            </el-form-item>
            <el-form-item label="內容" prop="content" class="fg-12">
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="6"
                placeholder="請輸入公告內容"
              />
            </el-form-item>
            <el-form-item label="附件（選填）" class="fg-12">
              <div class="attachments-block">
                <div v-if="existingAttachments.length" class="existing-attachments">
                  <div v-for="att in existingAttachments" :key="att.id" class="att-row">
                    <img v-if="att.thumb_url" :src="att.thumb_url" class="att-thumb" alt="" />
                    <el-icon v-else><Document /></el-icon>
                    <span class="att-filename">{{ att.filename }}</span>
                    <el-button
                      link
                      type="danger"
                      size="small"
                      @click="markAttachmentForDelete(att.id)"
                    >移除</el-button>
                  </div>
                </div>
                <el-upload
                  :auto-upload="false"
                  :multiple="true"
                  :limit="attachmentSlotsLeft"
                  :disabled="attachmentSlotsLeft <= 0"
                  v-model:file-list="attachmentFileList"
                  :on-change="handleAttachmentChange"
                  :on-remove="handleAttachmentRemove"
                  :on-exceed="handleAttachmentExceed"
                  :before-upload="handleAttachmentBefore"
                  accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.pdf"
                >
                  <el-button :disabled="attachmentSlotsLeft <= 0">選擇檔案</el-button>
                  <template #tip>
                    <div class="field-hint">
                      圖片或 PDF，最多 {{ ATTACHMENT_MAX }} 個、單檔 {{ ATTACHMENT_MAX_MB }}MB；按下「{{ submitText }}」時才會上傳。
                    </div>
                  </template>
                </el-upload>
              </div>
            </el-form-item>
          </div>
        </FormSection>

        <FormSection title="分類與對象" :collapsible="false">
          <el-alert
            v-if="recipientSettingsFailed"
            type="error"
            :closable="false"
            show-icon
            class="section-alert"
            data-test="recipient-load-error"
            title="讀取既有的員工／家長對象設定失敗，目前無法儲存（避免以預設值覆寫原設定）。請關閉後重新開啟；仍失敗請重新整理頁面。"
          />
          <p v-else-if="recipientSettingsLoading" class="field-hint section-note">正在讀取既有的對象設定…</p>
          <div class="form-grid">
            <el-form-item label="分類" class="fg-6">
              <el-select
                v-model="form.category_id"
                placeholder="請選擇分類"
                clearable
                class="field-full"
              >
                <el-option
                  v-for="cat in categories"
                  :key="cat.id"
                  :label="cat.name"
                  :value="cat.id"
                >
                  <span class="category-option">
                    <el-icon :size="16" :color="cat.color || undefined">
                      <component :is="previewIconFor(cat.icon)" />
                    </el-icon>
                    {{ cat.name }}
                    <el-tag v-if="cat.is_default" size="small" type="success" effect="plain">預設</el-tag>
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="員工可見範圍" class="fg-6">
              <el-switch v-model="form.restrict_recipients" active-text="指定員工" inactive-text="全體員工" />
            </el-form-item>
            <el-form-item
              v-if="form.restrict_recipients"
              label="指定員工"
              prop="target_employee_ids"
              required
              class="fg-12"
            >
              <el-select
                v-model="form.target_employee_ids"
                multiple
                filterable
                placeholder="請選擇員工"
                class="field-full"
              >
                <el-option
                  v-for="emp in employeeOptions"
                  :key="emp.value"
                  :label="emp.label"
                  :value="emp.value"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="家長端" class="fg-12">
              <el-radio-group v-model="form.parent_visibility">
                <el-radio value="off">不對家長公開</el-radio>
                <!-- ANNOUNCEMENTS_SCHOOL_WRITE／ANNOUNCEMENTS_CLASS_WRITE（anncat01）：
                     與基礎 ANNOUNCEMENTS_WRITE 互不隱含的獨立範圍碼，缺碼即停用對應選項
                     （指定學生／既有進階設定不受影響，仍只需 ANNOUNCEMENTS_WRITE）。 -->
                <el-radio value="all" :disabled="!canScopeSchool">
                  全部家長
                  <span v-if="!canScopeSchool" class="text-muted">（需「校園發布」權限）</span>
                </el-radio>
                <el-radio value="classroom" :disabled="!canScopeClass">
                  指定班級
                  <span v-if="!canScopeClass" class="text-muted">（需「班級發布」權限）</span>
                </el-radio>
                <el-radio value="custom" data-test="parent-custom-radio">指定學生</el-radio>
                <el-radio v-if="form.parent_visibility === 'unchanged'" value="unchanged" disabled>
                  讀取失敗，將不變更
                </el-radio>
              </el-radio-group>
              <div v-if="form.parent_visibility !== 'off' && form.parent_visibility !== 'unchanged'" class="field-hint">
                對家長公開時，會以 LINE 通知家長；通知送出後無法收回。
              </div>
            </el-form-item>
            <el-form-item
              v-if="form.parent_visibility === 'classroom'"
              label="指定班級"
              prop="parent_target_classroom_ids"
              required
              class="fg-12"
            >
              <el-select
                v-model="form.parent_target_classroom_ids"
                multiple
                filterable
                placeholder="請選擇班級"
                class="field-full"
              >
                <el-option
                  v-for="opt in classroomOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="form.parent_visibility === 'custom'"
              label="指定學生"
              prop="parent_target_student_ids"
              required
              class="fg-12"
            >
              <el-select
                v-model="form.parent_target_student_ids"
                multiple
                filterable
                placeholder="請選擇學生（該生所有已綁定家長都會收到）"
                :loading="studentOptionsLoading"
                class="field-full"
                data-test="parent-student-select"
              >
                <el-option-group v-for="grp in studentOptionGroups" :key="grp.label" :label="grp.label">
                  <el-option v-for="opt in grp.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-option-group>
              </el-select>
              <div v-if="preservedParentItems.length" class="field-hint" data-test="preserved-scope-hint">
                另含 {{ preservedParentItems.length }} 筆進階對象設定（班級或監護人層級），儲存時會原樣保留。
              </div>
            </el-form-item>
          </div>
        </FormSection>

        <FormSection title="發佈設定" :collapsible="false">
          <div class="form-grid">
            <el-form-item label="優先級" class="fg-6">
              <el-select v-model="form.priority" class="field-full">
                <el-option
                  v-for="opt in priorityOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="置頂" class="fg-6">
              <el-switch v-model="form.is_pinned" active-text="置頂在列表最上方" />
            </el-form-item>
            <el-form-item label="發佈時間" class="fg-6">
              <el-date-picker
                v-model="form.publish_at"
                type="datetime"
                placeholder="留空＝立即發佈"
                value-format="YYYY-MM-DDTHH:mm:ss"
                class="field-full"
              />
              <div class="field-hint">設定未來時間＝排程發佈，到時才會顯示並通知。</div>
            </el-form-item>
            <el-form-item label="到期時間" prop="expires_at" class="fg-6">
              <el-date-picker
                v-model="form.expires_at"
                type="datetime"
                placeholder="留空＝永久"
                value-format="YYYY-MM-DDTHH:mm:ss"
                class="field-full"
              />
              <div class="field-hint">到期後不再顯示給員工與家長。</div>
            </el-form-item>
          </div>
        </FormSection>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.announcement-view {
  padding: 0;
}

.announcement-embedded-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-3);
}

/* 載入失敗時「共 0 筆」是假的，隱藏避免與錯誤態矛盾 */
.is-load-error :deep(.admin-list-toolbar__count) {
  visibility: hidden;
}

.announcement-pagination {
  margin-top: var(--space-4);
  justify-content: flex-end;
}

.row-actions {
  display: flex;
  justify-content: center;
  white-space: nowrap;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.title-cell {
  font-weight: 600;
}

.content-preview {
  color: var(--text-secondary);
}

.text-muted {
  color: var(--text-tertiary);
}

.category-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.field-full {
  width: 100%;
}

.field-hint {
  flex-basis: 100%;
  margin-top: 4px;
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--text-tertiary);
}

.section-alert {
  margin-bottom: var(--space-3);
}

.section-note {
  margin: 0 0 var(--space-3);
}

.attachments-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.existing-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.att-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.att-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
}

.att-filename {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 手機卡片標題的置頂圖示：與標題文字同列對齊 */
.card-pin-icon {
  color: var(--el-color-warning);
  margin-right: var(--space-1);
  vertical-align: -2px;
}
</style>
