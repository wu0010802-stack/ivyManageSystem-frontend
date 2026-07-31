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
      <symbol id="i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></symbol>
      <symbol id="i-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></symbol>
      <symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></symbol>
    </svg>

    <!-- Toast Container（A1-P4 抽元件） -->
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <!-- Video Modal（A1-P2 抽元件） -->
    <VideoModal
      :visible="videoModal.visible"
      :title="videoModal.title"
      :url="videoModal.url"
      :youtube-id="videoModal.youtubeId"
      @close="closeVideoModal"
    />

    <!-- Success Modal（A1-P5 抽元件） -->
    <SuccessSummaryModal :summary="successModal" @close="closeSuccessModal" />

    <!-- Contact Modal（A1-P3 抽元件） -->
    <ContactInquiryModal
      v-model:visible="contactModalVisible"
      @toast="(msg, type) => showToast(msg, type)"
    />

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
          <h1 class="page-subtitle">{{ displayTitle }}</h1>
          <div class="page-meta-row">
            <span v-if="displayTermLabel" class="page-meta-term">{{ displayTermLabel }}</span>
            <span v-if="displayEventDate" class="page-meta-item">
              <svg class="icon" width="14" height="14" aria-hidden="true"><use href="#i-calendar" /></svg>
              {{ displayEventDate }}
            </span>
            <span v-if="displayAudience" class="page-meta-item">招生對象：{{ displayAudience }}</span>
          </div>
        </div>
      </header>

      <main class="page-body">
        <!-- Registration Time Notice：僅在 initState==='ready' 顯示——loading 期間 timeInfo
             仍是預設值（is_open:false），若不擋住會先誤閃「報名尚未開放」（P2 flash 修正） -->
        <div
          v-if="initState === 'ready' && noticeState"
          class="notice is-visible"
          :class="[noticeState.variant, { 'is-sticky': noticeIsUrgent }]"
          role="status"
        >
          <svg class="notice-icon" width="24" height="24" aria-hidden="true"><use href="#i-alert" /></svg>
          <div class="notice-content">
            <div class="notice-title">{{ noticeState.title }}</div>
            <div class="notice-message">{{ noticeState.message }}</div>
          </div>
        </div>

        <!-- 初始化中：中性載入態，不渲染報名表／時段提示，對齊下方 initState 註解原意
             （避免家長在資料回來前先看到誤導性的「尚未開放」+ 空殼表單） -->
        <div
          v-if="initState === 'loading'"
          class="init-loading-panel"
          role="status"
          aria-live="polite"
        >
          <span class="init-loading-spinner" aria-hidden="true"></span>
          <p class="init-loading-text">頁面載入中…</p>
        </div>

        <!-- 初始化失敗：頁內錯誤 + 重試（避免 toast 一閃但表單空殼） -->
        <div
          v-else-if="initState === 'error'"
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
                <div v-if="posterLoaded" class="poster-actions">
                  <a
                    class="poster-action tap-target"
                    :href="posterSrc"
                    :download="posterDownloadName"
                    target="_blank"
                    rel="noopener"
                    aria-label="下載海報"
                  >
                    <svg class="icon" aria-hidden="true"><use href="#i-download" /></svg>
                    下載
                  </a>
                  <button
                    v-if="canSharePoster"
                    type="button"
                    class="poster-action tap-target"
                    aria-label="分享海報給家人"
                    @click="sharePoster"
                  >
                    <svg class="icon" aria-hidden="true"><use href="#i-share" /></svg>
                    分享
                  </button>
                </div>
              </div>
              <div class="info-box">
                <p class="info-intro">
                  爸比媽咪：<br />
                  2 ~ 5 歲的孩子對於自我探索的心很強烈，也是孩子成長的重要因素之一，課後才藝就是一個很好的機會哦！<br />
                  孩子和同儕一起互動學習是最開心的時刻，樂在其中的學習也能玩出潛能！讓我們一起發掘孩子的能力吧！
                </p>
                <hr class="info-divider" />
                <ul class="notice-list">
                  <li>本學期才藝課線上報名，<strong>額滿為止</strong>。</li>
                  <li>上才藝課當天，<strong>坐娃娃車的寶貝請爸媽自己來接喔</strong>。</li>
                  <li>人數未達最低標準時，這門課會取消開課。</li>
                  <li>遇到臨時停課（例如疫情）時，會依比例退費給您。</li>
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
                  <div
                    v-if="draftRestored"
                    class="draft-restored-notice"
                    role="status"
                    data-testid="draft-restored-notice"
                  >
                    <svg class="icon" aria-hidden="true"><use href="#i-form" /></svg>
                    <p class="draft-restored-text">已幫您留著上次填到一半的資料，接著填完就好。</p>
                    <button
                      type="button"
                      class="draft-restored-discard"
                      @click="discardRestoredDraft"
                    >
                      清除重填
                    </button>
                  </div>

                  <nav class="registration-steps" aria-label="報名進度">
                    <button
                      v-for="step in registrationSteps"
                      :key="step.number"
                      type="button"
                      class="registration-step-tab"
                      :class="{
                        'is-active': currentStep === step.number,
                        'is-complete': highestVisitedStep > step.number,
                      }"
                      :disabled="highestVisitedStep < step.number"
                      :aria-current="currentStep === step.number ? 'step' : undefined"
                      @click="navigateToVisitedStep(step.number)"
                    >
                      <span class="registration-step-index" aria-hidden="true">
                        {{ highestVisitedStep > step.number ? '✓' : step.number }}
                      </span>
                      <span>{{ step.label }}</span>
                    </button>
                  </nav>

                  <section
                    v-show="currentStep === 1"
                    class="registration-step-panel"
                    data-registration-step="1"
                    aria-labelledby="registrationStep1Title"
                    tabindex="-1"
                  >
                  <div class="form-section-step is-active">
                    <span class="step-num">1</span>
                    <div class="step-title-col">
                      <span id="registrationStep1Title" class="step-title">寶貝資料</span>
                      <span class="step-desc">填寫幼兒基本資訊與聯絡方式</span>
                    </div>
                  </div>

                  <div class="form-grid-2col">
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
                        aria-required="true"
                        :aria-invalid="!!errors.name"
                        :aria-describedby="errors.name ? 'studentName-err' : undefined"
                        placeholder="請輸入幼兒姓名"
                        maxlength="100"
                        autocomplete="off"
                        enterkeyhint="next"
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
                        aria-required="true"
                        :aria-invalid="!!errors.birthday"
                        :aria-describedby="errors.birthday ? 'studentBirthday-err' : undefined"
                        enterkeyhint="next"
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
                        aria-required="true"
                        :aria-invalid="!!parentPhoneError"
                        :aria-describedby="parentPhoneError ? 'parentPhone-err' : undefined"
                        placeholder="09xx-xxx-xxx"
                        maxlength="15"
                        autocomplete="tel"
                        inputmode="tel"
                        enterkeyhint="next"
                        @input="clearError('parent_phone')"
                        @blur="phoneTouched = true"
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
                        aria-required="true"
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

                  <div class="form-row" :class="{ 'has-error': !!errors.email }">
                    <div class="form-label-col">
                      <label class="form-label" for="contactEmail">
                        聯絡 Email（選填） <span class="en">Email</span>
                      </label>
                    </div>
                    <div class="form-input-col">
                      <input
                        id="contactEmail"
                        v-model="form.email"
                        type="email"
                        class="input-text"
                        :class="{ 'is-invalid': !!errors.email }"
                        :aria-invalid="!!errors.email"
                        :aria-describedby="errors.email ? 'contactEmail-err' : 'contactEmail-hint'"
                        placeholder="example@email.com"
                        maxlength="200"
                        autocomplete="email"
                        inputmode="email"
                        enterkeyhint="next"
                        @input="clearError('email')"
                      />
                      <div id="contactEmail-hint" class="form-hint">
                        填寫後，報名成功將寄送報名資訊、查詢碼與修改連結到此信箱。
                      </div>
                      <div v-if="errors.email" id="contactEmail-err" class="form-error-hint" role="alert">{{ errors.email }}</div>
                    </div>
                  </div>
                  </div><!-- /.form-grid-2col -->
                  </section>

                  <section
                    v-show="currentStep === 2"
                    class="registration-step-panel"
                    data-registration-step="2"
                    aria-label="選擇課程與用品"
                    tabindex="-1"
                  >
                  <!-- A1-P7：Step 2 抽 CoursePickerSection 元件 -->
                  <CoursePickerSection
                    :courses="courses"
                    :selected-courses="form.selectedCourses"
                    :videos="videos"
                    :error-message="errors.courses"
                    :availability-state="availabilityState"
                    :format-schedule="formatSchedule"
                    :course-advisory="courseAdvisory"
                    :is-active-step="currentStep === 2"
                    @toggle="(course) => { toggleCourse(course); clearError('courses') }"
                    @open-video="openVideoModal"
                  />

                  <template v-if="supplies.length > 0">
                    <div class="form-section-step form-subsection-heading">
                      <span class="step-num" aria-hidden="true">＋</span>
                      <div class="step-title-col">
                        <span class="step-title">加購用品</span>
                        <span class="step-desc">選填；需先選至少一門課程，用品可不加購</span>
                      </div>
                    </div>
                  </template>

                  <div v-if="supplies.length > 0" class="form-row">
                    <div class="form-label-col">
                      <span class="form-label">
                        課程加購項目 <span class="en">Supplies</span>
                      </span>
                    </div>
                    <div class="form-input-col">
                      <div class="dance-grid" role="group" aria-label="加購項目">
                        <label v-for="supply in supplies" :key="supply.name" class="course-item supply-item">
                          <input
                            type="checkbox"
                            name="supply"
                            :value="supply.name"
                            :checked="selectedSupplies.includes(supply.name)"
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
                  </section>

                  <section
                    v-show="currentStep === 3"
                    class="registration-step-panel"
                    data-registration-step="3"
                    aria-labelledby="registrationStep3Title"
                    tabindex="-1"
                  >
                    <div class="form-section-step is-active">
                      <span class="step-num">3</span>
                      <div class="step-title-col">
                        <span id="registrationStep3Title" class="step-title">確認報名資料</span>
                        <span class="step-desc">送出前再核對一次，避免聯絡資訊或課程選錯</span>
                      </div>
                    </div>

                    <div class="registration-review">
                      <section class="review-section" aria-labelledby="reviewStudentTitle">
                        <div class="review-section-heading">
                          <h4 id="reviewStudentTitle">寶貝與聯絡資料</h4>
                          <button type="button" class="review-edit-button" @click="navigateToVisitedStep(1)">修改</button>
                        </div>
                        <dl class="review-details">
                          <div><dt>幼兒姓名</dt><dd>{{ form.name }}</dd></div>
                          <div><dt>幼兒生日</dt><dd>{{ form.birthday }}</dd></div>
                          <div><dt>寶貝班級</dt><dd>{{ form.class_name }}</dd></div>
                          <div><dt>家長手機</dt><dd>{{ form.parent_phone }}</dd></div>
                          <div v-if="form.email"><dt>通知 Email</dt><dd>{{ form.email }}</dd></div>
                        </dl>
                      </section>

                      <section class="review-section" aria-labelledby="reviewSelectionTitle">
                        <div class="review-section-heading">
                          <h4 id="reviewSelectionTitle">課程與用品</h4>
                          <button type="button" class="review-edit-button" @click="navigateToVisitedStep(2)">修改</button>
                        </div>
                        <ul v-if="selectedCourseReview.length > 0" class="review-selection-list">
                          <li v-for="item in selectedCourseReview" :key="`review-course-${item.name}`">
                            <span>{{ item.name }}</span><strong>NT$ {{ item.price.toLocaleString() }}</strong>
                          </li>
                        </ul>
                        <p v-else class="review-empty">尚未選擇課程，請返回上一步完成選課。</p>
                        <ul v-if="selectedSupplyReview.length > 0" class="review-selection-list review-selection-list--supplies">
                          <li v-for="item in selectedSupplyReview" :key="`review-supply-${item.name}`">
                            <span>{{ item.name }} <small>用品</small></span><strong>NT$ {{ item.price.toLocaleString() }}</strong>
                          </li>
                        </ul>
                      </section>
                    </div>
                  </section>
                </div>
              </section>

              <transition name="fee-fade">
                <aside
                  v-if="currentStep === 2 && selectedAdvisories.length > 0"
                  class="advisory-panel"
                  role="status"
                  aria-live="polite"
                  aria-label="課程選擇提醒"
                >
                  <div class="advisory-panel-title">
                    <svg class="icon" width="14" height="14" aria-hidden="true"><use href="#i-alert" /></svg>
                    您選的課程有 {{ selectedAdvisories.length }} 項提醒
                    <span class="advisory-panel-hint">（提醒參考用，仍可送出報名）</span>
                  </div>
                  <ul class="advisory-list">
                    <li v-for="item in selectedAdvisories" :key="`adv-${item.courseName}`">
                      <span class="advisory-course">{{ item.courseName }}</span>
                      <span class="advisory-warnings">
                        <span
                          v-for="(w, i) in item.warnings"
                          :key="`${item.courseName}-w-${i}`"
                          class="advisory-tag"
                          :class="`advisory-tag--${w.severity}`"
                        >{{ w.message }}</span>
                      </span>
                    </li>
                  </ul>
                </aside>
              </transition>

              <!-- checkout-stick: 桌機把費用預覽 + 主送出鈕 sticky 在 viewport
                   底部，家長勾課程時不用回滾才看到金額 / 送出 -->
              <div class="checkout-stick">
                <transition name="fee-fade">
                  <aside v-if="currentStep > 1 && feePreview" class="fee-preview" aria-live="polite" aria-label="費用預估">
                    <div class="fee-preview-title">
                      <svg class="icon" width="14" height="14" aria-hidden="true"><use href="#i-check" /></svg>
                      費用預估
                      <span class="fee-preview-count">
                        <template v-if="feePreview.courseCount > 0">{{ feePreview.courseCount }} 堂課</template>
                        <template v-if="feePreview.courseCount > 0 && feePreview.supplyCount > 0">．</template>
                        <template v-if="feePreview.supplyCount > 0">{{ feePreview.supplyCount }} 項加購</template>
                      </span>
                    </div>
                    <dl class="fee-preview-list">
                      <div v-if="feePreview.courseCount > 0" class="fee-row">
                        <dt>才藝課程小計</dt>
                        <dd>NT$ {{ feePreview.coursesTotal.toLocaleString() }}</dd>
                      </div>
                      <div v-if="feePreview.supplyCount > 0" class="fee-row">
                        <dt>用品加購小計</dt>
                        <dd>NT$ {{ feePreview.suppliesTotal.toLocaleString() }}</dd>
                      </div>
                      <div class="fee-row fee-row-total">
                        <dt>預估應繳合計</dt>
                        <dd>NT$ {{ feePreview.total.toLocaleString() }}</dd>
                      </div>
                    </dl>
                    <div class="fee-preview-note">
                      <template v-if="feePreview.waitlistCount > 0">
                        含 {{ feePreview.waitlistCount }} 堂候補課程；候補課程實際不收費，校方確認後另行通知。
                      </template>
                      <template v-else>
                        * 此為估算金額，實際應繳以校方確認後通知為準。
                      </template>
                    </div>
                  </aside>
                </transition>

                <div
                  v-if="submitError"
                  class="submit-error-panel"
                  role="alert"
                  data-test="submit-error-banner"
                >
                  <svg class="notice-icon" width="22" height="22" aria-hidden="true"><use href="#i-alert" /></svg>
                  <div class="submit-error-content">
                    <strong>報名尚未送出</strong>
                    <p>{{ submitError }}</p>
                  </div>
                </div>

                <div class="submit-bar registration-nav-actions">
                  <!-- 手機版吸底 CTA 帶合計：桌機有 sticky fee-preview，手機的費用
                       預估留在內文流裡，勾完課要回滾才看得到金額，這裡補一行。
                       金額變動已由 fee-preview 的 aria-live 播報，此處 aria-hidden 防雙報 -->
                  <div
                    v-if="currentStep > 1 && feePreview"
                    class="submit-bar-total"
                    aria-hidden="true"
                  >
                    預估合計 <strong>NT$ {{ feePreview.total.toLocaleString() }}</strong>
                  </div>
                  <button
                    v-if="currentStep > 1"
                    type="button"
                    class="btn btn-outline registration-back-button"
                    @click="goToPreviousStep"
                  >
                    上一步
                  </button>
                  <button
                    v-if="currentStep < 3"
                    type="button"
                    class="btn btn-primary btn-submit"
                    :disabled="submitButtonDisabled"
                    @click="continueRegistration"
                  >
                    {{ currentStep === 1 ? '下一步：選擇課程與用品' : '下一步：確認資料' }}
                  </button>
                  <button
                    v-else
                    type="submit"
                    class="btn btn-primary btn-submit"
                    :disabled="submitButtonDisabled"
                  >
                    {{ submitButtonLabel }}
                  </button>
                </div>
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

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
// 公開頁設計 token 唯一權威（與查詢頁共用，禁止頁內重定義同名變數）
import '@/assets/public-theme.css'
import { publicRegister, getPublicBootstrap } from '@/api/activityPublic'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { priceFromList, sumCourseFees, sumSupplyFees } from '@/utils/activityPricing'
import { useActivityRegistrationTime } from '@/composables/useActivityRegistrationTime'
import { useRegistrationWindow } from '@/composables/useRegistrationWindow'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { usePublicRegistrationForm } from '@/composables/usePublicRegistrationForm'
import {
  usePublicRegistrationFlow,
  type PublicRegistrationStep,
} from '@/composables/usePublicRegistrationFlow'
import { usePublicRegistrationDraft } from '@/composables/usePublicRegistrationDraft'
import { useCourseAdvisory } from '@/composables/useCourseAdvisory'
import { buildFormCardTitle } from '@/utils/activityDisplay'
import { buildPublicEditUrl } from '@/utils/publicLinks'
// KawaiiStar / LaurelWreath / BrandMark 已隨 SuccessSummaryModal 抽走（A1-P5）
import VideoModal from './components/VideoModal.vue'
import ContactInquiryModal from './components/ContactInquiryModal.vue'
import ToastStack from './components/ToastStack.vue'
import SuccessSummaryModal from './components/SuccessSummaryModal.vue'
import CoursePickerSection from './components/CoursePickerSection.vue'

