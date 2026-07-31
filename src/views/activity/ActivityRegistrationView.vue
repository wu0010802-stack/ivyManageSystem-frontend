<template>
  <div class="activity-registrations">
    <PageHeader title="報名管理" />

    <div class="mode-list">
    <div class="toolbar">
      <div class="toolbar-row toolbar-row--filters">
        <AcademicTermSelector />
        <el-input
          v-model="searchText"
          placeholder="搜尋學生/班級"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="paymentFilter" placeholder="付款狀態" clearable style="width: 140px" @change="handleSearch">
          <el-option label="已繳費" value="paid" />
          <el-option label="部分繳費" value="partial" />
          <el-option label="未繳費" value="unpaid" />
          <el-option label="超繳" value="overpaid" />
          <el-option label="免繳" value="no_fee" />
        </el-select>
        <el-select v-model="matchStatusFilter" placeholder="報名狀態" clearable style="width: 130px" @change="handleSearch">
          <el-option v-for="opt in matchStatusFilterOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-select v-model="courseFilter" placeholder="課程篩選" clearable style="width: 140px" @change="handleSearch">
          <el-option v-for="c in courseOptions" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="classroomFilter" placeholder="班級篩選" clearable style="width: 120px" @change="handleSearch">
          <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
        </el-select>
        <el-button :loading="loading" :disabled="loading" @click="handleSearch">搜尋</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
      <div class="toolbar-row toolbar-row--actions">
        <el-button
          v-if="canWrite"
          type="warning"
          :loading="rematchAllLoading"
          :disabled="rematchAllLoading"
          @click="onRematchAllPending"
        >重新比對</el-button>
        <el-button type="success" :loading="exporting" :disabled="exporting" @click="handleExport">匯出 Excel</el-button>
        <el-button type="success" plain :loading="exportingReport" :disabled="exportingReport" @click="handleExportPaymentReport">匯出繳費報表</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新增報名
        </el-button>
        <el-button type="primary" plain @click="copyPublicRegistrationLink">
          <el-icon><Link /></el-icon>
          複製報名連結
        </el-button>
        <el-button type="info" plain @click="goToPublic">
          前台報名頁
        </el-button>
      </div>
    </div>

    <!-- 報名截止提示 -->
    <el-alert
      v-if="regTimeBanner"
      :title="regTimeBanner.msg"
      :type="regTimeBanner.type"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-table
      ref="tableRef"
      :data="list"
      v-loading="loading"
      border
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="45" :selectable="isRowSelectable" />
      <el-table-column label="學生" prop="student_name" min-width="90" />
      <el-table-column label="家長手機" prop="parent_phone" min-width="120">
        <template #default="{ row }">
          <span>{{ row.parent_phone || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="班級" prop="class_name" min-width="100">
        <template #default="{ row }">
          <span>{{ row.class_name || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="審核狀態" width="100" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="row.match_status"
            size="small"
            :type="matchStatusTag(row.match_status).type"
            effect="plain"
          >{{ matchStatusTag(row.match_status).label }}</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="課程" prop="course_names" min-width="160" show-overflow-tooltip />
      <el-table-column label="繳費" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="paymentTagType(row)" size="small">
            {{ paymentTagLabel(row) }}
          </el-tag>
          <div v-if="row.total_amount > 0" class="amount-hint">
            {{ (row.paid_amount || 0).toLocaleString() }} / {{ row.total_amount.toLocaleString() }}
          </div>
        </template>
      </el-table-column>
      <!-- 備註（家長/櫃台填寫）+ 內部審核註記（審核工作流軌跡，唯讀；完整多行內容見詳情抽屜） -->
      <el-table-column label="備註" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">
          <div v-if="row.remark">{{ row.remark }}</div>
          <div v-if="row.internal_note" class="internal-note-inline">{{ row.internal_note }}</div>
        </template>
      </el-table-column>
      <el-table-column label="報名時間" min-width="140">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="330" align="center" fixed="right" class-name="op-cell">
        <template #default="{ row }">
          <!-- 第一行：詳情 / 拒絕（拒絕列為復原）/ 複製查詢碼。
               「刪除」已移除（2026-07-31 業主指定）：後台一律走「拒絕」軟刪除
               （強制留原因、可復原）；已繳費列拒絕時會要求退費沖帳確認。 -->
          <div class="op-row">
            <el-button size="small" @click="openDetail(row)">詳情</el-button>
            <!-- 已拒絕列：改顯示「復原」 -->
            <el-button
              v-if="isRejectedRow(row) && canWrite"
              size="small"
              type="success"
              @click="handleRestore(row)"
            >復原</el-button>
            <!-- 已核可（matched/manual/forced）列：拒絕鈕在第一行；
                 待審核／未比對列的拒絕鈕仍在第二行審核鈕群，不重複顯示 -->
            <el-button
              v-else-if="!isRejectedRow(row) && canWrite && !showReviewButtons(row)"
              size="small"
              type="danger"
              @click="handleReject(row)"
            >拒絕</el-button>
            <!-- 查詢碼由姓名+生日+家長手機及伺服器密鑰派生，供家長遺失時由後台補發 -->
            <el-tooltip v-if="row.query_token" :content="row.query_token" placement="top">
              <el-button
                size="small"
                type="primary"
                plain
                @click="copyQueryToken(row.query_token)"
              >複製查詢碼</el-button>
            </el-tooltip>
          </div>
          <!-- 第二行：「待審核」與「未比對」列顯示三顆審核鈕；其他狀態不顯示。
               重新比對已移至頁面工具列，改為一鍵批次處理全部待審核（2026-07-23）。 -->
          <div v-if="!isRejectedRow(row) && canWrite && showReviewButtons(row)" class="op-row op-row--audit">
            <el-button size="small" type="primary" @click="openMatchDialog(row)">手動匹配</el-button>
            <el-button size="small" type="danger" plain @click="openForceDialog(row)">強行收件</el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="!canReject(row)"
              @click="handleReject(row)"
            >拒絕</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && list.length === 0"
      :description="hasActiveFilters ? '未找到符合篩選條件的資料' : '尚無報名記錄'"
      style="padding: 40px 0"
    />

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next, jumper, sizes"
      :page-sizes="[10, 20, 50, 100]"
      style="margin-top: 12px; justify-content: flex-end"
      @change="fetchList"
    />

    <!-- 批次操作浮動工具列（依所選群組的報名狀態切換動作）-->
    <transition name="batch-bar">
      <div
        v-if="selectedRows.length > 0 && !loading && selectionBelongsToCurrentTerm"
        class="batch-toolbar"
      >
        <span class="batch-info">已選 {{ selectedRows.length }} 筆 · 狀態：{{ selectionCategoryLabel }}</span>

        <!-- 待審核分類：批量審核（含批量通過的兩條路徑）+ 逐筆精靈 -->
        <template v-if="selectionCategory === 'pending'">
          <!-- loading（切換學期等重新整理中）時 disable：避免用 loading 期間刷新前
               的舊選取（切學期已清空選取，但仍防同一學期內重整列表的窗口期誤觸）。 -->
          <el-button size="small" type="primary" :loading="batchProcessing" :disabled="loading" @click="onBatchRematch">批量重新比對</el-button>
          <el-button size="small" type="danger" plain :loading="batchProcessing" :disabled="loading" @click="onBatchForceAccept">批量強行收件</el-button>
          <el-button size="small" type="danger" :loading="batchProcessing" :disabled="loading" @click="onBatchReject">批量拒絕</el-button>
          <el-button size="small" type="warning" plain @click="onOpenWizard">逐筆審核</el-button>
        </template>

        <!-- 已拒絕分類：批量復原 -->
        <template v-else-if="selectionCategory === 'rejected'">
          <el-button size="small" type="success" :loading="batchProcessing" @click="onBatchRestore">批量復原</el-button>
        </template>

        <!-- 報名成功分類（系統自動 / 人工指定 / 強行收件 / 未比對）：沿用批量標記已繳費 -->
        <template v-else>
          <el-button size="small" type="success" :loading="savingBatch" :disabled="loading" @click="handleBatchMarkPaid(true)">標記已繳費</el-button>
        </template>

        <el-button size="small" @click="clearSelection">取消</el-button>
      </div>
    </transition>

    <!-- 詳情抽屜 -->
    <el-drawer v-model="drawerVisible" title="報名詳情" size="560px" destroy-on-close>
      <div v-if="loadingDetail" class="detail-body">
        <el-skeleton :rows="6" animated />
      </div>
      <div v-else-if="detail" class="detail-body">
        <el-alert
          v-if="isDetailReadOnly"
          data-test="inactive-detail-alert"
          :title="inactiveDetailMessage"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <div class="section-header">
          <span class="section-header-title">基本資料</span>
          <el-button v-if="canMutateDetail" size="small" type="primary" link @click="openEditBasicDialog">
            <el-icon><Edit /></el-icon>編輯
          </el-button>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="學生姓名">{{ detail.student_name }}</el-descriptions-item>
          <el-descriptions-item label="班級">{{ detail.class_name }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ detail.birthday }}</el-descriptions-item>
          <el-descriptions-item label="家長手機">{{ detail.parent_phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="Email" :span="2">{{ detail.email }}</el-descriptions-item>
          <el-descriptions-item label="查詢碼" :span="2">
            <template v-if="detail.query_token">
              <span class="query-token-text">{{ detail.query_token }}</span>
              <el-button size="small" link type="primary" @click="copyQueryToken(detail.query_token)">複製</el-button>
            </template>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="報名時間" :span="2">{{ formatActivityDate(detail.created_at) }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">流程時間軸</div>
        <RegistrationTimeline
          :registration="detail"
          :payments="paymentInfo.records || []"
          :paid-amount="paymentInfo.paid_amount || 0"
          :payment-status="paymentInfo.payment_status || 'unpaid'"
        />

        <!-- ── 繳費管理區塊 ── -->
        <div class="section-title">繳費管理</div>
        <div v-if="loadingPayments" style="padding: 8px 0">
          <el-skeleton :rows="2" animated />
        </div>
        <div v-else class="payment-panel">
          <div class="payment-summary">
            <div class="payment-summary-row">
              <span class="ps-label">應繳金額</span>
              <span class="ps-value">NT$ {{ detail.total_amount?.toLocaleString() }}</span>
            </div>
            <div class="payment-summary-row">
              <span class="ps-label">已繳金額</span>
              <span class="ps-value ps-paid">NT$ {{ paymentInfo.paid_amount?.toLocaleString() }}</span>
            </div>
            <div class="payment-summary-row">
              <span class="ps-label">狀態</span>
              <el-tag :type="paymentTagTypeByStatus(paymentInfo.payment_status)" size="small">
                {{ paymentStatusLabel(paymentInfo.payment_status) }}
              </el-tag>
            </div>
          </div>

          <!-- 繳費歷史（含已軟刪紀錄；voided 列以半透明 + 劃線顯示） -->
          <div v-if="paymentInfo.records?.length" class="payment-history">
            <div class="payment-history-title">繳費明細</div>
            <div
              v-for="rec in paymentInfo.records"
              :key="rec.id"
              class="payment-record-row"
              :class="{ 'payment-record-voided': rec.is_voided }"
            >
              <el-tag :type="rec.type === 'payment' ? 'success' : 'danger'" size="small">
                {{ rec.type === 'payment' ? '繳費' : '退費' }}
              </el-tag>
              <el-tag v-if="rec.is_voided" type="info" size="small">已軟刪</el-tag>
              <span class="pr-amount">{{ rec.type === 'payment' ? '+' : '-' }}{{ rec.amount.toLocaleString() }}</span>
              <span class="pr-date">{{ rec.payment_date }}</span>
              <span class="pr-method">{{ rec.payment_method }}</span>
              <span v-if="rec.notes" class="pr-notes">{{ rec.notes }}</span>
              <span v-if="rec.is_voided && rec.void_reason" class="pr-notes">
                軟刪原因：{{ rec.void_reason }}
              </span>
              <el-button
                v-if="canVoidPayment && canMutateDetail && !rec.is_voided"
                link
                type="danger"
                size="small"
                :loading="deletingPaymentId === rec.id"
                @click="handleDeletePayment(rec)"
              >軟刪</el-button>
            </div>
          </div>
          <div v-else class="no-payment-hint">尚無繳費記錄</div>

          <div v-if="canMutateDetail" class="payment-actions">
            <el-button size="small" type="success" @click="openPaymentDialog('payment')" :disabled="loadingPayments || paymentLoadFailed">新增繳費</el-button>
            <el-button size="small" type="danger" @click="openPaymentDialog('refund')" :disabled="!paymentInfo.paid_amount || loadingPayments || paymentLoadFailed">新增退費</el-button>
          </div>
        </div>

        <div class="section-header">
          <span class="section-header-title">課程</span>
          <el-button v-if="canMutateDetail" size="small" type="primary" link @click="openAddCourseDialog">
            <el-icon><Plus /></el-icon>新增課程
          </el-button>
        </div>
        <el-table :data="detail.courses" size="small" border>
          <el-table-column label="課程名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">
              <span :data-test="`course-billing-${row.course_id}`">
                {{ courseBillingLabel(row) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="150" align="center">
            <template #default="{ row }">
              <el-tag :type="courseStatusTagType(row.status)" size="small">
                {{ courseStatusLabel(row.status) }}
              </el-tag>
              <div
                v-if="row.status === 'promoted_pending' && row.confirm_deadline"
                class="promotion-deadline-hint"
              >
                {{ formatDeadlineHint(row.confirm_deadline) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="canMutateDetail" label="操作" width="160" align="center">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'waitlist' || row.status === 'promoted_pending'"
                size="small"
                type="primary"
                @click="handlePromote(row)"
                :loading="savingPromote"
                :disabled="savingPromote"
              >{{ row.status === 'promoted_pending' ? '代替家長確認' : '升正式' }}</el-button>
              <el-button
                size="small"
                type="danger"
                plain
                @click="handleWithdrawCourse(row)"
                :loading="withdrawingCourseId === row.id"
              >退課</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="section-header">
          <span class="section-header-title">用品</span>
          <el-button v-if="canMutateDetail" size="small" type="primary" link @click="openAddSupplyDialog">
            <el-icon><Plus /></el-icon>新增用品
          </el-button>
        </div>
        <el-table :data="detail.supplies" size="small" border>
          <el-table-column label="用品名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">{{ row.price ? `$${row.price}` : '-' }}</template>
          </el-table-column>
          <el-table-column v-if="canMutateDetail" label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button
                size="small"
                type="danger"
                plain
                :loading="deletingSupplyId === row.id"
                @click="handleRemoveSupply(row)"
              >移除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="section-title">備註</div>
        <div v-if="canMutateDetail" class="remark-row">
          <el-input v-model="remarkText" type="textarea" :rows="2" />
          <el-button size="small" @click="saveRemark" :loading="savingRemark">儲存備註</el-button>
        </div>
        <div v-else data-test="readonly-remark" class="readonly-remark">
          {{ detail.remark || '—' }}
        </div>

        <!-- 內部審核註記：後端審核工作流寫入的軌跡文字（拒絕/強行收件/復原等），唯讀無編輯入口 -->
        <template v-if="detail.internal_note">
          <div class="section-title">內部審核註記</div>
          <div class="internal-note-box" data-test="internal-note-box">{{ detail.internal_note }}</div>
        </template>

        <div class="section-title">修改紀錄</div>
        <el-timeline>
          <el-timeline-item
            v-for="ch in detail.changes"
            :key="ch.id as string"
            :timestamp="formatActivityDate(ch.created_at as string)"
          >
            <strong>{{ ch.change_type }}</strong>：{{ ch.description }}
            <span v-if="ch.changed_by" class="change-by">（{{ ch.changed_by }}）</span>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>

    <!-- 新增繳費/退費 Dialog -->
    <RegistrationPaymentDialog
      v-if="paymentDialogVisible && canMutateDetail"
      v-model="paymentDialogVisible"
      :type="paymentDialogType"
      :registration-id="detail?.id"
      :student-name="detail?.student_name || ''"
      :total-amount="detail?.total_amount ?? 0"
      :paid-amount="paymentInfo.paid_amount || 0"
      @submitted="onPaymentSubmitted"
    />

    <RegistrationCreateDialog
      v-if="createDialogVisible"
      v-model="createDialogVisible"
      :school-year="termStore.school_year"
      :semester="termStore.semester"
      :classroom-options="classroomOptions"
      :course-options="courseOptions"
      @created="onRegistrationCreated"
    />

    <RegistrationEditBasicDialog
      v-if="editBasicDialogVisible && canMutateDetail"
      v-model="editBasicDialogVisible"
      :registration-id="detail?.id"
      :initial="detail || {}"
      :classroom-options="classroomOptions"
      @saved="onEditBasicSaved"
    />

    <!-- 新增課程 Dialog -->
    <RegistrationAddCourseDialog
      v-if="addCourseDialogVisible && canMutateDetail"
      v-model="addCourseDialogVisible"
      :registration-id="detail?.id"
      :course-options="courseOptions"
      :enrolled-course-ids="(detail?.courses || []).map((c) => c.course_id)"
      @added="onCourseAdded"
    />

    <RegistrationAddSupplyDialog
      v-if="addSupplyDialogVisible && canMutateDetail"
      v-model="addSupplyDialogVisible"
      :registration-id="detail?.id"
      :school-year="termStore.school_year"
      :semester="termStore.semester"
      :existing-supply-ids="(detail?.supplies || []).map((s) => s.supply_id)"
      @added="onSupplyAdded"
    />

    <!-- 審核工作流：手動匹配 / 重新比對·強行收件 / 逐筆審核精靈 -->
    <RegistrationMatchDialog
      v-if="matchDialog.visible"
      :state="matchDialog"
      :on-search="debouncedMatchSearch"
      :on-confirm="confirmMatch"
    />
    <RegistrationRematchForceDialog
      v-if="editDialog.visible"
      :state="editDialog"
      :on-confirm="confirmEdit"
    />
    <RegistrationReviewWizard
      v-if="wizardEverOpened"
      :state="wizard"
      :current="wizardCurrent"
      :on-search="debouncedWizardSearch"
      :on-match="wizardMatch"
      :on-force="wizardForce"
      :on-reject="wizardReject"
      :on-skip="wizardSkip"
      :on-prev="prevWizard"
      :on-close="finishWizard"
    />
    </div><!-- /.mode-list -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Plus, Edit, Link } from '@element-plus/icons-vue'
import {
  getRegistrationDetail,
  updateRemark, promoteWaitlist,
  exportRegistrations, exportPaymentReport,
  getRegistrationPayments, deleteRegistrationPayment,
  withdrawCourse, getRegistrationTime,
  removeRegistrationSupply,
} from '@/api/activity'
import { saveBlobResponse } from '@/utils/download'
import { useAcademicTermStore } from '@/stores/academicTerm'
import {
  PAYMENT_STATUS_TAG_TYPE, PAYMENT_STATUS_LABEL,
  COURSE_STATUS_TAG_TYPE, COURSE_STATUS_LABEL,
  FIELD_RULES, VOID_REASON_PATTERN, forceRefundReasonPromptOptions,
  MATCH_STATUS_TAG_TYPE, MATCH_STATUS_LABEL_SHORT,
} from '@/constants/activity'
import { useActivityRegistration } from '@/composables/useActivityRegistration'
import { useActivityReview, type ReviewRow } from '@/composables/useActivityReview'
import { useCountdownBanner, countdownLabel } from '@/composables/useCountdownBanner'
import { formatActivityDate } from '@/utils/format'
import { courseBillingLabel as formatCourseBillingLabel } from '@/utils/activityDisplay'
import { hasPermission } from '@/utils/auth'
import { buildPublicRegistrationUrl } from '@/utils/publicLinks'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import PageHeader from '@/components/common/PageHeader.vue'
// 6 個彈窗/時間軸都綁在 v-model/drawer 後，互動才顯示 → 改 async 拆出主 chunk，加速首載。
const RegistrationPaymentDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationPaymentDialog.vue'))
const RegistrationTimeline = defineAsyncComponent(() => import('@/components/activity/RegistrationTimeline.vue'))
const RegistrationEditBasicDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationEditBasicDialog.vue'))
const RegistrationCreateDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationCreateDialog.vue'))
const RegistrationAddCourseDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationAddCourseDialog.vue'))
const RegistrationAddSupplyDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationAddSupplyDialog.vue'))
// 審核工作流 dialog / 精靈（互動才顯示 → async）
const RegistrationMatchDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationMatchDialog.vue'))
const RegistrationRematchForceDialog = defineAsyncComponent(() => import('@/components/activity/RegistrationRematchForceDialog.vue'))
const RegistrationReviewWizard = defineAsyncComponent(() => import('@/components/activity/RegistrationReviewWizard.vue'))

type ApiErr = { response?: { data?: { detail?: string }; status?: number } }

interface RegistrationRow { id: number; student_name?: string; payment_status?: string; query_token?: string | null; [key: string]: unknown }
interface PaymentRecord { id: number; type: string; amount: number; payment_date?: string; payment_method?: string; notes?: string; is_voided?: boolean; void_reason?: string }
interface PaymentInfo { total_amount?: number; paid_amount?: number; payment_status?: string; records?: PaymentRecord[] }
interface RegistrationCourse { id: number; course_id: number; name: string; price?: number; status: string; confirm_deadline?: string }
interface RegistrationSupply { id: number; supply_id: number; name?: string; price?: number }
interface RegistrationDetail {
  id: number; is_active?: boolean; match_status?: string; student_name?: string; class_name?: string; birthday?: string; parent_phone?: string; email?: string; created_at?: string; remark?: string; query_token?: string | null
  total_amount?: number; courses?: RegistrationCourse[]; supplies?: RegistrationSupply[]; changes?: Record<string, unknown>[]
  // internal_note = 內部審核軌跡（僅 admin payload 回傳，公開查詢端點不含此欄）
  internal_note?: string
  [key: string]: unknown
}

function courseBillingLabel(course: RegistrationCourse): string {
  return formatCourseBillingLabel(course)
}

const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))
// 軟刪繳費走後端 DELETE /registrations/{id}/payments/{pid}，守衛是
// ACTIVITY_PAYMENT_APPROVE（非 WRITE）——「有 WRITE 無簽核權」的櫃台配置
// 舊版會看到可點按鈕、填完原因才吃 403（audit C-4，2026-07-02；對齊
// POS 頁 canApproveRefund 前端閘）
const canVoidPayment = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

async function copyQueryToken(token: unknown) {
  if (typeof token !== 'string' || !token) return
  try {
    await navigator.clipboard.writeText(token)
    ElMessage.success('查詢碼已複製')
  } catch {
    ElMessage.warning('複製失敗，請以滑鼠選取後手動複製')
  }
}

function courseStatusTagType(status: string): ElTagType {
  return ((COURSE_STATUS_TAG_TYPE as Record<string, string>)[status] || 'info') as ElTagType
}
function courseStatusLabel(status: string) {
  return (COURSE_STATUS_LABEL as Record<string, string>)[status] || status
}
const termStore = useAcademicTermStore()
const route = useRoute()

// 老師實際的分享動作是「複製連結貼到家長 LINE@」，所以這裡給的必須是對外的
// public.html 網址，而不是 router.resolve('public-activity') 解出的 admin SPA
// fallback（index.html#/public/activity）——那個網址貼進 LINE 的預覽卡標題會是
// 「常春藤管理系統」，而且會讓家長載入整包 admin bundle。
function publicRegistrationUrl() {
  return buildPublicRegistrationUrl(window.location.origin)
}

function goToPublic() {
  window.open(publicRegistrationUrl(), '_blank', 'noopener')
}

async function copyPublicRegistrationLink() {
  try {
    await navigator.clipboard.writeText(publicRegistrationUrl())
    ElMessage.success('報名連結已複製，可直接貼到家長 LINE 群組')
  } catch {
    ElMessage.warning('複製失敗，請改用「前台報名頁」開啟後複製網址列')
  }
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
function matchStatusTag(status: string): { label: string; type: ElTagType } {
  const label = (MATCH_STATUS_LABEL_SHORT as Record<string, string>)[status]
  if (!label) return { label: status || '—', type: 'info' }
  return {
    label,
    type: ((MATCH_STATUS_TAG_TYPE as Record<string, string>)[status] || 'info') as ElTagType,
  }
}

// 短時段倒數提示由 useCountdownBanner 提供，這裡僅做別名保留呼叫端 API
const formatDeadlineHint = countdownLabel

const {
  list, total, page, pageSize, loading,
  searchText, paymentFilter, matchStatusFilter, courseFilter, classroomFilter,
  courseOptions: _courseOptions, classroomOptions: _classroomOptions,
  savingBatch,
  initFromQuery, fetchList, handleSearch, batchMarkPaid, loadOptions,
} = useActivityRegistration()

// 例外中心深連結（/activity/registrations?match_status=pending）可能導到「已掛載的
// 本頁」——同路徑只換 query 時 Vue Router 不會重新 mount component，onMounted 內的
// initFromQuery() 只在首次掛載跑一次，不會再生效。額外 watch route.query.match_status
// 讓深連結在使用者已停留本頁時也能生效；用值比較避免與 syncToQuery() 的 router.replace
// 互相觸發成無窮迴圈。
watch(
  () => {
    const raw = route.query.match_status
    return Array.isArray(raw) ? raw[0] : raw
  },
  (next) => {
    const val = next || ''
    if (val === matchStatusFilter.value) return
    matchStatusFilter.value = val
    page.value = 1
    fetchList()
  },
)

// 選取的 row 由 view 持有（批量勾選需依 match_status 分群）；selectedIds 供批量繳費端點。
const selectedRows = ref<RegistrationRow[]>([])
const selectedIds = computed(() => selectedRows.value.map((r) => r.id))
const currentTermKey = computed(() => `${termStore.school_year}-${termStore.semester}`)
// 勾選當下綁定學期；所有批次 mutation 送出前再次核對，避免切學期後舊 id 被操作。
const selectionTermKey = ref<string | null>(null)
const selectionBelongsToCurrentTerm = computed(
  () => selectionTermKey.value !== null && selectionTermKey.value === currentTermKey.value,
)
// Cast composable's unknown[] to the specific types expected by child components
interface CourseOptionItem { id: number | string; name: string; price?: number | string; remaining?: number; capacity?: number; [key: string]: unknown }
const courseOptions = _courseOptions as import('vue').Ref<CourseOptionItem[]>
const classroomOptions = _classroomOptions as import('vue').Ref<string[]>

// ── 篩選輔助 ──
const hasActiveFilters = computed(() =>
  !!(searchText.value || paymentFilter.value || matchStatusFilter.value || courseFilter.value || classroomFilter.value)
)

function resetFilters() {
  searchText.value = ''
  paymentFilter.value = ''
  matchStatusFilter.value = ''
  courseFilter.value = null
  classroomFilter.value = ''
  handleSearch()
}

// ── 報名狀態（match_status）篩選選項 ──
const matchStatusFilterOptions = (Object.keys(MATCH_STATUS_LABEL_SHORT) as (keyof typeof MATCH_STATUS_LABEL_SHORT)[])
  .map((value) => ({ value, label: MATCH_STATUS_LABEL_SHORT[value] }))

// ── 報名時間 banner ──
type AlertType = 'success' | 'warning' | 'info' | 'error'
const regTimeInfo = ref<{ is_open: boolean; open_at: string | null; close_at: string | null }>({ is_open: false, open_at: null, close_at: null })
const { banner: _regTimeBanner } = useCountdownBanner(regTimeInfo)
const regTimeBanner = computed(() => {
  if (!_regTimeBanner.value) return null
  return { ..._regTimeBanner.value, type: _regTimeBanner.value.type as AlertType }
})

const drawerVisible = ref(false)
const detail = ref<RegistrationDetail | null>(null)
const isDetailReadOnly = computed(
  () => detail.value?.is_active === false || detail.value?.match_status === 'rejected',
)
const canMutateDetail = computed(
  () => canWrite.value && detail.value !== null && !isDetailReadOnly.value,
)
const inactiveDetailMessage = computed(() =>
  detail.value?.match_status === 'rejected'
    ? '此報名已拒絕，以下為唯讀歷史詳情；如需恢復請使用列表的「復原」動作'
    : '此報名已撤銷，以下為唯讀歷史詳情',
)

function ensureMutableDetail(): boolean {
  if (canMutateDetail.value) return true
  ElMessage.warning('此報名已撤銷或拒絕，詳情僅供查閱')
  return false
}

const loadingDetail = ref(false)
// Why: 防止使用者快速點兩列、或關閉 drawer 後 in-flight 請求覆蓋 detail/paymentInfo
const drawerSeq = ref(0)
watch(drawerVisible, (v) => { if (!v) drawerSeq.value++ })
const remarkText = ref('')
const savingPromote = ref(false)
const savingRemark = ref(false)
const withdrawingCourseId = ref<number | null>(null)
const exporting = ref(false)
const exportingReport = ref(false)

const tableRef = ref<{
  clearSelection: () => void
  toggleRowSelection: (row: RegistrationRow, selected?: boolean) => void
} | null>(null)

// 資安（2026-07-30 #3）：切換學期後，composable 的學期 watcher 只重置 page/filter
// 並重新載入列表，不會清空選取狀態——若使用者在切換學期前已勾選批次，切換後
// selectedRows 仍持有「上一學期」的報名列（row 物件本身未變、id 也還在），使用者
// 若此時點批次操作（標記已繳費／重新比對等），會誤把上一學期的資料一併處理。
// 這裡監看學期變化並清空選取＋el-table 的勾選 UI（tableRef.clearSelection()）。
watch(
  () => [termStore.school_year, termStore.semester],
  () => {
    selectedRows.value = []
    tableRef.value?.clearSelection()
  }
)

// ── 繳費相關 state ──
const loadingPayments = ref(false)
// 繳費端點載入失敗旗標：失敗時 paid_amount 會停在 0，若放行開繳費對話框，
// computeOwed(全額, 0) 會預填全額造成重複收款超繳；故失敗態須擋下繳費操作。
const paymentLoadFailed = ref(false)
const paymentInfo = ref<PaymentInfo>({ total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] })
const deletingPaymentId = ref<number | null>(null)
const paymentDialogVisible = ref(false)
const paymentDialogType = ref<'payment' | 'refund'>('payment')

// ── 繳費狀態 helper（使用 constants）──
const paymentTagType = (row: RegistrationRow): ElTagType => ((PAYMENT_STATUS_TAG_TYPE as Record<string, string>)[row.payment_status as string] || 'info') as ElTagType
const paymentTagLabel = (row: RegistrationRow) => (PAYMENT_STATUS_LABEL as Record<string, string>)[row.payment_status as string] || '未繳費'
const paymentTagTypeByStatus = (status: string | undefined): ElTagType => ((PAYMENT_STATUS_TAG_TYPE as Record<string, string>)[status ?? ''] || 'info') as ElTagType
const paymentStatusLabel = (status: string | undefined) => (PAYMENT_STATUS_LABEL as Record<string, string>)[status ?? ''] || '未繳費'

async function openDetail(row: RegistrationRow) {
  const seq = ++drawerSeq.value
  drawerVisible.value = true
  detail.value = null
  remarkText.value = ''
  loadingDetail.value = true
  paymentLoadFailed.value = false
  paymentInfo.value = { total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] }
  try {
    const detailRes = await getRegistrationDetail(row.id)
    if (seq !== drawerSeq.value) return
    detail.value = detailRes.data as RegistrationDetail
    remarkText.value = (detailRes.data as RegistrationDetail).remark || ''
    await loadPayments(row.id, seq)
  } catch (e) {
    if (seq === drawerSeq.value) {
      ElMessage.error((e as ApiErr)?.response?.data?.detail || '載入詳情失敗，請稍後重試')
    }
  } finally {
    if (seq === drawerSeq.value) loadingDetail.value = false
  }
}

async function loadPayments(registrationId: number, seq = drawerSeq.value) {
  loadingPayments.value = true
  paymentLoadFailed.value = false
  try {
    const res = await getRegistrationPayments(registrationId)
    if (seq !== drawerSeq.value) return
    paymentInfo.value = res.data as PaymentInfo
  } catch (e) {
    if (seq === drawerSeq.value) {
      paymentLoadFailed.value = true
      ElMessage.warning((e as ApiErr)?.response?.data?.detail || '繳費資訊載入失敗')
    }
  } finally {
    if (seq === drawerSeq.value) loadingPayments.value = false
  }
}

function openPaymentDialog(type: 'payment' | 'refund') {
  if (!ensureMutableDetail()) return
  // Why: 繳費資訊未載入完成時，computeOwed 會用到 paid_amount=0 預填全額，
  // 使用者誤送出將造成超繳。
  if (loadingPayments.value) {
    ElMessage.warning('繳費資訊載入中，請稍候再試')
    return
  }
  // Why: 繳費資訊載入失敗時 paid_amount 停在 0，computeOwed 會用全額預填造成
  // 重複收款超繳；失敗態一律擋下繳費/退費，要求先重載。
  if (paymentLoadFailed.value) {
    ElMessage.warning('繳費資訊載入失敗，請先重新整理繳費資料再操作，以免重複收款')
    return
  }
  paymentDialogType.value = type
  paymentDialogVisible.value = true
}

async function onPaymentSubmitted() {
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  await loadPayments(targetId, seq)
  fetchList()
}

async function handleDeletePayment(rec: PaymentRecord) {
  if (!ensureMutableDetail()) return
  // 軟刪除（voiding）：需具備「才藝課收款簽核」權限，且強制填寫原因（≥5 字）
  // 原紀錄會保留供稽核；paid_amount 會重新計算排除已 voided 的紀錄。
  let reasonResult: { value: string }
  try {
    reasonResult = (await ElMessageBox.prompt(
      `將軟刪此${rec.type === 'payment' ? '繳費' : '退費'}記錄（NT$${rec.amount}）。` +
        `\n\n請輸入操作原因（至少 ${FIELD_RULES.voidReasonMin} 字，例：單據誤植、客戶退款後重開）。` +
        '\n原紀錄會保留於資料庫供稽核，不會真正刪除。',
      '軟刪繳費紀錄',
      {
        confirmButtonText: '確認軟刪',
        cancelButtonText: '取消',
        inputPattern: VOID_REASON_PATTERN,
        inputErrorMessage: `原因必須 ${FIELD_RULES.voidReasonMin}-${FIELD_RULES.voidReasonMax} 個字，不可敷衍`,
        confirmButtonClass: 'el-button--danger',
      }
    )) as { value: string }
  } catch {
    return
  }
  const reason = (reasonResult.value || '').trim()
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  deletingPaymentId.value = rec.id
  try {
    await deleteRegistrationPayment(targetId, rec.id, reason)
    if (seq !== drawerSeq.value) return
    ElMessage.success('記錄已軟刪（原紀錄保留供稽核）')
    await loadPayments(targetId, seq)
    fetchList()
  } catch (e) {
    if (seq === drawerSeq.value) {
      ElMessage.error((e as ApiErr)?.response?.data?.detail || '軟刪失敗')
    }
  } finally {
    deletingPaymentId.value = null
  }
}

async function saveRemark() {
  if (!detail.value || !ensureMutableDetail()) return
  const targetId = detail.value.id
  const text = remarkText.value
  savingRemark.value = true
  try {
    await updateRemark(targetId, { remark: text })
    // Why: await 期間使用者可能關閉 drawer 或切換到別人，避免把備註寫到錯的學生身上
    if (detail.value?.id === targetId) detail.value.remark = text
    ElMessage.success('備註已儲存')
  } catch (e) {
    ElMessage.error(friendlyError('儲存備註失敗', e))
  } finally {
    savingRemark.value = false
  }
}

async function handlePromote(course: RegistrationCourse) {
  if (!detail.value || !ensureMutableDetail()) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  savingPromote.value = true
  try {
    await promoteWaitlist(targetId, course.course_id)
    if (seq !== drawerSeq.value) return
    ElMessage.success('已升為正式報名')
    const res = await getRegistrationDetail(targetId)
    if (seq !== drawerSeq.value) return
    detail.value = res.data as RegistrationDetail
    // 升正式後總金額可能改變，重新載入繳費資訊
    await loadPayments(targetId, seq)
    fetchList()
  } catch (e) {
    if (seq === drawerSeq.value) {
      ElMessage.error((e as ApiErr)?.response?.data?.detail || '升正式失敗')
    }
  } finally {
    savingPromote.value = false
  }
}

async function handleWithdrawCourse(course: RegistrationCourse) {
  if (!detail.value || !ensureMutableDetail()) return
  try {
    await ElMessageBox.confirm(
      `確定要退出課程「${course.name}」？退課後將無法復原，若為正式報名則自動升位候補。`,
      '確認退課',
      { type: 'warning', confirmButtonText: '確定退課', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await doWithdrawCourse(course, false)
}

async function doWithdrawCourse(course: RegistrationCourse, forceRefund: boolean, refundReason?: string) {
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  withdrawingCourseId.value = course.id
  try {
    await withdrawCourse(targetId, course.course_id, { forceRefund, refundReason })
    if (seq !== drawerSeq.value) return
    ElMessage.success(
      forceRefund
        ? `已退出課程「${course.name}」並自動寫退費沖帳`
        : `已退出課程「${course.name}」`
    )
    const res = await getRegistrationDetail(targetId)
    if (seq !== drawerSeq.value) return
    detail.value = res.data as RegistrationDetail
    await loadPayments(targetId, seq)
    fetchList()
  } catch (e) {
    // 409：退課後將超繳，需二次確認以 force_refund=true 自動沖帳；
    // 後端要求自動沖帳必填 refund_reason（≥15 字），故此處用 prompt 收原因。
    const err = e as ApiErr
    if (err?.response?.status === 409 && !forceRefund) {
      const detailMsg = err?.response?.data?.detail || '退課將產生超繳'
      let reasonResult: { value: string }
      try {
        reasonResult = (await ElMessageBox.prompt(
          `${detailMsg}\n\n按「確認退課並沖帳」後會自動寫一筆退費沖帳紀錄（付款方式：系統補齊），原繳費歷史保留。` +
            `\n\n請輸入沖帳原因（至少 ${FIELD_RULES.refundReasonMin} 字，會寫入退費紀錄供稽核）：`,
          '需要確認自動沖帳',
          forceRefundReasonPromptOptions('確認退課並沖帳')
        )) as { value: string }
      } catch {
        withdrawingCourseId.value = null
        return
      }
      const reason = (reasonResult.value || '').trim()
      await doWithdrawCourse(course, true, reason)
      return
    }
    ElMessage.error(err?.response?.data?.detail || '退課失敗')
  } finally {
    withdrawingCourseId.value = null
  }
}

// 「刪除報名」流程已整組移除（2026-07-31 業主指定）：後台唯一移除入口是
// 「拒絕」（useActivityReview.handleReject，含已繳費 409 → force_refund 沖帳
// 二次確認），同為軟刪除、留審核軌跡、可復原。

// ── 批量勾選：限同一「審核分類」──
// 批量動作實際只在乎三種分類：待審核 / 已拒絕 / 已完成報名（系統自動 matched、
// 人工指定 manual、強行收件 forced、未比對 unmatched 都算已完成報名，彼此可互相
// 勾選一起批次操作，例如一起標記已繳費）；不再要求逐一 match_status 完全相同。
type SelectionCategory = 'pending' | 'rejected' | 'success'
const SELECTION_CATEGORY_LABEL: Record<SelectionCategory, string> = {
  pending: '待審核',
  rejected: '已拒絕',
  success: '報名成功',
}
function selectionCategoryOf(status: string | undefined): SelectionCategory {
  if (status === 'pending') return 'pending'
  if (status === 'rejected') return 'rejected'
  return 'success'
}
// selectionCategory = 目前群組的分類（空選為 null）；逐一勾選時其他分類的 checkbox
// 由 isRowSelectable disable；表頭全選跨分類時於 handleSelectionChange 收斂。
const selectionCategory = computed<SelectionCategory | null>(() =>
  selectedRows.value.length ? selectionCategoryOf(selectedRows.value[0].match_status as string | undefined) : null
)
const selectionCategoryLabel = computed(() =>
  selectionCategory.value ? SELECTION_CATEGORY_LABEL[selectionCategory.value] : '—'
)
function isRowSelectable(row: RegistrationRow): boolean {
  if (loading.value) return false
  return selectionCategory.value === null || selectionCategoryOf(row.match_status as string | undefined) === selectionCategory.value
}
let clamping = false
function handleSelectionChange(rows: RegistrationRow[]) {
  if (clamping) return
  if (loading.value) {
    selectedRows.value = []
    selectionTermKey.value = null
    return
  }
  if (rows.length === 0) {
    selectedRows.value = []
    selectionTermKey.value = null
    return
  }
  // 若 table 在切學期 DOM 更新前送出一個舊 selection-change event，直接丟棄。
  if (selectionTermKey.value && selectionTermKey.value !== currentTermKey.value) {
    clearSelection()
    return
  }
  const anchorCategory = selectionCategoryOf(rows[0].match_status as string | undefined)
  const sameGroup = rows.filter(r => selectionCategoryOf(r.match_status as string | undefined) === anchorCategory)
  if (sameGroup.length !== rows.length) {
    // 只會來自表頭全選（逐一勾選時其他分類已 disabled）→ 收斂到錨定分類
    selectedRows.value = sameGroup
    selectionTermKey.value = currentTermKey.value
    clamping = true
    nextTick(() => {
      tableRef.value?.clearSelection()
      sameGroup.forEach(r => tableRef.value?.toggleRowSelection(r, true))
      clamping = false
      ElMessage.info(`批量僅能勾選同一報名狀態分類，已保留「${SELECTION_CATEGORY_LABEL[anchorCategory]}」${sameGroup.length} 筆`)
    })
  } else {
    selectedRows.value = sameGroup
    selectionTermKey.value = currentTermKey.value
  }
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
  selectionTermKey.value = null
}

function ensureCurrentTermSelection(): boolean {
  // 直接讀 store（不只依賴 computed cache），讓 mutation 邊界永遠以呼叫當下學期判斷。
  const liveTermKey = `${termStore.school_year}-${termStore.semester}`
  if (
    loading.value
    || selectedRows.value.length === 0
    || selectionTermKey.value !== liveTermKey
  ) {
    clearSelection()
    ElMessage.warning('學期或清單已變更，請重新勾選後再操作')
    return false
  }
  return true
}

async function handleBatchMarkPaid(isPaid: boolean) {
  if (!ensureCurrentTermSelection()) return
  await batchMarkPaid(isPaid, selectedIds.value, () => { clearSelection() })
}

// 切學期當下先撤銷 view 內的勾選；列表本身由 useActivityRegistration.fetchList
// 在新請求開始時同步清空，兩層共同 fail-closed。
watch(currentTermKey, () => {
  clearSelection()
})

// ── 審核工作流（單列 + 批量 + 逐筆精靈）：集中於 useActivityReview ──
const review = useActivityReview({
  onChanged: () => fetchList(),
  clearSelection,
})
const {
  batchProcessing, rematchAllLoading,
  matchDialog, editDialog, wizard, wizardCurrent,
  debouncedMatchSearch, debouncedWizardSearch,
  openMatchDialog, confirmMatch, openForceDialog, confirmEdit,
  handleReject, handleRestore, handleRematchAllPending,
  handleBatchRematch, handleBatchForceAccept, handleBatchReject, handleBatchRestore,
  openWizard, prevWizard, finishWizard, wizardMatch, wizardForce, wizardReject, wizardSkip,
} = review

// 待審核／未比對列（審核鈕僅此二態 enabled；重新比對已移至頁面工具列一鍵批次
// 處理全部待審核，2026-07-23，不再是單列動作）
function showReviewButtons(row: RegistrationRow): boolean {
  return row.match_status === 'pending' || row.match_status === 'unmatched'
}
function isRejectedRow(row: RegistrationRow): boolean {
  return row.match_status === 'rejected'
}
// 2026-07-31 拒絕擴大涵蓋：已繳費不再 disable——後端 409 會引導 force_refund
// 沖帳二次確認（與原刪除流程同一套退費簽核閘）
function canReject(row: RegistrationRow): boolean {
  return canWrite.value && showReviewButtons(row)
}
function onRematchAllPending() {
  handleRematchAllPending({ school_year: termStore.school_year, semester: termStore.semester })
}

// 批量列動作（以 selectedRows 為輸入；cast 到 ReviewRow）
const selectedReviewRows = computed<ReviewRow[]>(() => selectedRows.value as unknown as ReviewRow[])
function onBatchRematch() {
  if (ensureCurrentTermSelection()) handleBatchRematch(selectedReviewRows.value)
}
function onBatchForceAccept() {
  if (ensureCurrentTermSelection()) handleBatchForceAccept(selectedReviewRows.value)
}
function onBatchReject() {
  if (ensureCurrentTermSelection()) handleBatchReject(selectedReviewRows.value)
}
function onBatchRestore() {
  if (ensureCurrentTermSelection()) handleBatchRestore(selectedReviewRows.value)
}
// 精靈首次開啟後保持掛載（async chunk 只載一次），讓 el-dialog @close 能正常結算刷新。
const wizardEverOpened = ref(false)
function onOpenWizard() {
  if (!ensureCurrentTermSelection()) return
  wizardEverOpened.value = true
  openWizard(selectedReviewRows.value)
}

async function handleExport() {
  exporting.value = true
  try {
    const res = await exportRegistrations({
      search: searchText.value || undefined,
      payment_status: paymentFilter.value || undefined,
      match_status: matchStatusFilter.value || undefined,
      include_inactive:
        (!matchStatusFilter.value || matchStatusFilter.value === 'rejected')
          ? true
          : undefined,
      course_id: courseFilter.value || undefined,
      classroom_name: classroomFilter.value || undefined,
      // 帶上目前選取學期，避免匯出傾印所有 active 學期（與列表查詢一致）
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    // 共用下載：後端 Content-Disposition 的中文檔名（才藝報名名單_學期_時間戳）優先
    saveBlobResponse(res, '才藝報名名單.xlsx')
  } catch (e) {
    ElMessage.error(friendlyError('匯出報名資料失敗', e))
  } finally {
    exporting.value = false
  }
}

// 繳費帳務報表（繳費總覽＋明細）；端點無 match_status 參數，僅帶列表共通篩選
async function handleExportPaymentReport() {
  exportingReport.value = true
  try {
    const res = await exportPaymentReport({
      search: searchText.value || undefined,
      payment_status: paymentFilter.value || undefined,
      course_id: courseFilter.value || undefined,
      classroom_name: classroomFilter.value || undefined,
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    saveBlobResponse(res, '才藝繳費報表.xlsx')
  } catch (e) {
    ElMessage.error(friendlyError('匯出繳費報表失敗', e))
  } finally {
    exportingReport.value = false
  }
}

// ── 新增報名 ────────────────────────────────────────────
const createDialogVisible = ref(false)

function openCreateDialog() {
  createDialogVisible.value = true
}

async function onRegistrationCreated() {
  await fetchList()
  loadOptions() // 重新載入課程選項以更新剩餘名額
}

// ── 編輯基本資料 ────────────────────────────────────────
const editBasicDialogVisible = ref(false)

function openEditBasicDialog() {
  if (!detail.value || !ensureMutableDetail()) return
  editBasicDialogVisible.value = true
}

async function onEditBasicSaved() {
  if (!detail.value) return
  const res = await getRegistrationDetail(detail.value.id)
  detail.value = res.data as RegistrationDetail
  fetchList()
}

// ── 新增課程 ─────────────────────────────────────────────
const addCourseDialogVisible = ref(false)

async function openAddCourseDialog() {
  if (!ensureMutableDetail()) return
  addCourseDialogVisible.value = true
  if (courseOptions.value.length === 0) await loadOptions()
}

async function onCourseAdded() {
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  const [d] = await Promise.all([
    getRegistrationDetail(targetId),
    loadPayments(targetId, seq),
  ])
  if (seq !== drawerSeq.value) return
  detail.value = d.data as RegistrationDetail
  loadOptions()
  fetchList()
}

// ── 新增用品 ─────────────────────────────────────────────
const addSupplyDialogVisible = ref(false)
const deletingSupplyId = ref<number | null>(null)

function openAddSupplyDialog() {
  if (!ensureMutableDetail()) return
  addSupplyDialogVisible.value = true
}

async function onSupplyAdded() {
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  const [d] = await Promise.all([
    getRegistrationDetail(targetId),
    loadPayments(targetId, seq),
  ])
  if (seq !== drawerSeq.value) return
  detail.value = d.data as RegistrationDetail
  fetchList()
}

async function handleRemoveSupply(row: RegistrationSupply) {
  if (!detail.value || !ensureMutableDetail()) return
  try {
    await ElMessageBox.confirm(
      `確定要移除用品「${row.name}」？`,
      '確認移除',
      { type: 'warning', confirmButtonText: '確定移除', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  await doRemoveSupply(row, false)
}

async function doRemoveSupply(row: RegistrationSupply, forceRefund: boolean, refundReason?: string) {
  if (!detail.value) return
  const targetId = detail.value.id
  const seq = drawerSeq.value
  deletingSupplyId.value = row.id
  try {
    await removeRegistrationSupply(targetId, row.id, { forceRefund, refundReason })
    if (seq !== drawerSeq.value) return
    ElMessage.success(
      forceRefund ? `已移除用品「${row.name}」並自動寫退費沖帳` : '用品已移除'
    )
    const [d] = await Promise.all([
      getRegistrationDetail(targetId),
      loadPayments(targetId, seq),
    ])
    if (seq !== drawerSeq.value) return
    detail.value = d.data as RegistrationDetail
    fetchList()
  } catch (e) {
    // 409：移除用品後將超繳，需二次確認以 force_refund=true 自動沖帳；
    // 後端要求自動沖帳必填 refund_reason（≥15 字），故此處用 prompt 收原因。
    const err = e as ApiErr
    if (err?.response?.status === 409 && !forceRefund) {
      const detailMsg = err?.response?.data?.detail || '移除用品將產生超繳'
      let reasonResult: { value: string }
      try {
        reasonResult = (await ElMessageBox.prompt(
          `${detailMsg}\n\n按「確認移除並沖帳」後會自動寫一筆退費沖帳紀錄（付款方式：系統補齊），原繳費歷史保留。` +
            `\n\n請輸入沖帳原因（至少 ${FIELD_RULES.refundReasonMin} 字，會寫入退費紀錄供稽核）：`,
          '需要確認自動沖帳',
          forceRefundReasonPromptOptions('確認移除並沖帳')
        )) as { value: string }
      } catch {
        deletingSupplyId.value = null
        return
      }
      const reason = (reasonResult.value || '').trim()
      await doRemoveSupply(row, true, reason)
      return
    }
    if (seq === drawerSeq.value) {
      ElMessage.error(err?.response?.data?.detail || '移除失敗')
    }
  } finally {
    deletingSupplyId.value = null
  }
}

onMounted(async () => {
  initFromQuery()
  fetchList()
  loadOptions()
  try {
    const res = await getRegistrationTime()
    regTimeInfo.value = res.data as { is_open: boolean; open_at: string | null; close_at: string | null }
  } catch {
    // 靜默失敗
  }
})
</script>

<style scoped>
/* 勾選欄點擊範圍放大：讓整個儲存格都可點（而不是只有 14px 的 checkbox 本身）。
   前綴 .activity-registrations 是為了拉高 specificity，蓋過 element-plus 內建的
   `.el-table__body-wrapper .el-table-column--selection>.cell{display:inline-flex;height:23px}`
  （單純 :deep() 不含外層 class 時不會帶 scope 屬性，specificity 會輸給它，寬度撐不開）。 */
.activity-registrations :deep(.el-table-column--selection .cell) {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.activity-registrations :deep(.el-table-column--selection .el-checkbox) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 12px 0;
  cursor: pointer;
}
.amount-hint { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.activity-registrations { padding: 16px; }
/* 兩列工具列（2026-07-23）：第一列搜尋/篩選、第二列動作按鈕（含重新比對），
   兩列皆靠左對齊。 */
.toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.toolbar-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-start; }

@media (--to-sm) {
  .toolbar-row { flex-direction: column; align-items: stretch; }
  .toolbar-row > * { width: 100% !important; }
}
.detail-body { padding: 0 4px; }
.section-title { font-weight: 600; margin: 16px 0 8px; font-size: 14px; color: var(--neutral-700); }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.section-header-title { font-weight: 600; font-size: 14px; color: var(--neutral-700); }
.section-header :deep(.el-button--small) { gap: 4px; }
.remark-row { display: flex; gap: 8px; align-items: flex-start; }
.readonly-remark {
  white-space: pre-wrap;
  color: var(--text-secondary);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
}
.internal-note-box {
  white-space: pre-wrap;
  background: var(--bg-color);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--neutral-700);
}
.internal-note-inline {
  font-size: 12px;
  color: var(--text-tertiary);
}
.change-by { color: var(--text-tertiary); font-size: 12px; }
.promotion-deadline-hint {
  font-size: 12px;
  color: var(--color-warning-hover);
  margin-top: 2px;
}

/* ── 繳費面板 ── */
.payment-panel {
  background: var(--bg-color);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
}
.payment-summary {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.payment-summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ps-label { font-size: 13px; color: var(--text-secondary); }
.ps-value { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.ps-paid { color: var(--color-success-hover); }

.payment-history { margin-bottom: 12px; }
.payment-history-title { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.payment-record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  flex-wrap: wrap;
}
.payment-record-row:last-child { border-bottom: none; }
.pr-amount { font-weight: 600; min-width: 60px; }
.pr-date { color: var(--text-secondary); }
.pr-method { color: var(--text-tertiary); }
.pr-notes { color: #aaa; font-style: italic; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.payment-record-voided { opacity: 0.55; text-decoration: line-through; }
.payment-record-voided .pr-notes { text-decoration: none; }

.no-payment-hint { color: #aaa; font-size: 13px; padding: 8px 0; margin-bottom: 8px; }
.payment-actions { display: flex; gap: 8px; }

/* ── 批次工具列 ── */
.batch-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-primary);
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  z-index: 999;
}
.batch-info { font-size: 14px; }

.batch-bar-enter-active,
.batch-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.batch-bar-enter-from,
.batch-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

@media (--to-sm) {
  .batch-toolbar {
    left: 12px;
    right: 12px;
    transform: none;
    flex-wrap: wrap;
    justify-content: center;
  }
  .batch-bar-enter-from,
  .batch-bar-leave-to { opacity: 0; transform: translateY(20px); }
}

.create-summary {
  padding: 8px 12px;
  background: var(--bg-color);
  border-radius: 6px;
  font-size: 14px;
  color: var(--neutral-700);
  margin-top: 4px;
}
.create-hint { color: var(--text-tertiary); margin-left: 8px; font-size: 13px; }
.query-token-text { font-family: monospace; word-break: break-all; margin-right: 8px; }

/* 操作欄兩行排版：第一行 詳情/刪除(復原)/複製查詢碼，第二行 四顆審核鈕 */
.op-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
.op-row + .op-row { margin-top: 12px; }
/* 以 gap 控間距，抵銷 element-plus 相鄰按鈕的預設 margin-left（12px） */
.op-row .el-button + .el-button { margin-left: 0; }
/* 操作欄儲存格 padding 加大，兩行按鈕不顯擁擠 */
:deep(td.op-cell .cell) { padding: 14px 12px; }
</style>
