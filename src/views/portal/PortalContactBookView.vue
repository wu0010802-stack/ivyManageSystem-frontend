<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { getMyStudents } from '@/api/portal'
import { usePortalFromHub } from '@/composables/usePortalFromHub'
import {
  applyTemplate,
  batchPublish,
  batchUpsert,
  copyFromYesterday,
  deletePhoto,
  getClassDay,
  publishEntry,
  updateEntry,
  uploadPhoto,
} from '@/api/contactBook'
import { useContactBookTemplates } from '@/composables/useContactBookTemplates'
import { todayISO } from '@/utils/format'
import { useRoute } from 'vue-router'
import { pickClassroomIdFromQuery, pickDateFromQuery } from '@/utils/portalQuery'
import { useErrorNotify } from '@/composables/useErrorNotify'
import ContactBookFilterBar from './components/contactBook/ContactBookFilterBar.vue'

const { notify } = useErrorNotify()
import ContactBookEntryCard from './components/contactBook/ContactBookEntryCard.vue'
import ContactBookEntryDrawer from './components/contactBook/ContactBookEntryDrawer.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const { fromHub, backToHub } = usePortalFromHub()

interface Photo { id: number; url?: string; [key: string]: unknown }
interface EntryRecord { id: number; published_at?: string | null; photos?: Photo[]; version?: number; [key: string]: unknown }
interface ClassroomEntry { classroom_id?: number; classroom_name?: string; [key: string]: unknown }
interface ItemEntry { student_id: number; student_name?: string; entry?: EntryRecord | null; [key: string]: unknown }
interface Completion { roster: number; draft: number; published: number; missing: number }

const MOOD_EMOJI = {
  happy: '😄',
  normal: '🙂',
  tired: '😴',
  sad: '😢',
  sick: '🤒',
}

const route = useRoute()
const classrooms = ref<ClassroomEntry[]>([])
const classroomLoading = ref(false)
const selectedClassroomId = ref<number | null>(null)
const route = useRoute()
// 搜尋面板點某天的聯絡簿會帶 ?log_date=；不讀的話日期永遠跳回今天
const selectedDate = ref(pickDateFromQuery(route.query, 'log_date', todayISO()))

// deep-link 預選：來自首頁班級卡（classroom_id）或搜尋面板聯絡簿結果（log_date）。
// 在 fetchClassrooms 設預設值「前」先吃 query，避免多班教師落到錯的班。
{
  const qClassroom = Number(route.query.classroom_id)
  if (Number.isFinite(qClassroom) && qClassroom > 0) selectedClassroomId.value = qClassroom
  if (typeof route.query.log_date === 'string' && route.query.log_date) {
    selectedDate.value = route.query.log_date
  }
}

const items = ref<ItemEntry[]>([]) // [{ student_id, student_name, entry }]
const completion = ref<Completion>({ roster: 0, draft: 0, published: 0, missing: 0 })
const listLoading = ref(false)

// Drawer state
const drawerVisible = ref(false)
const drawerStudent = ref<{ student_id: number; student_name?: string } | null>(null)
const drawerEntry = ref<EntryRecord | null>(null) // server entry or null
const drawerSaving = ref(false)
const drawerPublishing = ref(false)
const drawerPhotoUploading = ref(false)

const classroomOptions = computed(() =>
  classrooms.value.map((c) => ({ label: c.classroom_name ?? '', value: c.classroom_id ?? 0 })),
)

const completionPercent = computed(() => {
  const total = completion.value.roster || 0
  if (!total) return 0
  return Math.round((completion.value.published / total) * 100)
})

async function fetchClassrooms() {
  classroomLoading.value = true
  try {
    const res = await getMyStudents()
    classrooms.value = res.data?.classrooms || []
    if (classrooms.value.length > 0 && !selectedClassroomId.value) {
      // 首頁班級卡會帶 ?classroom_id=；多班老師不讀就會開到第一班（誤寫聯絡簿）
      selectedClassroomId.value = pickClassroomIdFromQuery(
        route.query,
        classrooms.value,
        classrooms.value[0].classroom_id ?? null,
      )
    }
  } catch (err) {
    notify(err, 'PortalContactBook:loadClassrooms', '載入班級失敗')
  } finally {
    classroomLoading.value = false
  }
}

