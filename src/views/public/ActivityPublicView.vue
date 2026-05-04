<template>
  <div class="public-activity-page">
    <!-- SVG Sprite -->
    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
      <symbol id="i-school" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m4 6 8-4 8 4" /><path d="m18 10 4 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3l4-2" /><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4" /><path d="M18 5v17" /><path d="M6 5v17" /><circle cx="12" cy="9" r="2" />
      </symbol>
      <symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></symbol>
      <symbol id="i-mail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></symbol>
      <symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></symbol>
      <symbol id="i-message" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></symbol>
      <symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></symbol>
      <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></symbol>
      <symbol id="i-play" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3" /></symbol>
      <symbol id="i-form" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></symbol>
    </svg>

    <!-- Toast Container -->
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        :role="t.type === 'error' ? 'alert' : 'status'"
      >
        <div class="toast-icon" v-html="TOAST_ICONS[t.type] || TOAST_ICONS.info" />
        <div class="toast-content">
          <div class="toast-message">{{ t.message }}</div>
        </div>
        <button type="button" class="toast-close" aria-label="關閉通知" @click="dismissToast(t.id)">&times;</button>
      </div>
    </div>

    <!-- Video Modal -->
    <div
      v-if="videoModal.visible"
      class="modal-overlay is-visible"
      role="dialog"
      aria-modal="true"
      @click.self="closeVideoModal"
    >
      <div class="modal-panel modal-panel--video">
        <h3 class="modal-title">{{ videoModal.title }}</h3>
        <button type="button" class="modal-close" aria-label="關閉影片" @click="closeVideoModal">
          <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
        <div class="video-wrapper">
          <iframe
            v-if="videoModal.youtubeId"
            :src="`https://www.youtube.com/embed/${videoModal.youtubeId}?autoplay=1`"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            height="480"
          />
          <video v-else-if="videoModal.url" :src="videoModal.url" controls autoplay>
            您的瀏覽器不支援影片播放
          </video>
        </div>
      </div>
    </div>

    <!-- Success Modal -->
    <div
      v-if="successModal.visible"
      class="modal-overlay is-visible"
      role="dialog"
      aria-modal="true"
      aria-labelledby="successModalTitle"
      @click.self="closeSuccessModal"
    >
      <div class="modal-panel modal-panel--success">
        <div class="modal-header">
          <h3 id="successModalTitle" class="modal-title">
            <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-check" /></svg>
            報名資料已送出
          </h3>
          <button type="button" class="modal-close" aria-label="關閉視窗" @click="closeSuccessModal">
            <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="success-msg">{{ successModal.message }}</p>

          <div class="summary-block">
            <div class="summary-row"><span class="summary-label">幼兒姓名</span><span class="summary-value">{{ successModal.studentName }}</span></div>
            <div class="summary-row"><span class="summary-label">家長手機</span><span class="summary-value">{{ successModal.parentPhone }}</span></div>
          </div>

          <div v-if="successModal.enrolledCourses.length > 0" class="summary-section">
            <div class="summary-section-title">
              <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-check" /></svg>
              已報名課程（{{ successModal.enrolledCourses.length }}）
            </div>
            <ul class="summary-list">
              <li v-for="c in successModal.enrolledCourses" :key="`e-${c.name}`">
                <span>{{ c.name }}</span><span class="summary-amount">${{ c.price }}</span>
              </li>
            </ul>
          </div>

          <div v-if="successModal.waitlistCourses.length > 0" class="summary-section is-waitlist">
            <div class="summary-section-title">
              <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-alert" /></svg>
              候補課程（{{ successModal.waitlistCourses.length }}）
            </div>
            <ul class="summary-list">
              <li v-for="c in successModal.waitlistCourses" :key="`w-${c.name}`">
                <span>{{ c.name }}</span><span class="summary-amount summary-amount--muted">候補中</span>
              </li>
            </ul>
            <p class="summary-note">候補課程不計入應繳金額，校方將儘快與您聯繫。</p>
          </div>

          <div v-if="successModal.selectedSupplies.length > 0" class="summary-section">
            <div class="summary-section-title">加購項目</div>
            <ul class="summary-list">
              <li v-for="s in successModal.selectedSupplies" :key="`s-${s.name}`">
                <span>{{ s.name }}</span><span class="summary-amount">${{ s.price }}</span>
              </li>
            </ul>
          </div>

          <div class="summary-total">
            <span>預估應繳金額</span>
            <strong>${{ successModal.totalAmount }}</strong>
          </div>
          <p class="summary-final-note">本金額不含候補課程；實際金額以園方確認後通知為準。</p>

          <div v-if="successModal.queryToken" class="success-token-box">
            <div class="token-title">查詢 / 編修專用連結</div>
            <p class="token-hint">
              請<strong>妥善保存以下查詢碼</strong>，後續查詢或修改報名資料時可免去輸入姓名/生日，僅需查詢碼 + 家長手機。
            </p>
            <div class="token-row">
              <span class="token-label">查詢碼</span>
              <code class="token-value">{{ successModal.queryToken }}</code>
              <button
                type="button"
                class="btn-copy"
                @click="copyToClipboard(successModal.queryToken, '查詢碼')"
              >複製</button>
            </div>
            <div class="token-row">
              <span class="token-label">編修連結</span>
              <a class="token-link" :href="successModal.editUrl" target="_blank" rel="noopener">
                {{ successModal.editUrl }}
              </a>
              <button
                type="button"
                class="btn-copy"
                @click="copyToClipboard(successModal.editUrl, '連結')"
              >複製</button>
            </div>
            <div v-if="successModal.copyHint" class="token-copy-hint">{{ successModal.copyHint }}</div>
            <p class="token-warn">⚠ 連結含個資識別碼，請勿轉傳他人。</p>
          </div>

          <button type="button" class="btn btn-primary btn-block" @click="closeSuccessModal">完成</button>
        </div>
      </div>
    </div>

    <!-- Contact Modal -->
    <div
      v-if="contactModalVisible"
      class="modal-overlay is-visible"
      role="dialog"
      aria-modal="true"
      @click.self="closeContactModal"
    >
      <div class="modal-panel">
        <div class="modal-header">
          <h3 class="modal-title">
            <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-phone" /></svg>
            聯絡主辦單位
          </h3>
          <button type="button" class="modal-close" aria-label="關閉視窗" @click="closeContactModal">
            <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="contact-school-card">
            <h4 class="contact-school-name">
              <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-school" /></svg>
              常春藤義華校
            </h4>
            <div class="contact-school-detail">
              <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-pin" /></svg>
              高雄市三民區義華路 68 號
            </div>
            <div class="contact-school-detail">
              <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-phone" /></svg>
              電話：<a href="tel:+88673928366">(07) 392-8366</a>
            </div>
          </div>
          <div class="contact-form-intro">
            <svg class="icon" width="18" height="18" aria-hidden="true"><use href="#i-mail" /></svg>
            您也可以透過以下表單留下問題，我們會儘快與您聯繫
          </div>
          <div class="field-group">
            <label for="contactName">您的姓名 <span class="required-mark">*</span></label>
            <input
              id="contactName"
              v-model="inquiry.name"
              type="text"
              class="input-text"
              placeholder="請輸入您的姓名"
              maxlength="50"
              autocomplete="name"
            />
          </div>
          <div class="field-group">
            <label for="contactPhone">聯絡電話 <span class="required-mark">*</span></label>
            <input
              id="contactPhone"
              v-model="inquiry.phone"
              type="tel"
              class="input-text"
              placeholder="請輸入手機號碼 (09xxxxxxxx)"
              inputmode="tel"
              autocomplete="tel"
              maxlength="15"
            />
          </div>
          <div class="field-group">
            <label for="contactQuestion">您的問題 <span class="required-mark">*</span></label>
            <textarea
              id="contactQuestion"
              v-model="inquiry.question"
              placeholder="請輸入您要詢問的問題"
              rows="4"
            />
          </div>
          <button
            type="button"
            class="btn btn-primary btn-block"
            :disabled="inquirySubmitting"
            @click="handleContactSubmit"
          >
            {{ inquirySubmitting ? '送出中…' : '送出提問' }}
          </button>
        </div>
      </div>
    </div>

    <div class="page-wrapper">
      <header class="page-header">
        <div class="page-header-main">
          <div class="page-title-line1">IVY AFTER-SCHOOL ARTS PROGRAM</div>
          <h1 class="page-title-line2">{{ displayTitle }}</h1>
        </div>
        <aside class="page-header-side" aria-label="本期活動資訊">
          <div class="badge-term">{{ displayTermLabel }}</div>
          <div v-if="displayEventDate" class="header-meta-item">
            <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-calendar" /></svg>
            <span>活動日期：{{ displayEventDate }}</span>
          </div>
          <div v-if="displayAudience" class="header-meta-note">對象：{{ displayAudience }}</div>
        </aside>
      </header>

      <main class="page-body">
        <!-- Registration Time Notice -->
        <div
          v-if="noticeState"
          class="notice is-visible"
          :class="noticeState.variant"
          role="status"
        >
          <svg class="notice-icon" width="24" height="24" aria-hidden="true"><use href="#i-alert" /></svg>
          <div class="notice-content">
            <div class="notice-title">{{ noticeState.title }}</div>
            <div class="notice-message">{{ noticeState.message }}</div>
          </div>
        </div>

        <!-- 初始化失敗：頁內錯誤 + 重試（避免 toast 一閃但表單空殼） -->
        <div
          v-if="initState === 'error'"
          class="init-error-panel"
          role="alert"
          aria-live="assertive"
        >
          <svg class="notice-icon" width="28" height="28" aria-hidden="true"><use href="#i-alert" /></svg>
          <div class="init-error-content">
            <div class="init-error-title">頁面載入失敗</div>
            <div class="init-error-message">{{ initErrorMessage }}</div>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="retryingInit"
            @click="retryInit"
          >
            {{ retryingInit ? '重新載入中…' : '重新載入' }}
          </button>
        </div>

        <form
          v-else
          novalidate
          @submit.prevent="handleSubmitRegistration"
        >
          <div class="grid-layout">
            <div class="col-left">
              <div class="poster-wrapper" :class="{ 'is-loading': !posterLoaded }">
                <img
                  :src="posterSrc"
                  :alt="`${displayTitle} 活動海報`"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                  @load="onPosterLoad"
                  @error="onPosterError"
                />
              </div>
              <div class="info-box">
                <p class="info-intro">
                  爸比媽咪：<br />
                  2 ~ 5 歲的孩子對於自我探索的心很強烈，也是孩子成長的重要因素之一，課後才藝就是一個很好的機會哦！<br />
                  孩子和同儕一起互動學習是最開心的時刻，樂在其中的學習也能玩出潛能！讓我們一起發掘孩子的能力吧！
                </p>
                <hr class="info-divider" />
                <ul class="notice-list">
                  <li>本學期課後才藝採線上報名，<strong>額滿為止</strong>。</li>
                  <li>有搭娃娃車的寶貝，上才藝課當天<strong>煩請家長自行接回</strong>。</li>
                  <li>若人數未達最低標準，則不予開課。</li>
                  <li>如因疫情等不可抗力因素停課，將依規定比例退費。</li>
                </ul>
              </div>
            </div>

            <div class="col-right">
              <section class="form-card">
                <div class="form-card-header">
                  <svg class="icon" width="20" height="20" aria-hidden="true"><use href="#i-form" /></svg>
                  <span class="form-card-header-title">{{ displayFormCardTitle }}</span>
                </div>
                <div class="form-card-body">
                  <div class="form-row" :class="{ 'has-error': !!errors.name }">
                    <div class="form-label-col">
                      <label class="form-label" for="studentName">
                        <span class="required-mark">*</span>
                        幼兒姓名 <span class="en">Child's Name</span>
                      </label>
                    </div>
                    <div class="form-input-col">
                      <input
                        id="studentName"
                        v-model="form.name"
                        type="text"
                        class="input-text"
                        :class="{ 'is-invalid': !!errors.name }"
                        :aria-invalid="!!errors.name"
                        :aria-describedby="errors.name ? 'studentName-err' : undefined"
                        placeholder="請輸入幼兒姓名"
                        maxlength="100"
                        autocomplete="off"
                        @input="clearError('name')"
                      />
                      <div v-if="errors.name" id="studentName-err" class="form-error-hint" role="alert">{{ errors.name }}</div>
                    </div>
                  </div>

                  <div class="form-row" :class="{ 'has-error': !!errors.birthday }">
                    <div class="form-label-col">
                      <label class="form-label" for="studentBirthday">
                        <span class="required-mark">*</span>
                        幼兒生日 <span class="en">Birthday</span>
                      </label>
                    </div>
                    <div class="form-input-col">
                      <input
                        id="studentBirthday"
                        v-model="form.birthday"
                        type="date"
                        class="input-text"
                        :class="{ 'is-invalid': !!errors.birthday }"
                        :min="minBirthdayISO"
                        :max="maxBirthdayISO"
                        :aria-invalid="!!errors.birthday"
                        :aria-describedby="errors.birthday ? 'studentBirthday-err' : undefined"
                        @input="clearError('birthday')"
                      />
                      <div v-if="errors.birthday" id="studentBirthday-err" class="form-error-hint" role="alert">{{ errors.birthday }}</div>
                    </div>
                  </div>

                  <div class="form-row" :class="{ 'has-error': !!parentPhoneError }">
                    <div class="form-label-col">
                      <label class="form-label" for="parentPhone">
                        <span class="required-mark">*</span>
                        家長手機 <span class="en">Parent Mobile</span>
                      </label>
                    </div>
                    <div class="form-input-col">
                      <input
                        id="parentPhone"
                        v-model="form.parent_phone"
                        type="tel"
                        class="input-text"
                        :class="{ 'is-invalid': !!parentPhoneError }"
                        :aria-invalid="!!parentPhoneError"
                        :aria-describedby="parentPhoneError ? 'parentPhone-err' : undefined"
                        placeholder="09xx-xxx-xxx"
                        maxlength="15"
                        autocomplete="tel"
                        inputmode="tel"
                        @input="clearError('parent_phone')"
                      />
                      <div v-if="parentPhoneError" id="parentPhone-err" class="form-error-hint" role="alert">{{ parentPhoneError }}</div>
                    </div>
                  </div>

                  <div class="form-row" :class="{ 'has-error': !!errors.class_name }">
                    <div class="form-label-col">
                      <label class="form-label" for="studentClass">
                        <span class="required-mark">*</span>
                        寶貝班級 <span class="en">Class</span>
                      </label>
                    </div>
                    <div class="form-input-col">
                      <select
                        id="studentClass"
                        v-model="form.class_name"
                        class="input-select"
                        :class="{ 'is-invalid': !!errors.class_name }"
                        :aria-invalid="!!errors.class_name"
                        :aria-describedby="errors.class_name ? 'studentClass-err' : undefined"
                        @change="clearError('class_name')"
                      >
                        <option value="" disabled>請選擇班級</option>
                        <option v-for="cls in classes" :key="cls" :value="cls">{{ cls }}</option>
                      </select>
                      <div v-if="errors.class_name" id="studentClass-err" class="form-error-hint" role="alert">{{ errors.class_name }}</div>
                    </div>
                  </div>

                  <div class="form-row" :class="{ 'has-error': !!errors.courses }">
                    <div class="form-label-col">
                      <span class="form-label">
                        <span class="required-mark">*</span>
                        才藝課班別 <span class="en">Courses</span>
                      </span>
                      <span class="form-hint">可複選；剩餘名額即時顯示</span>
                    </div>
                    <div class="form-input-col">
                      <div
                        id="courseListGroup"
                        class="course-list-vertical"
                        role="group"
                        aria-label="才藝課程選項"
                        tabindex="-1"
                      >
                        <div v-if="optionsLoading" class="empty-hint">載入中…</div>
                        <div v-else-if="courses.length === 0" class="empty-hint">目前尚無可報名課程</div>
                        <div
                          v-for="course in courses"
                          v-else
                          :key="course.name"
                          class="course-item"
                          :class="{ 'course-item-disabled': availabilityState(course).full }"
                          :title="availabilityState(course).full ? '此課程已額滿，無法再報名' : ''"
                        >
                          <label class="course-label">
                            <input
                              type="checkbox"
                              name="course"
                              :value="course.name"
                              :disabled="availabilityState(course).full"
                              :checked="form.selectedCourses.includes(course.name)"
                              @change="toggleCourse(course); clearError('courses')"
                            />
                            <span class="course-text">
                              <span class="course-name">{{ course.name }}</span>
                              <span class="price-tag">
                                <template v-if="course.sessions">{{ course.sessions }}堂</template>
                                ${{ course.price }}
                              </span>
                              <span v-if="course.frequency" class="rem-count">{{ course.frequency }}</span>
                              <span
                                v-if="availabilityState(course).text"
                                class="qty-display"
                                :class="availabilityState(course).cssClass"
                              >
                                {{ availabilityState(course).text }}
                              </span>
                            </span>
                          </label>
                          <button
                            v-if="videos[course.name]"
                            type="button"
                            class="video-btn"
                            :aria-label="`觀看 ${course.name} 介紹影片`"
                            @click="openVideoModal(course.name, videos[course.name])"
                          >
                            <svg class="icon" aria-hidden="true"><use href="#i-play" /></svg>
                            課程介紹
                          </button>
                        </div>
                      </div>
                      <div v-if="errors.courses" class="form-error-hint" role="alert">{{ errors.courses }}</div>
                    </div>
                  </div>

                  <div v-if="supplies.length > 0" class="form-row">
                    <div class="form-label-col">
                      <span class="form-label">
                        課程加購項目 <span class="en">Supplies</span>
                      </span>
                      <span class="form-hint">選填</span>
                    </div>
                    <div class="form-input-col">
                      <div class="dance-grid" role="group" aria-label="加購項目">
                        <label v-for="supply in supplies" :key="supply.name" class="course-item supply-item">
                          <input
                            type="checkbox"
                            name="supply"
                            :value="supply.name"
                            :checked="form.selectedSupplies.includes(supply.name)"
                            @change="toggleSupply(supply)"
                          />
                          <span class="course-text">
                            <span class="course-name">{{ supply.name }}</span>
                            <span class="price-tag">${{ supply.price }}</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div class="submit-bar">
                <button
                  type="submit"
                  class="btn btn-primary btn-submit"
                  :disabled="submitButtonDisabled"
                >
                  {{ submitButtonLabel }}
                  <span v-if="isRegistrationOpen && !submitting" class="btn-suffix">Submit</span>
                </button>
              </div>

              <div class="btn-actions-row">
                <button type="button" class="btn btn-outline" @click="goToQuery">
                  <svg class="icon" width="18" height="18" aria-hidden="true"><use href="#i-search" /></svg>
                  查詢 / 修改報名
                </button>
                <button type="button" class="btn btn-outline btn-outline--accent" @click="openContactModal">
                  <svg class="icon" width="18" height="18" aria-hidden="true"><use href="#i-message" /></svg>
                  與承辦人員聯繫
                </button>
              </div>
            </div>
          </div>
        </form>

        <footer class="footer-note">
          <p>常春藤教育機構 Ivy Educational Institution © 2026</p>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { publicRegister, publicCreateInquiry } from '@/api/activityPublic'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { useActivityRegistrationTime } from '@/composables/useActivityRegistrationTime'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { toggleArrayItem } from '@/utils/arrayUtils'