const router = useRouter()
const registrationSteps: ReadonlyArray<{ number: PublicRegistrationStep; label: string }> = [
  { number: 1, label: '寶貝資料' },
  { number: 2, label: '課程用品' },
  { number: 3, label: '確認送出' },
]

// TOAST_ICONS 已搬至 ToastStack 元件（A1-P4）

// composable 已用 codegen 契約型別（PublicCourseOption/PublicSupplyOption），
// 不再是 unknown[]；此處僅放寬到 view 子元件（CoursePickerSection/SuccessSummaryModal）
// 接受的 CourseItem/CourseOption（sessions string|number，無 null）。
const { courses: _courses, supplies: _supplies, classes, videos, applyOptions } = usePublicActivityOptions()
const { timeInfo, applyTime } = useActivityRegistrationTime()
const { availability, refresh: refreshAvailability, startPolling, stopPolling } = useActivityAvailability()

interface CourseOption { name: string; price?: string | number; sessions?: number | string; [key: string]: unknown }
interface SupplyOption { name: string; price?: string | number; [key: string]: unknown }
// 子元件 CourseItem.sessions 不收 null（後端 null 視為「無固定堂數」，模板以排程字串呈現），
// 故此邊界用 as 收斂 null→省略。
const courses = computed(() => _courses.value as unknown as CourseOption[])
const supplies = computed(() => _supplies.value as unknown as SupplyOption[])

