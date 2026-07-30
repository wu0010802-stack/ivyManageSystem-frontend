<template>
  <div class="public-query-page">
    <!-- SVG Sprite（與報名頁同語彙的 lucide 線稿；取代 emoji 標題 icon） -->
    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
      <symbol id="q-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></symbol>
      <symbol id="q-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></symbol>
      <symbol id="q-star" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M11.05 2.6a1 1 0 0 1 1.9 0l1.93 4.53 4.9.42a1 1 0 0 1 .59 1.75l-3.72 3.23 1.12 4.8a1 1 0 0 1-1.55 1.06L12 15.9l-4.22 2.5a1 1 0 0 1-1.55-1.07l1.12-4.8-3.72-3.22a1 1 0 0 1 .59-1.75l4.9-.42z" /></symbol>
      <symbol id="q-back" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></symbol>
    </svg>

    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <div class="page-wrapper">
      <header class="page-header">
        <div class="page-brand">
          <img
            src="/LOGO.png"
            alt="常春藤幼兒園"
            class="page-brand-logo"
            width="96"
            height="96"
          />
          <div class="page-brand-text">
            <div class="page-brand-prefix">高雄市私立</div>
            <div class="page-brand-zh">常春藤幼兒園</div>
            <div class="page-brand-en">Ivy Kindergarten</div>
          </div>
        </div>
        <div class="page-meta">
          <h1 class="page-title-main">查詢 / 修改報名資料</h1>
          <div class="page-subtitle">Query &amp; Edit Registration</div>
          <!-- 死巷修正：本頁任何狀態都要有回報名頁的顯式路徑 -->
          <button type="button" class="page-backlink tap-target" @click="goBackToRegistration">
            <svg class="icon" width="14" height="14" aria-hidden="true"><use href="#q-back" /></svg>
            回才藝報名頁
          </button>
        </div>
      </header>

      <!-- 搜尋區 -->
      <section class="search-section">
        <div class="search-box">
          <div class="mode-tabs" role="tablist" @keydown="onTablistKeydown">
            <button
              ref="tokenTabRef"
              type="button"
              role="tab"
              :aria-selected="queryMode === 'token'"
              aria-controls="queryPanelToken"
              :tabindex="queryMode === 'token' ? 0 : -1"
              :class="['mode-tab', { active: queryMode === 'token' }]"
              @click="switchQueryMode('token')"
            >查詢碼 + 手機</button>
            <button
              ref="fieldsTabRef"
              type="button"
              role="tab"
              :aria-selected="queryMode === 'fields'"
              aria-controls="queryPanelFields"
              :tabindex="queryMode === 'fields' ? 0 : -1"
              :class="['mode-tab', { active: queryMode === 'fields' }]"
              @click="switchQueryMode('fields')"
            >姓名 + 生日 + 手機</button>
          </div>

          <div v-if="queryMode === 'token'" id="queryPanelToken" role="tabpanel">
            <div class="field-group">
              <label for="searchToken">查詢碼 <span class="required-mark">*</span></label>
              <input
                id="searchToken"
                v-model="queryForm.token"
                type="text"
                class="input-text"
                :class="{ valid: tokenValid, invalid: tokenTouched && !tokenValid }"
                placeholder="請貼上報名後收到的查詢碼"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                enterkeyhint="search"
                aria-required="true"
                @keyup.enter="onQuerySubmit"
                @blur="tokenTouched = true"
              />
              <div v-if="tokenTouched && !tokenValid" class="validation-msg error" role="alert">
                請輸入查詢碼
              </div>
            </div>
            <div class="field-group">
              <label for="searchPhone">家長手機 <span class="required-mark">*</span></label>
              <input
                id="searchPhone"
                v-model="queryForm.parent_phone"
                type="tel"
                class="input-text"
                :class="{ valid: phoneValid, invalid: phoneTouched && !phoneValid }"
                placeholder="09xx-xxx-xxx"
                maxlength="15"
                inputmode="tel"
                autocomplete="tel"
                enterkeyhint="search"
                aria-required="true"
                @keyup.enter="onQuerySubmit"
                @blur="phoneTouched = true"
              />
              <div v-if="phoneTouched && !phoneValid" class="validation-msg error" role="alert">
                請輸入 09 開頭的 10 碼手機號碼
              </div>
            </div>
          </div>

          <div v-else id="queryPanelFields" role="tabpanel">
            <div class="field-group">
              <label for="searchName">幼兒姓名 <span class="required-mark">*</span></label>
              <input
                id="searchName"
                v-model="queryForm.name"
                type="text"
                class="input-text"
                :class="{ valid: nameValid, invalid: nameTouched && !nameValid }"
                placeholder="請輸入幼兒姓名"
                autocomplete="off"
                enterkeyhint="search"
                aria-required="true"
                @keyup.enter="onQuerySubmit"
                @blur="nameTouched = true"
              />
              <div v-if="nameTouched && !nameValid" class="validation-msg error" role="alert">請輸入幼兒姓名</div>
            </div>
            <div class="field-group">
              <label for="searchBirthday">幼兒生日 <span class="required-mark">*</span></label>
              <input
                id="searchBirthday"
                v-model="queryForm.birthday"
                type="date"
                class="input-text"
                :class="{ valid: birthdayValid, invalid: birthdayTouched && !birthdayValid }"
                aria-required="true"
                @blur="birthdayTouched = true"
              />
              <div v-if="birthdayTouched && !birthdayValid" class="validation-msg error" role="alert">
                {{ birthdayErrorMsg }}
              </div>
            </div>
            <div class="field-group">
              <label for="searchPhoneFields">家長手機 <span class="required-mark">*</span></label>
              <input
                id="searchPhoneFields"
                v-model="queryForm.parent_phone"
                type="tel"
                class="input-text"
                :class="{ valid: phoneValid, invalid: phoneTouched && !phoneValid }"
                placeholder="09xx-xxx-xxx"
                maxlength="15"
                inputmode="tel"
                autocomplete="tel"
                enterkeyhint="search"
                aria-required="true"
                @keyup.enter="onQuerySubmit"
                @blur="phoneTouched = true"
              />
              <div v-if="phoneTouched && !phoneValid" class="validation-msg error" role="alert">
                請輸入 09 開頭的 10 碼手機號碼
              </div>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-primary btn-block"
            :disabled="queryLoading"
            data-test="query-submit"
            @click="onQuerySubmit"
          >
            {{ queryLoading ? '查詢中…' : '查詢 Search' }}
          </button>
        </div>
      </section>

      <section
        v-if="rotatedCredentialRecovery"
        class="credential-recovery"
        role="status"
        aria-live="polite"
      >
        <div>
          <strong>上一筆報名的手機已更新，請保存新查詢碼</strong>
          <p>新手機：{{ rotatedCredentialRecovery.parentPhone }}</p>
          <code>{{ rotatedCredentialRecovery.token }}</code>
        </div>
        <div class="credential-recovery-actions">
          <button type="button" class="btn btn-primary" @click="copyRotatedCredential">
            複製查詢碼
          </button>
          <button type="button" class="btn btn-secondary" @click="clearRotatedCredentialRecovery">
            我已保存
          </button>
        </div>
      </section>

      <!-- #3 a11y：查詢結果與錯誤共用同一 aria-live wrapper，避免結果/錯誤互換時雙重播報 -->
      <div aria-live="polite">
      <section
        v-if="searchError"
        ref="searchErrorRef"
        class="result-section"
        tabindex="-1"
      >
        <div class="error-message">{{ searchError }}</div>
        <div class="not-found-help">
          <div class="not-found-title">常見原因</div>
          <ul class="not-found-list">
            <li>姓名包含全形/半形空格或別字（請與報名表填寫完全一致）</li>
            <li>幼兒生日西元年月日格式錯誤</li>
            <li>家長手機與報名時填寫的不同（如已換號請使用舊號查詢）</li>
            <li>本學期尚未報名，或已由校方取消報名</li>
          </ul>
          <div class="not-found-cta">
            如三項資料皆確認無誤，請於上班時間來電聯繫校方協助查詢。
          </div>
        </div>
      </section>

      <!-- 候補已升正式待確認 -->
      <section v-if="pendingPromotions.length > 0" class="result-section">
        <div class="result-header promotion-header">
          <h2>
            <svg class="icon icon-star" width="20" height="20" aria-hidden="true"><use href="#q-star" /></svg>
            您有候補已升為正式
          </h2>
        </div>
        <div class="info-hint promotion-hint">
          <strong>須於期限前確認：</strong>請於各項目截止時間前完成確認，
          逾期系統將自動釋出給下一位候補。
        </div>
        <div
          v-for="item in pendingPromotions"
          :key="`pending-${item.course_id}`"
          class="promotion-card"
        >
          <div class="promotion-card-header">
            <span class="promotion-course-name">{{ item.name }}</span>
            <span class="promotion-price">${{ item.price }}</span>
          </div>
          <div class="promotion-card-deadline">
            截止：{{ formatDeadline(item.confirm_deadline) }}
            <span class="promotion-countdown">（{{ formatCountdown(item.confirm_deadline) }}）</span>
          </div>
          <div v-if="canMutate && pendingDeclineFor !== item.name" class="promotion-card-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="promotionSubmitting === item.course_id"
              @click="handleConfirmPromotion(item)"
            >
              {{ promotionSubmitting === item.course_id ? '處理中…' : '確認參加' }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="promotionSubmitting === item.course_id"
              @click="requestDeclinePromotion(item.name)"
            >
              放棄此位
            </button>
          </div>
          <!-- 放棄＝不可逆（名額立即釋出），就地二段確認取代 modal -->
          <div
            v-else-if="canMutate"
            class="decline-confirm"
            role="alert"
            data-test="decline-confirm"
          >
            <p class="decline-confirm-text">
              確定放棄「{{ item.name }}」的候補位置？名額將釋出給下一位候補，此動作無法復原。
            </p>
            <div class="decline-confirm-actions">
              <button
                type="button"
                class="btn btn-danger-outline btn-sm"
                :disabled="promotionSubmitting === item.course_id"
                @click="confirmDeclinePromotion(item)"
              >
                {{ promotionSubmitting === item.course_id ? '處理中…' : '確定放棄' }}
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                @click="cancelDeclinePromotion"
              >
                保留候補
              </button>
            </div>
          </div>
          <!-- 資安 #5：三欄查詢（無 token）載入 token-bearing 報名時，候補確認/放棄須改用查詢連結 -->
          <div v-else class="info-hint mutation-locked-hint">
            <svg class="icon icon-lock" width="13" height="13" aria-hidden="true"><use href="#q-lock" /></svg>
            確認 / 放棄候補需使用「報名時取得的查詢連結」。請改用查詢連結開啟本頁，或聯繫校方協助。
          </div>
        </div>
      </section>

      <!-- 結果編輯區 -->
      <section
        v-if="queryResult"
        ref="queryResultRef"
        class="result-section"
        tabindex="-1"
      >
        <div class="result-header">
          <h2>編輯報名資料</h2>
        </div>

        <!-- F5：報名時段非阻斷式提醒（如 48h 內即將截止）；已鎖定時不重複顯示 -->
        <div
          v-if="noticeState && !isEditLocked"
          class="registration-window-notice"
          :class="noticeState.variant"
          role="status"
          data-test="registration-window-notice"
        >
          {{ noticeState.title }}：{{ noticeState.message }}
        </div>

        <!-- 審核中：校方尚未核對就讀資料，課程/班級可能因核對而調整 -->
        <div
          v-if="fieldState.review_state === 'school_review'"
          class="info-hint review-pending-hint"
          role="status"
          data-test="review-pending-hint"
        >
          此報名尚待校方核對就讀資料，課程與班級以校方確認結果為準。
        </div>

        <!-- 已付款完結（含超繳）：整單前台唯讀鎖定，is_paid 由後端即時計算回傳 -->
        <div
          v-if="isPaymentLocked"
          class="info-hint mutation-locked-hint"
          data-test="payment-locked-hint"
        >
          <svg class="icon icon-lock" width="13" height="13" aria-hidden="true"><use href="#q-lock" /></svg>
          此筆報名已完成付款，為保障金流與資料一致性，無法於前台直接修改，如需異動請聯繫校方協助處理。
        </div>
        <!-- F5：報名時段不可修改（已截止／尚未開放／尚未開始，付款鎖定優先於此判斷）；
             文案直接沿用 noticeState，避免不同關閉原因都被誤標成「已截止」 -->
        <div
          v-else-if="isRegistrationWindowClosed"
          class="info-hint mutation-locked-hint"
          data-test="registration-closed-hint"
        >
          <svg class="icon icon-lock" width="13" height="13" aria-hidden="true"><use href="#q-lock" /></svg>
          {{ noticeState?.title }}：{{ noticeState?.message }}
        </div>
        <template v-else>
          <div v-if="canMutate" class="info-hint">
            <strong>提示：</strong>您可以修改以下資料，完成後請點選「儲存修改」按鈕。
          </div>
          <!-- 資安 #5：三欄查詢（無 token）載入 token-bearing 報名時僅供檢視 -->
          <div v-else class="info-hint mutation-locked-hint">
            <svg class="icon icon-lock" width="13" height="13" aria-hidden="true"><use href="#q-lock" /></svg>
            此報名需使用「報名時取得的查詢連結」才能修改。目前查詢僅供檢視；
            如需修改，請改用查詢連結開啟本頁，或聯繫校方協助。
          </div>
        </template>

        <!-- 候補位次摘要：依 queryResult.courses 渲染，不依賴 options 列表 -->
        <div
          v-if="waitlistCourses.length > 0"
          class="waitlist-summary"
          data-test="waitlist-summary"
        >
          <div class="waitlist-summary-title">
            <svg class="icon icon-clock" width="14" height="14" aria-hidden="true"><use href="#q-clock" /></svg>
            候補狀態
          </div>
          <div
            v-for="wc in waitlistCourses"
            :key="wc.course_id"
            class="waitlist-row"
          >
            <span class="waitlist-course-name">{{ wc.name }}</span>
            <span class="badge badge-waitlist">候補中</span>
            <template v-if="wc.waitlist_position != null">
              <span v-if="wc.waitlist_total === 1" class="waitlist-position waitlist-position--solo">
                您是目前唯一候補者
              </span>
              <span v-else class="waitlist-position">
                目前第 <strong>{{ wc.waitlist_position }}</strong> 位
                <span class="waitlist-total">／共 {{ wc.waitlist_total }} 位</span>
                <small v-if="wc.waitlist_position === 1" class="waitlist-hint">
                  您是下一位候補；如有空位將自動通知
                </small>
              </span>
            </template>
          </div>
        </div>

        <!-- 已付款鎖定或報名時段截止：純文字唯讀摘要，不渲染任何表單控制項與動作按鈕 -->
        <div
          v-if="isEditLocked"
          class="payment-locked-summary"
          data-test="payment-locked-summary"
        >
          <div class="field-group">
            <label>幼兒姓名</label>
            <div class="readonly-text">{{ queryResult.name }}</div>
          </div>
          <div class="field-group">
            <label>幼兒生日</label>
            <div class="readonly-text">{{ queryResult.birthday || '—' }}</div>
          </div>
          <div class="field-group">
            <label>寶貝班級</label>
            <div class="readonly-text">{{ queryResult.class_name || '—' }}</div>
          </div>
          <div class="field-group">
            <label>家長手機</label>
            <div class="readonly-text">
              {{ queryResult.parent_phone || activeQueryCredentials?.parent_phone || '—' }}
            </div>
          </div>
          <div class="field-group">
            <label>才藝課班別</label>
            <div v-if="(queryResult.courses || []).length === 0" class="readonly-text">無</div>
            <ul v-else class="readonly-list">
              <li v-for="c in queryResult.courses" :key="c.name">
                {{ c.name }}
                <span v-if="c.price != null" class="price-tag">${{ c.price }}</span>
                <span v-if="c.status === 'waitlist'" class="badge badge-waitlist">候補中</span>
                <span v-else-if="c.status === 'promoted_pending'" class="qty-display is-waiting">
                  已升正式（待確認）
                </span>
              </li>
            </ul>
          </div>
          <div class="field-group">
            <label>舞蹈班代辦品</label>
            <div v-if="lockedSummarySupplies.length === 0" class="readonly-text">無</div>
            <ul v-else class="readonly-list">
              <li v-for="s in lockedSummarySupplies" :key="s.name">
                {{ s.name }}
                <span v-if="s.price != null" class="price-tag">${{ s.price }}</span>
              </li>
            </ul>
          </div>
        </div>

        <template v-else>
        <div
          v-if="!editorReady"
          class="info-hint review-pending-hint"
          role="status"
          data-test="editor-data-status"
        >
          <template v-if="optionsError">無法載入該學期課程資料，請稍後重試。</template>
          <template v-else-if="availabilityError">無法取得該學期名額，請稍後重試。</template>
          <template v-else>正在載入該學期課程與名額，請稍候。</template>
        </div>
        <div class="field-group">
          <label>幼兒姓名</label>
          <template v-if="identityEditable">
            <input v-model="editForm.new_name" type="text" class="input-text" maxlength="50" autocomplete="off" />
            <div class="field-hint">如有誤可直接修正；經校方審核確認後將無法再自行修改</div>
          </template>
          <template v-else>
            <input :value="editForm.new_name" type="text" class="input-text" readonly />
            <div class="field-hint field-hint-locked">
              <span class="field-tag">已完成審核</span>
              如姓名有誤，請聯繫校方協助更正
            </div>
          </template>
        </div>

        <div class="field-group">
          <label>幼兒生日</label>
          <template v-if="identityEditable">
            <input v-model="editForm.new_birthday" type="date" class="input-text" />
            <div class="field-hint">如有誤可直接修正；經校方審核確認後將無法再自行修改</div>
          </template>
          <template v-else>
            <input :value="editForm.new_birthday" type="date" class="input-text" readonly />
            <div class="field-hint field-hint-locked">
              <span class="field-tag">已完成審核</span>
              如生日有誤，請聯繫校方協助更正
            </div>
          </template>
        </div>

        <div class="field-group">
          <label>寶貝班級</label>
          <template v-if="classEditable">
            <select v-model="editForm.class_name" class="input-select">
              <option value="" disabled>請選擇班級</option>
              <option v-for="cls in classes" :key="cls" :value="cls">{{ cls }}</option>
            </select>
            <div class="field-hint">家長填寫班級，校方確認後可能調整</div>
          </template>
          <template v-else>
            <input :value="editForm.class_name" type="text" class="input-text" readonly />
            <div class="field-hint field-hint-locked">
              <span class="field-tag">依園所系統資料</span>
              如班級有誤，請聯繫校方協助調整
            </div>
          </template>
        </div>

        <div class="field-group">
          <label for="editNewPhone">家長手機（如需變更請填寫新號碼）</label>
          <input
            id="editNewPhone"
            v-model="editForm.new_parent_phone"
            type="tel"
            class="input-text"
            :class="{ invalid: newPhoneTouched && !newPhoneValid }"
            placeholder="留空表示不變更"
            maxlength="15"
            inputmode="tel"
            autocomplete="tel"
            @blur="newPhoneTouched = true"
          />
          <div v-if="newPhoneTouched && !newPhoneValid" class="validation-msg error" role="alert">
            請輸入 09 開頭的 10 碼手機號碼
          </div>
        </div>

        <div class="field-group">
          <label>才藝課班別</label>
          <div class="checkbox-group">
            <div v-if="courses.length === 0" class="empty-hint">目前尚無可選課程</div>
            <label
              v-for="course in courses"
              v-else
              :key="course.name"
              class="course-item"
            >
              <input
                type="checkbox"
                :value="course.name"
                :checked="editForm.selectedCourses.includes(course.name)"
                :disabled="
                  (courseLocked(course.name) || course.existing_only)
                    && !editForm.selectedCourses.includes(course.name)
                "
                @change="onToggleCourseOption(course)"
              />
              <span class="course-text">
                {{ course.name }}
                <span class="price-tag">${{ course.price }}</span>
                <span v-if="course.existing_only" class="qty-display is-locked">
                  已停用，僅可取消
                </span>
                <span v-if="statusBadgeFor(course.name)" class="qty-display is-waiting">
                  {{ statusBadgeFor(course.name) }}
                </span>
                <span
                  v-if="courseLocked(course.name) && !editForm.selectedCourses.includes(course.name)"
                  class="qty-display is-locked"
                >
                  已額滿（不開放候補）
                </span>
              </span>
            </label>
          </div>
        </div>

        <div class="field-group">
          <label>舞蹈班代辦品</label>
          <div class="checkbox-group">
            <div v-if="supplies.length === 0" class="empty-hint">目前沒有代辦用品</div>
            <label
              v-for="supply in supplies"
              v-else
              :key="supply.name"
              class="course-item"
            >
              <input
                type="checkbox"
                :value="supply.name"
                :checked="editForm.selectedSupplies.includes(supply.name)"
                :disabled="supply.existing_only && !editForm.selectedSupplies.includes(supply.name)"
                @change="onToggleSupplyOption(supply)"
              />
              <span class="course-text">
                {{ supply.name }}
                <span class="price-tag">${{ supply.price }}</span>
                <span v-if="supply.existing_only" class="qty-display is-locked">
                  已停用，僅可取消
                </span>
              </span>
            </label>
          </div>
        </div>

        <div v-if="feePreview" class="fee-preview" :class="{ 'fee-preview-warn': feePreview.wouldOverpay }">
          <div class="fee-preview-title">費用預覽（估算）</div>
          <dl class="fee-preview-list">
            <div class="fee-row">
              <dt>原應繳</dt>
              <dd>{{ formatCurrency(feePreview.originalTotal) }}</dd>
            </div>
            <div class="fee-row">
              <dt>新應繳</dt>
              <dd>{{ formatCurrency(feePreview.newTotal) }}</dd>
            </div>
            <div class="fee-row">
              <dt>已繳</dt>
              <dd>{{ formatCurrency(feePreview.paidAmount) }}</dd>
            </div>
            <div v-if="feePreview.additionalDue > 0" class="fee-row fee-row-due">
              <dt>需補繳</dt>
              <dd>{{ formatCurrency(feePreview.additionalDue) }}</dd>
            </div>
            <div v-if="feePreview.wouldOverpay" class="fee-row fee-row-refund">
              <dt>可能退費</dt>
              <dd>{{ formatCurrency(feePreview.refundNeeded) }}</dd>
            </div>
          </dl>
          <div v-if="feePreview.wouldOverpay" class="fee-preview-msg">
            <strong>此修改會產生退費</strong>，無法於前台直接沖帳，請聯繫校方協助處理。
          </div>
          <div v-else class="fee-preview-note">
            * 估算值，候補課程升正式時才會計入應繳。
          </div>
        </div>

        <div class="action-buttons">
          <button type="button" class="btn btn-outline" @click="goBackToRegistration">回報名頁</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="editSubmitting || saveBlocked || !canMutate"
            :title="
              !canMutate
                ? '此報名需使用報名時取得的查詢連結才能修改'
                : !editorReady
                  ? '課程與名額資料尚未就緒，請稍後再試'
                : saveBlocked
                  ? '此修改會產生退費，請聯繫校方'
                  : ''
            "
            @click="handleSaveChanges"
          >
            {{ editSubmitting ? '儲存中…' : '儲存修改 Save' }}
          </button>
        </div>
        </template>
      </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
// 公開頁設計 token 唯一權威（與報名頁共用，禁止頁內重定義同名變數）
import '@/assets/public-theme.css'
import { getPublicBootstrap } from '@/api/activityPublic'
import type { PublicActivityTermParams } from '@/api/activityPublic'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'
import type { QueryResult } from '@/composables/usePublicRegistrationQuery'
import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'
import { useRegistrationWindow, type RegistrationTimeSettings } from '@/composables/useRegistrationWindow'
import { usePromotionActions } from '@/composables/usePromotionActions'
import { toggleArrayItem } from '@/utils/arrayUtils'
// FE-3（2026-06-23 audit）：費用預覽改用全站 canonical 金額格式化（千分位 + NaN→「—」），
// 不再各自 `NT$ {{ x }}`（後端回非數字時會顯示「NT$ NaN」、且無千分位）。
import { formatCurrency } from '@/utils/currency'
import ToastStack from './components/ToastStack.vue'

interface Toast { id: number; message: string; type: string }

interface CourseOption { name: string; price?: string | number; existing_only?: boolean; [key: string]: unknown }
interface SupplyOption { name: string; price?: string | number; existing_only?: boolean; [key: string]: unknown }

const { courses: _courses, supplies: _supplies, classes: _classes, applyOptions } = usePublicActivityOptions()

// 此頁僅需 courses/supplies/classes（不用 videos）。用 bootstrap 單支 GET 取代
// loadOptions 的 4 支並行 GET，削報名尖峰對單 worker 後端的請求放大。
let optionsLoadSeq = 0
const optionsLoading = ref(false)
const optionsError = ref<unknown>(null)
const loadedOptionsTermKey = ref<string | null>(null)

// F5：報名時段守衛。預設 is_open=true → fail-open（比照 parent/views/ActivityView.vue
// 既有先例）：bootstrap 資料回來前，若查到報名不該誤鎖一個實際仍開放的視窗。
const timeInfo = ref<RegistrationTimeSettings>({ is_open: true, open_at: null, close_at: null })
function applyRegistrationTime(data: RegistrationTimeSettings | null | undefined) {
  if (data) timeInfo.value = data
}

function termKey(term?: PublicActivityTermParams): string {
  return term ? `${term.school_year}-${term.semester}` : ''
}

function applyExistingOnlyOptions(existing?: QueryResult) {
  applyOptions({
    courses: (existing?.courses ?? []).map((course) => ({
      name: course.name,
      price: course.price,
      existing_only: true,
    })),
    supplies: (existing?.supplies ?? []).map((supply) => ({
      ...(typeof supply === 'string' ? { name: supply } : supply),
      existing_only: true,
    })),
    classes: existing?.class_name ? [existing.class_name] : [],
    videos: {},
  })
}

async function loadOptions(
  term?: PublicActivityTermParams,
  existing?: QueryResult,
) {
  const seq = ++optionsLoadSeq
  const key = termKey(term)
  loadedOptionsTermKey.value = null
  optionsLoading.value = true
  optionsError.value = null
  // await 前立即清除上一學期 catalog；只留下本報名既有品項且標成僅可取消。
  applyExistingOnlyOptions(existing)
  try {
    const res = await getPublicBootstrap(term)
    if (seq !== optionsLoadSeq) return
    const b = res.data
    applyRegistrationTime(b.registration_time)
    const bootstrapCourses = Array.isArray(b.courses)
      ? [...b.courses] as CourseOption[]
      : []
    const bootstrapSupplies = Array.isArray(b.supplies)
      ? [...b.supplies] as SupplyOption[]
      : []
    const courseNames = new Set(bootstrapCourses.map((c) => c.name))
    const supplyNames = new Set(bootstrapSupplies.map((s) => s.name))

    // 歷史報名的既有品項可能已停用，因此不會出現在該學期 public bootstrap。
    // 仍合併成「僅可取消」選項，避免只改手機時被 UI 靜默從 payload 移除。
    for (const course of existing?.courses ?? []) {
      if (!courseNames.has(course.name)) {
        bootstrapCourses.push({
          name: course.name,
          price: course.price,
          existing_only: true,
        })
      }
    }
    for (const supply of existing?.supplies ?? []) {
      const normalized = typeof supply === 'string' ? { name: supply } : supply
      if (!supplyNames.has(normalized.name)) {
        bootstrapSupplies.push({
          ...normalized,
          existing_only: true,
        })
      }
    }
    applyOptions({
      courses: bootstrapCourses,
      supplies: bootstrapSupplies,
      classes: b.classes,
      videos: b.course_videos,
    })
    loadedOptionsTermKey.value = key
  } catch (err) {
    // 已有較新的學期請求時，舊失敗不得顯示錯誤或污染新結果。
    if (seq !== optionsLoadSeq) return
    optionsError.value = err
    throw err
  } finally {
    if (seq === optionsLoadSeq) optionsLoading.value = false
  }
}
const {
  availability,
  error: availabilityError,
  ready: availabilityReady,
  setTerm: setAvailabilityTerm,
  refresh: refreshAvailability,
  startPolling,
  stopPolling,
} =
  useActivityAvailability()

// 強型別轉換：composable 回傳 unknown[]，view 以強型別 computed 供模板 / 函式使用
const courses = computed(() => _courses.value as CourseOption[])
const supplies = computed(() => _supplies.value as SupplyOption[])
const classes = computed(() => (_classes.value as unknown[]).map(String))

const toasts = ref<Toast[]>([])
let toastSeq = 0
function showToast(message: string, type = 'success', duration = 4500) {
  const id = ++toastSeq
  toasts.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), duration)
}
function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// F4（2026-07-12）：查詢 / 編修草稿 / 費用試算 / 候補動作分別抽至 3 個 composable
// （src/composables/usePublicRegistrationQuery.ts / useRegistrationEditSave.ts /
// usePromotionActions.ts），詳細職責見各檔頂部說明。此檔只保留 options 載入、
// toast、生命週期，其餘綁定名稱與拆分前完全相同，template 不需改動。
const {
  queryMode, queryForm, queryLoading, queryResult, searchError,
  nameTouched, birthdayTouched, phoneTouched, tokenTouched,
  tokenValid, phoneValid, nameValid, birthdayErrorMsg, birthdayValid,
  activeQueryCredentials, activeQueryToken, canMutate, isPaymentLocked, lockedSummarySupplies,
  editForm, statusBadgeFor, waitlistCourses, fieldState, classEditable, identityEditable,
  handleQuery, createHydrationGuard, hydrateResult, refetchCurrent, initFromRoute,
} = usePublicRegistrationQuery({ refreshAvailability, startPolling })