const router = useRouter()

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
}

const { courses, supplies, classes, videos, loading: optionsLoading, loadOptions } = usePublicActivityOptions()
const { timeInfo, loadTime } = useActivityRegistrationTime()
const { availability, refresh: refreshAvailability, startPolling, stopPolling } = useActivityAvailability()

// ===== 前台客製化顯示 =====
const DEFAULT_POSTER = '/images/activity-poster.png'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const posterBroken = ref(false)

const displayTitle = computed(() => timeInfo.value?.page_title?.trim() || '114 下藝童趣｜課後才藝報名')
const displayTermLabel = computed(() => timeInfo.value?.term_label?.trim() || '114 下學期')
const displayEventDate = computed(() => timeInfo.value?.event_date_label?.trim() || '2026-02-23')
const displayAudience = computed(() => timeInfo.value?.target_audience?.trim() || '本園在學幼兒')
const displayFormCardTitle = computed(() => {
  const custom = timeInfo.value?.form_card_title?.trim()
  if (custom) return custom
  return `${displayTitle.value.split('｜')[0]} · ${displayEventDate.value}`
})
const posterSrc = computed(() => {
  if (posterBroken.value) return DEFAULT_POSTER
  const url = timeInfo.value?.poster_url
  if (!url) return DEFAULT_POSTER
  // 後端路徑以 /api 起頭，若前端 baseURL 指向跨 host 後端則補 host
  if (url.startsWith('/api/') && API_BASE && API_BASE !== '/api') {
    return API_BASE.replace(/\/api\/?$/, '') + url
  }
  return url
})
function onPosterError() {
  posterBroken.value = true
}

