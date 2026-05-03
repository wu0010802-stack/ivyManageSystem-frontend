<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Camera, Delete, Edit, Refresh } from '@element-plus/icons-vue'

import { getMyStudents } from '@/api/portal'
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
import { apiError } from '@/utils/error'

const MOOD_OPTIONS = [
  { value: 'happy', label: '😄 開心' },
  { value: 'normal', label: '🙂 普通' },
  { value: 'tired', label: '😴 疲倦' },
  { value: 'sad', label: '😢 難過' },
  { value: 'sick', label: '🤒 不適' },
]
const MOOD_EMOJI = MOOD_OPTIONS.reduce((acc, o) => {
  acc[o.value] = o.label.split(' ')[0]
  return acc
}, {})

const MEAL_OPTIONS = [
  { value: 0, label: '未進食' },
  { value: 1, label: '少' },
  { value: 2, label: '適中' },
  { value: 3, label: '多' },
]

const BOWEL_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'soft', label: '稀軟' },
  { value: 'hard', label: '硬' },
  { value: 'none', label: '未排便' },
]

// 完整 8 欄欄位範本（避免送出 undefined 把資料清掉）
const EMPTY_FIELDS = () => ({
  mood: null,
  meal_lunch: null,
  meal_snack: null,
  nap_minutes: null,
  bowel: null,
  temperature_c: null,
  teacher_note: '',
  learning_highlight: '',
})

const classrooms = ref([])
const classroomLoading = ref(false)
const selectedClassroomId = ref(null)
const selectedDate = ref(todayISO())

const items = ref([]) // [{ student_id, student_name, entry }]
const completion = ref({ roster: 0, draft: 0, published: 0, missing: 0 })
const listLoading = ref(false)

// Drawer state
const drawerVisible = ref(false)
const drawerStudent = ref(null) // { student_id, student_name }
const drawerEntry = ref(null) // server entry or null
const drawerForm = ref(EMPTY_FIELDS())
const drawerSaving = ref(false)
const drawerPublishing = ref(false)
const drawerPhotoUploading = ref(false)

const classroomOptions = computed(() =>
  classrooms.value.map((c) => ({ label: c.classroom_name, value: c.classroom_id })),
)

const completionPercent = computed(() => {
  const total = completion.value.roster || 0
  if (!total) return 0
  return Math.round((completion.value.published / total) * 100)
})

function statusOf(entry) {
  if (!entry) return { label: '未填', type: 'info' }
  if (entry.published_at) return { label: '已發布', type: 'success' }
  return { label: '草稿', type: 'warning' }
}

async function fetchClassrooms() {
  classroomLoading.value = true
  try {
    const res = await getMyStudents()
    classrooms.value = res.data?.classrooms || []
    if (classrooms.value.length > 0 && !selectedClassroomId.value) {
      selectedClassroomId.value = classrooms.value[0].classroom_id
    }
  } catch (err) {
    ElMessage.error(apiError(err, '載入班級失敗'))
  } finally {
    classroomLoading.value = false
  }
}

async function fetchClassDay() {
  if (!selectedClassroomId.value || !selectedDate.value) return
  listLoading.value = true
  try {
    const res = await getClassDay({
      classroom_id: selectedClassroomId.value,
      log_date: selectedDate.value,
    })
    items.value = res.data?.items || []
    completion.value = res.data?.completion || { roster: 0, draft: 0, published: 0, missing: 0 }
  } catch (err) {
    ElMessage.error(apiError(err, '載入聯絡簿失敗'))
  } finally {
    listLoading.value = false
  }
}

function openDrawer(item) {
  drawerStudent.value = { student_id: item.student_id, student_name: item.student_name }
  drawerEntry.value = item.entry ? { ...item.entry } : null
  if (item.entry) {
    drawerForm.value = {
      mood: item.entry.mood ?? null,
      meal_lunch: item.entry.meal_lunch ?? null,
      meal_snack: item.entry.meal_snack ?? null,
      nap_minutes: item.entry.nap_minutes ?? null,
      bowel: item.entry.bowel ?? null,
      temperature_c: item.entry.temperature_c ?? null,
      teacher_note: item.entry.teacher_note ?? '',
      learning_highlight: item.entry.learning_highlight ?? '',
    }
  } else {
    drawerForm.value = EMPTY_FIELDS()
  }
  drawerVisible.value = true
}

