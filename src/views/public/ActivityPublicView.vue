<template>
  <div class="public-activity">
    <!-- Header -->
    <div class="pub-header">
      <span class="pub-title">課後才藝報名</span>
      <el-tag
        :type="registrationOpen ? 'success' : 'info'"
        effect="dark"
        size="small"
      >
        {{ registrationOpen ? '報名開放中' : '報名未開放' }}
      </el-tag>
    </div>

    <!-- 報名時間資訊 -->
    <div v-if="timeInfo.open_at || timeInfo.close_at" class="pub-card time-card">
      <el-icon><Calendar /></el-icon>
      <span class="time-label">報名期間</span>
      <span class="time-value">
        {{ formatDate(timeInfo.open_at) }} ～ {{ formatDate(timeInfo.close_at) }}
      </span>
    </div>

    <!-- Tab 切換 -->
    <div class="pub-tabs">
      <button
        class="pub-tab"
        :class="{ active: activeTab === 'register', disabled: !registrationOpen }"
        :disabled="!registrationOpen"
        @click="activeTab = 'register'"
      >
        我要報名
      </button>
      <button
        class="pub-tab"
        :class="{ active: activeTab === 'query' }"
        @click="activeTab = 'query'"
      >
        查詢／修改
      </button>
    </div>

    <!-- ===== 我要報名 Tab ===== -->
    <div v-if="activeTab === 'register'">
      <!-- 報名成功畫面 -->
      <div v-if="submitResult" class="pub-card success-card">
        <el-icon class="success-icon"><CircleCheck /></el-icon>
        <h2>報名完成！</h2>
        <p class="success-msg">{{ submitResult.message }}</p>
        <div v-if="submitResult.waitlist_courses?.length" class="waitlist-note">
          <el-icon><WarningFilled /></el-icon>
          以下課程名額已滿，已列入候補：
          <strong>{{ submitResult.waitlist_courses.join('、') }}</strong>
        </div>
        <div class="success-actions">
          <el-button @click="submitResult = null; resetForm()">繼續報名其他幼兒</el-button>
          <el-button type="primary" @click="activeTab = 'query'">查詢報名資料</el-button>
        </div>
      </div>

      <template v-else>
        <!-- 幼兒資料 -->
        <div class="pub-card">
          <div class="card-title">幼兒資料</div>
          <div class="form-group">
            <label class="form-label">幼兒姓名 <span class="required">*</span></label>
            <el-input v-model="form.name" placeholder="請輸入幼兒姓名" clearable />
          </div>
          <div class="form-group">
            <label class="form-label">幼兒生日 <span class="required">*</span></label>
            <el-date-picker
              v-model="form.birthday"
              type="date"
              placeholder="選擇生日"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </div>
          <div class="form-group">
            <label class="form-label">就讀班級 <span class="required">*</span></label>
            <el-select v-model="form.class_name" placeholder="選擇班級" style="width: 100%">
              <el-option v-for="cls in classes" :key="cls" :label="cls" :value="cls" />
            </el-select>
          </div>
        </div>

        <!-- 課程選擇 -->
        <div class="pub-card">
          <div class="card-title" style="display:flex; align-items:center; justify-content:space-between;">
            <span>課程選擇</span>
            <span v-if="secondsSinceUpdate !== null" class="availability-update-hint">
              名額更新：{{ secondsSinceUpdate < 5 ? '剛剛' : `${secondsSinceUpdate} 秒前` }}
            </span>
          </div>
          <div v-if="optionsLoading" class="loading-placeholder">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else>
            <ActivityCourseCard
              v-for="course in courses"
              :key="course.id"
              :course="course"
              :selected="form.selectedCourses.includes(course.name)"
              :disabled="availability[course.name] < 0"
              :availability="availability[course.name]"
              :video-url="videos[course.name]"
              @toggle="toggleCourse(course)"
            />
            <div v-if="courses.length === 0" class="empty-hint">目前無開放課程</div>
          </div>
        </div>

        <!-- 用品選擇 -->
        <div v-if="supplies.length > 0" class="pub-card">
          <div class="card-title collapsible" @click="supplyExpanded = !supplyExpanded">
            用品選擇（選填）
            <el-icon class="collapse-icon" :class="{ rotated: supplyExpanded }">
              <ArrowDown />
            </el-icon>
          </div>
          <div v-if="supplyExpanded">
            <ActivitySupplyCard
              v-for="supply in supplies"
              :key="supply.id"
              :supply="supply"
              :selected="form.selectedSupplies.includes(supply.name)"
              @toggle="toggleSupply(supply)"
            />
          </div>
        </div>

        <!-- 備註 -->
        <div class="pub-card">
          <div class="card-title">備註（選填）</div>
          <el-input
            v-model="form.notes"
            type="textarea"
            :rows="3"
            placeholder="其他說明或特殊需求..."
          />
        </div>

        <!-- 費用小計 -->
        <ActivityCostSummary :total-cost="totalCost" />

        <!-- 送出按鈕 -->
        <div class="submit-btn-wrap">
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmit(() => refreshAvailability())"
          >
            確認並送出報名
          </el-button>
        </div>
      </template>
    </div>

    <!-- ===== 查詢／修改 Tab ===== -->
    <div v-if="activeTab === 'query'">
      <div class="pub-card">
        <div class="card-title">輸入幼兒資料查詢</div>
        <div class="form-group">
          <label class="form-label">幼兒姓名 <span class="required">*</span></label>
          <el-input v-model="queryForm.name" placeholder="請輸入幼兒姓名" clearable />
        </div>
        <div class="form-group">
          <label class="form-label">幼兒生日 <span class="required">*</span></label>
          <el-date-picker
            v-model="queryForm.birthday"
            type="date"
            placeholder="選擇生日"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </div>
        <el-button
          type="primary"
          :loading="queryLoading"
          :disabled="!queryForm.name || !queryForm.birthday"
          style="width: 100%; margin-top: 8px"
          @click="handleQuery"
        >
          查詢報名資料
        </el-button>
      </div>

      <!-- 查詢結果 -->
      <PublicQueryResultCard
        v-if="queryResult"
        :registration="queryResult"
        :registration-open="registrationOpen"
        @edit="enterEditMode"
        @inquiry="openInquiryDrawer(queryResult?.name)"
      />

      <!-- 修改模式 -->
      <div v-if="editMode && queryResult">
        <div class="pub-card edit-header">
          <el-icon><Edit /></el-icon>
          <span>修改 {{ queryResult.name }} 的報名資料</span>
          <el-button link @click="editMode = false">取消</el-button>
        </div>

        <!-- 課程選擇（修改模式） -->
        <div class="pub-card">
          <div class="card-title">課程選擇</div>
          <ActivityCourseCard
            v-for="course in courses"
            :key="course.name"
            :course="course"
            :selected="editForm.selectedCourses.includes(course.name)"
            :disabled="availability[course.name] < 0 && !editForm.selectedCourses.includes(course.name)"
            :availability="availability[course.name]"
            :video-url="videos[course.name]"
            @toggle="toggleEditCourse(course)"
          />
        </div>

        <!-- 用品選擇（修改模式） -->
        <div v-if="supplies.length > 0" class="pub-card">
          <div class="card-title">用品選擇（選填）</div>
          <ActivitySupplyCard
            v-for="supply in supplies"
            :key="supply.name"
            :supply="supply"
            :selected="editForm.selectedSupplies.includes(supply.name)"
            @toggle="toggleEditSupply(supply)"
          />
        </div>

        <!-- 備註（修改模式） -->
        <div class="pub-card">
          <div class="card-title">備註（選填）</div>
          <el-input v-model="editForm.notes" type="textarea" :rows="3" />
        </div>

        <!-- 費用差額提示 -->
        <div v-if="feeChangeSummary && feeChangeSummary.diff !== 0" class="pub-card fee-diff-card">
          <el-alert
            v-if="feeChangeSummary.diff > 0"
            :title="`費用增加：需補繳 NT$${feeChangeSummary.diff.toLocaleString()}（原 NT$${feeChangeSummary.originalTotal.toLocaleString()} → 新 NT$${feeChangeSummary.newTotal.toLocaleString()}）`"
            type="warning"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else
            :title="`費用減少：可退費 NT$${Math.abs(feeChangeSummary.diff).toLocaleString()}（原 NT$${feeChangeSummary.originalTotal.toLocaleString()} → 新 NT$${feeChangeSummary.newTotal.toLocaleString()}），請聯絡學校辦理退費`"
            type="info"
            :closable="false"
            show-icon
          />
        </div>

        <div class="submit-btn-wrap">
          <el-button
            type="primary"
            :loading="editSubmitting"
            @click="handleEditSubmit(() => refreshAvailability())"
          >
            確認修改
          </el-button>
        </div>
      </div>
    </div>

    <!-- 提問 Drawer -->
    <el-drawer v-model="inquiryDrawer" direction="btt" size="60%" title="提問">
      <div class="inquiry-form">
        <div class="form-group">
          <label class="form-label">姓名</label>
          <el-input v-model="inquiry.name" placeholder="您的姓名" />
        </div>
        <div class="form-group">
          <label class="form-label">聯絡電話</label>
          <el-input v-model="inquiry.phone" placeholder="方便聯繫的電話" />
        </div>
        <div class="form-group">
          <label class="form-label">問題內容 <span class="required">*</span></label>
          <el-input
            v-model="inquiry.question"
            type="textarea"
            :rows="4"
            placeholder="請描述您的問題..."
          />
        </div>
        <el-button
          type="primary"
          :loading="inquirySubmitting"
          :disabled="!inquiry.question"
          style="width: 100%; margin-top: 8px"
          @click="submitInquiry"
        >
          送出提問
        </el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Calendar, CircleCheck, WarningFilled, ArrowDown, Edit } from '@element-plus/icons-vue'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { useActivityRegistrationTime } from '@/composables/useActivityRegistrationTime'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { usePublicRegistrationForm } from '@/composables/usePublicRegistrationForm'
