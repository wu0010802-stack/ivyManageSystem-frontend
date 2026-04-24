<template>
  <div class="activity-registrations">
    <div class="page-header">
      <h2>報名管理</h2>
    </div>

    <div class="mode-list">
    <div class="toolbar">
      <div class="filters">
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
        </el-select>
        <el-select v-model="courseFilter" placeholder="課程篩選" clearable style="width: 140px" @change="handleSearch">
          <el-option v-for="c in courseOptions" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="classroomFilter" placeholder="班級篩選" clearable style="width: 120px" @change="handleSearch">
          <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
        </el-select>
        <el-button :loading="loading" :disabled="loading" @click="handleSearch">搜尋</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="success" :loading="exporting" :disabled="exporting" @click="handleExport">匯出 Excel</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新增報名
        </el-button>
        <el-badge
          v-if="canWrite"
          :value="pendingCount"
          :hidden="pendingCount === 0"
          type="warning"
          class="pending-badge"
        >
          <el-button type="warning" plain @click="goToPending">
            待審核佇列
          </el-button>
        </el-badge>
        <el-button type="info" plain @click="goToPublic">
          <el-icon><Link /></el-icon>
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
      <el-table-column type="selection" width="45" />
      <el-table-column label="學生" prop="student_name" min-width="90" />
      <el-table-column label="家長手機" prop="parent_phone" min-width="120">
        <template #default="{ row }">
          <span>{{ row.parent_phone || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="班級" prop="class_name" min-width="100">
        <template #default="{ row }">
          <span>{{ row.class_name || '—' }}</span>
          <el-tag
            v-if="row.match_status"
            size="small"
            :type="matchStatusTag(row.match_status).type"
            effect="plain"
            class="source-tag"
          >{{ matchStatusTag(row.match_status).label }}</el-tag>
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
      <el-table-column label="備註" prop="remark" min-width="100" show-overflow-tooltip />
      <el-table-column label="報名時間" min-width="140">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">詳情</el-button>
          <el-button
            size="small"
            type="danger"
            @click="handleDelete(row)"
            :loading="deletingRegistrationId === row.id"
          >刪除</el-button>
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

    <!-- 批次操作浮動工具列 -->
    <transition name="batch-bar">
      <div v-if="selectedIds.length > 0" class="batch-toolbar">
        <span class="batch-info">已選 {{ selectedIds.length }} 筆</span>
        <el-button size="small" type="success" :loading="savingBatch" @click="handleBatchMarkPaid(true)">標記已繳費</el-button>
        <el-tooltip content="批次沖帳已停用，請改至繳費明細逐筆軟刪以防誤操作" placement="top">
          <el-button size="small" type="warning" disabled>標記未繳費（已停用）</el-button>
        </el-tooltip>
        <el-button size="small" @click="clearSelection">取消</el-button>
      </div>
    </transition>

    <!-- 詳情抽屜 -->
    <el-drawer v-model="drawerVisible" title="報名詳情" size="560px" destroy-on-close>
      <div v-if="loadingDetail" class="detail-body">
        <el-skeleton :rows="6" animated />
      </div>
      <div v-else-if="detail" class="detail-body">
        <div class="section-header">
          <span class="section-header-title">基本資料</span>
          <el-button v-if="canWrite" size="small" type="primary" link @click="openEditBasicDialog">
            <el-icon><Edit /></el-icon>編輯
          </el-button>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="學生姓名">{{ detail.student_name }}</el-descriptions-item>
          <el-descriptions-item label="班級">{{ detail.class_name }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ detail.birthday }}</el-descriptions-item>
          <el-descriptions-item label="家長手機">{{ detail.parent_phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="Email" :span="2">{{ detail.email }}</el-descriptions-item>
          <el-descriptions-item label="報名時間" :span="2">{{ formatActivityDate(detail.created_at) }}</el-descriptions-item>
        </el-descriptions>

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
                v-if="!rec.is_voided"
                link
                type="danger"
                size="small"
                :loading="deletingPaymentId === rec.id"
                @click="handleDeletePayment(rec)"
              >軟刪</el-button>
            </div>
          </div>
          <div v-else class="no-payment-hint">尚無繳費記錄</div>

          <div class="payment-actions">
            <el-button size="small" type="success" @click="openPaymentDialog('payment')">新增繳費</el-button>
            <el-button size="small" type="danger" @click="openPaymentDialog('refund')" :disabled="!paymentInfo.paid_amount">新增退費</el-button>
          </div>
        </div>

        <div class="section-header">
          <span class="section-header-title">課程（總計：${{ detail.total_amount?.toLocaleString() }}）</span>
          <el-button v-if="canWrite" size="small" type="primary" link @click="openAddCourseDialog">
            <el-icon><Plus /></el-icon>新增課程
          </el-button>
        </div>
        <el-table :data="detail.courses" size="small" border>
          <el-table-column label="課程名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">{{ row.price ? `$${row.price}` : '-' }}</template>
          </el-table-column>
          <el-table-column label="狀態" width="150" align="center">
            <template #default="{ row }">
              <el-tag :type="COURSE_STATUS_TAG_TYPE[row.status] || 'info'" size="small">
                {{ COURSE_STATUS_LABEL[row.status] || row.status }}
              </el-tag>
              <div
                v-if="row.status === 'promoted_pending' && row.confirm_deadline"
                class="promotion-deadline-hint"
              >
                {{ formatDeadlineHint(row.confirm_deadline) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="center">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'waitlist' || row.status === 'promoted_pending'"
                size="small"
                type="primary"
                @click="handlePromote(row)"
                :loading="savingPromote"
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
          <el-button v-if="canWrite" size="small" type="primary" link @click="openAddSupplyDialog">
            <el-icon><Plus /></el-icon>新增用品
          </el-button>
        </div>
        <el-table :data="detail.supplies" size="small" border>
          <el-table-column label="用品名稱" prop="name" />
          <el-table-column label="金額" prop="price" width="80" align="right">
            <template #default="{ row }">{{ row.price ? `$${row.price}` : '-' }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="80" align="center">
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
        <div class="remark-row">
          <el-input v-model="remarkText" type="textarea" :rows="2" />
          <el-button size="small" @click="saveRemark" :loading="savingRemark">儲存備註</el-button>
        </div>

        <div class="section-title">修改紀錄</div>
        <el-timeline>
          <el-timeline-item
            v-for="ch in detail.changes"
            :key="ch.id"
            :timestamp="formatActivityDate(ch.created_at)"
          >
            <strong>{{ ch.change_type }}</strong>：{{ ch.description }}
            <span v-if="ch.changed_by" class="change-by">（{{ ch.changed_by }}）</span>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>

    <!-- 新增繳費/退費 Dialog -->
    <el-dialog
      v-model="paymentDialogVisible"
      :title="paymentForm.type === 'payment' ? '新增繳費記錄' : '新增退費記錄'"
      width="400px"
    >
      <div class="dialog-payment-summary">
        <span>應繳 <strong>NT${{ (detail?.total_amount ?? 0).toLocaleString() }}</strong></span>
        <span class="dps-divider">|</span>
        <span>已繳 <strong class="dps-paid">NT${{ (paymentInfo.paid_amount || 0).toLocaleString() }}</strong></span>
        <span class="dps-divider">|</span>
        <span :class="(paymentInfo.paid_amount || 0) > (detail?.total_amount ?? 0) ? 'dps-over' : 'dps-owed'">
          {{ (paymentInfo.paid_amount || 0) > (detail?.total_amount ?? 0) ? '超繳' : '尚欠' }}
          <strong>NT${{ Math.abs((detail?.total_amount ?? 0) - (paymentInfo.paid_amount || 0)).toLocaleString() }}</strong>
        </span>
      </div>
      <el-form :model="paymentForm" label-width="90px">
        <el-form-item label="金額（元）">
          <el-input-number
            v-model="paymentForm.amount"
            :min="1"
            :max="paymentForm.type === 'refund' ? (paymentInfo.paid_amount || 0) : 999999"
            :step="1"
            :precision="0"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="paymentForm.payment_date"
            type="date"
            placeholder="選擇日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="繳費方式">
          <el-select v-model="paymentForm.payment_method" style="width: 100%">
            <el-option label="現金" value="現金" />
            <el-option label="轉帳" value="轉帳" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="paymentForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="overpaymentAmount > 0"
        :title="`送出後將超繳 NT$${overpaymentAmount.toLocaleString()} 元，請確認`"
        type="warning"
        :closable="false"
        style="margin-top: 4px"
      />
      <template #footer>
        <el-button @click="paymentDialogVisible = false">取消</el-button>
        <el-button
          :type="paymentForm.type === 'payment' ? 'success' : 'danger'"
          :loading="savingPayment"
          :disabled="!paymentForm.amount || !paymentForm.payment_date"
          @click="handleAddPayment"
        >確認送出</el-button>
      </template>
    </el-dialog>

    <!-- 新增報名 Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增報名（後台手動）"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="createForm" label-width="90px" ref="createFormRef">
        <el-form-item label="學生姓名" required>
          <el-input v-model="createForm.name" maxlength="50" placeholder="請輸入學生姓名" />
        </el-form-item>
        <el-form-item label="生日" required>
          <el-date-picker
            v-model="createForm.birthday"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="班級" required>
          <el-select v-model="createForm.class_" placeholder="選擇班級" style="width: 100%">
            <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="createForm.email" maxlength="200" placeholder="選填" />
        </el-form-item>
        <el-form-item label="課程">
          <el-select
            v-model="createForm.courseNames"
            multiple
            filterable
            placeholder="選擇課程（可多選）"
            style="width: 100%"
          >
            <el-option
              v-for="c in courseOptions"
              :key="c.id"
              :label="`${c.name}（$${c.price}，剩 ${c.remaining}/${c.capacity}）`"
              :value="c.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用品">
          <el-select
            v-model="createForm.supplyNames"
            multiple
            filterable
            placeholder="選擇用品（可多選）"
            style="width: 100%"
            :loading="loadingSupplies"
          >
            <el-option
              v-for="s in supplyOptions"
              :key="s.id"
              :label="`${s.name}（$${s.price}）`"
              :value="s.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <div class="create-summary">
        總計：<strong>NT$ {{ createTotal.toLocaleString() }}</strong>
        <span v-if="createTotal === 0" class="create-hint">（未選擇課程或用品）</span>
      </div>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!createFormValid"
          @click="handleCreate"
        >確認新增</el-button>
      </template>
    </el-dialog>

    <!-- 編輯基本資料 Dialog -->
    <el-dialog
      v-model="editBasicDialogVisible"
      title="編輯基本資料"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="editBasicForm" label-width="90px">
        <el-form-item label="學生姓名" required>
          <el-input v-model="editBasicForm.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="生日" required>
          <el-date-picker
            v-model="editBasicForm.birthday"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="班級" required>
          <el-select v-model="editBasicForm.class_" style="width: 100%">
            <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="editBasicForm.email" maxlength="200" placeholder="選填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editBasicDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="savingEditBasic"
          :disabled="!editBasicValid"
          @click="handleSaveEditBasic"
        >儲存</el-button>
      </template>
    </el-dialog>

    <!-- 新增課程 Dialog -->
    <el-dialog
      v-model="addCourseDialogVisible"
      title="新增課程"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item label="選擇課程" required>
          <el-select
            v-model="addCourseId"
            filterable
            placeholder="選擇要加入的課程"
            style="width: 100%"
          >
            <el-option
              v-for="c in availableCoursesForAdd"
              :key="c.id"
              :label="`${c.name}（$${c.price}，剩 ${c.remaining}/${c.capacity}）`"
              :value="c.id"
            >
              <span>{{ c.name }}</span>
              <span style="float: right; color: #999; font-size: 12px">
                ${{ c.price }}｜{{ c.remaining > 0 ? `剩 ${c.remaining}` : (c.allow_waitlist ? '候補' : '額滿') }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-alert
          v-if="addCourseWaitlistHint"
          type="warning"
          :closable="false"
          :title="addCourseWaitlistHint"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="addCourseDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addingCourse"
          :disabled="!addCourseId"
          @click="handleAddCourse"
        >確認新增</el-button>
      </template>
    </el-dialog>

    <!-- 新增用品 Dialog -->
    <el-dialog
      v-model="addSupplyDialogVisible"
      title="新增用品"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item label="選擇用品" required>
          <el-select
            v-model="addSupplyId"
            filterable
            placeholder="選擇要加入的用品"
            style="width: 100%"
            :loading="loadingSupplies"
          >
            <el-option
              v-for="s in supplyOptions"
              :key="s.id"
              :label="`${s.name}（$${s.price}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addSupplyDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addingSupply"
          :disabled="!addSupplyId"
          @click="handleAddSupply"
        >確認新增</el-button>
      </template>
    </el-dialog>
    </div><!-- /.mode-list -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Link } from '@element-plus/icons-vue'
import {
  getRegistrationDetail,
  updateRemark, promoteWaitlist, deleteRegistration,
  exportRegistrations,
  getRegistrationPayments, addRegistrationPayment, deleteRegistrationPayment,
  withdrawCourse, getRegistrationTime,
  createRegistration, getSupplies,
  updateRegistrationBasic, addRegistrationCourse,
  addRegistrationSupply, removeRegistrationSupply,
  listPendingRegistrations,
} from '@/api/activity'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { PAYMENT_STATUS_TAG_TYPE, PAYMENT_STATUS_LABEL, COURSE_STATUS_TAG_TYPE, COURSE_STATUS_LABEL } from '@/constants/activity'
import { computeOwed } from '@/constants/pos'
import { useActivityRegistration } from '@/composables/useActivityRegistration'
import { formatActivityDate } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'

const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))
const termStore = useAcademicTermStore()
const router = useRouter()

const pendingCount = ref(0)
async function loadPendingCount() {
  if (!canWrite.value) return
  try {
    const res = await listPendingRegistrations({ skip: 0, limit: 1 })
    pendingCount.value = res.data?.total || 0
  } catch {
    pendingCount.value = 0
  }
}
function goToPending() {
  router.push({ name: 'activity-registrations-pending' })
}
function goToPublic() {
  const url = router.resolve({ name: 'public-activity' }).href
  window.open(url, '_blank', 'noopener')
}

const MATCH_STATUS_TAG = {
  matched: { label: '系統自動', type: 'success' },
  manual: { label: '人工指定', type: 'primary' },
  pending: { label: '待審核', type: 'warning' },
  rejected: { label: '已拒絕', type: 'info' },
  unmatched: { label: '未比對', type: 'info' },
  forced: { label: '強行收件', type: 'danger' },
}
function matchStatusTag(status) {
  return MATCH_STATUS_TAG[status] || { label: status || '—', type: 'info' }
}

function formatDeadlineHint(iso) {
  if (!iso) return ''
  const deadline = new Date(iso)
  if (Number.isNaN(deadline.getTime())) return ''
  const diffMs = deadline.getTime() - Date.now()
  if (diffMs <= 0) return '已逾期'
  const hours = Math.floor(diffMs / 3600000)
  const mins = Math.floor((diffMs % 3600000) / 60000)
  const label = hours >= 1 ? `${hours} 小時` : `${mins} 分鐘`
  return `剩 ${label}`
}

const {
  list, total, page, pageSize, loading,
  searchText, paymentFilter, courseFilter, classroomFilter,
  courseOptions, classroomOptions,
  selectedIds, savingBatch,
  initFromQuery, fetchList, handleSearch, batchMarkPaid, loadOptions,
} = useActivityRegistration()

// ── 篩選輔助 ──
const hasActiveFilters = computed(() =>
  !!(searchText.value || paymentFilter.value || courseFilter.value || classroomFilter.value)
)

function resetFilters() {
  searchText.value = ''
  paymentFilter.value = ''
  courseFilter.value = null
  classroomFilter.value = ''
  handleSearch()
}

// ── 報名時間 banner ──
const regTimeInfo = ref({ is_open: false, open_at: null, close_at: null })

const regTimeBanner = computed(() => {
  const info = regTimeInfo.value
  if (!info.close_at && !info.open_at) return null
  const now = new Date()
  if (info.close_at) {
    const closeDate = new Date(info.close_at)
    const diffMs = closeDate - now
    if (diffMs <= 0) return { type: 'info', msg: `報名已截止（${info.close_at.replace('T', ' ').slice(0, 16)}）` }
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays < 3) {
      const h = Math.floor(diffMs / (1000 * 60 * 60))
      const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      return { type: 'warning', msg: `報名截止倒數：${h} 小時 ${m} 分鐘（${info.close_at.replace('T', ' ').slice(0, 16)}）` }
    }
  }
  if (!info.is_open) return { type: 'info', msg: '報名目前未開放' }
  return null
})

const drawerVisible = ref(false)
const detail = ref(null)
const loadingDetail = ref(false)
const remarkText = ref('')
const savingPromote = ref(false)
const savingRemark = ref(false)
const withdrawingCourseId = ref(null)
const exporting = ref(false)

const tableRef = ref(null)

// ── 繳費相關 state ──
const loadingPayments = ref(false)
const paymentInfo = ref({ total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] })
const savingPayment = ref(false)
const deletingPaymentId = ref(null)
const deletingRegistrationId = ref(null)
const paymentDialogVisible = ref(false)
const paymentForm = reactive({
  type: 'payment',
  amount: 0,
  payment_date: '',
  payment_method: '現金',
  notes: '',
  idempotency_key: '',
})

function _genIdempotencyKey() {
  // 後端 pattern: ^[A-Za-z0-9_-]{8,64}$
  const rand = Math.random().toString(36).slice(2, 10)
  return `REG-${Date.now()}-${rand}`
}

const overpaymentAmount = computed(() => {
  if (paymentForm.type !== 'payment') return 0
  const willBePaid = (paymentInfo.value.paid_amount || 0) + (paymentForm.amount || 0)
  const total = detail.value?.total_amount ?? 0
  return Math.max(0, willBePaid - total)
})

// ── 繳費狀態 helper（使用 constants）──
const paymentTagType = (row) => PAYMENT_STATUS_TAG_TYPE[row.payment_status] || 'info'
const paymentTagLabel = (row) => PAYMENT_STATUS_LABEL[row.payment_status] || '未繳費'
const paymentTagTypeByStatus = (status) => PAYMENT_STATUS_TAG_TYPE[status] || 'info'
const paymentStatusLabel = (status) => PAYMENT_STATUS_LABEL[status] || '未繳費'

async function openDetail(row) {
  drawerVisible.value = true
  detail.value = null
  loadingDetail.value = true
  paymentInfo.value = { total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] }
  try {
    const [detailRes] = await Promise.all([
      getRegistrationDetail(row.id),
    ])
    detail.value = detailRes.data
    remarkText.value = detailRes.data.remark || ''
    await loadPayments(row.id)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '載入詳情失敗，請稍後重試')
  } finally {
    loadingDetail.value = false
  }
}