// request-sequence guard：快速切班/切日時，較舊的慢回應不得覆寫最新列表
let classDayRequestSeq = 0

async function fetchClassDay() {
  if (!selectedClassroomId.value || !selectedDate.value) return
  const seq = ++classDayRequestSeq
  listLoading.value = true
  try {
    const res = await getClassDay({
      classroom_id: selectedClassroomId.value,
      log_date: selectedDate.value,
    })
    if (seq !== classDayRequestSeq) return
    items.value = res.data?.items || []
    completion.value = res.data?.completion || { roster: 0, draft: 0, published: 0, missing: 0 }
  } catch (err) {
    if (seq !== classDayRequestSeq) return
    notify(err, 'PortalContactBook:loadEntries', '載入聯絡簿失敗')
  } finally {
    if (seq === classDayRequestSeq) listLoading.value = false
  }
}

function openDrawer(item: ItemEntry) {
  drawerStudent.value = { student_id: item.student_id, student_name: item.student_name }
  drawerEntry.value = item.entry ? { ...item.entry } : null
  drawerVisible.value = true
}

function closeDrawer() {
  drawerVisible.value = false
  drawerStudent.value = null
  drawerEntry.value = null
}

// ── 統一 save / publish 失敗處理（含 409 衝突局部寫回） ────────────────
function handleSaveError(err: unknown) {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } } }
  if (e?.response?.status === 409) {
    const detail = e.response?.data?.detail
    const currentEntry = typeof detail === 'object' && detail ? (detail as Record<string, unknown>).current_entry as EntryRecord | null : null
    if (currentEntry) {
      // 局部寫回：用後端最新版本覆蓋本地，不再 fetchClassDay 整撈
      const idx = items.value.findIndex((i) => i.entry?.id === currentEntry.id)
      if (idx >= 0) items.value[idx].entry = currentEntry
      drawerEntry.value = currentEntry
      ElMessage.warning('資料已被他人更新，已載入最新版，請確認後重新儲存')
    } else {
      // fallback 整撈
      fetchClassDay()
      ElMessage.warning('版本衝突，已重新整理列表')
    }
  } else {
    notify(err, 'PortalContactBook:save', '操作失敗')
  }
}

async function handleSaveDraft(formPayload: Record<string, unknown>, version: unknown) {
  if (!drawerStudent.value) return
  drawerSaving.value = true
  try {
    if (drawerEntry.value?.id) {
      // 既有 entry：PUT + If-Match，樂觀更新本地
      const res = await updateEntry(drawerEntry.value.id, formPayload, version as number | null | undefined)
      const updated = res.data as EntryRecord
      const idx = items.value.findIndex((i) => i.entry?.id === updated.id)
      if (idx >= 0) items.value[idx].entry = updated
      drawerEntry.value = updated
      ElMessage.success('已儲存')
    } else {
      // 新建：POST /batch（1 筆）；需整撈取得完整 entry（含 version / id）
      const res = await batchUpsert({
        classroom_id: selectedClassroomId.value,
        log_date: selectedDate.value,
        items: [{ student_id: drawerStudent.value.student_id, ...formPayload }],
      })
      const entryIds = (res.data as Record<string, unknown>)?.entry_ids as unknown[] | undefined
      const entryId = entryIds?.[0]
      if (!entryId) {
        ElMessage.warning('儲存成功但無法取得 ID，請刷新後再上傳照片')
      } else {
        await fetchClassDay()
        const student = drawerStudent.value
        const created = items.value.find((it) => it.student_id === student.student_id)
        drawerEntry.value = created?.entry ? { ...created.entry } : null
      }
      ElMessage.success('草稿已建立')
    }
  } catch (err) {
    handleSaveError(err)
  } finally {
    drawerSaving.value = false
  }
}

