<template>
  <div class="activity-courses">
    <!-- 標題交給外層「才藝設定與品項」頁的 h2 與 tab 標籤，此處不再重複（2026-07-31 整併） -->
    <div class="toolbar">
      <div class="toolbar__actions">
        <AcademicTermSelector />
        <el-button v-if="canWrite" data-test="sweep-expired-btn" :loading="sweeping" @click="handleSweepExpired">掃描過期候補</el-button>
        <el-button v-if="canWrite" @click="openCopyDialog" :icon="CopyDocument">複製上學期</el-button>
        <el-button
          v-if="canWrite"
          data-test="open-sort-btn"
          :icon="Sort"
          :disabled="courses.length < 2"
          @click="openSortDialog"
        >調整順序</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">新增課程</el-button>
      </div>
    </div>

    <AdminListToolbar
      v-model:search="courseSearch"
      search-placeholder="搜尋課程名稱或負責老師"
      :total="courseTotal"
      :shown="courseShown"
    />

    <el-table v-if="!isMobile" :data="filteredCourses" v-loading="loading" border>
      <template #empty>
        <el-empty :description="courseSearch ? '沒有符合搜尋條件的課程' : '尚無課程資料'" />
      </template>
      <el-table-column label="課程名稱" prop="name" min-width="140" />
      <el-table-column label="價格" prop="price" width="90" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="堂數" prop="sessions" width="70" align="center">
        <template #default="{ row }">{{ row.sessions ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="上課時段" min-width="140">
        <template #default="{ row }">
          <span v-if="formatSchedule(row)">{{ formatSchedule(row) }}</span>
          <span v-else style="color: var(--text-tertiary);">-</span>
        </template>
      </el-table-column>
      <el-table-column label="限定年級" min-width="110">
        <template #default="{ row }">
          <template v-if="row.allowed_grades?.length">
            <el-tag
              v-for="g in row.allowed_grades"
              :key="g"
              size="small"
              effect="plain"
              class="grade-tag"
            >{{ g }}</el-tag>
          </template>
          <span v-else style="color: var(--text-tertiary);">不限</span>
        </template>
      </el-table-column>
      <!-- G8（年終批次2）：課程負責老師，年終教課獎勵金依此歸屬自動計算 -->
      <el-table-column label="負責老師" width="100" align="center">
        <template #default="{ row }">
          <span v-if="instructorName(row)">{{ instructorName(row) }}</span>
          <span v-else style="color: var(--text-tertiary);">未設定</span>
        </template>
      </el-table-column>
      <!-- 容量顯示含正式、待審核與待家長確認，並拆開標示各狀態，避免管理者
           只看到正式人數而誤判仍可收件。 -->
      <el-table-column label="容量" width="140" align="center">
        <template #default="{ row }">
          <el-button
            v-if="occupying(row) > 0"
            link type="primary" size="small"
            @click="openEnrolled(row)"
          >{{ occupying(row) }}/{{ row.capacity }}</el-button>
          <span v-else>0/{{ row.capacity }}</span>
          <div v-if="(row.promoted_pending || 0) > 0" class="pending-occupancy-hint">
            含 {{ row.promoted_pending }} 待確認
          </div>
          <div v-if="(row.pending_review || 0) > 0" class="pending-occupancy-hint">
            含 {{ row.pending_review }} 待審核
          </div>
          <!-- 待審候補（pending_review_waitlist）：不佔容量，且點「升正式」後端必回 400，
               須先於「報名管理」完成身分審核——理由與候補 Drawer 的 tooltip 同一套說法。 -->
          <div
            v-if="pendingReviewWaitlist(row) > 0"
            class="pending-occupancy-hint pending-occupancy-hint--waitlist"
            data-test="pending-review-waitlist-hint"
          >
            {{ pendingReviewWaitlist(row) }} 待審候補（不佔位）
            <span class="pending-occupancy-hint__note">須先完成審核才能升正式</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="候補" width="70" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.waitlist_count > 0"
            link type="warning" size="small"
            @click="openWaitlist(row)"
          >{{ row.waitlist_count }}</el-button>
          <span v-else>0</span>
        </template>
      </el-table-column>
      <el-table-column label="允許候補" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.allow_waitlist ? 'success' : 'info'" size="small">
            {{ row.allow_waitlist ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="影片" width="60" align="center">
        <template #default="{ row }">
          <a v-if="sanitizeHref(row.video_url)" :href="sanitizeHref(row.video_url)" target="_blank" rel="noopener">
            <el-icon><VideoPlay /></el-icon>
          </a>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="310" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :data-test="`payment-slips-btn-${row.id}`" @click="openSlipDialog(row)">繳費單</el-button>
          <el-button size="small" :data-test="`reorder-enrolled-btn-${row.id}`" @click="openEnrolled(row)">報名排序</el-button>
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)" :loading="deletingId === row.id">停用</el-button>
        </template>
      </el-table-column>
    </el-table>
    <AdminListCards
      v-else
      :items="filteredCourses"
      :columns="courseCardColumns"
      row-key="id"
      :loading="loading"
      :empty-text="courseSearch ? '沒有符合搜尋條件的課程' : '尚無課程資料'"
    >
      <template #title="{ item }">{{ item.name }}</template>
      <template #cell-__grades="{ item }">
        <template v-if="(item.allowed_grades as string[])?.length">
          <el-tag
            v-for="g in (item.allowed_grades as string[])"
            :key="g"
            size="small"
            effect="plain"
            class="grade-tag"
          >{{ g }}</el-tag>
        </template>
        <span v-else>不限</span>
      </template>
      <template #cell-__capacity="{ item }">
        <el-button
          v-if="occupying(item as unknown as Course) > 0"
          link type="primary" size="small"
          @click="openEnrolled(item as unknown as Course)"
        >{{ occupying(item as unknown as Course) }}/{{ item.capacity }}</el-button>
        <span v-else>0/{{ item.capacity }}</span>
        <div v-if="((item.promoted_pending as number) || 0) > 0" class="pending-occupancy-hint">
          含 {{ item.promoted_pending }} 待確認
        </div>
        <div v-if="((item.pending_review as number) || 0) > 0" class="pending-occupancy-hint">
          含 {{ item.pending_review }} 待審核
        </div>
        <div
          v-if="pendingReviewWaitlist(item as unknown as Course) > 0"
          class="pending-occupancy-hint pending-occupancy-hint--waitlist"
        >
          {{ pendingReviewWaitlist(item as unknown as Course) }} 待審候補（不佔位）
          <span class="pending-occupancy-hint__note">須先完成審核才能升正式</span>
        </div>
      </template>
      <template #cell-__waitlist="{ item }">
        <el-button
          v-if="(item.waitlist_count as number) > 0"
          link type="warning" size="small"
          @click="openWaitlist(item as unknown as Course)"
        >{{ item.waitlist_count }}</el-button>
        <span v-else>0</span>
      </template>
      <template #cell-__allowWaitlist="{ item }">
        <el-tag :type="item.allow_waitlist ? 'success' : 'info'" size="small">
          {{ item.allow_waitlist ? '是' : '否' }}
        </el-tag>
      </template>
      <template v-if="canWrite" #actions="{ item }">
        <el-button size="small" @click="openEnrolled(item as unknown as Course)">報名排序</el-button>
        <el-button size="small" @click="openEdit(item as unknown as Course)">編輯</el-button>
        <el-button size="small" type="danger" :loading="deletingId === item.id" @click="handleDelete(item as unknown as Course)">停用</el-button>
      </template>
    </AdminListCards>

    <!-- 新增/編輯對話框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯課程' : '新增課程'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="90px" size="default">
        <el-form-item label="課程名稱" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="價格（元）" required>
          <el-input-number v-model="form.price" :min="0" :max="999999" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="堂數">
          <el-input-number v-model="form.sessions" :min="1" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="1" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="允許候補">
          <el-switch v-model="form.allow_waitlist" />
        </el-form-item>
        <el-form-item label="影片 URL">
          <el-input v-model="form.video_url" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="課程 DM">
          <CourseDmUploader
            v-if="editingId"
            :course-id="editingId"
            :dm-url="editingDm.dm_url"
            :dm-pages="editingDm.dm_pages"
            @updated="onDmUpdated"
          />
          <span v-else class="dm-hint-create">儲存課程後即可上傳 DM</span>
        </el-form-item>
        <el-form-item label="限定年級">
          <el-checkbox-group v-model="form.allowed_grades" data-test="allowed-grades-group">
            <el-checkbox v-for="g in GRADES_ORDER" :key="g" :value="g" :label="g">{{ g }}</el-checkbox>
          </el-checkbox-group>
          <div style="font-size: 12px; color: var(--text-tertiary); width: 100%;">
            不勾＝不限年級。僅供前台顯示與報名管理標示，不會擋報名
          </div>
        </el-form-item>
        <el-form-item label="講師">
          <el-input v-model="form.instructor_name" maxlength="50" placeholder="講師姓名（選填，前台課程卡顯示）" />
        </el-form-item>
        <el-form-item label="負責老師">
          <el-select
            v-model="form.instructor_employee_id"
            clearable
            filterable
            placeholder="選擇負責老師"
            style="width: 100%"
            data-test="select-instructor-employee"
          >
            <el-option
              v-for="emp in employeeOptions"
              :key="emp.id"
              :label="String(emp.name)"
              :value="emp.id"
            />
          </el-select>
          <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px;">
            年終教課獎勵金依此歸屬自動計算
          </div>
        </el-form-item>

        <el-divider content-position="left">
          <span style="font-size: 12px; color: var(--text-secondary);">
            上課時段（公開報名頁顯示用；空白＝不限制）
          </span>
        </el-divider>
        <el-form-item label="上課星期">
          <el-select
            v-model="form.meeting_weekdays"
            placeholder="選擇上課星期（可複選）"
            multiple
            clearable
            style="width: 100%;"
          >
            <el-option :value="0" label="週一" />
            <el-option :value="1" label="週二" />
            <el-option :value="2" label="週三" />
            <el-option :value="3" label="週四" />
            <el-option :value="4" label="週五" />
            <el-option :value="5" label="週六" />
            <el-option :value="6" label="週日" />
          </el-select>
        </el-form-item>
        <el-form-item label="上課時間">
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            <el-time-picker
              v-model="form.meeting_start_time"
              value-format="HH:mm"
              format="HH:mm"
              placeholder="起始"
              style="flex: 1;"
            />
            <span style="color: var(--text-tertiary);">~</span>
            <el-time-picker
              v-model="form.meeting_end_time"
              value-format="HH:mm"
              format="HH:mm"
              placeholder="結束"
              style="flex: 1;"
            />
          </div>
        </el-form-item>
        <el-alert
          v-if="isWeekdayScheduleIncomplete(form)"
          title="已選上課星期但未填完整起訖時間：報名頁只會顯示星期，且不參與衝堂提醒。"
          type="warning"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="saving">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 繳費單批次列印：A4 一頁 8 格（含 QR），裁切後貼信封袋發給家長 -->
    <el-dialog v-model="slipDialogVisible" :title="`列印繳費單 — ${slipCourse?.name ?? ''}`" width="380px" destroy-on-close>
      <el-form label-width="90px" size="default" @submit.prevent>
        <el-form-item label="繳費期限">
          <el-date-picker
            v-model="slipDueDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="留空則單上不印期限"
            style="width: 100%"
            data-test="slip-due-date"
          />
        </el-form-item>
      </el-form>
      <div style="font-size: 12px; color: var(--text-tertiary);">
        產出該課程所有未結清學生的繳費單（同學生同學期多課程合併一張；已繳清與純候補不出單）。
      </div>
      <template #footer>
        <el-button @click="slipDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="slipPrinting" data-test="slip-print-confirm" @click="handlePrintSlips">列印</el-button>
      </template>
    </el-dialog>
  <!-- 候補名單 Drawer -->
  <el-drawer
    v-model="waitlistDrawer"
    :title="`候補名單 — ${waitlistCourse?.name ?? ''}`"
    direction="rtl" size="420px" destroy-on-close
  >
    <el-table :data="waitlistItems" v-loading="waitlistLoading" border size="small">
      <el-table-column label="序號" prop="waitlist_position" width="60" align="center" />
      <el-table-column label="學生姓名" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" width="90" />
      <!-- 狀態（2026-07-30 #8）：候補清單混含一般候補與「候補待審」（報名本身尚待
           身分審核）；一眼標示子狀態，避免管理者誤以為所有候補都能立即升正式。 -->
      <el-table-column label="狀態" width="90" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="isPendingReviewWaitlist(row)"
            type="warning" size="small" effect="plain"
            :data-test="`waitlist-status-pending-review-${row.registration_id}`"
          >候補待審</el-tag>
          <el-tag v-else type="success" size="small" effect="plain" data-test="waitlist-status-normal">一般候補</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-button
            v-if="canWrite && !isPendingReviewWaitlist(row)"
            :data-test="`promote-waitlist-btn-${row.registration_id}`"
            size="small" type="success"
            @click="openPromoteDialog(row)"
          >升正式</el-button>
          <!-- 候補待審：報名尚待身分審核（後台報名管理手動匹配／重新比對／強行收件），
               點升正式後端必回 400——改顯示不可點的狀態標示並以 tooltip 說明原因。 -->
          <el-tooltip
            v-else-if="canWrite"
            content="此候補的報名尚待身分審核，請先於「報名管理」完成審核後再回來升正式"
            placement="top"
          >
            <el-tag
              type="info" size="small"
              :data-test="`waitlist-pending-review-tag-${row.registration_id}`"
            >待審核</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <!-- 手動升位確認 dialog（el-dialog：具 role="dialog"/aria-modal/focus 管理/Esc，
         取代原手刻 backdrop + modal；append-to-body 讓層級疊在 Drawer 之上） -->
    <el-dialog
      v-model="promoteDialog.open"
      title="確認手動升位"
      width="440px"
      append-to-body
      :close-on-click-modal="!promoteDialog.submitting"
      :close-on-press-escape="!promoteDialog.submitting"
      :show-close="!promoteDialog.submitting"
      @close="cancelPromote"
    >
      <p class="promote-modal__body">
        將<strong>跳過順序</strong>，立即升此候補為<strong>正式報名</strong>（不需家長 48h 確認窗）。系統會嘗試以 LINE 通知家長；若家長未綁定 LINE（如校外／未匹配報名），可能收不到通知，屆時請依 staff 通知中的提示改以電話主動告知新增費用。確定？
      </p>
      <p v-if="promoteDialog.error" class="promote-modal__error">{{ promoteDialog.error }}</p>
      <template #footer>
        <el-button :disabled="promoteDialog.submitting" @click="cancelPromote">取消</el-button>
        <el-button
          data-test="promote-confirm"
          type="primary"
          :loading="promoteDialog.submitting"
          @click="confirmPromote"
        >確認升位</el-button>
      </template>
    </el-dialog>
    <div v-if="!waitlistLoading && waitlistItems.length === 0"
         style="text-align:center; padding: 32px; color: var(--text-tertiary);">
      目前無候補學生
    </div>
  </el-drawer>

  <!-- 容量佔位名單 Drawer（enrollsort01：正式佔位＋候補兩區，可拖拉排序；
       拖放後立即儲存，跨區拖拉＝候補轉正／正式轉候補（跳確認提示）） -->
  <el-drawer
    v-model="enrolledDrawer"
    :title="`容量佔位名單 — ${enrolledCourse?.name ?? ''}`"
    direction="rtl" size="440px" destroy-on-close
  >
    <div v-loading="enrolledLoading" class="roster-body">
      <template v-if="occupyingItems.length > 0 || queueItems.length > 0">
        <p v-if="canWrite" class="roster-hint">
          拖拉列即可調整順序，放開後立即儲存；把候補列拖入正式區（或反向）將轉換報名身分
        </p>
        <div class="roster-table">
          <div class="roster-table__head">
            <span class="roster-col roster-col--pos">序號</span>
            <span class="roster-col roster-col--name">學生姓名</span>
            <span class="roster-col roster-col--class">班級</span>
            <span class="roster-col roster-col--status">佔位狀態</span>
          </div>
          <div class="roster-section-label">正式（佔位）</div>
          <draggable
            v-model="occupyingItems"
            item-key="course_record_id"
            group="course-roster"
            :disabled="!canWrite || rosterSaving"
            :animation="150"
            ghost-class="roster-row--ghost"
            class="roster-list"
            data-test="roster-occupying"
            @end="handleRosterDragEnd"
          >
            <template #item="{ element, index }">
              <div
                class="roster-row"
                :class="{ 'roster-row--draggable': canWrite && !rosterSaving }"
                :data-test="`roster-row-${element.course_record_id}`"
              >
                <span class="roster-col roster-col--pos">{{ index + 1 }}</span>
                <span class="roster-col roster-col--name">
                  <span :data-test="`occupancy-student-${element.registration_id}`">
                    {{ element.student_name }}
                  </span>
                </span>
                <span class="roster-col roster-col--class">{{ element.class_name || '-' }}</span>
                <span class="roster-col roster-col--status">
                  <el-tag
                    :data-test="`occupancy-status-${element.registration_id}`"
                    :type="occupancyStatusTagType(element.status)"
                    size="small"
                  >
                    {{ occupancyStatusLabel(element.status) }}
                  </el-tag>
                </span>
              </div>
            </template>
          </draggable>
          <div class="roster-section-label roster-section-label--wait">候補</div>
          <draggable
            v-model="queueItems"
            item-key="course_record_id"
            group="course-roster"
            :disabled="!canWrite || rosterSaving"
            :animation="150"
            ghost-class="roster-row--ghost"
            class="roster-list"
            data-test="roster-queue"
            @end="handleRosterDragEnd"
          >
            <template #item="{ element, index }">
              <div
                class="roster-row"
                :class="{ 'roster-row--draggable': canWrite && !rosterSaving }"
                :data-test="`roster-row-${element.course_record_id}`"
              >
                <span class="roster-col roster-col--pos">{{ occupyingItems.length + index + 1 }}</span>
                <span class="roster-col roster-col--name">
                  <span :data-test="`occupancy-student-${element.registration_id}`">
                    {{ element.student_name }}
                  </span>
                </span>
                <span class="roster-col roster-col--class">{{ element.class_name || '-' }}</span>
                <span class="roster-col roster-col--status">
                  <el-tag
                    :data-test="`occupancy-status-${element.registration_id}`"
                    :type="occupancyStatusTagType(element.status)"
                    size="small"
                  >
                    {{ occupancyStatusLabel(element.status) }}
                  </el-tag>
                </span>
              </div>
            </template>
          </draggable>
        </div>
      </template>
      <div v-if="!enrolledLoading && occupyingItems.length === 0 && queueItems.length === 0"
           style="text-align:center; padding: 32px; color: var(--text-tertiary);">
        目前無容量佔位學生
      </div>
    </div>
  </el-drawer>

  <!-- 複製上學期課程對話框 -->
  <el-dialog v-model="copyDialogVisible" title="複製上學期課程" width="460px" destroy-on-close>
    <el-form :model="copyForm" label-width="100px" size="default">
      <el-form-item label="來源學年度">
        <el-input-number v-model="copyForm.source_school_year" :min="100" :max="200" style="width: 120px" />
      </el-form-item>
      <el-form-item label="來源學期">
        <el-radio-group v-model="copyForm.source_semester">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="目標學期">
        {{ termStore.school_year }} 學年度
        {{ termStore.semester === 1 ? '上' : '下' }}學期（當前）
      </el-form-item>
      <el-alert
        title="已存在同名課程會自動跳過；不含任何報名、候補或繳費記錄。"
        type="info"
        :closable="false"
        show-icon
      />
    </el-form>
    <template #footer>
      <el-button @click="copyDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="copying" @click="handleCopy">確認複製</el-button>
    </template>
  </el-dialog>

  <!-- 課程顯示順序（actcsort01）：el-table 不支援列拖拉，故沿用容量佔位名單那套
       vuedraggable + flex 自繪列。清單刻意只放辨識用的欄位，避免與課程表格重複 -->
  <el-dialog v-model="sortDialogVisible" title="調整課程顯示順序" width="460px" destroy-on-close>
    <el-alert
      title="此順序同時決定公開報名頁與家長端的課程排列。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <draggable
      v-model="sortItems"
      item-key="id"
      :animation="150"
      :disabled="sortSaving"
      ghost-class="sort-row--ghost"
      handle=".sort-row__handle"
      class="sort-list"
      data-test="course-sort-list"
    >
      <template #item="{ element, index }">
        <div class="sort-row" :data-test="`course-sort-row-${element.id}`">
          <span class="sort-row__handle" :class="{ 'sort-row__handle--off': sortSaving }">
            <el-icon><Rank /></el-icon>
          </span>
          <span class="sort-row__pos">{{ index + 1 }}</span>
          <span class="sort-row__name">{{ element.name }}</span>
          <span class="sort-row__price">${{ element.price?.toLocaleString() }}</span>
        </div>
      </template>
    </draggable>
    <template #footer>
      <el-button :disabled="sortSaving" @click="sortDialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        data-test="save-sort-btn"
        :loading="sortSaving"
        @click="handleSaveSort"
      >儲存順序</el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { CopyDocument, Rank, Sort, VideoPlay } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { openPdfInNewTab } from '@/utils/printPdfWindow'
import { copyCoursesFromPrevious, getCourses, createCourse, updateCourse, deleteCourse, getCoursePaymentSlipsPdf,
         getCourseWaitlist, getCourseEnrolled, reorderCourseEnrolled, promoteWaitlist,
         reorderCourses, sweepExpiredWaitlist } from '@/api/activity'
import type {
  ActivityCourseOccupancyItem,
  ActivityCourseOccupancyStatus,
} from '@/api/activity'
import { getEmployees } from '@/api/employees'
import type { ApiBody } from '@/api/_generated/typed'
import { COURSE_STATUS_LABEL, COURSE_STATUS_TAG_TYPE } from '@/constants/activity'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useClientTableFilter } from '@/composables'
import { hasPermission } from '@/utils/auth'
import { sanitizeHref } from '@/utils/url'
import { formatWeekdaySchedule, isWeekdayScheduleIncomplete } from '@/utils/weekdaySchedule'
import { GRADES_ORDER } from '@/constants/recruitment'
import CourseDmUploader from './components/CourseDmUploader.vue'