function closeDrawer() {
  drawerVisible.value = false
  drawerStudent.value = null
  drawerEntry.value = null
  drawerForm.value = EMPTY_FIELDS()
}

function buildPayload() {
  // 完整 8 欄；空字串轉 null 避免後端視為有值
  const f = drawerForm.value
  const norm = (v) => (v === '' || v === undefined ? null : v)
  return {
    mood: norm(f.mood),
    meal_lunch: norm(f.meal_lunch),
    meal_snack: norm(f.meal_snack),
    nap_minutes: norm(f.nap_minutes),
    bowel: norm(f.bowel),
    temperature_c: norm(f.temperature_c),
    teacher_note: norm(f.teacher_note),
    learning_highlight: norm(f.learning_highlight),
  }
}

async function saveDraft() {
  if (!drawerStudent.value) return
  drawerSaving.value = true
  try {
    const payload = buildPayload()
    if (drawerEntry.value?.id) {
      // 既有 entry：PUT + If-Match
      const res = await updateEntry(drawerEntry.value.id, payload, drawerEntry.value.version)
      drawerEntry.value = res.data
      ElMessage.success('已儲存')
    } else {
      // 新建：POST /batch（1 筆）
      const res = await batchUpsert({
        classroom_id: selectedClassroomId.value,
        log_date: selectedDate.value,
        items: [{ student_id: drawerStudent.value.student_id, ...payload }],
      })
      const entryId = res.data?.entry_ids?.[0]
      if (!entryId) {
        ElMessage.warning('儲存成功但無法取得 ID，請刷新後再上傳照片')
      } else {
        // 重新撈整份列表，並把這個 student 的 entry 寫回 drawerEntry（含 version）
        await fetchClassDay()
        const updated = items.value.find((it) => it.student_id === drawerStudent.value.student_id)
        drawerEntry.value = updated?.entry ? { ...updated.entry } : null
      }
      ElMessage.success('草稿已建立')
      return
    }
    // 既有 entry：PUT 路徑刷新列表（取得最新 status / completion）
    await fetchClassDay()
  } catch (err) {
    if (err?.response?.status === 409) {
      ElMessage.error('此聯絡簿已被他人更新，請關閉後重新打開')
      await fetchClassDay()
    } else {
      ElMessage.error(apiError(err, '儲存失敗'))
    }
  } finally {
    drawerSaving.value = false
  }
}

async function doPublish() {
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
    const res = await publishEntry(drawerEntry.value.id)
    drawerEntry.value = res.data
    ElMessage.success(wasPublished ? '已再次發布' : '已發布')
    await fetchClassDay()
  } catch (err) {
    ElMessage.error(apiError(err, '發布失敗'))
  } finally {
    drawerPublishing.value = false
  }
}

async function handlePhotoUpload(opts) {
  if (!drawerEntry.value?.id) {
    ElMessage.warning('請先儲存草稿後再上傳照片')
    return
  }
  drawerPhotoUploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', opts.file)
    const res = await uploadPhoto(drawerEntry.value.id, fd)
    drawerEntry.value.photos = [...(drawerEntry.value.photos || []), res.data]
    ElMessage.success('照片已上傳')
  } catch (err) {
    ElMessage.error(apiError(err, '照片上傳失敗'))
  } finally {
    drawerPhotoUploading.value = false
  }
}