const form = reactive({
  name: '',
  birthday: '',
  parent_phone: '',
  class_name: '',
  selectedCourses: [],
  selectedSupplies: [],
})

// 各欄位錯誤訊息（送出後填入；使用者開始修改時清除對應欄位）
const errors = reactive({
  name: '',
  birthday: '',
  parent_phone: '',
  class_name: '',
  courses: '',
})

const TW_MOBILE_RE = /^09\d{8}$/
function normalizeMobile(raw) {
  return String(raw || '').replace(/[\s\-().]/g, '')
}
const parentPhoneError = computed(() => {
  if (errors.parent_phone) return errors.parent_phone
  if (!form.parent_phone) return ''
  return TW_MOBILE_RE.test(normalizeMobile(form.parent_phone))
    ? ''
    : '請輸入 09 開頭的 10 碼手機號碼'
})
const submitting = ref(false)
const posterLoaded = ref(false)
function onPosterLoad() { posterLoaded.value = true }

// 初始化狀態：'loading' | 'ready' | 'error'
// loading 期間隱藏報名表，error 顯示頁內錯誤狀態 + 重試按鈕，避免「toast 一閃但頁面空殼」
const initState = ref('loading')
const initErrorMessage = ref('')
const retryingInit = ref(false)

async function runInit() {
  try {
    await Promise.all([loadTime(), loadOptions(), refreshAvailability()])
    initState.value = 'ready'
    initErrorMessage.value = ''
    if (classes.value.length === 0) {
      showToast('目前沒有可選班級，請稍後再試或聯絡園方。', 'warning')
    }
  } catch (err) {
    initState.value = 'error'
    initErrorMessage.value =
      err?.response?.data?.detail || err?.message || '頁面初始化失敗，請稍後再試。'
  }
}