interface Course {
  id: number; name: string; price: number; sessions?: number | null; capacity: number
  allow_waitlist: boolean; video_url?: string; description?: string
  meeting_weekdays?: number[] | null; meeting_start_time?: string; meeting_end_time?: string
  instructor_name?: string | null
  // G8（年終批次2）：課程負責老師，年終教課獎勵金依此歸屬自動計算
  instructor_employee_id?: number | null
  // 可報名年級（空=不限；僅顯示 advisory，不擋報名）
  allowed_grades?: string[]
  enrolled?: number
  pending_review?: number
  pending_review_waitlist?: number
  promoted_pending?: number
  waitlist_count?: number
  // 課程 DM（介紹文宣，2026-07-31）：上傳獨立於表單送出，不隨 handleSave
  dm_url?: string | null
  dm_pages?: string[] | null
}
// status（2026-07-30 #8）：候補清單混含一般候補（waitlist，可升正式）與「候補待審」
// （pending_review_waitlist，報名本身尚待身分審核，點升正式後端必回 400）兩種子狀態；
// 舊資料 / 舊測試 mock 可能缺此欄，故型別為 optional，缺值時視同一般候補處理。
interface WaitlistItem { registration_id: number; student_name?: string; class_name?: string; waitlist_position?: number; status?: 'waitlist' | 'pending_review_waitlist' }