// #3 a11y：查詢完成（成功或失敗）後把 focus 移到結果/錯誤區塊（同目錄
// ActivityPublicView.vue 的 focusFirstError 範式：await nextTick() 待 DOM 更新
// 後再 focus，兩者互斥不會同時渲染，故共用同一組 ref 邏輯即可）。
const searchErrorRef = ref<HTMLElement | null>(null)
const queryResultRef = ref<HTMLElement | null>(null)

async function onQuerySubmit() {
  await handleQuery()
  await nextTick()
  if (searchError.value) {
    searchErrorRef.value?.focus()
  } else if (queryResult.value) {
    queryResultRef.value?.focus()
  }
}

const queryTermKey = computed(() => {
  const data = queryResult.value
  return data && data.school_year != null && data.semester != null
    ? `${data.school_year}-${data.semester}`
    : null
})
const catalogReady = computed(
  () => queryTermKey.value !== null
    && loadedOptionsTermKey.value === queryTermKey.value
    && optionsError.value === null
    && !optionsLoading.value,
)
const editorReady = computed(() => catalogReady.value && availabilityReady.value)

// F5：報名時段守衛。本頁不需要 submitButtonLabel/submitButtonDisabled（無單一
// 送出按鈕語意），僅取 noticeState / isRegistrationOpen；submitting 恆為 false
// （本頁無「送出中」狀態需與時段守衛互斥）。
const { noticeState, isRegistrationOpen } = useRegistrationWindow({
  timeInfo,
  submitting: ref(false),
})
const isRegistrationWindowClosed = computed(() => !isRegistrationOpen.value)
// 已付款鎖定與報名時段截止皆走同一套「唯讀摘要 + 隱藏儲存按鈕」UI pattern。
const isEditLocked = computed(() => isPaymentLocked.value || isRegistrationWindowClosed.value)