async function retryInit() {
  if (retryingInit.value) return
  retryingInit.value = true
  initState.value = 'loading'
  try {
    await runInit()
  } finally {
    retryingInit.value = false
  }
}

// ===== 生日輸入上下限（與後端 _validate_birthday_str 同步：20 年內、不可未來） =====
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const maxBirthdayISO = computed(() => toISODate(new Date()))
const minBirthdayISO = computed(() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 20)
  return toISODate(d)
})

// ===== 倒數時間 reactive tick（每 60 秒更新一次） =====
const nowTick = ref(Date.now())
let tickTimer = null

const toasts = ref([])
let toastSeq = 0
function showToast(message, type = 'success', duration = 4500) {
  const id = ++toastSeq
  toasts.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), duration)
}
function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// ===== 報名時段狀態 =====
const noticeState = computed(() => {
  const settings = timeInfo.value || {}
  const now = new Date(nowTick.value)
  const openAt = settings.open_at ? new Date(settings.open_at) : null
  const closeAt = settings.close_at ? new Date(settings.close_at) : null

  if (!settings.is_open) {
    return { variant: 'is-warning', title: '報名尚未開放', message: '目前尚未開放線上報名，請稍後再試。' }
  }
  if (openAt && now < openAt) {
    const daysLeft = Math.ceil((openAt - now) / (1000 * 60 * 60 * 24))
    return {
      variant: 'is-warning',
      title: '報名尚未開始',
      message: `報名開始時間：${openAt.toLocaleString('zh-TW')}，距離開放還有 ${daysLeft} 天。`,
    }
  }
  if (closeAt && now > closeAt) {
    return { variant: 'is-danger', title: '報名已截止', message: '感謝您的關注，本期報名已結束。' }
  }
  return null
})

const isRegistrationOpen = computed(() => noticeState.value === null)

const submitButtonLabel = computed(() => {
  if (submitting.value) return '送出中…'
  if (!isRegistrationOpen.value) return noticeState.value?.title || '報名未開放'
  return '確認報名資料'
})

const submitButtonDisabled = computed(() => submitting.value || !isRegistrationOpen.value)

// ===== 名額狀態（顏色語意：充足→中性綠、≤3→紅、候補→黃、額滿→灰） =====
function availabilityState(course) {
  const remaining = availability.value[course.name]
  if (remaining === undefined) {
    return { text: '', cssClass: '', full: false }
  }
  if (remaining === -1) {
    return { text: '已額滿', cssClass: 'is-full', full: true }
  }
  if (remaining <= 0) {
    return { text: '額滿·可候補', cssClass: 'is-waiting', full: false }
  }
  if (remaining <= 3) {
    return { text: `剩 ${remaining} 位`, cssClass: 'is-low', full: false }
  }
  return { text: `剩 ${remaining} 位`, cssClass: 'is-available', full: false }
}

function toggleCourse(course) {
  if (availabilityState(course).full) return
  toggleArrayItem(form.selectedCourses, course.name)
}

function toggleSupply(supply) {
  toggleArrayItem(form.selectedSupplies, supply.name)
}

// ===== 影片模態 =====
const videoModal = reactive({ visible: false, title: '', url: '', youtubeId: null })
function openVideoModal(title, url) {
  const match = String(url || '').match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  videoModal.title = title
  videoModal.url = url
  videoModal.youtubeId = match ? match[1] : null
  videoModal.visible = true
}
function closeVideoModal() {
  videoModal.visible = false
  videoModal.url = ''
  videoModal.youtubeId = null
}

// ===== 聯絡模態 =====
const contactModalVisible = ref(false)
const inquiry = reactive({ name: '', phone: '', question: '' })
const inquirySubmitting = ref(false)
function openContactModal() {
  inquiry.name = ''
  inquiry.phone = ''
  inquiry.question = ''
  contactModalVisible.value = true
}
function closeContactModal() {
  contactModalVisible.value = false
}
async function handleContactSubmit() {
  if (inquirySubmitting.value) return
  const name = inquiry.name.trim()
  const phone = inquiry.phone.trim()
  const question = inquiry.question.trim()
  if (!name) return showToast('請輸入您的姓名', 'error')
  if (!phone) return showToast('請輸入聯絡電話', 'error')
  if (!question) return showToast('請輸入您的問題', 'error')
  if (!/^09\d{8}$/.test(phone.replace(/-/g, ''))) {
    return showToast('請輸入有效的手機號碼，例如 0912345678。', 'error')
  }

  inquirySubmitting.value = true
  try {
    const res = await publicCreateInquiry({ name, phone, question })
    showToast(res?.data?.message || '感謝您的提問，我們會儘快回覆您！', 'success')
    closeContactModal()
  } catch (err) {
    showToast(err.response?.data?.detail || '送出失敗', 'error')
  } finally {
    inquirySubmitting.value = false
  }
}