interface CourseForm {
  name: string; price: number; sessions: number | null; capacity: number; allow_waitlist: boolean
  video_url: string; description: string
  meeting_weekdays: number[]; meeting_start_time: string; meeting_end_time: string
  instructor_name: string
  instructor_employee_id: number | null
  allowed_grades: string[]
}

type EmployeeOption = { id: number; name: unknown }

const termStore = useAcademicTermStore()

// 對齊 ActivityRegistrationView 慣例：READ-only 使用者隱藏 mutation 入口（後端守衛 ACTIVITY_WRITE）
const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))

function formatSchedule(row: Course) {
  return formatWeekdaySchedule(row)
}

// ── 繳費單批次列印 ──────────────────────────────────────────────
const slipDialogVisible = ref(false)
const slipCourse = ref<{ id: number; name: string } | null>(null)
const slipDueDate = ref<string>('')
const slipPrinting = ref(false)

function defaultSlipDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function openSlipDialog(row: Course) {
  slipCourse.value = { id: row.id, name: row.name }
  slipDueDate.value = defaultSlipDueDate()
  slipDialogVisible.value = true
}

// blob 回應的錯誤 body 也是 Blob，得先讀文字才能取出後端 detail（例如「無未結清報名」）
async function slipErrorDetail(err: unknown): Promise<string | null> {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { detail?: string }
      return parsed.detail ?? null
    } catch {
      return null
    }
  }
  return null
}