import { usePublicQueryForm } from '@/composables/usePublicQueryForm'
import { useActivityInquiry } from '@/composables/useActivityInquiry'
import ActivityCourseCard from '@/components/activity/ActivityCourseCard.vue'
import ActivitySupplyCard from '@/components/activity/ActivitySupplyCard.vue'
import ActivityCostSummary from '@/components/activity/ActivityCostSummary.vue'
import PublicQueryResultCard from '@/components/activity/PublicQueryResultCard.vue'

const activeTab = ref('register')

const { courses, supplies, classes, videos, loading: optionsLoading, loadOptions } = usePublicActivityOptions()
const { timeInfo, registrationOpen, loadTime, formatDate } = useActivityRegistrationTime()
const { availability, secondsSinceUpdate, refresh: refreshAvailability, startPolling, stopPolling } = useActivityAvailability()
const { form, submitting, submitResult, supplyExpanded, canSubmit, totalCost, toggleCourse, toggleSupply, resetForm, handleSubmit, loadDraftIfExists } = usePublicRegistrationForm({ courses, supplies, availability })
const { queryForm, queryLoading, queryResult, editMode, editForm, editSubmitting, feeChangeSummary, handleQuery, enterEditMode, toggleEditCourse, toggleEditSupply, handleEditSubmit } = usePublicQueryForm({ courses, supplies, availability, registrationOpen })
const { inquiryDrawer, inquiry, inquirySubmitting, openInquiryDrawer, submitInquiry } = useActivityInquiry()