// ===== 前台客製化顯示 =====
const DEFAULT_POSTER = '/images/activity-poster.jpg'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const posterBroken = ref(false)

interface TimeInfoExtended {
  is_open: boolean; open_at: string | null; close_at: string | null
  page_title?: string; term_label?: string; event_date_label?: string
  target_audience?: string; form_card_title?: string; poster_url?: string
}
// timeInfo 基礎型別只含 is_open/open_at/close_at，後端實際回傳更多欄位
const timeInfoExt = computed(() => timeInfo.value as TimeInfoExtended)

const displayTitle = computed(() => timeInfoExt.value?.page_title?.trim() || '課後才藝報名')
const displayTermLabel = computed(() => timeInfoExt.value?.term_label?.trim() || '')
const displayEventDate = computed(() => timeInfoExt.value?.event_date_label?.trim() || '')
const displayAudience = computed(() => timeInfoExt.value?.target_audience?.trim() || '本園在學幼兒')
const displayFormCardTitle = computed(() => {
  const custom = timeInfoExt.value?.form_card_title?.trim()
  if (custom) return custom
  return buildFormCardTitle(displayTitle.value, displayEventDate.value)
})
const posterSrc = computed(() => {
  if (posterBroken.value) return DEFAULT_POSTER
  const url = timeInfoExt.value?.poster_url
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

// 海報下載 / 分享：給家長轉發給配偶或長輩
const canSharePoster = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
)
const posterDownloadName = computed(() => {
  const base = (displayTitle.value || '常春藤才藝報名海報').replace(/[\\/:*?"<>|]/g, '_')
  return `${base}.jpg`
})
async function sharePoster() {
  if (!canSharePoster.value) return
  try {
    await navigator.share({
      title: displayTitle.value,
      text: '常春藤幼兒園才藝報名海報',
      url: window.location.href,
    })
  } catch (err) {
    if (err && (err as { name?: string }).name !== 'AbortError') {
      showToast('分享失敗，請改用下載按鈕', 'error')
    }
  }
}

// A1-P1：表單狀態 / 驗證 / 即時費用預覽 / 生日範圍 抽到 usePublicRegistrationForm
const {
  form,
  errors,
  phoneTouched,
  parentPhoneError,
  maxBirthdayISO,
  minBirthdayISO,
  feePreview,
  validatePersonalDetails,
  validateSelections,
  validateForm,
  clearError,
  toggleCourse,
  toggleSupply,
  resetForm,
  normalizeMobile,
  FIELD_FOCUS_ORDER,
} = usePublicRegistrationForm({ courses, supplies, availability })

const {
  currentStep,
  highestVisitedStep,
  goToStep,
  completeStep,
  goToErrorField,
  resetFlow,
} = usePublicRegistrationFlow()

// 草稿保存：家長在 LINE 內建瀏覽器填表、被打斷切走再回來時不必重填（見 composable 註解）
const {
  restoreDraft,
  clearDraft: clearRegistrationDraft,
  startAutosave: startDraftAutosave,
} = usePublicRegistrationDraft({ form, currentStep, highestVisitedStep })
let stopDraftAutosave: (() => void) | undefined
const draftRestored = ref(false)

function discardRestoredDraft() {
  clearRegistrationDraft()
  resetForm()
  resetFlow()
  draftRestored.value = false
}

const submitting = ref(false)
// 送出失敗的持久錯誤（非 toast）：手機上家長低頭填表會錯過 4.5s toast，
// 誤以為已報名成功——失敗訊息必須就地留在送出鈕旁直到下一次嘗試。
const submitError = ref('')
const posterLoaded = ref(false)
function onPosterLoad() { posterLoaded.value = true }

// 初始化狀態：'loading' | 'ready' | 'error'
// loading 期間隱藏報名表，error 顯示頁內錯誤狀態 + 重試按鈕，避免「toast 一閃但頁面空殼」
const initState = ref('loading')
const initErrorMessage = ref('')
const retryingInit = ref(false)
let disposed = false

async function runInit(): Promise<boolean> {
  try {
    // 一次取回靜態資料（bootstrap，後端 30s 快取）+ 即時名額；6 支 GET 降為 2 支，
    // 削報名開放尖峰對單 worker 後端的請求放大（穩定度稽核 2026-06-23）。
    const [bootRes] = await Promise.all([getPublicBootstrap(), refreshAvailability()])
    // Vue 不會取消 setup 內已發出的 Promise；離頁後的遲到回應不可再寫 state，
    // 更不可讓 onMounted / retryInit 的 continuation 重啟 polling。
    if (disposed) return false
    const b = bootRes.data
    applyOptions({
      courses: b.courses,
      supplies: b.supplies,
      classes: b.classes,
      videos: b.course_videos,
    })
    applyTime(b.registration_time)
    initState.value = 'ready'
    initErrorMessage.value = ''
    if (classes.value.length === 0) {
      showToast('目前沒有可選班級，請稍後再試或聯絡園方。', 'warning')
    }
    return true
  } catch (err) {
    if (disposed) return false
    stopPolling()
    initState.value = 'error'
    initErrorMessage.value =
      (err as { response?: { data?: { detail?: string }; message?: string }; message?: string })?.response?.data?.detail || (err as Error)?.message || '頁面初始化失敗，請稍後再試。'
    return false
  }
}

async function retryInit() {
  if (retryingInit.value) return
  retryingInit.value = true
  initState.value = 'loading'
  try {
    if (await runInit()) startPolling()
  } finally {
    retryingInit.value = false
  }
}

// 生日上下限 / feePreview / toggleCourse / toggleSupply / validateForm / clearError /
// resetForm 已抽至 usePublicRegistrationForm（A1-P1）。

interface Toast { id: number; message: string; type: string }
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

// ===== 報名時段狀態（A1-P7 抽至 useRegistrationWindow） =====
// nowTick / formatCountdown / noticeState / isRegistrationOpen /
// submitButtonLabel / submitButtonDisabled 由 composable 提供；
// composable 內自管 30s tick timer 的 onMounted/onUnmounted lifecycle。
const {
  noticeState,
  isRegistrationOpen,
  submitButtonLabel,
  submitButtonDisabled,
} = useRegistrationWindow({ timeInfo, submitting })

// 費用預覽 feePreview 已抽至 usePublicRegistrationForm（A1-P1）

// 課程顯示輔助（衝堂 / 名額狀態）抽至 useCourseAdvisory（A1-P6）
const {
  formatSchedule,
  courseAdvisory,
  selectedAdvisories,
  availabilityState,
} = useCourseAdvisory({ courses, availability, form })

// toggleCourse / toggleSupply 已抽至 usePublicRegistrationForm（A1-P1）;
// 額滿判定（availability=-1）規則在 composable 內,與 availabilityState 一致。

// form.selectedSupplies 在 composable 內推斷為 never[]（空陣列無型別標注）；
// 以強型別 computed 供模板 .includes() 使用，不改變實際 reactive 物件。
const selectedSupplies = computed(() => form.selectedSupplies as string[])
const selectedCourseReview = computed(() => form.selectedCourses.map((name) => ({
  name,
  price: priceFromList(name, courses.value),
})))
const selectedSupplyReview = computed(() => form.selectedSupplies.map((name) => ({
  name,
  price: priceFromList(name, supplies.value),
})))

// 報名截止 48h 內彈出的 noticeState 改 sticky，家長滑到底勾課程時仍可見倒數
const noticeIsUrgent = computed(() => noticeState.value?.title === '報名即將截止')

// ===== 影片模態 =====
const videoModal = reactive<{ visible: boolean; title: string; url: string; youtubeId: string | null }>({ visible: false, title: '', url: '', youtubeId: null })
function openVideoModal(title: string, url: string) {
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

// ===== 聯絡模態 =====（A1-P3 抽至 ContactInquiryModal，本檔只保留 visible ref）
const contactModalVisible = ref(false)
function openContactModal() {
  contactModalVisible.value = true
}

// ===== 查詢 / 修改：使用同視窗路由（避免行動裝置 popup 被擋） =====
function goToQuery() {
  router.push({ name: 'public-activity-query' })
}

// ===== 送出成功 modal =====
interface CourseItem { name: string; price: number; waitlisted?: boolean }
const successModal = reactive<{
  visible: boolean; studentName: string; parentPhone: string; message: string;
  selectedCourses: CourseItem[];
  selectedSupplies: CourseItem[]; totalAmount: number; queryToken: string; editUrl: string; copyHint: string;
  email: string
}>({
  visible: false,
  studentName: '',
  parentPhone: '',
  message: '',
  selectedCourses: [],
  selectedSupplies: [],
  totalAmount: 0,
  queryToken: '',
  editUrl: '',
  copyHint: '',
  email: '',
})

function buildSuccessSummary({ name, parentPhone, email, message, queryToken }: {
  name: string; parentPhone: string; email?: string; message: string; queryToken?: string
}) {
  // Register response 為 anti-enumeration neutral response，不揭露後端錄取結果；
  // 但 client 送出前本來就拿著即時名額（feePreview 同一判定：剩餘 <=0 即進候補
  // 序列），成功畫面按「送出當下快照」標註候補課並將其排除於合計外，與費用
  // 預估的「候補實際不收費」文案一致，不增加 enumeration 面。
  const waitlistedAtSubmit = new Set(
    form.selectedCourses.filter((courseName) => {
      const remaining = availability.value[courseName]
      return remaining !== undefined && remaining <= 0
    }),
  )

  const selectedCourseItems = form.selectedCourses.map((courseName) => ({
    name: courseName,
    price: priceFromList(courseName, courses.value),
    waitlisted: waitlistedAtSubmit.has(courseName),
  }))

  const supplyItems = form.selectedSupplies.map((supplyName) => ({
    name: supplyName,
    price: priceFromList(supplyName, supplies.value),
  }))

  const total =
    sumCourseFees(form.selectedCourses, {
      isEnrolled: (courseName) => !waitlistedAtSubmit.has(courseName),
      resolvePrice: (n) => priceFromList(n, courses.value),
    }) +
    sumSupplyFees(form.selectedSupplies, {
      resolvePrice: (n) => priceFromList(n, supplies.value),
    })

  successModal.studentName = name
  successModal.parentPhone = parentPhone
  successModal.message = message
  successModal.selectedCourses = selectedCourseItems
  successModal.selectedSupplies = supplyItems
  successModal.totalAmount = total
  // 編修連結由前端用 window.location.origin 組（後端不知道 frontend host）。
  // 必須是 public.html hash 路由，token 放 hash 內——細節見 buildPublicEditUrl。
  successModal.queryToken = queryToken || ''
  successModal.editUrl = buildPublicEditUrl(window.location.origin, queryToken)
  successModal.email = email || ''
  successModal.copyHint = ''
  successModal.visible = true
}

// copyToClipboard / shareToken / canShare 已抽至 SuccessSummaryModal（A1-P5）

function closeSuccessModal() {
  successModal.visible = false
}

// ===== 表單驗證 =====
// validateForm / clearError / errors / FIELD_FOCUS_ORDER 已抽至
// usePublicRegistrationForm（A1-P1）。view 保留 focusFirstError 與
// FIELD_ELEMENT_ID 因 DOM 操作仰賴 view 的元件 id。
const FIELD_ELEMENT_ID: Record<string, string> = {
  name: 'studentName',
  birthday: 'studentBirthday',
  parent_phone: 'parentPhone',
  class_name: 'studentClass',
  email: 'contactEmail',
  courses: 'courseListGroup',
}

async function focusFirstError() {
  const field = FIELD_FOCUS_ORDER.find((f) => (errors as Record<string, string>)[f])
  if (!field) return
  goToErrorField(field)
  await nextTick()
  const el = document.getElementById(FIELD_ELEMENT_ID[field])
  if (!el) return
  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: false }) } catch { el.focus() }
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function focusStepPanel(step: PublicRegistrationStep) {
  await nextTick()
  const panel = document.querySelector<HTMLElement>(`[data-registration-step="${step}"]`)
  panel?.focus({ preventScroll: true })
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function navigateToVisitedStep(step: PublicRegistrationStep) {
  if (!goToStep(step)) return false
  await focusStepPanel(step)
  return true
}

async function continueRegistration() {
  if (!isRegistrationOpen.value) {
    showToast('目前不在可報名時段內。', 'warning')
    return
  }

  const valid = currentStep.value === 1
    ? validatePersonalDetails()
    : validateSelections()
  if (!valid) {
    showToast(
      currentStep.value === 1 ? '請先完成紅字標示的寶貝資料。' : '請至少選一門課程後再繼續。',
      'error',
    )
    await focusFirstError()
    return
  }

  const completedStep = currentStep.value
  if (completeStep(completedStep)) await focusStepPanel(currentStep.value)
}

async function goToPreviousStep() {
  if (currentStep.value <= 1) return
  await navigateToVisitedStep((currentStep.value - 1) as PublicRegistrationStep)
}

// ===== 送出報名 =====
async function handleSubmitRegistration() {
  if (currentStep.value < 3) {
    await continueRegistration()
    return
  }
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
  const email = form.email.trim()

  submitting.value = true
  submitError.value = ''
  try {
    const res = await publicRegister({
      name,
      birthday,
      parent_phone: parentPhone,
      class: className,
      // 契約 PublicCourseItem/PublicSupplyItem 只收 name（價格後端以 DB 為準）
      courses: form.selectedCourses.map((courseName) => ({ name: courseName })),
      supplies: form.selectedSupplies.map((supplyName) => ({ name: supplyName })),
      remark: '',
      // 選填通知信箱：空值不帶 key（後端視同未填，DB 存 NULL）
      ...(email ? { email } : {}),
      // _hp honeypot：正常使用者空字串（填值=機器人→後端 silent-drop）
      _hp: '',
    })
    const result = res?.data || {}
    buildSuccessSummary({
      name,
      parentPhone,
      email,
      message: result.message || '報名資料已送出',
      queryToken: result.query_token,
    })
    showToast(result.message || '報名送出成功！', 'success')
    // 先清草稿再 resetForm：autosave watcher 對空表單本來就會清掉草稿，但清除順序
    // 顛倒會讓 debounce 期間的重新整理還原到一筆已送出的報名，家長可能重複報名
    clearRegistrationDraft()
    draftRestored.value = false
    resetForm()
    resetFlow()
    await refreshAvailability()
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
    submitError.value = detail || '送出失敗，請確認網路連線後再試一次；您填寫的資料都還在。'
    await nextTick()
    document.querySelector('.submit-error-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } finally {
    submitting.value = false
  }
}

// resetForm 已抽至 usePublicRegistrationForm（A1-P1）

// ===== 離開防護（spec #6）=====
// dirty 判定：任一必填欄位（姓名/生日/家長手機/班級）已有值。
// 送出成功後 handleSubmitRegistration 會呼叫 resetForm() 清空這些欄位，
// isFormDirty 隨之回 false，beforeunload 自然不再攔截，不需額外的
// 「已送出」旗標。
function isFormDirty(): boolean {
  return Boolean(form.name || form.birthday || form.parent_phone || form.class_name)
}
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isFormDirty()) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  if (await runInit()) {
    startPolling()
    // 還原草稿必須排在 runInit 之後：要拿當期課程／用品清單濾掉已下架的品項
    draftRestored.value = restoreDraft(
      courses.value.map((course) => course.name),
      supplies.value.map((supply) => supply.name),
    )
  }
  // A1-P7：30s tick 由 useRegistrationWindow 自管 lifecycle
  stopDraftAutosave = startDraftAutosave()
  window.addEventListener('beforeunload', handleBeforeUnload)
})
onUnmounted(() => {
  disposed = true
  stopPolling()
  stopDraftAutosave?.()
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
/* 重置容器字型（使頁面獨立於 admin 全域樣式）。
   設計 token 一律來自 assets/public-theme.css（公開頁唯一權威，於 <script> import），
   此處只保留本頁私有的布局值。 */
.public-activity-page {
  min-height: 100vh;
  padding: clamp(12px, 3vw, 28px);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.6;
  color: var(--color-text);
  background-color: var(--color-bg);
  background-image: linear-gradient(180deg, #fff1ee 0%, #fffce8 55%, #fffce8 100%);
  background-attachment: fixed;
  -webkit-font-smoothing: antialiased;
}

.public-activity-page *,
.public-activity-page *::before,
.public-activity-page *::after { box-sizing: border-box; }

.public-activity-page :focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 4px; }

/* ⚠ 這裡不可以再加 overflow: hidden。它會讓 .page-wrapper 變成 scroll container，
   底下所有 position: sticky 從此永遠吸不住——截止倒數提示（.notice.is-sticky）與桌機
   結帳列（.checkout-stick）都曾因此整段失效，設計意圖只留在註解裡沒實現。
   當初加它是為了把 header 的白底裁進圓角；改由 .page-header 自己帶上方圓角處理，
   .page-body 沒有自己的背景，下方圓角由 .page-wrapper 的底色直接呈現。 */
.page-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

/* Header — 簡約版：LOGO + 校名 ｜ 活動標題 水平兩欄、純白底、無動畫 */
.page-header {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  align-items: center;
  margin: 0;
  padding: var(--space-6) var(--space-8);
  background: #fff;
  border-bottom: 1px solid var(--color-border);
  /* 取代 .page-wrapper 的 overflow: hidden（那會廢掉全頁 sticky，見上方註解） */
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
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
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.page-subtitle {
  margin: 0;
  font-size: clamp(20px, 3vw, 26px);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.page-meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
.page-meta-term {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
  font-weight: 600;
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
}
.page-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.page-meta-item .icon { color: var(--color-text-muted); flex-shrink: 0; }

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
  border: 1px solid rgba(217, 119, 6, 0.35);
  background-color: var(--color-warning-soft);
  gap: var(--space-3);
  align-items: flex-start;
}
.notice.is-visible { display: flex; }
.notice.is-warning {
  border-color: rgba(217, 119, 6, 0.35);
  background-color: var(--color-warning-soft);
}
.notice.is-danger {
  border-color: rgba(220, 38, 38, 0.35);
  background-color: var(--color-danger-soft);
}
/* urgent close 倒數時 sticky 在頂端，家長滑下勾課程仍見得到剩餘時間 */
.notice.is-sticky {
  position: sticky;
  top: var(--space-3);
  z-index: 50;
  box-shadow: 0 10px 28px rgba(217, 119, 6, 0.18);
}
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

/* 初始化中：中性載入態（P2 flash 修正——loading 期間不渲染表單／時段提示，避免誤導） */
.init-loading-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding: var(--space-10) var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background-color: var(--color-surface-muted);
  color: var(--color-text-muted);
}
.init-loading-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--color-border-strong);
  border-top-color: var(--color-primary);
  animation: init-loading-spin 0.8s linear infinite;
}
.init-loading-text { margin: 0; font-size: var(--fs-sm); }
@keyframes init-loading-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .init-loading-spinner { animation-duration: 2.4s; }
}