async function handlePrintSlips() {
  const course = slipCourse.value
  if (!course) return
  slipPrinting.value = true
  try {
    // openPdfInNewTab 內部吞錯走 onError，成功回 win、失敗回 null——失敗時保留 dialog 供重試
    const win = await openPdfInNewTab({
      fetchBlob: async () => {
        const res = await getCoursePaymentSlipsPdf(course.id, slipDueDate.value || undefined)
        return res.data
      },
      loadingText: '繳費單產生中…',
      onError: (err: unknown) => {
        void slipErrorDetail(err).then((detail) => {
          ElMessage.error(detail || friendlyError('繳費單 PDF 載入失敗', err))
        })
      },
    })
    if (win) slipDialogVisible.value = false
  } finally {
    slipPrinting.value = false
  }
}

const courses = ref<Course[]>([])

// 手機版（≤767.98px）：清單改卡片視圖（比照 EmployeeListView 範式）
const { isMobile } = useIsMobile()
const loading = ref(false)
const deletingId = ref<number | null>(null)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
// 課程 DM 現況（僅編輯模式顯示，上傳/移除獨立於表單送出，不隨 handleSave）
const editingDm = ref<{ dm_url: string | null; dm_pages: string[] | null }>({ dm_url: null, dm_pages: null })
const copyDialogVisible = ref(false)
const copying = ref(false)
const copyForm = ref<{ source_school_year: number | null; source_semester: number }>({ source_school_year: null, source_semester: 1 })