// ===== 查詢 / 修改：使用同視窗路由（避免行動裝置 popup 被擋） =====
function goToQuery() {
  router.push({ name: 'public-activity-query' })
}

// ===== 送出成功 modal =====
const successModal = reactive({
  visible: false,
  studentName: '',
  parentPhone: '',
  message: '',
  waitlisted: false,
  enrolledCourses: [], // [{ name, price }]
  waitlistCourses: [], // [{ name, price }]
  selectedSupplies: [], // [{ name, price }]
  totalAmount: 0,
  // Phase 3：查詢碼 / 編修連結（後端 register response 一次性回，不再重發）
  queryToken: '',
  editUrl: '',
  copyHint: '',
})

function priceOf(name, source) {
  const item = source.find((it) => it.name === name)
  return Number(item?.price) || 0
}

function buildSuccessSummary({ name, parentPhone, message, waitlisted, waitlistCourses, queryToken }) {
  const waitlistSet = new Set(waitlistCourses || [])
  const enrolledCourses = []
  const waitlistOnes = []
  let total = 0

  form.selectedCourses.forEach((courseName) => {
    const price = priceOf(courseName, courses.value)
    const item = { name: courseName, price }
    if (waitlistSet.has(courseName)) {
      waitlistOnes.push(item)
    } else {
      enrolledCourses.push(item)
      total += price
    }
  })

  const supplyItems = form.selectedSupplies.map((supplyName) => {
    const price = priceOf(supplyName, supplies.value)
    total += price
    return { name: supplyName, price }
  })

  successModal.studentName = name
  successModal.parentPhone = parentPhone
  successModal.message = message
  successModal.waitlisted = !!waitlisted
  successModal.enrolledCourses = enrolledCourses
  successModal.waitlistCourses = waitlistOnes
  successModal.selectedSupplies = supplyItems
  successModal.totalAmount = total
  // 編修連結由前端用 window.location.origin 組（後端不知道 frontend host）
  successModal.queryToken = queryToken || ''
  successModal.editUrl = queryToken
    ? `${window.location.origin}/public/activity/query?token=${encodeURIComponent(queryToken)}`
    : ''
  successModal.copyHint = ''
  successModal.visible = true
}

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    successModal.copyHint = `已複製${label}`
    setTimeout(() => { successModal.copyHint = '' }, 2500)
  } catch {
    successModal.copyHint = '複製失敗，請手動長按文字選取'
    setTimeout(() => { successModal.copyHint = '' }, 4000)
  }
}

function closeSuccessModal() {
  successModal.visible = false
}

// ===== 表單驗證：一次收集所有錯誤、auto focus 第一個錯誤欄位 =====
const FIELD_FOCUS_ORDER = ['name', 'birthday', 'parent_phone', 'class_name', 'courses']
const FIELD_ELEMENT_ID = {
  name: 'studentName',
  birthday: 'studentBirthday',
  parent_phone: 'parentPhone',
  class_name: 'studentClass',
  courses: 'courseListGroup',
}

function clearError(field) {
  if (errors[field]) errors[field] = ''
}

function validateForm() {
  errors.name = ''
  errors.birthday = ''
  errors.parent_phone = ''
  errors.class_name = ''
  errors.courses = ''

  const name = form.name.trim()
  const birthday = form.birthday
  const className = form.class_name
  const parentPhone = normalizeMobile(form.parent_phone)

  if (!name) errors.name = '請輸入幼兒姓名'

  if (!birthday) {
    errors.birthday = '請選擇幼兒生日'
  } else {
    const inputDate = new Date(birthday)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (Number.isNaN(inputDate.getTime())) {
      errors.birthday = '生日格式不正確'
    } else if (inputDate > today) {
      errors.birthday = '生日不可選擇未來日期'
    } else {
      const earliest = new Date(today)
      earliest.setFullYear(earliest.getFullYear() - 20)
      if (inputDate < earliest) errors.birthday = '生日超出合理範圍，請再次確認'
    }
  }

  if (!parentPhone) {
    errors.parent_phone = '請輸入家長手機號碼'
  } else if (!TW_MOBILE_RE.test(parentPhone)) {
    errors.parent_phone = '請輸入 09 開頭的 10 碼手機號碼'
  }

  if (!className) errors.class_name = '請選擇寶貝班級'

  if (form.selectedCourses.length === 0) errors.courses = '請至少選擇一門才藝課'

  return FIELD_FOCUS_ORDER.every((f) => !errors[f])
}