let hydratedTermKey = ''
watch(
  () => queryResult.value,
  (data) => {
    if (!data || data.school_year == null || data.semester == null) return
    const term = { school_year: data.school_year, semester: data.semester }
    const nextKey = `${term.school_year}-${term.semester}`
    const termChangedAfterFirstResult = hydratedTermKey !== '' && hydratedTermKey !== nextKey
    hydratedTermKey = nextKey
    // flush:'sync' 確保 hydrateResult 隨後啟動 availability refresh 前，學期已切換。
    setAvailabilityTerm(term)
    if (termChangedAfterFirstResult) void refreshAvailability()
    void loadOptions(term, data).catch((err: unknown) => {
      showToast(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          || '無法載入該學期課程資料',
        'error',
      )
    })
  },
  { flush: 'sync' },
)

// #6：多步表單無離開防護。dirty 判定＝已進入「編輯報名」狀態（有 queryResult
// 且可修改、非已付款鎖定）且 editForm 與最近一次 hydrate 進來的基準值不同。
// flush:'post' 確保 baseline 快照時，hydrateResult（查詢命中／儲存成功後）已
// 同步寫完 editForm.* 才擷取，不會誤把「剛查到、尚未編輯」判定成 dirty。
const editFormBaseline = ref('')
watch(
  () => queryResult.value,
  (data) => {
    editFormBaseline.value = data ? JSON.stringify(editForm) : ''
  },
  { flush: 'post' },
)
const isEditingRegistration = computed(
  () => !!queryResult.value && canMutate.value && !isPaymentLocked.value,
)
const isEditFormDirty = computed(
  () => isEditingRegistration.value && JSON.stringify(editForm) !== editFormBaseline.value,
)
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isEditFormDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