const defaultForm = (): CourseForm => ({
  name: '',
  price: 0,
  sessions: null,
  capacity: 30,
  allow_waitlist: true,
  video_url: '',
  description: '',
  // Phase 3：結構化時段（給家長公開頁前台 advisory 用；空陣列表示不限）
  meeting_weekdays: [],
  meeting_start_time: '',
  meeting_end_time: '',
  instructor_name: '',
  instructor_employee_id: null,
  allowed_grades: [],
})
const form = ref<CourseForm>(defaultForm())

// G8：負責老師下拉選項（在職員工），比照 YearEndRulesPanel.vue 的 fetchEmployeeOptions 慣例
const employeeOptions = ref<EmployeeOption[]>([])
async function fetchEmployeeOptions() {
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as EmployeeOption[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉退化但其餘欄位仍可編輯
    ElMessage.warning('員工清單載入失敗，負責老師選擇可能不完整')
  }
}
function instructorName(row: Course): string {
  if (row.instructor_employee_id == null) return ''
  const emp = employeeOptions.value.find((e) => e.id === row.instructor_employee_id)
  return emp ? String(emp.name) : `員工 #${row.instructor_employee_id}`
}

// 客端關鍵字過濾：課程清單已全載，課程名稱/負責老師（依 instructor_employee_id 解析
// 出的姓名，與「負責老師」欄一致）即打即濾
const {
  searchQuery: courseSearch,
  filtered: filteredCourses,
  total: courseTotal,
  shown: courseShown,
} = useClientTableFilter<Record<string, unknown>>({
  source: () => courses.value as unknown as Record<string, unknown>[],
  searchFields: (r) => [r.name as string | undefined, instructorName(r as unknown as Course)],
})

// 手機卡片欄位（__ 前綴為 slot-only 欄）。容量／候補的多行提示改由 slot 沿用原邏輯
const courseCardColumns = [
  { label: '價格', prop: '__price', formatter: (r: Record<string, unknown>) => `$${(r.price as number)?.toLocaleString() ?? '-'}` },
  { label: '堂數', prop: '__sessions', formatter: (r: Record<string, unknown>) => (r.sessions ?? '-') },
  { label: '上課時段', prop: '__schedule', formatter: (r: Record<string, unknown>) => formatSchedule(r as unknown as Course) || '-' },
  { label: '限定年級', prop: '__grades' },
  { label: '負責老師', prop: '__instructor', formatter: (r: Record<string, unknown>) => instructorName(r as unknown as Course) || '未設定' },
  { label: '容量', prop: '__capacity' },
  { label: '候補', prop: '__waitlist' },
  { label: '允許候補', prop: '__allowWaitlist' },
]

const waitlistDrawer = ref(false)
const waitlistCourse = ref<{ id: number; name: string } | null>(null)
const waitlistItems = ref<WaitlistItem[]>([])
const waitlistLoading = ref(false)

// status（2026-07-30 #8）：缺欄位（舊測試 mock／未預期的後端回應）時視同一般候補，
// 維持修復前「一律可升正式」的行為，只有明確標記 pending_review_waitlist 才擋。
function isPendingReviewWaitlist(row: WaitlistItem): boolean {
  return row.status === 'pending_review_waitlist'
}

const promoteDialog = reactive<{
  open: boolean
  registration: WaitlistItem | null
  submitting: boolean
  error: string
}>({
  open: false,
  registration: null,
  submitting: false,
  error: '',
})

const enrolledDrawer = ref(false)
const enrolledCourse = ref<{ id: number; name: string } | null>(null)
const enrolledLoading = ref(false)

// enrollsort01：佔位名單拆「正式（佔位）／候補」兩區，各自可拖拉排序、
// 跨區拖拉＝身分轉換。與後端 OCCUPYING_STATUSES 同口徑。
const OCCUPYING_STATUS_SET = new Set<ActivityCourseOccupancyStatus>([
  'enrolled', 'promoted_pending', 'pending_review',
])
const occupyingItems = ref<ActivityCourseOccupancyItem[]>([])
const queueItems = ref<ActivityCourseOccupancyItem[]>([])
const rosterSaving = ref(false)
// 最後一次已成功儲存（或後端回傳）的快照；@end 比對避免原地放下也打 API、
// 取消確認時用於還原
let savedOccItems: ActivityCourseOccupancyItem[] = []
let savedQueueItems: ActivityCourseOccupancyItem[] = []

function snapshotRoster() {
  savedOccItems = [...occupyingItems.value]
  savedQueueItems = [...queueItems.value]
}