async function focusFirstError() {
  const field = FIELD_FOCUS_ORDER.find((f) => errors[f])
  if (!field) return
  await nextTick()
  const el = document.getElementById(FIELD_ELEMENT_ID[field])
  if (!el) return
  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: false }) } catch { el.focus() }
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ===== 送出報名 =====
async function handleSubmitRegistration() {
  if (!isRegistrationOpen.value) {
    showToast('目前不在可報名時段內。', 'warning')
    return
  }
  if (!navigator.onLine) {
    showToast('網路連線失敗，無法送出報名表。', 'error')
    return
  }

  if (!validateForm()) {
    showToast('請修正紅字標示的欄位後再送出。', 'error')
    await focusFirstError()
    return
  }

  const name = form.name.trim()
  const birthday = form.birthday
  const className = form.class_name
  const parentPhone = normalizeMobile(form.parent_phone)

  submitting.value = true
  try {
    const res = await publicRegister({
      name,
      birthday,
      parent_phone: parentPhone,
      class: className,
      courses: form.selectedCourses.map((courseName) => ({ name: courseName, price: '' })),
      supplies: form.selectedSupplies.map((supplyName) => ({ name: supplyName, price: '' })),
      remark: '',
    })
    const result = res?.data || {}
    buildSuccessSummary({
      name,
      parentPhone,
      message: result.message || '報名資料已送出',
      waitlisted: result.waitlisted,
      waitlistCourses: Array.isArray(result.waitlist_courses) ? result.waitlist_courses : [],
      queryToken: result.query_token,
    })
    showToast(result.message || '報名送出成功！', 'success')
    resetForm()
    await refreshAvailability()
  } catch (err) {
    showToast(err.response?.data?.detail || '送出失敗', 'error')
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.name = ''
  form.birthday = ''
  form.parent_phone = ''
  form.class_name = ''
  form.selectedCourses = []
  form.selectedSupplies = []
}

onMounted(async () => {
  await runInit()
  startPolling()
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
})
onUnmounted(() => {
  stopPolling()
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
/* 重置容器字型（使頁面獨立於 admin 全域樣式） */
.public-activity-page {
  --color-bg: #FFFBEB;
  --color-surface: #FFFFFF;
  --color-surface-muted: #FFF8E1;

  --color-primary: #15803D;
  --color-primary-hover: #166534;
  --color-primary-soft: #DCFCE7;
  --color-primary-contrast: #FFFFFF;

  --color-cta: #EA580C;
  --color-cta-hover: #C2410C;
  --color-cta-contrast: #FFFFFF;

  --color-accent: #1E3A8A;
  --color-accent-soft: #E0E7FF;

  --color-text: #1F2937;
  --color-text-muted: #4B5563;
  --color-text-subtle: #6B7280;

  --color-border: #F2E6C9;
  --color-border-strong: #E8D9A8;
  --color-border-muted: #E5E7EB;

  --color-danger: #DC2626;
  --color-danger-soft: #FEE2E2;
  --color-warning: #D97706;
  --color-warning-soft: #FEF3C7;
  --color-success: #15803D;
  --color-required: #E11D48;

  --font-sans: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  --font-display: 'Baloo 2', 'Noto Sans TC', -apple-system, sans-serif;

  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 15px; --fs-md: 16px; --fs-lg: 18px; --fs-xl: 22px;

  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 24px; --radius-full: 999px;

  --shadow-sm: 0 1px 2px rgba(17, 24, 39, 0.06);
  --shadow-md: 0 4px 12px rgba(17, 24, 39, 0.08);
  --shadow-lg: 0 12px 32px rgba(17, 24, 39, 0.10);
  --shadow-xl: 0 20px 48px rgba(17, 24, 39, 0.14);

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 150ms; --dur-base: 220ms; --dur-slow: 320ms;
  --focus-ring: 0 0 0 3px rgba(21, 128, 61, 0.28);

  min-height: 100vh;
  padding: clamp(12px, 3vw, 28px);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.6;
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

.public-activity-page *,
.public-activity-page *::before,
.public-activity-page *::after { box-sizing: border-box; }

.public-activity-page :focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 4px; }

.page-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* Header */
.page-header {
  position: relative;
  padding: var(--space-8) var(--space-8) var(--space-6);
  background: linear-gradient(135deg, #FEF3C7 0%, #DCFCE7 100%);
  border-bottom: 1px solid var(--color-border);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-6);
  align-items: center;
}
.page-header::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 15% 20%, rgba(21, 128, 61, 0.08) 0, transparent 40%),
    radial-gradient(circle at 85% 80%, rgba(234, 88, 12, 0.08) 0, transparent 40%);
  pointer-events: none;
}
.page-header-main { position: relative; min-width: 0; }
.page-title-line1 {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--color-primary);
  text-transform: uppercase;
  margin-bottom: var(--space-2);
}
.page-title-line2 {
  font-size: clamp(22px, 3.6vw, 32px);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.25;
  letter-spacing: -0.01em;
  margin: 0;
}
.page-header-side {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-5);
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  min-width: 220px;
}
.badge-term {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-cta);
  color: var(--color-cta-contrast);
  font-weight: 700;
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  margin-bottom: var(--space-2);
}
.header-meta-item { display: flex; align-items: center; gap: 6px; color: var(--color-text-muted); }
.header-meta-item .icon { flex-shrink: 0; color: var(--color-primary); }
.header-meta-note { color: var(--color-text-subtle); font-size: var(--fs-xs); margin-top: var(--space-1); }

/* Body */
.page-body { padding: var(--space-8); }
.grid-layout {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--space-8);
}

/* Notice */
.notice {
  display: none;
  margin-bottom: var(--space-6);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-lg);
  border-left: 4px solid var(--color-warning);
  background-color: var(--color-warning-soft);
  gap: var(--space-3);
  align-items: flex-start;
}
.notice.is-visible { display: flex; }
.notice.is-warning { border-left-color: var(--color-warning); background-color: var(--color-warning-soft); }
.notice.is-danger { border-left-color: var(--color-danger); background-color: var(--color-danger-soft); }
.notice-icon { flex-shrink: 0; width: 24px; height: 24px; color: var(--color-warning); }
.notice.is-danger .notice-icon { color: var(--color-danger); }
.notice-content { flex: 1; min-width: 0; }
.notice-title { font-weight: 700; font-size: var(--fs-md); color: var(--color-text); margin-bottom: 2px; }
.notice-message { font-size: var(--fs-sm); color: var(--color-text-muted); }

/* 初始化失敗：頁內錯誤狀態 */
.init-error-panel {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding: var(--space-5) var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-danger);
  background-color: var(--color-danger-soft);
  flex-wrap: wrap;
}
.init-error-panel .notice-icon { color: var(--color-danger); width: 28px; height: 28px; }
.init-error-content { flex: 1; min-width: 200px; }
.init-error-title { font-weight: 700; font-size: var(--fs-lg); color: var(--color-text); margin-bottom: 4px; }
.init-error-message { font-size: var(--fs-sm); color: var(--color-text-muted); }

/* Left Column */
.col-left { display: flex; flex-direction: column; gap: var(--space-5); }
.poster-wrapper {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.poster-wrapper { position: relative; }
.poster-wrapper img {
  width: 100%;
  display: block;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: var(--radius-md);
  background-color: var(--color-surface-muted);
  transition: opacity var(--dur-base) var(--ease-out);
}
.poster-wrapper.is-loading img { opacity: 0; }
.poster-wrapper.is-loading::after {
  content: "";
  position: absolute;
  inset: var(--space-2);
  border-radius: var(--radius-md);
  background:
    linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.55) 50%, transparent 100%),
    var(--color-surface-muted);
  background-size: 200% 100%, 100% 100%;
  background-repeat: no-repeat;
  animation: posterShimmer 1.4s linear infinite;
  pointer-events: none;
}
@keyframes posterShimmer {
  from { background-position: -100% 0, 0 0; }
  to { background-position: 100% 0, 0 0; }
}
.info-box {
  background: linear-gradient(180deg, var(--color-surface-muted) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  box-shadow: var(--shadow-sm);
}
.info-intro {
  color: var(--color-primary);
  font-weight: 500;
  font-size: var(--fs-base);
  line-height: 1.75;
  margin: 0 0 var(--space-4) 0;
}
.info-divider {
  height: 1px;
  background: repeating-linear-gradient(to right,
      var(--color-border-strong) 0,
      var(--color-border-strong) 4px,
      transparent 4px,
      transparent 8px);
  margin: var(--space-4) 0;
  border: 0;
}
.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
}
.notice-list li { position: relative; padding-left: var(--space-5); }
.notice-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-primary);
}
.notice-list strong { color: var(--color-danger); font-weight: 700; }