/* Left Column */
.col-left { display: flex; flex-direction: column; gap: var(--space-5); }
.poster-wrapper {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  overflow: hidden;
  position: relative;
}
.poster-wrapper img {
  width: 100%;
  display: block;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: var(--radius-md);
  background-color: var(--color-surface-muted);
  transition: opacity var(--dur-base) var(--ease-out);
}

/* 海報右下角 hover 浮現的下載 / 分享 chip；行動裝置常駐顯示 */
.poster-actions {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  display: flex;
  gap: var(--space-2);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
  pointer-events: none;
}
.poster-wrapper:hover .poster-actions,
.poster-wrapper:focus-within .poster-actions {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.poster-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text);
  font-size: var(--fs-xs);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
  transition: transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}
.poster-action:hover { background: #fff; transform: translateY(-1px); }
.poster-action .icon, .poster-action svg { width: 14px; height: 14px; flex-shrink: 0; }
@media (hover: none) {
  .poster-actions { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .poster-action { padding: 4px 10px; font-size: 11px; }
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
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
}
.info-intro {
  color: var(--color-text);
  font-weight: 400;
  font-size: var(--fs-base);
  line-height: 1.75;
  margin: 0 0 var(--space-4) 0;
}
.info-divider {
  height: 1px;
  background: var(--color-border);
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
.notice-list li { position: relative; padding-left: var(--space-4); }
.notice-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.7em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-text-muted);
}
.notice-list strong { color: var(--color-text); font-weight: 700; }

/* Right Column */
.col-right { display: flex; flex-direction: column; gap: var(--space-4); }
.form-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.form-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.form-card-header .icon { color: var(--color-text-muted); flex-shrink: 0; }
.form-card-header-title { font-weight: 700; font-size: var(--fs-md); color: var(--color-text); }
.form-card-body { padding: var(--space-2) var(--space-5) var(--space-5); }

/* 草稿還原提示：整框淡綠底 + 1px 全框線（公開頁禁用單邊色條，見 ToastStack 註解） */
.draft-restored-notice {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-primary-soft);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
}
.draft-restored-notice .icon { flex-shrink: 0; width: 20px; height: 20px; color: var(--color-primary-strong); }
.draft-restored-text {
  flex: 1;
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--color-text);
}
/* 文字用深咖啡而非深綠：深綠 #0d9053 配淺綠底僅 3.75:1，不過 WCAG AA */
.draft-restored-discard {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
}
.draft-restored-discard:hover { border-color: var(--color-primary); }
.draft-restored-discard:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.registration-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-4) 0 var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.registration-step-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-subtle);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.registration-step-tab:disabled { cursor: not-allowed; opacity: 0.58; }
.registration-step-tab.is-active {
  color: var(--color-primary-strong);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  box-shadow: 0 4px 12px rgba(57, 42, 28, 0.08);
}
.registration-step-tab.is-complete:not(.is-active) { color: var(--color-success); }
.registration-step-tab:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.registration-step-index {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  color: currentColor;
  border: 1.5px solid currentColor;
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  line-height: 1;
}
.registration-step-panel:focus { outline: none; }