function restoreRoster() {
  occupyingItems.value = [...savedOccItems]
  queueItems.value = [...savedQueueItems]
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
function occupancyStatusLabel(status: ActivityCourseOccupancyStatus): string {
  return COURSE_STATUS_LABEL[status]
}
function occupancyStatusTagType(status: ActivityCourseOccupancyStatus): ElTagType {
  return COURSE_STATUS_TAG_TYPE[status] as ElTagType
}

// 佔位數 = enrolled + promoted_pending + pending_review（OCCUPYING_STATUSES，
// 與後端容量閘同口徑，courses.py 的 remaining 亦以此計；2026-07-19 業主決策
// 待審核占位也占容量）。pending_review_waitlist 不佔位，於欄位下方分開標示。
function occupying(row: Course): number {
  return (row.enrolled || 0) + (row.promoted_pending || 0) + (row.pending_review || 0)
}

// 待審候補人數：後端 CourseListItemOut 的 pending_review_waitlist（不佔位，另計於
// waitlist_count 之內）。舊版後端未回此欄位（或回非數值）時一律當 0，讓前後端
// 部署順序不必嚴格對齊，也避免欄位缺失時顯示 NaN 而整列壞掉。
function pendingReviewWaitlist(row: Course): number {
  const n = Number(row.pending_review_waitlist ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// review P1（2026-07-12）：候補/報名 Drawer 的載入需與 fetchCourses 同樣的請求序號守衛，
// 否則快速切換不同課程時較慢的舊課回應會最後覆寫較新課程的清單 → Drawer 標題顯示新課、
// 列卻屬舊課；此時 confirmPromote 以最新 waitlistCourse.id + 舊課列的 registration_id
// 送出，同生同時候補兩課時該 (registration_id, course_id) pair 恰為合法 → 對錯課升位加費。
let waitlistSeq = 0
let enrolledSeq = 0

async function loadEnrolledRoster(courseId: number) {
  const seq = ++enrolledSeq
  enrolledLoading.value = true
  try {
    const res = await getCourseEnrolled(courseId)
    if (seq !== enrolledSeq) return // 過期回應：已切到別課，丟棄不覆寫
    // 後端已保證佔位在前、候補在後，這裡依 status 拆兩區供分區拖拉
    occupyingItems.value = res.data.items.filter((i) => OCCUPYING_STATUS_SET.has(i.status))
    queueItems.value = res.data.items.filter((i) => !OCCUPYING_STATUS_SET.has(i.status))
    snapshotRoster()
  } catch (e) {
    if (seq !== enrolledSeq) return
    ElMessage.error(friendlyError('載入報名名單失敗', e))
  } finally {
    if (seq === enrolledSeq) enrolledLoading.value = false
  }
}

function openEnrolled(row: Course) {
  enrolledCourse.value = { id: row.id, name: row.name }
  // 切課先清空，避免新課標題下短暫顯示舊課清單
  occupyingItems.value = []
  queueItems.value = []
  snapshotRoster()
  enrolledDrawer.value = true
  loadEnrolledRoster(row.id)
}

// 拖放結束：先偵測跨區身分轉換（跳確認提示），再立即儲存；任何失敗都以
// 後端為準重載，避免畫面停留在「看似已排但未儲存」的順序
async function handleRosterDragEnd() {
  const course = enrolledCourse.value
  if (!course) return
  const occIds = occupyingItems.value.map((i) => i.course_record_id)
  const queueIds = queueItems.value.map((i) => i.course_record_id)
  const savedOccIds = savedOccItems.map((i) => i.course_record_id)
  const savedQueueIds = savedQueueItems.map((i) => i.course_record_id)
  if (occIds.join(',') === savedOccIds.join(',') && queueIds.join(',') === savedQueueIds.join(',')) {
    return // 原地放下，不打 API
  }

  // 跨區＝身分轉換：依「目前所在區」與「原 status」的落差判定
  const promoted = occupyingItems.value.filter((i) => !OCCUPYING_STATUS_SET.has(i.status))
  const demoted = queueItems.value.filter((i) => OCCUPYING_STATUS_SET.has(i.status))
  if (promoted.length > 0 || demoted.length > 0) {
    const lines: string[] = []
    if (promoted.length > 0) {
      lines.push(
        `候補轉正式：${promoted.map((i) => i.student_name).join('、')}（家長將收到通知並產生費用；待審核候補僅轉為待審核佔位）`,
      )
    }
    if (demoted.length > 0) {
      lines.push(
        `正式轉候補：${demoted.map((i) => i.student_name).join('、')}（系統不會自動通知家長，請自行聯繫）`,
      )
    }
    try {
      await ElMessageBox.confirm(`${lines.join('；')}。確定套用？`, '確認名單身分異動', {
        type: 'warning',
        confirmButtonText: '確認變更',
      })
    } catch {
      restoreRoster() // 取消：還原拖拉前順序
      return
    }
  }

  rosterSaving.value = true
  try {
    const res = await reorderCourseEnrolled(course.id, occIds, queueIds)
    ElMessage.success((res.data as { message?: string })?.message || '排序已儲存')
    if (promoted.length > 0 || demoted.length > 0) {
      // 身分已變（status／通知／費用），以後端為準重載並刷新課程列表計數
      await loadEnrolledRoster(course.id)
      fetchCourses()
    } else {
      snapshotRoster()
    }
  } catch (e) {
    ElMessage.error(
      (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '排序儲存失敗',
    )
    await loadEnrolledRoster(course.id) // 409 名單過期等：重載後端最新名單
  } finally {
    rosterSaving.value = false
  }
}

async function openWaitlist(row: Course) {
  const seq = ++waitlistSeq
  // 切課時重置殘留的手動升位確認框：el-drawer destroy-on-close 只拆 modal DOM、不清
  // promoteDialog 狀態，換課重開 Drawer 會帶著舊課 registration 重現升位框（見上方 P1 註）。
  cancelPromote()
  waitlistCourse.value = { id: row.id, name: row.name }
  waitlistItems.value = [] // 切課先清空，避免新課標題下短暫顯示舊課候補列
  waitlistDrawer.value = true
  waitlistLoading.value = true
  try {
    const res = await getCourseWaitlist(row.id)
    if (seq !== waitlistSeq) return // 過期回應：已切到別課，丟棄不覆寫（否則標題與清單錯配）
    waitlistItems.value = (res.data as { items: WaitlistItem[] }).items
  } catch (e) {
    if (seq !== waitlistSeq) return
    ElMessage.error(friendlyError('載入候補名單失敗', e))
  } finally {
    if (seq === waitlistSeq) waitlistLoading.value = false
  }
}

function openPromoteDialog(reg: WaitlistItem) {
  promoteDialog.registration = reg
  promoteDialog.error = ''
  promoteDialog.open = true
}

function cancelPromote() {
  // 送出中不可取消：避免把 promoteDialog.registration 清成 null 後，confirmPromote
  // 仍在 await 中、resolve 後讀 registration.student_name 對 null 取值拋錯，
  // 誤報「升位失敗」且後續刷新（getCourseWaitlist + fetchCourses）永不執行。
  if (promoteDialog.submitting) return
  promoteDialog.open = false
  promoteDialog.registration = null
  promoteDialog.error = ''
}

async function confirmPromote() {
  if (!promoteDialog.registration) return
  // 送出前把用得到的欄位存到區域變數：避免 await 期間 promoteDialog.registration
  // 被清掉（理論上 cancelPromote 送出中已擋，此處為雙重防線）造成事後讀取炸掉。
  const { registration_id: registrationId, student_name: studentName } = promoteDialog.registration
  const courseId = waitlistCourse.value!.id
  promoteDialog.submitting = true
  promoteDialog.error = ''
  try {
    await promoteWaitlist(registrationId, courseId)
    ElMessage.success(`${studentName} 已升為正式報名`)
    promoteDialog.open = false
    promoteDialog.registration = null
    // 刷新獨立 try/catch：升位本身已成功，刷新失敗不可回頭把已顯示的成功訊息
    // 誤報為「升位失敗」（落入下方 catch 蓋掉 promoteDialog.error）。
    try {
      // 切課防護（與 fetchSeq/waitlistSeq 一致）：await 期間若已切到別的課程，
      // waitlistCourse 不再等於送出當下的 courseId，套用回應前後都要重新檢查，
      // 否則會把「舊課的升位結果」覆寫到「目前顯示的新課」候補清單上。
      if (waitlistCourse.value?.id === courseId) {
        const res = await getCourseWaitlist(courseId)
        if (waitlistCourse.value?.id === courseId) {
          waitlistItems.value = (res.data as { items: WaitlistItem[] }).items
        }
      }
      await fetchCourses()
    } catch {
      // 非關鍵路徑：靜默失敗，不覆蓋已成功的升位結果
    }
  } catch (e) {
    promoteDialog.error = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '升位失敗，請稍後再試'
  } finally {
    promoteDialog.submitting = false
  }
}

// F5：切換學期競態守衛。每次載入遞增序號，回應落地前比對序號；快速切學期時較慢的
// 舊請求後回不得覆寫較新請求的結果（否則頁面顯示新學期但資料屬舊學期）。
let fetchSeq = 0
async function fetchCourses() {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const res = await getCourses({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    if (seq !== fetchSeq) return // 過期回應：已有更新的載入，丟棄不覆寫
    courses.value = (res.data as { courses: Course[] }).courses
  } catch (e) {
    if (seq !== fetchSeq) return
    // F4：載入失敗須清空清單，否則切學期失敗時畫面留著上一學期的資料且編輯/停用
    // 按鈕仍可操作（學期選擇器顯示新學期但資料屬舊學期），易誤改到舊學期資料。
    courses.value = []
    ElMessage.error(friendlyError('載入課程失敗', e))
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

watch(
  () => [termStore.school_year, termStore.semester],
  () => fetchCourses()
)

function openCopyDialog() {
  // 預設來源=上學期
  const cy = termStore.school_year
  const cs = termStore.semester
  copyForm.value = cs === 1
    ? { source_school_year: cy - 1, source_semester: 2 }
    : { source_school_year: cy, source_semester: 1 }
  copyDialogVisible.value = true
}

async function handleCopy() {
  copying.value = true
  try {
    const res = await copyCoursesFromPrevious({
      source_school_year: copyForm.value.source_school_year,
      source_semester: copyForm.value.source_semester,
      target_school_year: termStore.school_year,
      target_semester: termStore.semester,
    } as ApiBody<'/activity/courses/copy-from-previous', 'post'>)
    ElMessage.success((res.data as { message: string }).message)
    copyDialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '複製失敗')
  } finally {
    copying.value = false
  }
}

// 課程顯示順序（actcsort01）
const sortDialogVisible = ref(false)
const sortSaving = ref(false)
const sortItems = ref<Course[]>([])

function openSortDialog() {
  // 一律以完整清單為底，不吃 filteredCourses：後端要求送出該學期完整排列，
  // 搜尋結果只是子集，送出去會被判定清單不符而 409。
  sortItems.value = [...courses.value]
  sortDialogVisible.value = true
}

async function handleSaveSort() {
  sortSaving.value = true
  try {
    await reorderCourses({
      school_year: termStore.school_year,
      semester: termStore.semester,
      course_ids: sortItems.value.map((c) => c.id),
    })
    ElMessage.success('課程順序已儲存')
    sortDialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error(friendlyError('順序儲存失敗', e))
    // 409＝清單已變動（並發新增／停用課程）；重載讓使用者在最新清單上重排
    fetchCourses()
  } finally {
    sortSaving.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = defaultForm()
  editingDm.value = { dm_url: null, dm_pages: null }
  dialogVisible.value = true
}

function openEdit(row: Course) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    price: row.price,
    sessions: row.sessions ?? null,
    capacity: row.capacity,
    allow_waitlist: row.allow_waitlist,
    video_url: row.video_url || '',
    description: row.description || '',
    meeting_weekdays: row.meeting_weekdays ? [...row.meeting_weekdays] : [],
    meeting_start_time: row.meeting_start_time || '',
    meeting_end_time: row.meeting_end_time || '',
    instructor_name: row.instructor_name || '',
    instructor_employee_id: row.instructor_employee_id ?? null,
    allowed_grades: row.allowed_grades ? [...row.allowed_grades] : [],
  }
  editingDm.value = { dm_url: row.dm_url ?? null, dm_pages: row.dm_pages ?? null }
  dialogVisible.value = true
}

// DM 上傳／移除獨立於 handleSave：上傳元件內已直接呼叫 API 完成，這裡只需同步
// dialog 當前狀態與列表該 row，讓下次開 dialog／列表其他互動看到最新值。
function onDmUpdated(payload: { dm_url: string | null; dm_pages: string[] | null }) {
  editingDm.value = payload
  const row = courses.value.find((c) => c.id === editingId.value)
  if (row) {
    row.dm_url = payload.dm_url
    row.dm_pages = payload.dm_pages
  }
}

async function handleSave() {
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫課程名稱和價格')
  }
  // Phase 3 前端驗證：與後端 Pydantic validator 同步
  const f = form.value
  if (f.meeting_start_time && f.meeting_end_time && f.meeting_start_time >= f.meeting_end_time) {
    return ElMessage.warning('上課起始時刻必須早於結束時刻')
  }
  // 後端期望 time field 為 "HH:MM" 字串或 null
  const payload = {
    ...f,
    // 排序去重後送出；空陣列送 null（後端 [] 與 null 皆收斂為 NULL=未定）
    meeting_weekdays: f.meeting_weekdays.length
      ? [...new Set(f.meeting_weekdays)].sort((a, b) => a - b)
      : null,
    meeting_start_time: f.meeting_start_time || null,
    meeting_end_time: f.meeting_end_time || null,
    instructor_name: f.instructor_name || null,
    // 空陣列送 null（後端 [] 與 null 皆正規化為 NULL=不限，取語意明確者）
    allowed_grades: f.allowed_grades.length ? f.allowed_grades : null,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateCourse(editingId.value, payload)
      ElMessage.success('課程更新成功')
    } else {
      // 帶上 selector 選定學期：否則後端缺省成當前學期，非當前學期新增會「消失」
      // 並污染當前學期資料（與 fetchCourses 同樣以 termStore 查詢對齊）
      await createCourse({
        ...payload,
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
      ElMessage.success('課程新增成功')
    }
    dialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Course) {
  try {
    await ElMessageBox.confirm(`確定要停用課程「${row.name}」嗎？`, '確認停用', {
      type: 'warning',
      confirmButtonText: '確定停用',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deleteCourse(row.id)
    ElMessage.success('課程已停用')
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '停用失敗')
  } finally {
    deletingId.value = null
  }
}

// 手動觸發候補過期掃描（排程備援；後端冪等，重複執行安全）
const sweeping = ref(false)
async function handleSweepExpired() {
  try {
    await ElMessageBox.confirm(
      '將刪除逾期未確認的候補轉正、依序遞補下一位，並補發 24h／6h 提醒（與排程掃描結果相同）。確定執行？',
      '掃描過期候補',
      { type: 'warning', confirmButtonText: '執行掃描' },
    )
  } catch {
    return
  }
  sweeping.value = true
  try {
    const res = await sweepExpiredWaitlist()
    const { expired, reminded, final_reminded } = res.data
    ElMessage.success(
      `掃描完成：逾期釋出 ${expired} 筆、寄出提醒 ${reminded + final_reminded} 筆`,
    )
    fetchCourses()
  } catch (e) {
    ElMessage.error(friendlyError('候補過期掃描失敗', e))
  } finally {
    sweeping.value = false
  }
}

onMounted(() => {
  fetchCourses()
  fetchEmployeeOptions()
})
</script>

<style scoped>
.activity-courses { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar__actions { display: flex; gap: 8px; align-items: center; }
.pending-occupancy-hint { font-size: 11px; color: var(--el-color-warning); line-height: 1.2; }
.pending-occupancy-hint--waitlist { color: var(--el-color-info); }
/* 待審候補的補充說明另起一行：欄寬僅 140px，與人數擠同一行會斷得難讀 */
.pending-occupancy-hint__note { display: block; font-size: 10px; }
.grade-tag { margin: 1px 4px 1px 0; }
.dm-hint-create { font-size: 12px; color: var(--text-tertiary); }

/* 容量佔位名單 Drawer：仿 el-table 外觀的可拖拉列表（el-table 不支援列拖拉，
   改以 vuedraggable + flex 列自繪）；正式（佔位）／候補分兩區、跨區可拖 */
.roster-body { min-height: 120px; }
.roster-hint { margin: 0 0 12px; font-size: 12px; color: var(--text-tertiary, #909399); }
.roster-table {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
}
.roster-table__head,
.roster-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}
.roster-table__head {
  background: var(--el-fill-color-light);
  font-weight: 600;
  color: var(--text-secondary, #606266);
}
.roster-section-label {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9, #f0f9eb);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.roster-section-label--wait {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9, #fdf6ec);
  border-top: 1px solid var(--el-border-color-lighter);
}
/* 空區維持可放置的落點高度（如把唯一佔位生拖去候補後，佔位區仍需能拖回） */
.roster-list:empty {
  min-height: 36px;
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 6px,
      var(--el-fill-color-light) 6px,
      var(--el-fill-color-light) 12px
    );
}
.roster-row { background: var(--el-bg-color); user-select: none; }
.roster-row:last-child { border-bottom: none; }
.roster-row--draggable { cursor: grab; }
.roster-row--draggable:active { cursor: grabbing; }
.roster-row--ghost { opacity: 0.5; background: var(--el-color-primary-light-9); }
.roster-col--pos { width: 48px; text-align: center; flex-shrink: 0; }
.roster-col--name { flex: 1; min-width: 0; padding: 0 8px; }
.roster-col--class { width: 90px; flex-shrink: 0; }
.roster-col--status { width: 100px; text-align: center; flex-shrink: 0; }
</style>

<style>
/* 升位 dialog 內容（append-to-body 脫離 scoped 範圍，維持 global；
   backdrop/modal 外殼已改用 el-dialog，僅保留內文樣式） */
.promote-modal__body {
  font-size: 14px;
  color: var(--text-regular, #606266);
  line-height: 1.6;
  margin: 0;
}
.promote-modal__error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-color-danger, #f56c6c);
}

/* 課程顯示順序對話框：同樣是 el-table 無法列拖拉，沿用 vuedraggable + flex 列 */
.sort-list {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  max-height: 50vh;
  overflow-y: auto;
}
.sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  font-size: 13px;
  user-select: none;
}
.sort-row:last-child { border-bottom: none; }
.sort-row--ghost { opacity: 0.5; background: var(--el-color-primary-light-9); }
/* 只有握把可拖：整列可拖時使用者容易誤觸而不自覺改動前台順序 */
.sort-row__handle { color: var(--text-tertiary, #909399); cursor: grab; display: flex; }
.sort-row__handle:active { cursor: grabbing; }
.sort-row__handle--off { cursor: not-allowed; opacity: 0.5; }
.sort-row__pos {
  width: 28px;
  text-align: center;
  flex-shrink: 0;
  color: var(--text-tertiary, #909399);
}
.sort-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sort-row__price { flex-shrink: 0; color: var(--text-regular, #606266); }
</style>