const {
  editSubmitting, newPhoneTouched, newPhoneValid,
  rotatedCredentialRecovery, clearRotatedCredentialRecovery,
  estimatedCourseStatus, courseLocked, onToggleCourse,
  feePreview, saveBlocked, handleSaveChanges,
} = useRegistrationEditSave({
  editForm,
  queryResult,
  queryForm,
  activeQueryCredentials,
  activeQueryToken,
  courses,
  supplies,
  availability,
  editorReady,
  isRegistrationOpen,
  timeInfo,
  createHydrationGuard,
  hydrateResult,
  refetchCurrent,
  showToast,
})

function onToggleCourseOption(course: CourseOption) {
  if (course.existing_only && !editForm.selectedCourses.includes(course.name)) return
  if (!editorReady.value && !queryResult.value?.courses?.some((c) => c.name === course.name)) return
  onToggleCourse(course.name)
}

function onToggleSupplyOption(supply: SupplyOption) {
  if (supply.existing_only && !editForm.selectedSupplies.includes(supply.name)) return
  toggleArrayItem(editForm.selectedSupplies, supply.name)
}

async function copyRotatedCredential() {
  const token = rotatedCredentialRecovery.value?.token
  if (!token) return
  try {
    await navigator.clipboard.writeText(token)
    showToast('新查詢碼已複製')
  } catch {
    showToast('無法自動複製，請手動選取查詢碼', 'error')
  }
}
// estimatedCourseStatus 未在 template 直接使用（內部由 feePreview 消費），但既有測試
// 透過 wrapper.vm.estimatedCourseStatus 檢視估算結果，需維持頂層綁定；void 只為滿足
// noUnusedLocals，不影響 runtime（wrapper.vm 存取不受此列是否「被使用」影響）。
void estimatedCourseStatus