.registration-review {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-4);
}
.review-section {
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.review-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.review-section-heading h4 { margin: 0; color: var(--color-text); font-size: var(--fs-md); }
.review-edit-button {
  /* 觸控區 ≥44px（spec #2）：min-height 撐開點擊區，負 margin 抵消對
     .review-section-heading 排版高度的影響，維持原本視覺 chip 大小觀感 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin: -11px 0;
  padding: 4px 10px;
  color: var(--color-primary-strong);
  background: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  font: inherit;
  font-size: var(--fs-xs);
  font-weight: 700;
  cursor: pointer;
}
.review-edit-button:hover { color: var(--color-primary-contrast); background: var(--color-primary-strong); }
.review-edit-button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.review-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3) var(--space-5);
  margin: 0;
}
.review-details div { min-width: 0; }
.review-details dt { color: var(--color-text-subtle); font-size: var(--fs-xs); }
.review-details dd { margin: 2px 0 0; color: var(--color-text); font-weight: 700; overflow-wrap: anywhere; }
.review-selection-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.review-selection-list--supplies { margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px dashed var(--color-border-strong); }
.review-selection-list li { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.review-selection-list strong { flex: 0 0 auto; color: var(--color-text); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.review-selection-list small { color: var(--color-text-subtle); font-weight: 400; }
.review-empty { margin: 0; color: var(--color-text-subtle); font-size: var(--fs-sm); }

/* 區塊段標：① 寶貝資料 / ② 選擇課程 / ③ 加購用品 */
.form-section-step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.form-section-step:first-child { padding-top: var(--space-3); }
/* 當前進行步驟：填色 step-num + 強調 title，給家長清楚的進度感 */
.form-section-step.is-active .step-num {
  background-color: var(--color-primary-strong);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.form-section-step.is-active .step-title { color: var(--color-primary-strong); }
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  background: transparent;
  color: var(--color-primary-strong);
  font-weight: 700;
  font-size: var(--fs-sm);
  font-family: var(--font-display);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-full);
}
.step-title-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.step-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.01em;
}
.step-desc {
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  line-height: 1.4;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  border-bottom: 1px dashed var(--color-border);
}
.form-row:last-child { border-bottom: 0; }