async function loadPayments(registrationId) {
  loadingPayments.value = true
  try {
    const res = await getRegistrationPayments(registrationId)
    paymentInfo.value = res.data
  } catch (e) {
    ElMessage.warning(e?.response?.data?.detail || '繳費資訊載入失敗')
  } finally {
    loadingPayments.value = false
  }
}

function openPaymentDialog(type) {
  paymentForm.type = type
  paymentForm.amount = type === 'payment'
    ? computeOwed(detail.value?.total_amount, paymentInfo.value.paid_amount)
    : paymentInfo.value.paid_amount || 0
  paymentForm.payment_date = new Date().toISOString().slice(0, 10)
  paymentForm.payment_method = '現金'
  paymentForm.notes = ''
  // 每次開 dialog 產生新冪等 key；同一個 key 用於後續重試（失敗後按確認不會重複扣款）
  paymentForm.idempotency_key = _genIdempotencyKey()
  paymentDialogVisible.value = true
}

async function handleAddPayment() {
  if (!detail.value) return
  if (savingPayment.value) return
  const typeLabel = paymentForm.type === 'payment' ? '繳費' : '退費'
  const amount = Number(paymentForm.amount) || 0
  if (amount <= 0) {
    ElMessage.warning('金額必須大於 0')
    return
  }
  if (paymentForm.type === 'refund') {
    try {
      await ElMessageBox.confirm(
        `確定要為 ${detail.value.student_name || '此報名'} 退費 NT$${amount.toLocaleString()}？此操作會同步更新已繳金額。`,
        '確認退費',
        {
          type: 'warning',
          confirmButtonText: '確定退費',
          confirmButtonClass: 'el-button--danger',
          cancelButtonText: '取消',
        }
      )
    } catch {
      return
    }
  }
  savingPayment.value = true
  try {
    await addRegistrationPayment(detail.value.id, {
      type: paymentForm.type,
      amount,
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      notes: paymentForm.notes.trim(),
      idempotency_key: paymentForm.idempotency_key,
    })
    ElMessage.success(`${typeLabel}記錄新增成功`)
    paymentDialogVisible.value = false
    await loadPayments(detail.value.id)
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    savingPayment.value = false
  }
}