const {
  pendingPromotions, promotionSubmitting,
  formatDeadline, formatCountdown,
  handleConfirmPromotion, handleDeclinePromotion,
} = usePromotionActions({
  queryResult,
  activeQueryCredentials,
  activeQueryToken,
  refetchCurrent,
  createHydrationGuard,
  hydrateResult,
  showToast,
})

// 死巷修正（critique 2026-07-28）：本頁由報名頁 router.push 同窗導入或 LINE
// 直開，皆非 script 開窗——舊 window.close() 會靜默失敗，按鈕形同虛設。
// 改為顯式導回報名頁；編輯中有未存異動時沿用 beforeunload 同語意先確認。
const router = useRouter()
function goBackToRegistration() {
  if (isEditFormDirty.value && !window.confirm('尚有未儲存的修改，確定要離開嗎？')) return
  router.push({ name: 'public-activity' })
}

// 放棄候補＝不可逆（名額立即釋出給下一位），加一層就地二段確認，不用 modal。
// 以 name 當 pending key（course_id 契約上可為 undefined，name 恆存在）
const pendingDeclineFor = ref<string | null>(null)
function requestDeclinePromotion(courseName: string) {
  pendingDeclineFor.value = courseName
}
function cancelDeclinePromotion() {
  pendingDeclineFor.value = null
}
async function confirmDeclinePromotion(item: Parameters<typeof handleDeclinePromotion>[0]) {
  pendingDeclineFor.value = null
  await handleDeclinePromotion(item)
}