async function removePhoto(att) {
  if (!drawerEntry.value?.id) return
  try {
    await ElMessageBox.confirm('確定刪除此照片？', '刪除照片', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deletePhoto(drawerEntry.value.id, att.id)
    drawerEntry.value.photos = (drawerEntry.value.photos || []).filter((p) => p.id !== att.id)
    ElMessage.success('已刪除')
  } catch (err) {
    ElMessage.error(apiError(err, '刪除失敗'))
  }
}

// ── 範本與批次操作 ────────────────────────────────────────────────
const tpls = useContactBookTemplates()
const showTemplateDialog = ref(false)
const selectedTemplateId = ref(null)
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
    ElMessage.error(apiError(err, '複製失敗'))
  } finally {
    batchBusy.value = false
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
    .map((it) => it.entry.id)
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
    const totalChanged = res.data.results.reduce(
      (acc, r) => acc + (r.changed_fields?.length || 0),
      0,
    )
    ElMessage.success(`已套用範本，共改動 ${totalChanged} 個欄位`)
    showTemplateDialog.value = false
    selectedTemplateId.value = null
    await fetchClassDay()
  } catch (err) {
    ElMessage.error(apiError(err, '套用失敗'))
  } finally {
    batchBusy.value = false
  }
}

async function handleBatchPublish() {
  const draftEntryIds = items.value
    .filter((it) => it.entry && !it.entry.published_at)
    .map((it) => it.entry.id)
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
    ElMessage.error(apiError(err, '批次發布失敗'))
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
    <div class="page-header">
      <h2>每日聯絡簿</h2>
      <div class="header-actions">
        <el-select
          v-model="selectedClassroomId"
          placeholder="選擇班級"
          :loading="classroomLoading"
          style="width: 180px"
        >
          <el-option
            v-for="o in classroomOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
        <el-date-picker
          v-model="selectedDate"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 160px"
        />
        <el-button :icon="Refresh" :loading="listLoading" @click="fetchClassDay">重新整理</el-button>
      </div>
    </div>

    <div class="batch-bar pt-card" v-if="selectedClassroomId">
      <el-button :loading="batchBusy" @click="handleCopyYesterday">複製昨日</el-button>
      <el-button :loading="batchBusy" @click="openTemplateDialog">套用範本到全班</el-button>
      <el-button :loading="batchBusy" type="success" @click="handleBatchPublish">
        批次發布草稿
      </el-button>
      <el-divider direction="vertical" />
      <el-checkbox v-model="showOnlyUnpublished">只看未發布</el-checkbox>
    </div>

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
      <el-card
        v-for="it in visibleItems"
        :key="it.student_id"
        class="student-card"
        shadow="hover"
        @click="openDrawer(it)"
      >
        <div class="card-top">
          <div class="card-name">{{ it.student_name }}</div>
          <el-tag :type="statusOf(it.entry).type" size="small">
            {{ statusOf(it.entry).label }}
          </el-tag>
        </div>
        <div class="card-body">
          <div class="card-mood">
            <span v-if="it.entry?.mood" class="mood-emoji">{{ MOOD_EMOJI[it.entry.mood] || '🙂' }}</span>
            <span v-else class="mood-empty">—</span>
          </div>
          <div class="card-meta">
            <div v-if="it.entry?.teacher_note" class="card-note">{{ it.entry.teacher_note }}</div>
            <div v-else class="card-note muted">尚未填寫</div>
            <div v-if="it.entry?.photos?.length" class="card-photos">
              <el-icon><Camera /></el-icon>
              <span>{{ it.entry.photos.length }} 張</span>
            </div>
          </div>
        </div>
        <div class="card-action">
          <el-button :icon="Edit" size="small" type="primary" plain>
            編輯
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- Drawer：單筆編輯 -->
    <el-drawer
      v-model="drawerVisible"
      :title="drawerStudent?.student_name ? `${drawerStudent.student_name} 的聯絡簿` : '聯絡簿'"
      direction="rtl"
      size="520px"
      :close-on-click-modal="!drawerSaving && !drawerPublishing"
      @close="closeDrawer"
    >
      <el-form v-if="drawerStudent" label-position="top" class="drawer-form">
        <el-alert
          v-if="drawerEntry?.published_at"
          type="success"
          :closable="false"
          show-icon
        >
          <template #title>
            此聯絡簿已於 {{ drawerEntry.published_at?.replace('T', ' ').slice(0, 16) }} 發布；修改後請點「再次發布」才會通知家長。
          </template>
        </el-alert>

        <el-form-item label="心情">
          <el-select v-model="drawerForm.mood" placeholder="選擇心情" clearable style="width: 220px">
            <el-option v-for="o in MOOD_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <div class="form-row">
          <el-form-item label="午餐">
            <el-select v-model="drawerForm.meal_lunch" placeholder="選擇" clearable>
              <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="點心">
            <el-select v-model="drawerForm.meal_snack" placeholder="選擇" clearable>
              <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="午睡（分鐘）">
            <el-input-number v-model="drawerForm.nap_minutes" :min="0" :max="600" :step="15" />
          </el-form-item>
          <el-form-item label="體溫（°C）">
            <el-input-number
              v-model="drawerForm.temperature_c"
              :min="30"
              :max="45"
              :step="0.1"
              :precision="1"
            />
          </el-form-item>
        </div>

        <el-form-item label="排便">
          <el-select v-model="drawerForm.bowel" placeholder="選擇排便狀況" clearable style="width: 220px">
            <el-option v-for="o in BOWEL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="今日學習亮點">
          <el-input
            v-model="drawerForm.learning_highlight"
            type="textarea"
            :rows="2"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="老師留言">
          <el-input
            v-model="drawerForm.teacher_note"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="照片">
          <div v-if="!drawerEntry?.id" class="hint muted">儲存草稿後即可上傳照片</div>
          <div v-else class="photo-block">
            <div v-if="drawerEntry.photos?.length" class="photo-list">
              <div v-for="p in drawerEntry.photos" :key="p.id" class="photo-item">
                <el-image
                  :src="p.thumb_url || p.display_url"
                  :preview-src-list="[p.display_url]"
                  preview-teleported
                  fit="cover"
                  hide-on-click-modal
                />
                <el-button
                  :icon="Delete"
                  size="small"
                  type="danger"
                  text
                  @click="removePhoto(p)"
                >
                  刪除
                </el-button>
              </div>
            </div>
            <el-upload
              :auto-upload="true"
              :show-file-list="false"
              :http-request="handlePhotoUpload"
              accept=".jpg,.jpeg,.png,.heic,.heif"
            >
              <el-button :icon="Camera" :loading="drawerPhotoUploading">
                上傳照片
              </el-button>
              <template #tip>
                <div class="upload-tip muted">支援 JPG / PNG / HEIC，一次一張</div>
              </template>
            </el-upload>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="closeDrawer">關閉</el-button>
          <el-button
            type="primary"
            :loading="drawerSaving"
            :disabled="drawerPublishing"
            @click="saveDraft"
          >
            儲存草稿
          </el-button>
          <el-button
            type="success"
            :icon="Bell"
            :loading="drawerPublishing"
            :disabled="!drawerEntry?.id || drawerSaving"
            @click="doPublish"
          >
            {{ drawerEntry?.published_at ? '再次發布' : '發布給家長' }}
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 範本選擇對話框 -->
    <el-dialog v-model="showTemplateDialog" title="套用範本到全班草稿" width="480px">
      <div v-if="tpls.loading.value" class="empty">讀取中…</div>
      <div v-else-if="!tpls.templates.value.length" class="empty">
        尚無範本。可先到管理介面建立個人或園所共用範本。
      </div>
      <el-radio-group v-else v-model="selectedTemplateId" class="tpl-list">
        <el-radio
          v-for="t in tpls.templates.value"
          :key="t.id"
          :value="t.id"
          class="tpl-row"
        >
          <strong>{{ t.name }}</strong>
          <el-tag v-if="t.scope === 'shared'" size="small" type="success">共用</el-tag>
          <el-tag v-else size="small">個人</el-tag>
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

.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
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

.header-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
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

.student-card {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.student-card:hover {
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.card-name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 56px;
}

.card-mood {
  font-size: 32px;
  line-height: 1;
}

.mood-empty {
  font-size: 24px;
  color: var(--text-tertiary);
}

.card-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.card-note {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-photos {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.card-action {
  margin-top: var(--space-2);
  display: flex;
  justify-content: flex-end;
}

.muted {
  color: var(--text-tertiary);
}

/* Drawer */
.drawer-form {
  padding: 0 var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.photo-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.photo-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}

.photo-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.photo-item :deep(.el-image) {
  width: 100%;
  height: 100px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.upload-tip {
  font-size: var(--text-xs);
  margin-top: 4px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.hint {
  font-size: var(--text-sm);
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