async function handleDeletePayment(rec) {
  // 軟刪除（voiding）：需具備「才藝課收款簽核」權限，且強制填寫原因（≥5 字）
  // 原紀錄會保留供稽核；paid_amount 會重新計算排除已 voided 的紀錄。
  let reasonResult
  try {
    reasonResult = await ElMessageBox.prompt(
      `將軟刪此${rec.type === 'payment' ? '繳費' : '退費'}記錄（NT$${rec.amount}）。` +
        '\n\n請輸入操作原因（至少 5 字，例：單據誤植、客戶退款後重開）。' +
        '\n原紀錄會保留於資料庫供稽核，不會真正刪除。',
      '軟刪繳費紀錄',
      {
        confirmButtonText: '確認軟刪',
        cancelButtonText: '取消',
        inputPattern: /.{5,200}/,
        inputErrorMessage: '原因必須 5-200 個字，不可敷衍',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }
  const reason = (reasonResult.value || '').trim()
  deletingPaymentId.value = rec.id
  try {
    await deleteRegistrationPayment(detail.value.id, rec.id, reason)
    ElMessage.success('記錄已軟刪（原紀錄保留供稽核）')
    await loadPayments(detail.value.id)
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '軟刪失敗')
  } finally {
    deletingPaymentId.value = null
  }
}

async function saveRemark() {
  if (!detail.value) return
  savingRemark.value = true
  try {
    await updateRemark(detail.value.id, { remark: remarkText.value })
    detail.value.remark = remarkText.value
    ElMessage.success('備註已儲存')
  } catch {
    ElMessage.error('儲存失敗')
  } finally {
    savingRemark.value = false
  }
}

async function handlePromote(course) {
  if (!detail.value) return
  savingPromote.value = true
  try {
    await promoteWaitlist(detail.value.id, course.course_id)
    ElMessage.success('已升為正式報名')
    const res = await getRegistrationDetail(detail.value.id)
    detail.value = res.data
    // 升正式後總金額可能改變，重新載入繳費資訊
    await loadPayments(detail.value.id)
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '升正式失敗')
  } finally {
    savingPromote.value = false
  }
}