/* Step 1 兩欄並排 grid，桌機節省垂直空間 */
.form-grid-2col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--space-5);
}
.form-grid-2col .form-row { padding: var(--space-3) 0; }
/* 第 5 個 Email 欄位獨占最後一列，僅最後一項拿掉 dashed border。 */
.form-grid-2col .form-row:nth-child(n+5) { border-bottom: 0; padding-bottom: 0; }
@media (--to-sm) {
  .form-grid-2col { grid-template-columns: 1fr; column-gap: 0; }
  .form-grid-2col .form-row { padding: var(--space-4) 0; }
  .form-grid-2col .form-row:last-child { border-bottom: 0; padding-bottom: 0; }
}
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
.input-text:hover, .input-select:hover { border-color: var(--neutral-300); }
.input-text:focus, .input-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.input-text.is-invalid, .input-select.is-invalid {
  border-color: var(--color-danger);
  background-color: #fff5f5;
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
  /* 未勾邊框需達 WCAG 1.4.11 非文字對比 3:1；舊 --color-success-soft（#dcfce7）
     對白底僅 1.07:1，家長看不出卡片可勾選 */
  border: 2px solid var(--color-text-subtle);
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
  border-color: var(--neutral-300);
  background-color: #f3f4f6;
}
/* 額滿狀態：邊框/灰底而非 opacity（保留可讀性，明確標示 disabled） */
.course-item-disabled {
  background-color: #f5f6f8;
  border-style: dashed;
  border-color: var(--neutral-300);
  position: relative;
}
.course-item-disabled::after {
  content: "已額滿";
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  background: var(--text-secondary);
  color: var(--neutral-0);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-full);
  letter-spacing: 0.05em;
  pointer-events: none;
}
.course-item-disabled .course-name { color: var(--text-tertiary); text-decoration: line-through; text-decoration-color: rgba(156, 163, 175, 0.6); }
.course-item-disabled .meta-chip { color: #b0b7bf; background-color: transparent; border-color: var(--color-border-muted); }
.course-item-disabled .qty-display { display: none; }
.course-item-disabled:hover { border-color: var(--neutral-300); background-color: #f5f6f8; }
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
/* 課程卡（含名稱+剩餘 badge / 第二行 meta）使用直排 */
.course-text--stacked {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 6px;
}
.course-row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}
.course-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}
.course-name { font-weight: 600; font-size: var(--fs-base); line-height: 1.4; }
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-full);
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
  letter-spacing: 0.01em;
}
.meta-chip--price {
  color: var(--color-text-muted);
  background-color: var(--color-surface-muted);
  border-color: var(--color-border);
}
.meta-chip--schedule {
  color: var(--color-text-muted);
  background-color: var(--color-surface-muted);
  border-color: var(--color-border);
}
.meta-chip--schedule .icon { color: var(--ivy-teal); flex-shrink: 0; }
/* Phase 3 advisory chips：衝堂（danger 紅） */
.meta-chip--advisory .icon { flex-shrink: 0; }
.meta-chip--danger {
  color: var(--color-danger-darker);
  background-color: var(--color-danger-soft);
  border-color: rgba(220, 38, 38, 0.35);
}
/* supply-item 仍保留橫排 .price-tag */
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
.qty-display.is-available { background-color: var(--color-surface-muted); color: var(--color-text-muted); }
.qty-display.is-low { background-color: var(--color-danger-soft); color: var(--color-danger-darker); }
.qty-display.is-waiting { background-color: var(--color-warning-soft); color: var(--color-warning-darker); }
.qty-display.is-full { background-color: var(--color-border-muted); color: var(--text-secondary); }

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