// mode-tabs 完整 ARIA tabs 鍵盤語意：roving tabindex + 左右鍵切換
const tokenTabRef = ref<HTMLButtonElement | null>(null)
const fieldsTabRef = ref<HTMLButtonElement | null>(null)
function switchQueryMode(mode: 'token' | 'fields') {
  queryMode.value = mode
  void nextTick(() => {
    ;(mode === 'token' ? tokenTabRef : fieldsTabRef).value?.focus()
  })
}
function onTablistKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  switchQueryMode(queryMode.value === 'token' ? 'fields' : 'token')
}

onMounted(async () => {
  initFromRoute()
  // #6：離開防護；handleBeforeUnload 內部依 isEditFormDirty 判斷，非編輯中或
  // 無異動時直接放行，不需要動態掛載/移除監聽。
  window.addEventListener('beforeunload', handleBeforeUnload)
  try {
    // 僅載入課程/用品/班級選項；availability 輪詢延到查詢命中、進入編輯介面才啟動
    // （ensureAvailabilityPolling，於 hydrateResult），查詢階段不輪詢。
    await loadOptions()
  } catch (err) {
    showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '無法載入頁面資料', 'error')
  }
})

onBeforeUnmount(() => {
  stopPolling()
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
/* 設計 token 一律來自 assets/public-theme.css（公開頁唯一權威，於 <script> import；
   曾經頁內複製一份而長期漂移成整套冷灰＋橙 CTA，critique 2026-07-28 判 P1），
   此處只保留本頁私有的布局值。 */
.public-query-page {
  min-height: 100vh;
  padding: clamp(12px, 3vw, 20px);
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.public-query-page *, .public-query-page *::before, .public-query-page *::after { box-sizing: border-box; }

.page-wrapper {
  max-width: 900px;
  margin: 0 auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.page-header {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  align-items: center;
  margin: 0;
  padding: var(--space-6) var(--space-8);
  background: #fff;
  border-bottom: 1px solid var(--color-border);
}
.page-brand {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin: 0;
  padding-right: var(--space-8);
  border-right: 1px solid var(--color-border);
}
.page-brand-logo {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  object-fit: contain;
  user-select: none;
}
.page-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.page-brand-prefix {
  font-size: var(--fs-sm);
  letter-spacing: 0.4em;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}
.page-brand-zh {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--color-text);
  line-height: 1.15;
}
.page-brand-en {
  font-size: var(--fs-sm);
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-top: 4px;
}
.page-meta {
  min-width: 0;
}
.page-title-main {
  margin: 0;
  font-size: clamp(20px, 3vw, 24px);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.page-subtitle {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  margin-top: var(--space-1);
}

/* 回報名頁：text-link 視覺（不與查詢主 CTA 搶重量） */
.page-backlink {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--space-2);
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}
.page-backlink:hover { background: var(--color-primary-soft); }
.page-backlink .icon { flex-shrink: 0; }

.search-section {
  padding: var(--space-6) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}
.search-box { max-width: 520px; margin: 0 auto; }

.mode-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  padding: 4px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-md);
}
.mode-tab {
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.mode-tab.active {
  color: var(--color-primary);
  background: var(--color-surface);
  border-color: var(--color-primary);
}
.mode-tab:not(.active):hover { background: var(--color-surface); }

.credential-recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin: var(--space-5) var(--space-6) 0;
  padding: var(--space-4);
  color: #78350f;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
}
.credential-recovery p { margin: var(--space-1) 0; }
.credential-recovery code {
  display: inline-block;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--color-text);
}
.credential-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-shrink: 0;
}