onMounted(async () => {
  try {
    await Promise.all([loadTime(), loadOptions(), refreshAvailability()])
  } catch {
    ElMessage.error('載入資料失敗，請重新整理頁面')
  }
  startPolling()
  await loadDraftIfExists()
})
onUnmounted(() => stopPolling())
</script>

<style scoped>
/* ── 全域容器 ── */
.public-activity {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', sans-serif;
}

/* ── Header ── */
.pub-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #3f7d48;
  color: #fff;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pub-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* ── 時間資訊 ── */
.time-card {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #444;
  font-size: 14px;
}
.time-label { color: #888; }
.time-value { font-weight: 500; }

/* ── Tabs ── */
.pub-tabs {
  display: flex;
  margin: 0 12px 4px;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.pub-tab {
  flex: 1;
  padding: 12px 0;
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
  color: #666;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.pub-tab.active { background: #3f7d48; color: #fff; font-weight: 600; }
.pub-tab.disabled { opacity: 0.4; cursor: not-allowed; }

/* ── 卡片 ── */
.pub-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title.collapsible { cursor: pointer; user-select: none; margin-bottom: 0; }
.card-title.collapsible + div { margin-top: 14px; }
.collapse-icon { transition: transform 0.2s; }
.collapse-icon.rotated { transform: rotate(180deg); }

/* ── 表單元素 ── */
.form-group { margin-bottom: 14px; }
.form-group:last-child { margin-bottom: 0; }
.form-label { display: block; font-size: 14px; color: #555; margin-bottom: 6px; font-weight: 500; }
.required { color: #e74c3c; }

/* ── 費用小計（配合子元件 margin 移除重複） ── */
.cost-summary { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 500; }
.cost-value { font-size: 18px; font-weight: 700; color: #3f7d48; }

/* ── 送出按鈕區 ── */
.submit-btn-wrap {
  position: sticky;
  bottom: env(safe-area-inset-bottom, 16px);
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  z-index: 5;
}
.submit-btn-wrap .el-button { width: 100%; height: 48px; font-size: 16px; }

/* ── 報名成功 ── */
.success-card { text-align: center; padding: 32px 20px; }
.success-icon { font-size: 56px; color: #3f7d48; margin-bottom: 12px; }
.success-card h2 { font-size: 22px; color: #333; margin: 0 0 8px; }
.success-msg { color: #666; margin-bottom: 16px; }
.waitlist-note {
  background: #fffbe6;
  border: 1px solid #fadb14;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  color: #664d00;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
}
.success-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

/* ── 修改模式 header ── */
.edit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: #3f7d48;
}

/* ── 提問表單 ── */
.inquiry-form { padding: 0 4px; }

/* ── Loading / Empty ── */
.loading-placeholder { padding: 8px 0; }
.empty-hint { color: #aaa; font-size: 14px; text-align: center; padding: 16px 0; }

/* ── 防 iOS 自動縮放（全域覆蓋） ── */
:deep(.el-input__inner),
:deep(.el-textarea__inner) {
  font-size: 16px !important;
}

.availability-update-hint {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
}
</style>