/* 費用預估卡 */
.fee-preview {
  margin-top: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-mint) 100%);
  border: 1px solid rgba(13, 144, 83, 0.30);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(13, 144, 83, 0.08);
}
.fee-preview-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-primary-strong);
  margin-bottom: var(--space-3);
}
.fee-preview-title .icon {
  background-color: var(--color-primary);
  color: var(--neutral-0);
  border-radius: var(--radius-full);
  padding: 3px;
  width: 20px;
  height: 20px;
}
.fee-preview-count {
  margin-left: auto;
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.6);
  padding: 2px 10px;
  border-radius: var(--radius-full);
}
.fee-preview-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.fee-preview .fee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
.fee-preview .fee-row dt { margin: 0; font-weight: 500; }
.fee-preview .fee-row dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--color-text); }
.fee-preview .fee-row-total {
  padding-top: var(--space-3);
  margin-top: var(--space-1);
  border-top: 1px dashed rgba(13, 144, 83, 0.4);
  font-size: var(--fs-md);
}
.fee-preview .fee-row-total dt {
  font-weight: 700;
  color: var(--color-primary-strong);
}
.fee-preview .fee-row-total dd {
  font-weight: 700;
  color: var(--color-primary-strong);
  font-size: var(--fs-xl);
}
.fee-preview-note {
  margin-top: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  line-height: 1.5;
}

.fee-fade-enter-active, .fee-fade-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.fee-fade-enter-from, .fee-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Phase 3 課程提醒匯總卡 */
.advisory-panel {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(135deg, #fef3c7 0%, #fff8d6 100%);
  border: 1px solid rgba(217, 119, 6, 0.4);
  border-radius: var(--radius-md);
}
.advisory-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-warning-darker);
  margin-bottom: var(--space-2);
}
.advisory-panel-title .icon {
  flex-shrink: 0;
  color: var(--color-warning-hover);
}
.advisory-panel-hint {
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--color-text-subtle);
  margin-left: auto;
}
.advisory-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.advisory-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: var(--fs-sm);
  color: var(--color-text);
}
.advisory-course {
  font-weight: 600;
  color: var(--color-text);
}
.advisory-warnings {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.advisory-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
}
.advisory-tag--danger {
  color: var(--color-danger-darker);
  background-color: rgba(254, 226, 226, 0.95);
  border-color: rgba(220, 38, 38, 0.4);
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
  box-shadow: 0 6px 16px rgba(13, 144, 83, 0.25);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(13, 144, 83, 0.30);
}
.btn-primary:active:not(:disabled) { transform: translateY(0); box-shadow: 0 4px 10px rgba(13, 144, 83, 0.25); }
.btn-primary:disabled { background-color: var(--neutral-300); border-color: var(--neutral-300); color: var(--text-secondary); cursor: not-allowed; box-shadow: none; }
.submit-bar { margin-top: var(--space-3); }
.btn-submit { width: 100%; min-height: 56px; font-size: var(--fs-lg); }
.registration-nav-actions { display: flex; align-items: stretch; gap: var(--space-3); }

/* 送出失敗的持久錯誤：full border + tint（side-stripe ban），置於送出鈕正上方 */
.submit-error-panel {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-danger-soft);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: var(--radius-md);
}
.submit-error-panel .notice-icon { flex-shrink: 0; color: var(--color-danger); }
.submit-error-content strong {
  display: block;
  font-size: var(--fs-md);
  color: var(--color-danger);
  margin-bottom: 2px;
}
.submit-error-content p {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--color-text);
  line-height: 1.5;
}

/* 手機吸底 CTA 的合計列：桌機由 sticky fee-preview 呈現，預設隱藏 */
.submit-bar-total { display: none; }
.registration-nav-actions .btn-submit { flex: 1 1 auto; width: auto; }
.registration-back-button { flex: 0 0 auto; min-width: 112px; }

/* 桌機：fee-preview + submit-bar 一起 sticky 在 viewport 底，家長勾課程時不用
   回滾才看到金額；mobile 維持 inline。注意不用 backdrop-filter（避免落入
   glassmorphism 預設禁令），改用純白底 + 上下兩道 shadow 區隔。 */
.checkout-stick { margin-top: var(--space-3); }
@media (--bp-sm) {
  .checkout-stick {
    position: sticky;
    bottom: var(--space-3);
    z-index: 30;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    box-shadow:
      0 -2px 6px rgba(15, 23, 42, 0.04),
      0 12px 28px rgba(15, 23, 42, 0.12);
  }
  .checkout-stick .fee-preview { margin-top: 0; }
  .checkout-stick .submit-bar { margin-top: var(--space-3); }
}
.btn-block { width: 100%; }
.btn-outline {
  background-color: var(--color-surface);
  color: var(--color-primary-strong);
  border-color: var(--color-primary);
}
.btn-outline:hover:not(:disabled) { background-color: var(--color-primary-strong); color: var(--color-primary-contrast); }
.btn-outline--accent { color: var(--ivy-teal); border-color: var(--ivy-teal); }
.btn-outline--accent:hover:not(:disabled) { background-color: var(--ivy-teal); color: var(--neutral-0); border-color: var(--ivy-teal); }
.btn-actions-row {
  display: flex;
  gap: var(--space-2);
  justify-content: center;
  flex-wrap: wrap;
  margin-top: var(--space-3);
}
/* 副按鈕視覺壓低：text-link 風格，不跟主 submit 搶視覺重量；
   min-height 44px 撐開觸控區（spec #2），padding 維持不變以保留壓低觀感 */
.btn-actions-row .btn {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  font-weight: 500;
  font-size: var(--fs-sm);
  box-shadow: none;
}
.btn-actions-row .btn:hover:not(:disabled) {
  background: var(--color-surface-muted);
  border-color: transparent;
  color: var(--color-text);
  transform: none;
  box-shadow: none;
}
.btn-actions-row .btn .icon,
.btn-actions-row .btn svg {
  width: 14px;
  height: 14px;
}

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
.video-btn:hover { background-color: var(--color-accent); color: var(--neutral-0); transform: scale(1.03); }
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