.result-section { padding: var(--space-6); }

.result-header {
  background: var(--color-primary);
  color: #fff;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
.result-header h2 { margin: 0; font-size: var(--fs-lg); }

.info-hint {
  background: var(--color-surface-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}
/* sprite icon 對齊行內文字（取代 emoji 後的基線調整） */
.info-hint .icon-lock,
.waitlist-summary-title .icon-clock {
  vertical-align: -2px;
  margin-right: 4px;
}
.promotion-header h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.promotion-header .icon-star { color: var(--ivy-crown-gold); flex-shrink: 0; }

/* 放棄候補的就地二段確認 */
.decline-confirm {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-danger-soft);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: var(--radius-md);
}
.decline-confirm-text {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-sm);
  color: var(--color-text);
  line-height: 1.6;
}
.decline-confirm-actions { display: flex; gap: var(--space-3); }
.btn-danger-outline {
  background: var(--color-surface);
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.btn-danger-outline:hover:not(:disabled) {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}

/* F5：報名時段非阻斷式提醒（48h 內即將截止等），比照 ActivityPublicView.vue 的 .notice */
.registration-window-notice {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid rgba(217, 119, 6, 0.35);
  background-color: var(--color-warning-soft);
  font-size: var(--fs-sm);
  margin-bottom: var(--space-4);
}
.registration-window-notice.is-warning {
  border-color: rgba(217, 119, 6, 0.35);
  background-color: var(--color-warning-soft);
  color: var(--color-warning-darker);
}
.registration-window-notice.is-danger {
  border-color: rgba(220, 38, 38, 0.35);
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}

.field-group { margin-bottom: var(--space-4); }
.field-group label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.required-mark { color: var(--color-required); font-weight: 700; }

.input-text, .input-select {
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  font-family: inherit;
  font-size: var(--fs-md);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.input-text:focus, .input-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.input-text:read-only { background-color: var(--color-surface-readonly); color: var(--color-text-muted); }
.input-text.valid { border-color: var(--color-success); }
.input-text.invalid { border-color: var(--color-danger); }
.validation-msg { font-size: var(--fs-xs); margin-top: var(--space-1); }
.validation-msg.error { color: var(--color-danger); }

.input-select {
  padding-right: 36px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234B5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 320px;
  overflow-y: auto;
  padding: var(--space-3);
  background: var(--color-surface-readonly);
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-md);
}
.course-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}
.course-item:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.course-item:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.course-item input[type="checkbox"] {
  flex-shrink: 0;
  margin-top: 3px;
  width: 18px; height: 18px;
  accent-color: var(--color-primary);
}
.course-text {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.price-tag { color: var(--color-text-subtle); font-size: var(--fs-sm); font-weight: 500; }
.qty-display {
  font-weight: 600;
  font-size: var(--fs-xs);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-warning-soft);
  color: var(--color-warning-darker);
}