async function handleWithdrawCourse(course) {
  if (!detail.value) return
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

async function doWithdrawCourse(course, forceRefund) {
  withdrawingCourseId.value = course.id
  try {
    await withdrawCourse(detail.value.id, course.course_id, { forceRefund })
    ElMessage.success(
      forceRefund
        ? `已退出課程「${course.name}」並自動寫退費沖帳`
        : `已退出課程「${course.name}」`
    )
    const res = await getRegistrationDetail(detail.value.id)
    detail.value = res.data
    await loadPayments(detail.value.id)
    fetchList()
  } catch (e) {
    // 409：退課後將超繳，需二次確認以 force_refund=true 自動沖帳
    if (e?.response?.status === 409 && !forceRefund) {
      const detailMsg = e?.response?.data?.detail || '退課將產生超繳'
      try {
        await ElMessageBox.confirm(
          `${detailMsg}\n\n按「確認退課並沖帳」後會自動寫一筆退費沖帳紀錄（付款方式：系統補齊），原繳費歷史保留。`,
          '需要確認自動沖帳',
          {
            type: 'warning',
            confirmButtonText: '確認退課並沖帳',
            cancelButtonText: '取消',
            dangerouslyUseHTMLString: false,
          }
        )
      } catch {
        withdrawingCourseId.value = null
        return
      }
      await doWithdrawCourse(course, true)
      return
    }
    ElMessage.error(e?.response?.data?.detail || '退課失敗')
  } finally {
    withdrawingCourseId.value = null
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`確定要刪除「${row.student_name}」的報名資料嗎？`, '確認刪除', {
      type: 'warning',
      confirmButtonText: '確定刪除',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  await doDeleteRegistration(row, false)
}

async function doDeleteRegistration(row, forceRefund) {
  deletingRegistrationId.value = row.id
  try {
    await deleteRegistration(row.id, { forceRefund })
    ElMessage.success(forceRefund ? '已刪除並自動寫退費沖帳' : '已刪除')
    drawerVisible.value = false
    fetchList()
  } catch (e) {
    // 409：報名尚有已繳金額，需二次確認以 force_refund=true 自動沖帳
    if (e?.response?.status === 409 && !forceRefund) {
      const detailMsg = e?.response?.data?.detail || '報名尚有已繳金額'
      try {
        await ElMessageBox.confirm(
          `${detailMsg}\n\n按「確認刪除並沖帳」後會自動寫退費沖帳紀錄（付款方式：系統補齊），原繳費歷史保留。`,
          '需要確認自動沖帳',
          {
            type: 'warning',
            confirmButtonText: '確認刪除並沖帳',
            cancelButtonText: '取消',
            confirmButtonClass: 'el-button--danger',
          }
        )
      } catch {
        deletingRegistrationId.value = null
        return
      }
      await doDeleteRegistration(row, true)
      return
    }
    ElMessage.error(e?.response?.data?.detail || '刪除失敗')
  } finally {
    deletingRegistrationId.value = null
  }
}

function handleSelectionChange(rows) {
  selectedIds.value = rows.map(r => r.id)
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedIds.value = []
}

async function handleBatchMarkPaid(isPaid) {
  await batchMarkPaid(isPaid, () => {
    tableRef.value?.clearSelection()
  })
}

async function handleExport() {
  exporting.value = true
  try {
    const res = await exportRegistrations({
      search: searchText.value || undefined,
      payment_status: paymentFilter.value || undefined,
      course_id: courseFilter.value || undefined,
      classroom_name: classroomFilter.value || undefined,
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    const localDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    a.download = `activity_registrations_${localDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('匯出失敗')
  } finally {
    exporting.value = false
  }
}

// ── 新增報名 ────────────────────────────────────────────
const createDialogVisible = ref(false)
const creating = ref(false)
const loadingSupplies = ref(false)
const supplyOptions = ref([])
const createFormRef = ref(null)
const createForm = reactive({
  name: '',
  birthday: '',
  class_: '',
  email: '',
  courseNames: [],
  supplyNames: [],
  remark: '',
})

const createFormValid = computed(() =>
  !!createForm.name && !!createForm.birthday && !!createForm.class_
)

const createTotal = computed(() => {
  let sum = 0
  for (const n of createForm.courseNames) {
    const c = courseOptions.value.find((x) => x.name === n)
    if (c) sum += c.price || 0
  }
  for (const n of createForm.supplyNames) {
    const s = supplyOptions.value.find((x) => x.name === n)
    if (s) sum += s.price || 0
  }
  return sum
})

async function openCreateDialog() {
  createForm.name = ''
  createForm.birthday = ''
  createForm.class_ = ''
  createForm.email = ''
  createForm.courseNames = []
  createForm.supplyNames = []
  createForm.remark = ''
  createDialogVisible.value = true

  if (supplyOptions.value.length === 0) {
    loadingSupplies.value = true
    try {
      const res = await getSupplies({
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      supplyOptions.value = res.data.supplies || []
    } catch {
      ElMessage.warning('用品清單載入失敗')
    } finally {
      loadingSupplies.value = false
    }
  }
}

async function handleCreate() {
  if (!createFormValid.value) return
  creating.value = true
  try {
    const payload = {
      name: createForm.name.trim(),
      birthday: createForm.birthday,
      class: createForm.class_,
      email: createForm.email?.trim() || null,
      remark: createForm.remark || '',
      courses: createForm.courseNames.map((name) => ({ name, price: '' })),
      supplies: createForm.supplyNames.map((name) => ({ name, price: '' })),
      school_year: termStore.school_year,
      semester: termStore.semester,
    }
    const res = await createRegistration(payload)
    ElMessage.success(res.data.message || '新增成功')
    createDialogVisible.value = false
    await fetchList()
    // 重新載入課程選項以更新剩餘名額
    loadOptions()
    // 強制重新載入用品（本次已新增可能影響）
    supplyOptions.value = []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    creating.value = false
  }
}

// ── 編輯基本資料 ────────────────────────────────────────
const editBasicDialogVisible = ref(false)
const savingEditBasic = ref(false)
const editBasicForm = reactive({
  name: '',
  birthday: '',
  class_: '',
  email: '',
})
const editBasicValid = computed(() =>
  !!editBasicForm.name && !!editBasicForm.birthday && !!editBasicForm.class_
)

function openEditBasicDialog() {
  if (!detail.value) return
  editBasicForm.name = detail.value.student_name || ''
  editBasicForm.birthday = detail.value.birthday || ''
  editBasicForm.class_ = detail.value.class_name || ''
  editBasicForm.email = detail.value.email || ''
  editBasicDialogVisible.value = true
}

async function handleSaveEditBasic() {
  if (!detail.value || !editBasicValid.value) return
  savingEditBasic.value = true
  try {
    await updateRegistrationBasic(detail.value.id, {
      name: editBasicForm.name.trim(),
      birthday: editBasicForm.birthday,
      class: editBasicForm.class_,
      email: editBasicForm.email?.trim() || null,
    })
    ElMessage.success('基本資料已更新')
    editBasicDialogVisible.value = false
    const res = await getRegistrationDetail(detail.value.id)
    detail.value = res.data
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '更新失敗')
  } finally {
    savingEditBasic.value = false
  }
}

// ── 新增課程 ─────────────────────────────────────────────
const addCourseDialogVisible = ref(false)
const addingCourse = ref(false)
const addCourseId = ref(null)

const availableCoursesForAdd = computed(() => {
  if (!detail.value) return courseOptions.value
  const existing = new Set((detail.value.courses || []).map((c) => c.course_id))
  return courseOptions.value.filter((c) => !existing.has(c.id))
})

const addCourseWaitlistHint = computed(() => {
  if (!addCourseId.value) return ''
  const c = courseOptions.value.find((x) => x.id === addCourseId.value)
  if (!c) return ''
  if (c.remaining > 0) return ''
  if (c.allow_waitlist) return `課程「${c.name}」已額滿，新增後將進入候補`
  return `課程「${c.name}」已額滿且不開放候補，無法新增`
})

async function openAddCourseDialog() {
  addCourseId.value = null
  addCourseDialogVisible.value = true
  if (courseOptions.value.length === 0) {
    await loadOptions()
  }
}

async function handleAddCourse() {
  if (!detail.value || !addCourseId.value) return
  addingCourse.value = true
  try {
    const res = await addRegistrationCourse(detail.value.id, addCourseId.value)
    ElMessage.success(res.data.message || '課程新增成功')
    addCourseDialogVisible.value = false
    const [d] = await Promise.all([
      getRegistrationDetail(detail.value.id),
      loadPayments(detail.value.id),
    ])
    detail.value = d.data
    loadOptions()
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    addingCourse.value = false
  }
}

// ── 新增用品 ─────────────────────────────────────────────
const addSupplyDialogVisible = ref(false)
const addingSupply = ref(false)
const addSupplyId = ref(null)
const deletingSupplyId = ref(null)

async function openAddSupplyDialog() {
  addSupplyId.value = null
  addSupplyDialogVisible.value = true
  if (supplyOptions.value.length === 0) {
    loadingSupplies.value = true
    try {
      const res = await getSupplies({
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      supplyOptions.value = res.data.supplies || []
    } catch {
      ElMessage.warning('用品清單載入失敗')
    } finally {
      loadingSupplies.value = false
    }
  }
}

async function handleAddSupply() {
  if (!detail.value || !addSupplyId.value) return
  addingSupply.value = true
  try {
    await addRegistrationSupply(detail.value.id, addSupplyId.value)
    ElMessage.success('用品新增成功')
    addSupplyDialogVisible.value = false
    const [d] = await Promise.all([
      getRegistrationDetail(detail.value.id),
      loadPayments(detail.value.id),
    ])
    detail.value = d.data
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
  } finally {
    addingSupply.value = false
  }
}

async function handleRemoveSupply(row) {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `確定要移除用品「${row.name}」？`,
      '確認移除',
      { type: 'warning', confirmButtonText: '確定移除', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  deletingSupplyId.value = row.id
  try {
    await removeRegistrationSupply(detail.value.id, row.id)
    ElMessage.success('用品已移除')
    const [d] = await Promise.all([
      getRegistrationDetail(detail.value.id),
      loadPayments(detail.value.id),
    ])
    detail.value = d.data
    fetchList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '移除失敗')
  } finally {
    deletingSupplyId.value = null
  }
}

onMounted(async () => {
  initFromQuery()
  fetchList()
  loadOptions()
  loadPendingCount()
  try {
    const res = await getRegistrationTime()
    regTimeInfo.value = res.data
  } catch {
    // 靜默失敗
  }
})
</script>

<style scoped>
.amount-hint { font-size: 11px; color: #999; margin-top: 2px; }
.source-tag { margin-left: 6px; font-size: 11px; }
.pending-badge { margin-left: 4px; }
.activity-registrations { padding: 16px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.toolbar { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

@media (max-width: 768px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .filters { flex-direction: column; }
  .filters > * { width: 100% !important; }
}
.detail-body { padding: 0 4px; }
.section-title { font-weight: 600; margin: 16px 0 8px; font-size: 14px; color: #374151; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.section-header-title { font-weight: 600; font-size: 14px; color: #374151; }
.section-header :deep(.el-button--small) { gap: 4px; }
.remark-row { display: flex; gap: 8px; align-items: flex-start; }
.change-by { color: #94a3b8; font-size: 12px; }
.promotion-deadline-hint {
  font-size: 11px;
  color: #d97706;
  margin-top: 2px;
}

/* ── 繳費面板 ── */
.payment-panel {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e2e8f0;
}
.payment-summary {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}
.payment-summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ps-label { font-size: 13px; color: #6b7280; }
.ps-value { font-size: 15px; font-weight: 600; color: #1f2937; }
.ps-paid { color: #16a34a; }

.payment-history { margin-bottom: 12px; }
.payment-history-title { font-size: 13px; color: #6b7280; margin-bottom: 6px; }
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
.pr-date { color: #6b7280; }
.pr-method { color: #888; }
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
  background: #1f2937;
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
.batch-bar-leave-active { transition: all 0.2s ease; }
.batch-bar-enter-from,
.batch-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

@media (max-width: 768px) {
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
  background: #f8fafc;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  margin-top: 4px;
}
.create-hint { color: #9ca3af; margin-left: 8px; font-size: 13px; }

.dialog-payment-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #374151;
  flex-wrap: wrap;
}
.dps-divider { color: #d1d5db; }
.dps-paid { color: #16a34a; }
.dps-owed { color: #374151; }
.dps-over { color: #d97706; }
</style>