/* Toast 樣式已搬至 components/ToastStack.vue 自帶的 <style scoped>。
   同時把原本 border-left: 4px solid 違反「side-stripe ban」的設計改成
   background tint + 1px full border。 */

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
  color: var(--color-primary-strong);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.modal-title .icon { color: var(--color-primary-strong); }
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
  color: var(--neutral-0);
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
  color: var(--color-primary-strong);
  margin: 0 0 var(--space-3) 0;
}
.contact-school-name .icon { color: var(--color-primary-strong); }
.contact-school-detail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-top: var(--space-1);
}
.contact-school-detail .icon { flex-shrink: 0; color: var(--color-primary-strong); }
.contact-school-detail a { color: var(--color-primary-strong); font-weight: 600; text-decoration: none; }
.contact-form-intro {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  margin-bottom: var(--space-4);
  border-top: 1px dashed var(--color-border);
  font-size: var(--fs-sm);
  color: var(--ivy-teal);
  font-weight: 500;
}
.contact-form-intro .icon { color: var(--ivy-teal); }

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
@media (--to-md) {
  .grid-layout { grid-template-columns: 1fr; gap: var(--space-6); }
  /* 單欄堆疊順序：海報 → 報名表 → 說明與注意事項。
     海報是這頁的 DM 本體（家長從 LINE@ 連結點進來，第一眼要先知道在報什麼），
     所以放最前面；但「爸比媽咪…」介紹文與四條注意事項留在表單之後，否則第一個
     輸入框會被推到約 900px 之下——底部固定 CTA 從首次繪製就在畫面上，家長最先能
     點的東西就變成那顆「下一步」。（真按下去 focusFirstError() 會捲到出錯欄位，
     不會卡死，但仍以少滑一段為佳。）
     col-left 改 display:contents 把海報與說明攤平成 grid item，才能各自排序。 */
  .col-left { display: contents; }
  .poster-wrapper { order: 1; }
  .col-right { order: 2; }
  .info-box { order: 3; }
  .page-header {
    grid-template-columns: 1fr;
    gap: var(--space-5);
    padding: var(--space-6);
  }
  .page-brand {
    padding-right: 0;
    padding-bottom: var(--space-5);
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
  /* 單欄堆疊後，品牌文字被 LOGO 往右推了約 85px，標題卻從卡片 padding 起算，
     兩條左緣對不齊，標題看起來孤零零貼在最左。標題與招生資訊改置中收掉這條
     參差；品牌區維持 LOGO 在旁的橫排（改成堆疊置中會讓 header 長高約 60px，
     把 DM 海報往下推）。 */
  .page-meta {
    align-items: center;
    text-align: center;
  }
  .page-meta-row { justify-content: center; }
}
@media (--to-sm) {
  .public-activity-page { padding: 0; }
  .page-wrapper { border-radius: 0; box-shadow: none; }
  .page-header { border-radius: 0; }
  .page-header { padding: var(--space-5); gap: var(--space-4); }
  .page-brand { gap: var(--space-4); padding-bottom: var(--space-4); }
  .page-brand-logo { width: 72px; height: 72px; }
  .page-brand-prefix { font-size: var(--fs-xs); letter-spacing: 0.3em; }
  .page-subtitle { font-size: var(--fs-xl); }
  /* 為 sticky CTA 預留空間，避免遮擋頁尾文字 */
  .page-body { padding: var(--space-5); padding-bottom: 96px; }
  .form-card-body { padding: var(--space-1) var(--space-4) var(--space-4); }
  .registration-steps { gap: 4px; padding: 4px; }
  .registration-step-tab { flex-direction: column; gap: 3px; min-height: 56px; padding: 6px 3px; font-size: 11px; }
  .registration-step-index { width: 21px; height: 21px; }
  .review-details { grid-template-columns: 1fr; }
  .btn-actions-row { flex-direction: column; }
  .toast-container { top: auto; bottom: 96px; right: var(--space-3); left: var(--space-3); }
  .toast { min-width: 0; max-width: none; }

  /* 手機版主 CTA 固定在螢幕底部：手機上表單很長，sticky 只在捲到該區塊時才吸附，
     fixed 才能讓送出鈕從落地到送出全程都在拇指範圍內。 */
  .submit-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    background: rgba(255, 252, 232, 0.92);
    backdrop-filter: blur(12px) saturate(1.2);
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    border-top: 2px solid var(--color-primary);
    box-shadow: 0 -10px 32px rgba(13, 144, 83, 0.12);
    z-index: 50;
  }
  .btn-submit { min-height: 52px; font-size: var(--fs-md); }
  .registration-back-button { min-width: 84px; padding-inline: var(--space-3); }

  /* 手機吸底 CTA 帶合計：fee-preview 在內文流會被滾出視野，家長勾完課
     不用回滾就能看到金額（桌機由 sticky fee-preview 負責，此列僅手機顯示） */
  .registration-nav-actions { flex-wrap: wrap; }
  .submit-bar-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex: 1 0 100%;
    margin-bottom: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-text-muted);
  }
  .submit-bar-total strong {
    color: var(--color-primary-strong);
    font-size: var(--fs-md);
    font-variant-numeric: tabular-nums;
  }

  /* 行動裝置 fee-preview 預留底部空間，避免被吸底 CTA 遮 */
  .fee-preview { margin-bottom: 0; }

  /* 課程列：影片按鈕在小螢幕往下換行更舒服 */
  .course-item { flex-wrap: wrap; }
  .video-btn { margin: 0 var(--space-4) var(--space-3); }

  /* 行動裝置課程卡 meta-chip 字級略縮 */
  .meta-chip { padding: 2px 8px; }
  .course-item-disabled::after { top: 6px; right: 6px; padding: 1px 6px; font-size: 9px; }
}
</style>

<style>
/* 非 scoped：上面的 <style scoped> 加的 data-v-* 不會落到 ContactInquiryModal /
   SuccessSummaryModal 等子元件 DOM 上，導致 modal 顯示時 layout 整片失效。
   這裡用 .public-activity-page ancestor 重新 export 一份共用規則；其他頁面
   不會用到 .public-activity-page 這個 class，因此不會洩漏到 admin / portal。
   CoursePickerSection / VideoModal / ToastStack 已各自 scoped，不重複寫。 */

.public-activity-page .modal-overlay {
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
.public-activity-page .modal-overlay.is-visible { display: flex; }
.public-activity-page .modal-panel {
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
.public-activity-page .modal-panel--video { max-width: 900px; padding: var(--space-5); }
.public-activity-page .modal-panel--video .modal-close {
  position: absolute;
  top: -46px;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-md);
}
.public-activity-page .modal-panel--video .modal-title {
  position: absolute;
  top: -46px;
  left: 0;
  color: var(--neutral-0);
  font-size: var(--fs-md);
}
.public-activity-page .video-wrapper {
  width: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
}
.public-activity-page .video-wrapper video,
.public-activity-page .video-wrapper iframe {
  width: 100%;
  max-height: 72vh;
  display: block;
  border: 0;
}
.public-activity-page .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.public-activity-page .modal-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--color-primary-strong);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.public-activity-page .modal-title .icon { color: var(--color-primary-strong); }
.public-activity-page .modal-close {
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
  transition:
    background-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.public-activity-page .modal-close:hover {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
  transform: rotate(90deg);
}
.public-activity-page .modal-body { padding: var(--space-5); }

/* Contact modal */
.public-activity-page .contact-school-card {
  padding: var(--space-4) var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-muted) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
.public-activity-page .contact-school-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--color-primary-strong);
  margin: 0 0 var(--space-3) 0;
}
.public-activity-page .contact-school-name .icon { color: var(--color-primary-strong); }
.public-activity-page .contact-school-detail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-top: var(--space-1);
}
.public-activity-page .contact-school-detail .icon { flex-shrink: 0; color: var(--color-primary-strong); }
.public-activity-page .contact-school-detail a { color: var(--color-primary-strong); font-weight: 600; text-decoration: none; }
.public-activity-page .contact-form-intro {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  margin-bottom: var(--space-4);
  border-top: 1px dashed var(--color-border);
  font-size: var(--fs-sm);
  color: var(--ivy-teal);
  font-weight: 500;
}
.public-activity-page .contact-form-intro .icon { color: var(--ivy-teal); }
.public-activity-page .field-group { margin-bottom: var(--space-4); }
.public-activity-page .field-group:last-of-type { margin-bottom: var(--space-5); }
.public-activity-page .field-group label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.public-activity-page .field-group textarea {
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
.public-activity-page .field-group textarea:focus { outline: none; border-color: var(--color-primary); box-shadow: var(--focus-ring); }

/* shared input/btn primitives — 子元件 modal 用到 */
.public-activity-page .input-text,
.public-activity-page .input-select {
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
.public-activity-page .input-text::placeholder { color: var(--color-text-subtle); }
.public-activity-page .input-text:hover { border-color: var(--neutral-300); }
.public-activity-page .input-text:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.public-activity-page .required-mark { color: var(--color-required); font-weight: 700; }

.public-activity-page .btn {
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
.public-activity-page .btn-primary {
  background-color: var(--color-cta);
  color: var(--color-cta-contrast);
  border-color: var(--color-cta);
  box-shadow: 0 6px 16px rgba(13, 144, 83, 0.25);
}
.public-activity-page .btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(13, 144, 83, 0.30);
}
.public-activity-page .btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 4px 10px rgba(13, 144, 83, 0.25);
}
.public-activity-page .btn-primary:disabled {
  background-color: var(--neutral-300);
  border-color: var(--neutral-300);
  color: var(--text-secondary);
  cursor: not-allowed;
  box-shadow: none;
}
.public-activity-page .btn-block { width: 100%; }
.public-activity-page .btn-outline {
  background-color: var(--color-surface);
  color: var(--color-primary-strong);
  border-color: var(--color-primary);
}
.public-activity-page .btn-outline:hover:not(:disabled) {
  background-color: var(--color-primary-strong);
  color: var(--color-primary-contrast);
}

/* keyframes 在 <style scoped> 內會被 Vue 加 hash 後綴跨不過去，
   這裡再定義一份不帶 hash 的給非 scoped 規則使用 */
@keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideIn {
  from { transform: translateY(24px) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .public-activity-page .modal-overlay,
  .public-activity-page .modal-panel { animation: none; }
}
</style>