/* Right Column */
.col-right { display: flex; flex-direction: column; gap: var(--space-4); }
.form-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.form-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-muted) 100%);
  border-bottom: 1px solid var(--color-border);
}
.form-card-header .icon { color: var(--color-primary); flex-shrink: 0; }
.form-card-header-title { font-weight: 700; font-size: var(--fs-md); color: var(--color-text); }
.form-card-body { padding: var(--space-2) var(--space-5) var(--space-5); }

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  border-bottom: 1px dashed var(--color-border);
}
.form-row:last-child { border-bottom: 0; }
.form-label-col { display: flex; flex-direction: column; gap: 2px; }
.form-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.4;
}
.form-label .en {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--color-text-subtle);
  font-family: -apple-system, 'Segoe UI', sans-serif;
  letter-spacing: 0.02em;
}
.required-mark { color: var(--color-required); font-weight: 700; }
.form-hint { font-size: var(--fs-xs); color: var(--color-text-subtle); margin-top: 2px; }
.form-input-col { width: 100%; }

.input-text,
.input-select {
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  font-family: inherit;
  font-size: var(--fs-md);
  color: var(--color-text);
  background-color: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.input-text::placeholder { color: var(--color-text-subtle); }
.input-text:hover, .input-select:hover { border-color: #CBD5E1; }
.input-text:focus, .input-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.input-text.is-invalid, .input-select.is-invalid {
  border-color: var(--color-danger);
  background-color: #FFF5F5;
}
.input-text.is-invalid:focus, .input-select.is-invalid:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.22);
}
.form-error-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: var(--fs-xs);
  color: var(--color-danger);
  font-weight: 600;
  line-height: 1.4;
}
.form-error-hint::before {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DC2626' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>");
  background-size: contain;
  background-repeat: no-repeat;
}
.input-select {
  padding-right: 36px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234B5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.dance-grid { display: flex; flex-direction: column; gap: var(--space-2); }
.course-list-vertical {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-2);
}
.course-list-vertical:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-md); }