async function handlePublish(formPayload: Record<string, unknown>, version: unknown) {
  if (!drawerEntry.value?.id) {
    ElMessage.warning('請先儲存草稿')
    return
  }
  const wasPublished = !!drawerEntry.value.published_at
  const confirmText = wasPublished
    ? '確定再次發布？將再次推播 LINE 與通知家長。'
    : '確定發布？發布後家長 App 與 LINE 將立即收到通知。'
  try {
    await ElMessageBox.confirm(confirmText, wasPublished ? '再次發布' : '發布給家長', {
      type: 'warning',
      confirmButtonText: '發布',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  drawerPublishing.value = true
  try {
    // 先 update 欄位（若有變），樂觀更新本地
    const updateRes = await updateEntry(drawerEntry.value.id, formPayload, version as number | null | undefined)
    const afterUpdate = updateRes.data as EntryRecord
    const uidx = items.value.findIndex((i) => i.entry?.id === afterUpdate.id)
    if (uidx >= 0) items.value[uidx].entry = afterUpdate
    drawerEntry.value = afterUpdate

    // 再 publish
    const pubRes = await publishEntry(drawerEntry.value.id)
    const published = pubRes.data as EntryRecord
    const pidx = items.value.findIndex((i) => i.entry?.id === published.id)
    if (pidx >= 0) items.value[pidx].entry = published
    drawerEntry.value = published
    ElMessage.success(wasPublished ? '已再次發布' : '已發布')
  } catch (err) {
    handleSaveError(err)
  } finally {
    drawerPublishing.value = false
  }
}

async function handlePhotoUpload(opts: { file: File }) {
  if (!drawerEntry.value?.id) {
    ElMessage.warning('請先儲存草稿後再上傳照片')
    return
  }
  drawerPhotoUploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', opts.file)
    const res = await uploadPhoto(drawerEntry.value.id, fd)
    const newPhoto = res.data as Photo
    // 樂觀更新：append photo
    const entry = drawerEntry.value
    entry.photos = [...(entry.photos || []), newPhoto]
    const idx = items.value.findIndex((i) => i.entry?.id === entry.id)
    if (idx >= 0 && items.value[idx].entry) {
      items.value[idx].entry!.photos = [...(items.value[idx].entry!.photos || []), newPhoto]
    }
    ElMessage.success('照片已上傳')
  } catch (err) {
    notify(err, 'PortalContactBook:uploadPhoto', '照片上傳失敗')
  } finally {
    drawerPhotoUploading.value = false
  }
}

async function handleDeletePhoto(att: Photo) {
  if (!drawerEntry.value?.id) return
  try {
    await ElMessageBox.confirm('確定刪除此照片？', '刪除照片', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deletePhoto(drawerEntry.value.id, att.id)
    // 樂觀更新：filter 掉 photo
    const entry = drawerEntry.value
    entry.photos = (entry.photos || []).filter((p) => p.id !== att.id)
    const idx = items.value.findIndex((i) => i.entry?.id === entry.id)
    if (idx >= 0 && items.value[idx].entry?.photos) {
      items.value[idx].entry!.photos = items.value[idx].entry!.photos!.filter((p) => p.id !== att.id)
    }
    ElMessage.success('已刪除')
  } catch (err) {
    notify(err, 'PortalContactBook:delete', '刪除失敗')
  }
}

// ── 範本與批次操作 ────────────────────────────────────────────────
const tpls = useContactBookTemplates()
const showTemplateDialog = ref(false)
const selectedTemplateId = ref<number | string | null>(null)
const showOnlyUnpublished = ref(false)
const batchBusy = ref(false)

const visibleItems = computed(() => {
  if (!showOnlyUnpublished.value) return items.value
  return items.value.filter((it) => !it.entry || !it.entry.published_at)
})

async function handleCopyYesterday() {
  if (!selectedClassroomId.value) return
  try {
    await ElMessageBox.confirm(
      '把昨日該班所有聯絡簿欄位複製為今日草稿？已存在當日 entry 的學生會被略過。',
      '複製昨日',
      { confirmButtonText: '複製', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  batchBusy.value = true
  try {
    const res = await copyFromYesterday({
      classroom_id: selectedClassroomId.value,
      target_date: selectedDate.value,
    })
    ElMessage.success(`已建立 ${res.data.created} 筆草稿`)
    await fetchClassDay()
  } catch (err) {
    notify(err, 'PortalContactBook:copy', '複製失敗')
  } finally {
    batchBusy.value = false
  }
}

// 建立範本：個人範本只需 PORTFOLIO_WRITE，本來就該由老師自己在教師端建立。
// 先前 create / update / archive / promote 四支 API 都包好了卻 runtime 零 caller，
// 空狀態還寫著「可先到管理介面建立」——而全 repo 根本沒有那個管理介面。
async function handleSaveAsTemplate(fields: Record<string, unknown>) {
  let name = ''
  try {
    const res = await ElMessageBox.prompt('範本名稱', '存為範本', {
      confirmButtonText: '建立',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v && v.trim() ? true : '請輸入名稱'),
    })
    name = (res as { value: string }).value.trim()
  } catch {
    return // 使用者取消
  }
  try {
    await tpls.create({ name, scope: 'personal', fields })
    ElMessage.success('已建立個人範本')
    await tpls.load()
  } catch (err) {
    notify(err, 'PortalContactBook:createTemplate', '建立範本失敗')
  }
}

async function handleArchiveTemplate(id: number) {
  try {
    await ElMessageBox.confirm('封存後將不再出現在套用清單，確定嗎？', '封存範本', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await tpls.archive(id)
    ElMessage.success('已封存')
    if (selectedTemplateId.value === id) selectedTemplateId.value = null
    await tpls.load()
  } catch (err) {
    notify(err, 'PortalContactBook:archiveTemplate', '封存失敗')
  }
}

async function openTemplateDialog() {
  showTemplateDialog.value = true
  if (!tpls.loaded.value) {
    try {
      await tpls.load()
    } catch (e) {
      ElMessage.error('讀取範本失敗')
    }
  }
}

async function handleApplyTemplateToClass() {
  if (!selectedTemplateId.value) {
    ElMessage.warning('請選擇範本')
    return
  }
  // 找出當日所有未發布的 entry id
  const draftEntryIds = items.value
    .filter((it) => it.entry && !it.entry.published_at)
    .map((it) => it.entry!.id)
  if (!draftEntryIds.length) {
    ElMessage.warning('無可套用的草稿（請先建立草稿或複製昨日）')
    return
  }
  batchBusy.value = true
  try {
    const res = await applyTemplate({
      template_id: selectedTemplateId.value,
      entry_ids: draftEntryIds,
      only_fill_blank: true,
    })
    const results = (res.data as Record<string, unknown>).results as { changed_fields?: unknown[] }[]
    const totalChanged = results.reduce(
      (acc: number, r) => acc + (r.changed_fields?.length || 0),
      0,
    )
    ElMessage.success(`已套用範本，共改動 ${totalChanged} 個欄位`)
    showTemplateDialog.value = false
    selectedTemplateId.value = null
    await fetchClassDay()
  } catch (err) {
    notify(err, 'PortalContactBook:applyTemplate', '套用失敗')
  } finally {
    batchBusy.value = false
  }
}

async function handleBatchPublish() {
  const draftEntryIds = items.value
    .filter((it) => it.entry && !it.entry.published_at)
    .map((it) => it.entry!.id)
  if (!draftEntryIds.length) {
    ElMessage.warning('沒有可發布的草稿')
    return
  }
  try {
    await ElMessageBox.confirm(
      `確定批次發布 ${draftEntryIds.length} 筆草稿？將推播 LINE 與通知家長。`,
      '批次發布',
      { type: 'warning', confirmButtonText: '發布', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  batchBusy.value = true
  try {
    const res = await batchPublish({ entry_ids: draftEntryIds })
    ElMessage.success(`已發布 ${res.data.success_count} / ${draftEntryIds.length}`)
    await fetchClassDay()
  } catch (err) {
    notify(err, 'PortalContactBook:batchPublish', '批次發布失敗')
  } finally {
    batchBusy.value = false
  }
}

onMounted(fetchClassrooms)
watch([selectedClassroomId, selectedDate], () => {
  // 切換班級或日期時關閉抽屜，避免顯示 stale 的別班學生資料
  if (drawerVisible.value) closeDrawer()
  fetchClassDay()
})
</script>

<template>
  <div class="contact-book-page">
    <div v-if="fromHub" class="from-hub-bar">
      <el-button type="primary" link @click="backToHub">
        ← 返回今日工作台
      </el-button>
    </div>
    <div class="page-header">
      <h2>每日聯絡簿</h2>
    </div>

    <ContactBookFilterBar
      v-model:classroom-id="(selectedClassroomId as number | undefined)"
      v-model:log-date="selectedDate"
      v-model:show-only-unpublished="showOnlyUnpublished"
      :classroom-options="classroomOptions"
      :loading="listLoading"
      :batch-busy="batchBusy"
      @refresh="fetchClassDay"
      @open-copy="handleCopyYesterday"
      @open-template="openTemplateDialog"
      @open-batch="handleBatchPublish"
    />

    <el-card v-if="completion.roster > 0" class="completion-card" shadow="never">
      <div class="completion-row">
        <div class="completion-stats">
          <span class="stat">
            全班 <strong>{{ completion.roster }}</strong> 人
          </span>
          <el-tag type="info">未填 {{ completion.missing }}</el-tag>
          <el-tag type="warning">草稿 {{ completion.draft }}</el-tag>
          <el-tag type="success">已發布 {{ completion.published }}</el-tag>
        </div>
        <el-progress
          :percentage="completionPercent"
          :status="completionPercent === 100 ? 'success' : ''"
          style="flex: 1; max-width: 360px"
        />
      </div>
    </el-card>

    <el-empty
      v-if="!listLoading && visibleItems.length === 0"
      :description="showOnlyUnpublished ? '無未發布草稿' : '此日期此班級無學生資料'"
    />

    <div v-else class="card-grid" v-loading="listLoading">
      <ContactBookEntryCard
        v-for="it in visibleItems"
        :key="it.student_id"
        :item="it"
        :mood-emoji="MOOD_EMOJI"
        @click="(it) => openDrawer(it as ItemEntry)"
      />
    </div>

    <!-- Drawer：單筆編輯 -->
    <ContactBookEntryDrawer
      v-model="drawerVisible"
      :entry="drawerEntry ?? undefined"
      :student-name="drawerStudent?.student_name || ''"
      :saving="drawerSaving"
      :publishing="drawerPublishing"
      :photo-uploading="drawerPhotoUploading"
      @save-draft="handleSaveDraft"
      @save-as-template="handleSaveAsTemplate"
      @publish="handlePublish"
      @upload-photo="handlePhotoUpload"
      @delete-photo="handleDeletePhoto"
      @close="closeDrawer"
    />

    <!-- 範本選擇對話框 -->
    <el-dialog v-model="showTemplateDialog" title="套用範本到全班草稿" width="480px">
      <div v-if="tpls.loading.value" class="empty">讀取中…</div>
      <EmptyState
        v-else-if="!tpls.templates.value.length"
        variant="default"
        title="尚無範本"
        description="開啟任一位學生的聯絡簿，填好內容後按「存為範本」即可建立個人範本。"
      />
      <el-radio-group v-else v-model="(selectedTemplateId as string | number | boolean | undefined)" class="tpl-list">
        <el-radio
          v-for="t in tpls.templates.value"
          :key="(t.id as PropertyKey)"
          :value="(t.id as string | number | boolean | undefined)"
          class="tpl-row"
        >
          <strong>{{ t.name }}</strong>
          <el-tag v-if="t.scope === 'shared'" size="small" type="success">共用</el-tag>
          <el-tag v-else size="small">個人</el-tag>
          <el-button
            v-if="t.scope !== 'shared'"
            link
            type="danger"
            size="small"
            class="tpl-archive"
            @click.stop.prevent="handleArchiveTemplate(t.id as number)"
          >
            封存
          </el-button>
        </el-radio>
      </el-radio-group>
      <p class="hint">套用規則：只填入空欄位，已填值不會被覆蓋。</p>
      <template #footer>
        <el-button @click="showTemplateDialog = false">取消</el-button>
        <el-button type="primary" :loading="batchBusy" @click="handleApplyTemplateToClass">
          套用
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.contact-book-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.from-hub-bar {
  margin: 0 0 12px;
  padding: 4px 0;
}

.tpl-list { display: flex; flex-direction: column; gap: var(--space-2); }
.tpl-row { display: flex; gap: var(--space-2); align-items: center; }
.hint { font-size: var(--text-xs); color: var(--pt-text-muted); margin-top: var(--space-2); }
.empty { color: var(--pt-text-muted); padding: var(--space-3); text-align: center; }

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text-primary);
}

.completion-card {
  border: 1px solid var(--border-color-light);
}

.completion-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.completion-stats {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  color: var(--text-secondary);
}

.completion-stats .stat strong {
  color: var(--text-primary);
  font-size: var(--text-lg);
  margin: 0 4px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
}

</style>