.empty-hint {
  padding: var(--space-5);
  color: var(--color-text-subtle);
  font-size: var(--fs-sm);
  text-align: center;
  background-color: var(--color-surface-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: 12px 20px;
  font-family: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
  border: 1.5px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
  white-space: nowrap;
}
.btn-block { width: 100%; margin-top: var(--space-3); }
.btn-primary {
  background-color: var(--color-cta);
  color: var(--color-cta-contrast);
  border-color: var(--color-cta);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
}
.btn-primary:disabled { background-color: var(--neutral-300); border-color: var(--neutral-300); color: var(--text-secondary); cursor: not-allowed; box-shadow: none; }
.btn-outline {
  background: var(--color-surface);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-outline:hover { background: var(--color-primary); color: var(--color-primary-contrast); }

.action-buttons {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--color-border);
}
.action-buttons .btn { flex: 1; max-width: 240px; }

/* 候補升正式待確認區塊 */
.result-header.promotion-header {
  background: var(--color-warning-hover);
}
.info-hint.promotion-hint {
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
  color: var(--color-warning-darker);
}
.promotion-card {
  background: var(--color-surface);
  border: 1.5px solid #f59e0b;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.promotion-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}
.promotion-course-name { font-weight: 700; font-size: var(--fs-md); color: var(--color-text); }
.promotion-price { color: var(--color-text-muted); font-size: var(--fs-sm); }
.promotion-card-deadline {
  font-size: var(--fs-sm);
  color: var(--color-warning);
  margin-bottom: var(--space-3);
}
.promotion-countdown { font-weight: 600; }
.promotion-card-actions {
  display: flex;
  gap: var(--space-3);
}
.btn.btn-sm {
  min-height: 44px;
  padding: 8px 16px;
  font-size: var(--fs-sm);
  flex: 1;
}

.error-message {
  background: var(--color-danger-soft);
  /* full border + tint，對齊報名頁的 side-stripe ban（不用單側粗邊） */
  border: 1px solid rgba(220, 38, 38, 0.35);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-weight: 500;
}

/* 查無結果引導 */
.not-found-help {
  margin-top: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.not-found-title {
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.not-found-list {
  margin: 0 0 var(--space-3);
  padding-left: 20px;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.7;
}
.not-found-cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}
.contact-link {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
}
.contact-link:hover { text-decoration: underline; }

/* 班級欄位提示 */
.field-hint {
  margin-top: var(--space-1);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
}
.field-hint-locked {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.field-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: var(--radius-full);
}

/* 已付款鎖定：純文字唯讀摘要 */
.readonly-text {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  font-size: var(--fs-md);
  color: var(--color-text-muted);
  background: var(--color-surface-readonly);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
}
.readonly-list {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  list-style: none;
  background: var(--color-surface-readonly);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
}
.readonly-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: var(--space-1) 0;
  font-size: var(--fs-md);
  color: var(--color-text-muted);
}

/* 候補位次摘要 */
.waitlist-summary {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: #fff7e6;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
}
.waitlist-summary-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #92400e;
  margin-bottom: var(--space-2);
}
.waitlist-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px dashed #f59e0b;
}
.waitlist-row:first-of-type { border-top: none; }
.waitlist-course-name {
  font-weight: 600;
  font-size: var(--fs-sm);
  color: var(--color-text);
  margin-right: var(--space-1);
}
.badge-waitlist {
  background: #fef3c7;
  color: #b45309;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
}
.waitlist-position {
  font-size: var(--fs-sm);
  color: var(--color-text);
}
.waitlist-position strong {
  font-weight: 700;
  color: var(--color-warning);
}
.waitlist-position--solo {
  font-weight: 600;
  color: #92400e;
}
.waitlist-total {
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
}
.waitlist-hint {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--color-primary);
  font-weight: 500;
}

/* 費用預覽 */
.fee-preview {
  margin-top: var(--space-5);
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.fee-preview-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-3);
}
.fee-preview-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.fee-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
.fee-row dt { margin: 0; font-weight: 500; }
.fee-row dd { margin: 0; font-variant-numeric: tabular-nums; }
.fee-row-due dt, .fee-row-due dd {
  color: var(--color-cta);
  font-weight: 700;
}
.fee-row-refund dt, .fee-row-refund dd {
  color: var(--color-danger);
  font-weight: 700;
}
.fee-preview-warn {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
}
.fee-preview-msg {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-danger);
  font-size: var(--fs-sm);
  color: var(--color-danger);
  line-height: 1.6;
}
.fee-preview-note {
  margin-top: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
}

@media (--to-md) {
  .page-header {
    grid-template-columns: 1fr;
    gap: var(--space-5);
    padding: var(--space-5);
  }
  .page-brand {
    padding-right: 0;
    padding-bottom: var(--space-5);
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
@media (--to-sm) {
  .public-query-page { padding: 0; }
  .page-wrapper { border-radius: 0; box-shadow: none; }
  .page-brand { gap: var(--space-4); padding-bottom: var(--space-4); }
  .page-brand-logo { width: 72px; height: 72px; }
  .page-brand-prefix { font-size: var(--fs-xs); letter-spacing: 0.3em; }
  .action-buttons { flex-direction: column; }
  .action-buttons .btn { max-width: none; }
}
</style>