.course-item {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  padding: 0;
  background-color: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
  line-height: 1.5;
  overflow: hidden;
}
.course-item:hover:not(.course-item-disabled) {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
}
.course-item:has(input:checked) {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.course-label {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  min-width: 0;
}
/* supply-item 仍保留原本 label 即 row 的單純結構 */
.course-item.supply-item { padding: var(--space-3) var(--space-4); cursor: pointer; align-items: flex-start; }
.course-item input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
  display: grid;
  place-content: center;
  margin: 3px 0 0 0;
  width: 18px;
  height: 18px;
  border: 2px solid #86EFAC;
  border-radius: 5px;
  background-color: var(--color-surface);
  background-position: center;
  background-repeat: no-repeat;
  background-size: 12px 12px;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.course-item input[type="checkbox"]:checked {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'><path d='M2.5 6.2 5 8.7 9.5 3.3' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
}
.course-item input[type="checkbox"]:disabled {
  border-color: #D1D5DB;
  background-color: #F3F4F6;
}
.course-item-disabled { opacity: 0.55; background-color: #F9FAFB; }
.course-item-disabled .course-label { cursor: not-allowed; }
.course-item-disabled input { cursor: not-allowed; }
.course-text {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: var(--fs-base);
  color: var(--color-text);
  min-width: 0;
}
.course-name { font-weight: 500; }
.price-tag {
  color: var(--color-text-subtle);
  font-size: var(--fs-sm);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.rem-count {
  color: var(--color-danger);
  font-size: var(--fs-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.qty-display {
  font-weight: 600;
  font-size: var(--fs-xs);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-surface-muted);
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.qty-display.is-available { background-color: var(--color-primary-soft); color: var(--color-primary); }
.qty-display.is-low { background-color: #FEE2E2; color: #B91C1C; }
.qty-display.is-waiting { background-color: #FEF3C7; color: #B45309; }
.qty-display.is-full { background-color: #E5E7EB; color: #6B7280; }

.empty-hint {
  grid-column: 1 / -1;
  padding: var(--space-5);
  color: var(--color-text-subtle);
  font-size: var(--fs-sm);
  line-height: 1.6;
  text-align: center;
  background-color: var(--color-surface-muted);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

/* Buttons */
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
  line-height: 1.2;
  border: 1.5px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
  white-space: nowrap;
}
.btn-suffix { font-size: 0.85em; font-weight: 400; opacity: 0.75; }
.btn-primary {
  background-color: var(--color-cta);
  color: var(--color-cta-contrast);
  border-color: var(--color-cta);
  box-shadow: 0 6px 16px rgba(234, 88, 12, 0.25);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3);
}
.btn-primary:active:not(:disabled) { transform: translateY(0); box-shadow: 0 4px 10px rgba(234, 88, 12, 0.25); }
.btn-primary:disabled { background-color: #D1D5DB; border-color: #D1D5DB; color: #6B7280; cursor: not-allowed; box-shadow: none; }
.submit-bar { margin-top: var(--space-3); }
.btn-submit { width: 100%; min-height: 56px; font-size: var(--fs-lg); }
.btn-block { width: 100%; }
.btn-outline {
  background-color: var(--color-surface);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-outline:hover:not(:disabled) { background-color: var(--color-primary); color: var(--color-primary-contrast); }
.btn-outline--accent { color: var(--color-cta); border-color: var(--color-cta); }
.btn-outline--accent:hover:not(:disabled) { background-color: var(--color-cta); color: var(--color-cta-contrast); border-color: var(--color-cta); }
.btn-actions-row { display: flex; gap: var(--space-3); margin-top: var(--space-3); }
.btn-actions-row .btn { flex: 1; }

/* Video Button — 獨立於 label 之外，避免與 checkbox 互動衝突 */
.video-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: center;
  margin-right: var(--space-3);
  padding: 6px 12px;
  background-color: var(--color-accent-soft);
  color: var(--color-accent);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  min-height: 32px;
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.video-btn:hover { background-color: var(--color-accent); color: #FFFFFF; transform: scale(1.03); }
.video-btn .icon, .video-btn svg { width: 12px; height: 12px; flex-shrink: 0; }

/* Footer */
.footer-note {
  text-align: center;
  margin-top: var(--space-10);
  padding-top: var(--space-5);
  border-top: 1px dashed var(--color-border);
  color: var(--color-text-subtle);
  font-size: var(--fs-xs);
}

/* Toast */
.toast-container {
  position: fixed;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: calc(100vw - 40px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 300px;
  max-width: 440px;
  padding: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border-left: 4px solid var(--color-primary);
  animation: toastSlideIn var(--dur-slow) var(--ease-out);
}
.toast.success { border-left-color: var(--color-success); }
.toast.error { border-left-color: var(--color-danger); }
.toast.warning { border-left-color: var(--color-warning); }
.toast-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-top: 1px;
}
.toast-content { flex: 1; min-width: 0; }
.toast-message { font-size: var(--fs-sm); line-height: 1.5; color: var(--color-text-muted); white-space: pre-line; word-break: break-word; }
.toast-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-subtle);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.toast-close:hover { background-color: var(--color-surface-muted); color: var(--color-text); }
@keyframes toastSlideIn {
  from { transform: translateX(32px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: none;
  justify-content: center;
  align-items: center;
  padding: var(--space-5);
  z-index: 2000;
  animation: modalFadeIn var(--dur-base) var(--ease-out);
}
.modal-overlay.is-visible { display: flex; }
.modal-panel {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  animation: modalSlideIn var(--dur-slow) var(--ease-out);
}
.modal-panel--video { max-width: 900px; padding: var(--space-5); }
.modal-panel--success { max-width: 560px; }
.modal-panel--success .modal-title { color: var(--color-success); }
.success-msg {
  margin: 0 0 var(--space-4) 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-primary-soft);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--color-text);
  line-height: 1.6;
}
.summary-block {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
}
.summary-row { display: contents; }
.summary-label { color: var(--color-text-subtle); font-weight: 500; }
.summary-value { color: var(--color-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.summary-section { margin-bottom: var(--space-4); }
.summary-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.summary-section-title .icon { color: var(--color-primary); }
.summary-section.is-waitlist .summary-section-title .icon { color: var(--color-warning); }
.summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.summary-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: 10px var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-muted);
}
.summary-list li:last-child { border-bottom: 0; }
.summary-amount { color: var(--color-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.summary-amount--muted { color: var(--color-warning); font-weight: 600; }
.summary-note {
  margin: var(--space-2) 0 0 0;
  font-size: var(--fs-xs);
  color: var(--color-warning);
  line-height: 1.5;
}
.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-muted) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--color-text);
}
.summary-total strong {
  color: var(--color-cta);
  font-size: var(--fs-xl);
  font-variant-numeric: tabular-nums;
}
.summary-final-note {
  margin: var(--space-2) 0 var(--space-4) 0;
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  text-align: center;
  line-height: 1.5;
}

/* Phase 3 查詢碼/編修連結 */
.success-token-box {
  margin: var(--space-4) 0;
  padding: var(--space-4);
  background: var(--color-primary-soft);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
}
.token-title {
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: var(--space-2);
}
.token-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
}
.token-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
}
.token-label {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--color-text-subtle);
  min-width: 64px;
}
.token-value {
  flex: 1;
  font-family: monospace;
  font-size: var(--fs-sm);
  color: var(--color-text);
  word-break: break-all;
}
.token-link {
  flex: 1;
  font-size: var(--fs-xs);
  color: var(--color-primary);
  word-break: break-all;
  text-decoration: underline;
}
.btn-copy {
  padding: 4px 12px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--color-primary-contrast);
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn-copy:hover { background: var(--color-primary-hover); }
.token-copy-hint {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--fs-xs);
  color: var(--color-success);
  text-align: center;
}
.token-warn {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-xs);
  color: var(--color-warning);
  font-weight: 600;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.modal-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.modal-title .icon { color: var(--color-primary); }
.modal-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--color-surface-muted);
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.modal-close:hover { background-color: var(--color-danger-soft); color: var(--color-danger); transform: rotate(90deg); }
.modal-body { padding: var(--space-5); }

.modal-panel--video .modal-close {
  position: absolute;
  top: -46px;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-md);
}
.modal-panel--video .modal-title {
  position: absolute;
  top: -46px;
  left: 0;
  color: #FFFFFF;
  font-size: var(--fs-md);
}
.video-wrapper { width: 100%; border-radius: var(--radius-md); overflow: hidden; background: #000; }
.video-wrapper video, .video-wrapper iframe { width: 100%; max-height: 72vh; display: block; border: 0; }

/* Contact */
.contact-school-card {
  padding: var(--space-4) var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-muted) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
.contact-school-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--color-primary);
  margin: 0 0 var(--space-3) 0;
}
.contact-school-name .icon { color: var(--color-primary); }
.contact-school-detail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-top: var(--space-1);
}
.contact-school-detail .icon { flex-shrink: 0; color: var(--color-primary); }
.contact-school-detail a { color: var(--color-primary); font-weight: 600; text-decoration: none; }
.contact-form-intro {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  margin-bottom: var(--space-4);
  border-top: 1px dashed var(--color-border);
  font-size: var(--fs-sm);
  color: var(--color-cta);
  font-weight: 500;
}
.contact-form-intro .icon { color: var(--color-cta); }

.field-group { margin-bottom: var(--space-4); }
.field-group:last-of-type { margin-bottom: var(--space-5); }
.field-group label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.field-group textarea {
  width: 100%;
  min-height: 100px;
  padding: 10px 14px;
  font-family: inherit;
  font-size: var(--fs-md);
  color: var(--color-text);
  background-color: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
  resize: vertical;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  line-height: 1.6;
}
.field-group textarea:focus { outline: none; border-color: var(--color-primary); box-shadow: var(--focus-ring); }

@keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideIn { from { transform: translateY(24px) scale(0.96); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

/* Responsive */
@media (max-width: 900px) {
  .grid-layout { grid-template-columns: 1fr; gap: var(--space-6); }
  .page-header { grid-template-columns: 1fr; padding: var(--space-6); }
  .page-header-side { min-width: 0; }
}
@media (max-width: 600px) {
  .public-activity-page { padding: 0; }
  .page-wrapper { border-radius: 0; box-shadow: none; }
  .page-header { padding: var(--space-5); }
  /* 為 sticky CTA 預留空間，避免遮擋頁尾文字 */
  .page-body { padding: var(--space-5); padding-bottom: 96px; }
  .page-title-line2 { font-size: var(--fs-xl); }
  .form-card-body { padding: var(--space-1) var(--space-4) var(--space-4); }
  .btn-actions-row { flex-direction: column; }
  .toast-container { top: auto; bottom: 96px; right: var(--space-3); left: var(--space-3); }
  .toast { min-width: 0; max-width: none; }

  /* 手機版主 CTA 固定底部（page-wrapper overflow:hidden 會破壞 sticky，改用 fixed） */
  .submit-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -8px 24px rgba(17, 24, 39, 0.08);
    z-index: 50;
  }
  .btn-submit { min-height: 52px; font-size: var(--fs-md); }

  /* 課程列：影片按鈕在小螢幕往下換行更舒服 */
  .course-item { flex-wrap: wrap; }
  .video-btn { margin: 0 var(--space-4) var(--space-3); }
}
</style>
