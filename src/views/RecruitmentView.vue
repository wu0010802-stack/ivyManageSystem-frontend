<template>
  <div class="recruitment-view" v-loading="loadingStats">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="page-title">招生統計儀表板</h2>
          <p class="page-subtitle">招生漏斗 · 轉換率 · 區域分析</p>
        </div>
      </div>
      <div class="header-actions">
        <el-select
          v-model="referenceMonth"
          size="small"
          placeholder="參考月份"
          clearable
          style="width: 140px"
          @change="handleReferenceMonthChange"
        >
          <el-option
            v-for="month in options.months"
            :key="month"
            :label="month"
            :value="month"
          />
        </el-select>
        <el-button
          v-if="canWrite"
          size="small"
          @click="openMonthDialog"
        >管理月份</el-button>
        <el-button
          type="success"
          size="small"
          :loading="exportingExcel"
          @click="handleExportExcel"
        >匯出 Excel</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          size="small"
          @click="openAddDialog"
        >新增訪視記錄</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-click="onTabClick">
      <!-- ==================== 總覽 ==================== -->
      <el-tab-pane label="總覽" name="overview">
        <RecruitmentOverviewTab
          :stats="stats"
          :reference-month="referenceMonth"
          :decision-summary="stats.decision_summary"
          :funnel-snapshot="stats.funnel_snapshot"
          :month-over-month="stats.month_over_month"
          :alerts="stats.alerts"
          :top-action-queue="stats.top_action_queue"
          :show-charts="isChartTabActive('overview')"
          :monthly-table-data="monthlyTableData"
          :monthly-bar-data="monthlyBarData"
          :monthly-rate-data="monthlyRateData"
          :bar-options="barOptions"
          :monthly-bar-options="monthlyBarOptions"
          :line-options="percentLineOptions"
          :bar-component="Bar"
          :line-component="Line"
          :fmt-rate="fmtRate"
          @navigate="handleDashboardTarget"
        />
      </el-tab-pane>

      <!-- ==================== 班別分析 ==================== -->
      <el-tab-pane label="班別分析" name="class" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各班別參觀人數</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('class') && classBarData" :data="classBarData" :options="classBarOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>各班別預繳率</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('class') && classRateData" :data="classRateData" :options="percentHorizBarOptions" />
            </div>
          </el-card>
        </div>
        <el-card style="margin-bottom:16px">
          <template #header>班別統計</template>
          <el-table :data="stats.by_grade" border stripe size="small">
            <el-table-column prop="grade" label="班別" width="100" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card>
          <template #header>月份 × 班別分布</template>
          <el-table :data="monthGradeTableData" border stripe size="small">
            <el-table-column prop="month" label="月份" width="90" fixed="left" />
            <el-table-column
              v-for="g in GRADES_ORDER"
              :key="g"
              :label="g"
              :prop="g"
              align="center"
              width="80"
            />
            <el-table-column prop="合計" label="合計" align="center" width="80" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ==================== 來源分析 ==================== -->
      <el-tab-pane label="來源分析" name="source" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各來源參觀人數排名</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('source') && sourceBarData" :data="sourceBarData" :options="sourceClickBarOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>各來源預繳率</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('source') && sourceRateData" :data="sourceRateData" :options="percentHorizBarOptions" />
            </div>
          </el-card>
        </div>
        <el-card>
          <template #header>來源排名明細</template>
          <el-table :data="stats.by_source" border stripe size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="source" label="來源" min-width="120" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ==================== 接待分析 ==================== -->
      <el-tab-pane label="接待分析" name="staff" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>接待人員參觀量</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('staff') && staffBarData" :data="staffBarData" :options="barOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>接待人員預繳率</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('staff') && staffRateData" :data="staffRateData" :options="percentBarOptions" />
            </div>
          </el-card>
        </div>
        <el-card style="margin-bottom:16px">
          <template #header>接待人員統計</template>
          <el-table :data="stats.by_referrer" border stripe size="small">
            <el-table-column prop="referrer" label="接待人員" width="120" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card style="margin-bottom:16px">
          <template #header>接待人員 × 各年級預繳率</template>
          <el-table :data="stats.by_referrer" border stripe size="small">
            <el-table-column prop="referrer" label="接待人員" width="120" fixed="left" />
            <el-table-column
              v-for="g in GRADES_ORDER"
              :key="g"
              :label="g"
              align="center"
              width="120"
            >
              <template #default="{ row }">
                <template v-if="row.by_grade && row.by_grade[g]">
                  {{ row.by_grade[g].visit }}人 / {{ fmtPct(row.by_grade[g].deposit, row.by_grade[g].visit) }}
                </template>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card v-if="stats.referrer_source_cross && stats.referrer_source_cross.referrers">
          <template #header>介紹者 × 來源 交叉分析</template>
          <el-table :data="stats.referrer_source_cross.referrers" border stripe size="small" style="overflow-x:auto">
            <el-table-column prop="referrer" label="介紹者" width="110" fixed="left" />
            <el-table-column
              v-for="src in stats.referrer_source_cross.sources"
              :key="src"
              :label="src"
              align="center"
              min-width="90"
            >
              <template #default="{ row }">
                {{ row.sources[src] ?? 0 }}
              </template>
            </el-table-column>
            <el-table-column label="合計" align="center" width="70">
              <template #default="{ row }">{{ row.total }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ==================== 區域分析 ==================== -->
      <el-tab-pane label="區域分析" name="area" lazy>

        <!-- 1. 緊湊標頭：中心點 + 完整度 + 操作 -->
        <div class="area-header-bar">
          <div class="area-campus-info">
            <span class="area-campus-name">{{ currentCampus.campus_name }}</span>
            <span class="area-campus-addr">{{ currentCampus.campus_address || '尚未設定地址' }}</span>
            <span class="area-campus-coord" :class="{ 'area-campus-coord-warn': !campusGeocodedOk }">
              <template v-if="campusGeocodedOk">
                {{ campusSetting.campus_lat.toFixed(4) }}, {{ campusSetting.campus_lng.toFixed(4) }}
              </template>
              <template v-else>
                座標未設定（熱點圖使用預設位置）—請點「設定中心點」→「自動定位」
              </template>
            </span>
          </div>
          <div class="area-header-meta">
            <el-tag
              :type="marketSnapshot.data_completeness === 'complete' ? 'success' : 'warning'"
              effect="light"
              size="small"
            >
              {{ marketSnapshot.data_completeness === 'complete' ? '資料完整' : marketSnapshot.data_completeness === 'cached' ? '快取中' : '部分資料' }}
            </el-tag>
            <el-tag effect="plain" size="small">
              {{ currentCampus.travel_mode === 'walking' ? '步行' : currentCampus.travel_mode === 'cycling' ? '騎車' : '開車' }}
            </el-tag>
            <el-tag v-if="!campusGeocodedOk" type="danger" effect="light" size="small">
              座標未設定
            </el-tag>
            <span class="area-sync-time">
              上次同步：{{ marketSnapshot.synced_at ? new Date(marketSnapshot.synced_at).toLocaleString() : '尚未同步' }}
            </span>
          </div>
          <div class="header-actions" v-if="canWrite">
            <el-button size="small" @click="openCampusDialog">設定中心點</el-button>
            <el-button type="primary" size="small" :loading="syncingMarket" @click="handleMarketSync">同步市場情報</el-button>
          </div>
        </div>

        <!-- 2. 生活圈 KPI（帶百分比 + 進度條） -->
        <div class="kpi-row area-kpi-row">
          <el-card
            v-for="band in distanceBandKPI"
            :key="band.label"
            class="kpi-card area-band-card"
            :class="areaBandCardClass(band.label)"
            shadow="hover"
          >
            <div class="area-band-top">
              <div class="kpi-value">{{ band.visit }}</div>
              <div class="area-band-pct">
                {{ distanceBandTotal ? `${Math.round(band.visit / distanceBandTotal * 100)}%` : '—' }}
              </div>
            </div>
            <div class="kpi-label">{{ band.label }}</div>
            <div class="area-band-bar-track">
              <div
                class="area-band-bar-fill"
                :style="{ width: distanceBandTotal ? `${(band.visit / distanceBandTotal * 100).toFixed(1)}%` : '0%' }"
              />
            </div>
          </el-card>
        </div>

        <!-- 3. 圖表（總覽先行） -->
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各行政區 90 天來源量</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('area') && areaBarData" :data="areaBarData" :options="horizBarOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>生活圈分佈</template>
            <div class="chart-box">
              <Doughnut v-if="isChartTabActive('area') && distanceDoughnutData" :data="distanceDoughnutData" :options="doughnutOptions" />
            </div>
          </el-card>
        </div>

        <!-- 4. 行政區比較表（可點擊選取，inline 展開明細） -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <div class="area-table-header">
              <span>行政區比較表</span>
              <span class="area-table-hint">點擊列篩選熱點圖</span>
            </div>
          </template>
          <el-table
            :data="districtMarketRows"
            border
            stripe
            size="small"
            :row-class-name="({ row }) => row.district === selectedMarketDistrict ? 'district-row-selected' : ''"
            style="cursor:pointer"
            @row-click="selectedMarketDistrict = selectedMarketDistrict === $event.district ? '' : $event.district"
          >
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="district" label="行政區" width="100" />
            <el-table-column prop="lead_count_30d" label="30 天來源" align="center" width="100" sortable />
            <el-table-column prop="lead_count_90d" label="90 天來源" align="center" width="100" sortable />
            <el-table-column prop="deposit_rate_90d" label="90 天預繳率" align="center" width="120" sortable>
              <template #default="{ row }">{{ fmtRate(row.deposit_rate_90d) }}</template>
            </el-table-column>
            <el-table-column prop="avg_travel_minutes" label="平均通勤" align="center" width="110" sortable>
              <template #default="{ row }">{{ row.avg_travel_minutes != null ? `${row.avg_travel_minutes.toFixed(1)} 分` : '—' }}</template>
            </el-table-column>
            <el-table-column prop="population_density" label="人口密度" align="center" width="100" sortable>
              <template #default="{ row }">{{ row.population_density != null ? row.population_density.toFixed(1) : '—' }}</template>
            </el-table-column>
            <el-table-column prop="population_0_6" label="0-6 歲" align="center" width="100" sortable>
              <template #default="{ row }">{{ row.population_0_6 ?? '—' }}</template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 5. 家長地址熱點圖 -->
        <el-card style="margin-bottom:0" v-loading="loadingAreaHotspots || loadingMarket">
          <template #header>家長地址熱點圖</template>
          <RecruitmentAddressHeatmap
            :hotspots="areaHotspotsSummary.hotspots"
            :campus="currentCampus"
            :travel-bands="TRAVEL_BANDS"
            :selected-district="selectedMarketDistrict"
            :records-with-address="areaHotspotsSummary.records_with_address"
            :total-hotspots="areaHotspotsSummary.total_hotspots"
            :geocoded-hotspots="areaHotspotsSummary.geocoded_hotspots"
            :pending-hotspots="areaHotspotsSummary.pending_hotspots"
            :stale-hotspots="areaHotspotsSummary.stale_hotspots"
            :failed-hotspots="areaHotspotsSummary.failed_hotspots"
            :provider-available="areaHotspotsSummary.provider_available"
            :provider-name="areaHotspotsSummary.provider_name"
            :school-lat="currentCampus.campus_lat"
            :school-lng="currentCampus.campus_lng"
            :can-write="canWrite"
            :syncing-mode="syncingAreaHotspotsMode"
            :nearby-schools="nearbySchools"
            :nearby-schools-loading="loadingNearbySchools"
            :nearby-schools-available="nearbySchoolsAvailable"
            :nearby-schools-message="nearbySchoolsMessage"
            :fmt-pct="fmtPct"
            @sync="handleAreaHotspotSync"
            @viewport-change="handleNearbyViewportChange"
            @set-as-campus="handleSetAsCampus"
          />
        </el-card>

      </el-tab-pane>

      <!-- ==================== 未預繳原因分析 ==================== -->
      <el-tab-pane label="未預繳原因" name="nodeposit" lazy>
        <RecruitmentNoDepositTab
          :show-charts="isChartTabActive('nodeposit')"
          :no-deposit-reason-bar-data="noDepositReasonBarData"
          :no-deposit-grade-bar-data="noDepositGradeBarData"
          :horiz-bar-options="horizBarOptions"
          :no-deposit-grade-options="noDepositGradeBarOptions"
          :bar-component="Bar"
          :reason-options="options.no_deposit_reasons"
          :grades="GRADES_ORDER"
          :summary="ndSummary"
          :priority="ndFilter.priority"
          :reason="ndFilter.reason"
          :grade="ndFilter.grade"
          :overdue-days="ndFilter.overdue_days"
          :cold-only="ndFilter.cold_only"
          :page="ndFilter.page"
          :page-size="ndFilter.page_size"
          :total="ndTotal"
          :records="ndData"
          :loading="loadingND"
          @update:priority="ndFilter.priority = $event"
          @update:reason="ndFilter.reason = $event"
          @update:grade="ndFilter.grade = $event"
          @update:overdue-days="ndFilter.overdue_days = $event"
          @update:cold-only="ndFilter.cold_only = $event"
          @filter-change="onNoDepositFilterChange"
          @page-change="onNDPageChange"
        />
      </el-tab-pane>

      <!-- ==================== 童年綠地分析 ==================== -->
      <el-tab-pane label="童年綠地" name="chuannian" lazy>
        <div class="kpi-row">
          <el-card class="kpi-card kpi-green" shadow="hover">
            <div class="kpi-value">{{ stats.chuannian_visit ?? 0 }}</div>
            <div class="kpi-label">童年綠地參觀總數</div>
            <div class="kpi-sub">含雅婷班導認列</div>
          </el-card>
          <el-card class="kpi-card kpi-green" shadow="hover">
            <div class="kpi-value">{{ stats.chuannian_deposit ?? 0 }}</div>
            <div class="kpi-label">其中已預繳</div>
          </el-card>
          <el-card class="kpi-card" shadow="hover">
            <div class="kpi-value">{{ chuannianNoDeposit }}</div>
            <div class="kpi-label">其中未預繳</div>
          </el-card>
          <el-card class="kpi-card kpi-blue" shadow="hover">
            <div class="kpi-value">{{ fmtPct(stats.chuannian_deposit, stats.chuannian_visit) }}</div>
            <div class="kpi-label">童年綠地預繳率</div>
          </el-card>
          <el-card class="kpi-card" shadow="hover">
            <div class="kpi-value">{{ fmtPct(stats.chuannian_visit, stats.total_visit) }}</div>
            <div class="kpi-label">佔總參觀比例</div>
          </el-card>
        </div>

        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>預計就讀月份分佈（參觀 vs 預繳）</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('chuannian') && chuannianExpectedBarData" :data="chuannianExpectedBarData" :options="barOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>童年綠地各班別分佈</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('chuannian') && chuannianGradeBarData" :data="chuannianGradeBarData" :options="horizBarOptions" />
            </div>
          </el-card>
        </div>

        <div class="chart-row" style="margin-bottom:0">
          <el-card>
            <template #header>預計就讀月份明細</template>
            <el-table
              v-if="stats.chuannian_by_expected && stats.chuannian_by_expected.length"
              :data="stats.chuannian_by_expected"
              border stripe size="small"
            >
              <el-table-column prop="expected_month" label="預計就讀月份" min-width="140" />
              <el-table-column prop="visit" label="人數" align="center" width="80" />
              <el-table-column prop="deposit" label="預繳" align="center" width="80" />
              <el-table-column label="未預繳" align="center" width="80">
                <template #default="{ row }">{{ row.visit - row.deposit }}</template>
              </el-table-column>
              <el-table-column label="預繳率" align="center" width="100">
                <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暫無童年綠地資料" />
          </el-card>
          <el-card>
            <template #header>童年綠地各班別統計</template>
            <el-table
              v-if="stats.chuannian_by_grade && stats.chuannian_by_grade.length"
              :data="stats.chuannian_by_grade"
              border stripe size="small"
            >
              <el-table-column prop="grade" label="班別" width="100" />
              <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
              <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
              <el-table-column label="預繳率" align="center" width="100">
                <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- ==================== 近五年轉換整合 ==================== -->
      <el-tab-pane label="近五年轉換" name="periods" lazy>
        <RecruitmentPeriodsTab
          :can-write="canWrite"
          :show-charts="isChartTabActive('periods')"
          :periods-summary="periodsSummary"
          :periods="periods"
          :loading-periods="loadingPeriods"
          :periods-trend-data="periodsTrendData"
          :periods-count-bar-data="periodsCountBarData"
          :line-options="percentLineOptions"
          :bar-options="barOptions"
          :line-component="Line"
          :bar-component="Bar"
          :fmt-rate="fmtRate"
          @open-add="openPeriodAdd"
          @sync="handlePeriodSync"
          @edit="openPeriodEdit"
          @delete="handlePeriodDelete"
        />
      </el-tab-pane>

      <!-- ==================== 原始明細 ==================== -->
      <el-tab-pane label="原始明細" name="detail" lazy>
        <RecruitmentDetailTab
          :can-write="canWrite"
          :options="options"
          :filters="filter"
          :detail-data="detailData"
          :detail-total="detailTotal"
          :loading-detail="loadingDetail"
          :row-class-name="depositRowClass"
          @update-filter="updateDetailFilter"
          @filter-change="fetchDetail"
          @keyword-input="fetchDetailDebounced"
          @clear-filter="clearFilter"
          @page-change="onPageChange"
          @edit="openEditDialog"
          @delete="handleDelete"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- ==================== 管理月份 Dialog ==================== -->
    <el-dialog v-model="monthDialogVisible" title="管理登記月份" width="420px">
      <!-- 已登記月份列表 -->
      <el-table :data="registeredMonths" border stripe size="small" style="margin-bottom:16px">
        <el-table-column prop="month" label="月份" />
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-button
              type="danger"
              size="small"
              text
              @click="handleDeleteMonth(row.month)"
            >刪除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <span style="color:#999">尚未手動登記任何月份</span>
        </template>
      </el-table>

      <!-- 新增月份輸入列 -->
      <div style="display:flex;gap:8px;align-items:center">
        <el-input
          v-model="newMonthInput"
          placeholder="輸入月份，如 115.04"
          size="small"
          style="flex:1"
          @keyup.enter="handleAddMonth"
        />
        <el-button
          type="primary"
          size="small"
          :loading="monthSaving"
          @click="handleAddMonth"
        >新增</el-button>
      </div>
      <div style="margin-top:6px;font-size:12px;color:#909399">
        格式：民國年.月，如 115.04（刪除只移除登記，不影響訪視記錄）
      </div>

      <template #footer>
        <el-button @click="monthDialogVisible = false">關閉</el-button>
      </template>
    </el-dialog>

    <!-- ==================== 新增/編輯訪視記錄 Dialog ==================== -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增訪視記錄' : '編輯訪視記錄'"
      width="680px"
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="95px" size="small">

        <!-- ── 基本資料 ── -->
        <div class="form-section-title">基本資料</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="參觀日期" prop="month">
              <el-date-picker
                v-model="form.month_raw"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="選擇參觀日期（年月日）"
                style="width:100%"
              />
              <div v-if="form.visit_date" style="font-size:11px;color:#909399;margin-top:2px">
                民國：{{ form.visit_date }}（月份：{{ form.month }}）
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="序號">
              <el-input v-model="form.seq_no" placeholder="選填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="幼生姓名" prop="child_name">
              <el-input v-model="form.child_name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="適讀班級">
              <el-select v-model="form.grade" clearable style="width:100%">
                <el-option v-for="g in GRADES_ORDER" :key="g" :label="g" :value="g" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生日">
              <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- ── 聯絡與來源 ── -->
        <div class="form-section-title">聯絡與來源</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="電話">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="行政區">
              <el-autocomplete
                v-model="form.district"
                :fetch-suggestions="districtQuery"
                clearable
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="地址">
              <el-input v-model="form.address" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="幼生來源">
              <el-autocomplete
                v-model="form.source"
                :fetch-suggestions="sourceQuery"
                clearable
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="介紹者">
              <el-autocomplete
                v-model="form.referrer"
                :fetch-suggestions="referrerQuery"
                clearable
                style="width:100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- ── 預繳狀態 ── -->
        <div class="form-section-title">預繳狀態</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="是否預繳">
              <el-switch
                v-model="form.has_deposit"
                active-text="已預繳"
                inactive-text="未預繳"
                @change="onDepositChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收預繳人員">
              <el-input v-model="form.deposit_collector" :disabled="!form.has_deposit" placeholder="預繳時填寫" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="已報到/註冊">
              <el-switch v-model="form.enrolled" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="轉其他學期">
              <el-switch v-model="form.transfer_term" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
          <!-- 未預繳相關欄位：只在未預繳時顯示 -->
          <template v-if="!form.has_deposit">
            <el-col :span="24">
              <el-form-item label="未預繳原因">
                <el-select v-model="form.no_deposit_reason" clearable placeholder="請選擇原因" style="width:100%">
                  <el-option v-for="r in options.no_deposit_reasons" :key="r" :label="r" :value="r" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="原因說明">
                <el-input v-model="form.no_deposit_reason_detail" type="textarea" :rows="2" placeholder="詳細說明（選填）" />
              </el-form-item>
            </el-col>
          </template>
        </el-row>

        <!-- ── 備註 ── -->
        <div class="form-section-title">備註</div>
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item label="備註">
              <el-input v-model="form.notes" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="電訪回應">
              <el-input v-model="form.parent_response" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
      </template>
    </el-dialog>

    <!-- ==================== 近五年期間 Dialog ==================== -->
    <el-dialog
      v-model="periodDialogVisible"
      :title="periodDialogMode === 'add' ? '新增招生期間' : '編輯招生期間'"
      width="560px"
    >
      <el-form :model="periodForm" ref="periodFormRef" label-width="110px" size="small">
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item label="期間名稱" prop="period_name" :rules="[{required:true,message:'必填'}]">
              <el-input v-model="periodForm.period_name" placeholder="如 114.09.16~115.03.15" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="參觀人數"><el-input-number v-model="periodForm.visit_count" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="預繳人數"><el-input-number v-model="periodForm.deposit_count" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="實際註冊"><el-input-number v-model="periodForm.enrolled_count" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="轉其他學期"><el-input-number v-model="periodForm.transfer_term_count" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="有效預繳"><el-input-number v-model="periodForm.effective_deposit_count" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="未就讀退預繳"><el-input-number v-model="periodForm.not_enrolled_deposit" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="註冊後退學"><el-input-number v-model="periodForm.enrolled_after_school" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序"><el-input-number v-model="periodForm.sort_order" :min="0" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="備註"><el-input v-model="periodForm.notes" type="textarea" :rows="2" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="periodDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPeriod" @click="handlePeriodSave">儲存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="campusDialogVisible"
      title="設定園所中心點"
      width="540px"
    >
      <el-form :model="campusForm" label-width="100px" size="small">
        <el-form-item label="園所名稱">
          <el-input v-model="campusForm.campus_name" />
        </el-form-item>
        <el-form-item label="園所地址">
          <div style="display:flex;gap:8px;width:100%">
            <el-input
              v-model="campusForm.campus_address"
              placeholder="請填完整地址，例：高雄市三民區義華路68號"
              style="flex:1"
              @change="campusGeocodeDirty = true"
            />
            <el-button
              size="small"
              :loading="geocodingCampus"
              :disabled="!campusForm.campus_address"
              @click="geocodeCampusAddress"
            >自動定位</el-button>
          </div>
        </el-form-item>

        <el-alert
          v-if="campusForm.campus_lat == null || campusForm.campus_lng == null"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom:12px"
        >
          <template #default>
            <span>座標尚未設定，熱點圖將使用預設位置。請填入地址後點「自動定位」，或手動輸入緯度 / 經度。</span>
          </template>
        </el-alert>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="緯度">
              <el-input-number
                v-model="campusForm.campus_lat"
                :step="0.0001"
                :precision="6"
                placeholder="例：22.647xxx"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="經度">
              <el-input-number
                v-model="campusForm.campus_lng"
                :step="0.0001"
                :precision="6"
                placeholder="例：120.314xxx"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <div
          v-if="campusForm.campus_lat != null && campusForm.campus_lng != null"
          class="campus-coord-preview"
        >
          <span>預覽：</span>
          <a
            :href="`https://www.openstreetmap.org/?mlat=${campusForm.campus_lat}&mlon=${campusForm.campus_lng}#map=17/${campusForm.campus_lat}/${campusForm.campus_lng}`"
            target="_blank"
            rel="noreferrer"
          >
            {{ campusForm.campus_lat.toFixed(6) }}, {{ campusForm.campus_lng.toFixed(6) }} →在地圖上確認
          </a>
        </div>

        <el-form-item label="交通模式">
          <el-select v-model="campusForm.travel_mode" style="width:100%">
            <el-option label="開車" value="driving" />
            <el-option label="步行" value="walking" />
            <el-option label="騎車" value="cycling" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="campusDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingCampus" @click="handleCampusSave">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRecruitmentRecords,
  createRecruitmentRecord,
  updateRecruitmentRecord,
  deleteRecruitmentRecord,
  getNoDepositAnalysis,
  createPeriod,
  updatePeriod,
  deletePeriod,
  syncPeriod,
  getMonths,
  addMonth,
  deleteMonth,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { getUserInfo, PERMISSION_VALUES } from '@/utils/auth'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useRecruitmentArea, createEmptyCampus } from '@/composables/useRecruitmentArea'
import { useRecruitmentPeriods } from '@/composables/useRecruitmentPeriods'
import RecruitmentOverviewTab from '@/components/recruitment/RecruitmentOverviewTab.vue'
import RecruitmentAddressHeatmap from '@/components/recruitment/RecruitmentAddressHeatmap.vue'
import RecruitmentNoDepositTab from '@/components/recruitment/RecruitmentNoDepositTab.vue'
import RecruitmentPeriodsTab from '@/components/recruitment/RecruitmentPeriodsTab.vue'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'


// -------- Chart.js 延遲載入 --------
let _chartReady = null
const ensureChartReady = () => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement,
      PointElement, LineElement, ArcElement,
      Title, Tooltip, Legend,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, BarElement,
        PointElement, LineElement, ArcElement,
        Title, Tooltip, Legend,
      )
    })
  }
  return _chartReady
}

const Bar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)
const Line = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line))
)
const Doughnut = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Doughnut))
)

// -------- 常數 --------
const GRADES_ORDER = ['幼幼班', '小班', '中班', '大班']
const FALLBACK_SCHOOL_LAT = 22.6420
const FALLBACK_SCHOOL_LNG = 120.3243
const TRAVEL_BANDS = [10, 15, 20]
const AREA_HOTSPOT_DISPLAY_LIMIT = 200
const AREA_HOTSPOT_SYNC_BATCH_SIZE = 20
const AREA_HOTSPOT_MAX_SYNC_ROUNDS = 100

// -------- 權限 --------
const canWrite = computed(() => {
  try {
    const info = getUserInfo()
    if (!info) return false
    if (info.permissions === -1 || info.permissions === null || info.permissions === undefined) return true
    const val = BigInt(PERMISSION_VALUES.RECRUITMENT_WRITE)
    return (BigInt(info.permissions) & val) === val
  } catch { return false }
})

// -------- 狀態 --------
const activeTab = ref('overview')
const loadingDetail = ref(false)
const loadingND = ref(false)
const saving = ref(false)
const detailLoaded = ref(false)
const ndLoaded = ref(false)
const areaLoaded = ref(false)
const periodsLoaded = ref(false)

const savingPeriod = ref(false)

const detailData = ref([])
const detailTotal = ref(0)
const filter = ref({
  month: null, grade: null, source: null, referrer: null,
  has_deposit: null, no_deposit_reason: null, keyword: '',
  page: 1, page_size: 50,
})

// 未預繳分析
const ndData = ref([])
const ndTotal = ref(0)
const emptyNDFilter = () => ({
  priority: 'high',
  reason: null,
  grade: null,
  overdue_days: null,
  cold_only: false,
  page: 1,
  page_size: 50,
})
const emptyNDSummary = () => ({
  high_potential_count: 0,
  overdue_followup_count: 0,
  cold_count: 0,
})
const ndFilter = ref(emptyNDFilter())
const ndSummary = ref(emptyNDSummary())

const {
  stats,
  options,
  loadingStats,
  optionsLoaded,
  exportingExcel,
  referenceMonth,
  invalidateOptions,
  fetchOptions,
  fetchStats,
  loadDashboard,
  setReferenceMonth,
  handleExportExcel,
} = useRecruitmentDashboard({
  notifyError: (message) => ElMessage.error(message),
})

const {
  loadingAreaHotspots,
  syncingAreaHotspotsMode,
  loadingMarket,
  syncingMarket,
  savingCampus,
  loadingNearbySchools,
  areaHotspotsSummary,
  campusSetting,
  marketSnapshot,
  nearbySchools,
  nearbySchoolsAvailable,
  nearbySchoolsMessage,
  selectedMarketDistrict,
  campusDialogVisible,
  campusForm,
  loadAreaTab: loadAreaData,
  fetchNearbySchools,
  handleAreaHotspotSync: syncAreaHotspotsAction,
  handleMarketSync: syncMarketAction,
  openCampusDialog: openCampusDialogAction,
  handleCampusSave: saveCampusSettingAction,
} = useRecruitmentArea({
  notifyError: (message) => ElMessage.error(message),
  notifyWarning: (message) => ElMessage.warning(message),
  notifySuccess: (message) => ElMessage.success(message),
  displayLimit: AREA_HOTSPOT_DISPLAY_LIMIT,
  syncBatchSize: AREA_HOTSPOT_SYNC_BATCH_SIZE,
  maxSyncRounds: AREA_HOTSPOT_MAX_SYNC_ROUNDS,
  fallbackCampusLat: FALLBACK_SCHOOL_LAT,
  fallbackCampusLng: FALLBACK_SCHOOL_LNG,
})

const {
  loadingPeriods,
  periods,
  periodsSummary,
  fetchPeriods,
} = useRecruitmentPeriods({
  notifyError: (message) => ElMessage.error(message),
})

let debounceTimer = null
const fetchDetailDebounced = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDetail(), 400)
}

const invalidateLazyTabs = () => {
  detailLoaded.value = false
  ndLoaded.value = false
  areaLoaded.value = false
  periodsLoaded.value = false

}

const isChartTabActive = (tabName) => activeTab.value === tabName

// -------- 訪視記錄 Dialog --------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const editingId = ref(null)
const formRef = ref(null)
const emptyForm = () => ({
  month: '', month_raw: null, seq_no: '', visit_date: '', child_name: '',
  birthday: null, grade: null, phone: '', address: '',
  district: '', source: '', referrer: '', deposit_collector: '',
  has_deposit: false, enrolled: false, transfer_term: false,
  no_deposit_reason: null, no_deposit_reason_detail: '',
  notes: '', parent_response: '',
})
const form = ref(emptyForm())
const formRules = {
  month: [{ required: true, message: '請選擇參觀日期', trigger: 'blur' }],
  child_name: [{ required: true, message: '請填寫姓名', trigger: 'blur' }],
}

// -------- 近五年期間 Dialog --------
const periodDialogVisible = ref(false)
const periodDialogMode = ref('add')
const editingPeriodId = ref(null)
const periodFormRef = ref(null)
const emptyPeriodForm = () => ({
  period_name: '', visit_count: 0, deposit_count: 0,
  enrolled_count: 0, transfer_term_count: 0, effective_deposit_count: 0,
  not_enrolled_deposit: 0, enrolled_after_school: 0, notes: '', sort_order: 0,
})
const periodForm = ref(emptyPeriodForm())

// -------- 管理月份 Dialog --------
const monthDialogVisible = ref(false)
const registeredMonths   = ref([])
const newMonthInput      = ref('')
const monthSaving        = ref(false)

const _validateMonthFormat = (v) => {
  const parts = v.trim().split('.')
  if (parts.length !== 2) return false
  const num = parseInt(parts[1], 10)
  return !isNaN(num) && num >= 1 && num <= 12
}

const openMonthDialog = async () => {
  monthDialogVisible.value = true
  try {
    const res = await getMonths()
    registeredMonths.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入月份失敗'))
  }
}

const handleAddMonth = async () => {
  const month = newMonthInput.value.trim()
  if (!month) return
  if (!_validateMonthFormat(month)) {
    ElMessage.warning('格式錯誤，請輸入民國年.月，如 115.04')
    return
  }
  monthSaving.value = true
  try {
    const res = await addMonth(month)
    registeredMonths.value.push(res.data)
    registeredMonths.value.sort((a, b) => a.month.localeCompare(b.month))
    newMonthInput.value = ''
    ElMessage.success(`已登記月份 ${month}`)
    invalidateOptions()
    if (detailLoaded.value || ndLoaded.value) {
      await fetchOptions(true)
    }
  } catch (e) {
    const msg = e.response?.status === 409 ? `月份 ${month} 已存在` : apiError(e, '新增失敗')
    ElMessage.error(msg)
  } finally {
    monthSaving.value = false
  }
}

const handleDeleteMonth = async (month) => {
  try {
    await ElMessageBox.confirm(`確定刪除登記月份「${month}」？`, '確認刪除', {
      type: 'warning',
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteMonth(month)
    registeredMonths.value = registeredMonths.value.filter(r => r.month !== month)
    ElMessage.success(`已刪除登記月份 ${month}`)
    invalidateOptions()
    if (detailLoaded.value || ndLoaded.value) {
      await fetchOptions(true)
    }
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// -------- 日期轉換工具（西元 ↔ 民國）--------
const isoToRoc = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(y) - 1911}.${m}.${d}`
}
const isoToRocMonth = (iso) => {
  if (!iso) return ''
  const [y, m] = iso.split('-')
  return `${parseInt(y) - 1911}.${m}`
}
const rocDateToISO = (roc) => {
  if (!roc) return null
  const parts = roc.split('.')
  if (parts.length < 3) return null
  const year = parseInt(parts[0]) + 1911
  return `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
}
const rocMonthToISO = (rm) => {
  if (!rm) return null
  const parts = rm.split('.')
  if (parts.length < 2) return null
  const year = parseInt(parts[0]) + 1911
  return `${year}-${parts[1].padStart(2, '0')}`
}

// 監聽參觀日期選擇器（YYYY-MM-DD）→ 同步 visit_date 與 month（民國格式）
watch(() => form.value.month_raw, (iso) => {
  if (iso) {
    form.value.visit_date = isoToRoc(iso)
    form.value.month = isoToRocMonth(iso.substring(0, 7))
  } else {
    form.value.visit_date = ''
    form.value.month = ''
  }
})

// -------- 訪視記錄 Dialog helpers --------
const _makeSuggestions = (list, query, cb) => {
  const q = (query || '').trim().toLowerCase()
  const items = list
    .filter(v => !q || v.toLowerCase().includes(q))
    .map(v => ({ value: v }))
  cb(items)
}

const districtQuery = (query, cb) => {
  const districts = (stats.value.by_district || []).map(d => d.district).filter(Boolean)
  _makeSuggestions(districts, query, cb)
}
const sourceQuery   = (query, cb) => _makeSuggestions(options.value.sources   || [], query, cb)
const referrerQuery = (query, cb) => _makeSuggestions(options.value.referrers || [], query, cb)

const onDepositChange = (val) => {
  if (val) {
    form.value.no_deposit_reason        = null
    form.value.no_deposit_reason_detail = ''
  } else {
    form.value.deposit_collector = ''
  }
}

const fetchDetail = async () => {
  loadingDetail.value = true
  try {
    const params = { page: filter.value.page, page_size: filter.value.page_size }
    if (filter.value.month) params.month = filter.value.month
    if (filter.value.grade) params.grade = filter.value.grade
    if (filter.value.source) params.source = filter.value.source
    if (filter.value.referrer) params.referrer = filter.value.referrer
    if (filter.value.has_deposit !== null && filter.value.has_deposit !== undefined)
      params.has_deposit = filter.value.has_deposit
    if (filter.value.no_deposit_reason) params.no_deposit_reason = filter.value.no_deposit_reason
    if (filter.value.keyword) params.keyword = filter.value.keyword

    const res = await getRecruitmentRecords(params)
    detailData.value = res.data.records
    detailTotal.value = res.data.total
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入明細失敗'))
    return false
  } finally {
    loadingDetail.value = false
  }
}

const fetchNoDeposit = async () => {
  loadingND.value = true
  try {
    const params = { page: ndFilter.value.page, page_size: ndFilter.value.page_size }
    if (ndFilter.value.priority) params.priority = ndFilter.value.priority
    if (ndFilter.value.reason) params.reason = ndFilter.value.reason
    if (ndFilter.value.grade) params.grade = ndFilter.value.grade
    if (ndFilter.value.overdue_days) params.overdue_days = ndFilter.value.overdue_days
    if (ndFilter.value.cold_only) params.cold_only = true
    const res = await getNoDepositAnalysis(params)
    ndData.value = res.data.records
    ndTotal.value = res.data.total
    ndSummary.value = {
      ...emptyNDSummary(),
      ...(res.data.summary || {}),
    }
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入未預繳資料失敗'))
    return false
  } finally {
    loadingND.value = false
  }
}

const loadDetailTab = async (force = false) => {
  const [detailOk] = await Promise.all([
    fetchDetail(),
    fetchOptions(force),
  ])
  if (detailOk) detailLoaded.value = true
}

const loadNoDepositTab = async (force = false) => {
  const [ndOk] = await Promise.all([
    fetchNoDeposit(),
    fetchOptions(force),
  ])
  if (ndOk) ndLoaded.value = true
}

const loadAreaTab = async () => {
  const ok = await loadAreaData()
  if (ok) areaLoaded.value = true
}

const loadPeriodsTab = async () => {
  const ok = await fetchPeriods()
  if (ok) periodsLoaded.value = true
}


const handleAreaHotspotSync = async (mode = 'incremental') => {
  const ok = await syncAreaHotspotsAction(mode)
  if (ok) areaLoaded.value = true
}

const handleMarketSync = async () => {
  const ok = await syncMarketAction()
  if (ok) areaLoaded.value = true
}

const handleNearbyViewportChange = async (bounds) => {
  await fetchNearbySchools(bounds)
}

const openCampusDialog = () => {
  openCampusDialogAction()
}

const handleSetAsCampus = async ({ lat, lng, name, address }) => {
  campusForm.value = {
    ...campusSetting.value,
    campus_lat: lat,
    campus_lng: lng,
    ...(address ? { campus_address: address } : {}),
  }
  const ok = await saveCampusSettingAction()
  if (ok) areaLoaded.value = true
}

const handleCampusSave = async () => {
  const ok = await saveCampusSettingAction()
  if (ok) areaLoaded.value = true
}

const campusGeocodedOk = computed(() =>
  campusSetting.value?.campus_lat != null && campusSetting.value?.campus_lng != null
)

const geocodingCampus = ref(false)
const campusGeocodeDirty = ref(false)

const geocodeCampusAddress = async () => {
  const address = campusForm.value?.campus_address
  if (!address) return
  geocodingCampus.value = true
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', address)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'tw')
    const response = await fetch(url.toString(), {
      headers: { 'Accept-Language': 'zh-Hant-TW,zh-TW;q=0.9' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data.length > 0) {
      campusForm.value.campus_lat = parseFloat(data[0].lat)
      campusForm.value.campus_lng = parseFloat(data[0].lon)
      campusGeocodeDirty.value = false
      ElMessage.success(`已定位：${data[0].display_name}`)
    } else {
      ElMessage.warning('找不到此地址，請嘗試填寫更精確的地址（含縣市區），或直接手動輸入座標')
    }
  } catch {
    ElMessage.error('自動定位服務暫時無法使用，請手動輸入緯度 / 經度')
  } finally {
    geocodingCampus.value = false
  }
}

onMounted(() => {
  loadDashboard()
})

const handleReferenceMonthChange = async (value) => {
  await setReferenceMonth(value || null)
}

const onTabClick = async (tab) => {
  if (tab?.paneName) activeTab.value = tab.paneName
  if (tab.paneName === 'detail' && !detailLoaded.value) await loadDetailTab()
  if (tab.paneName === 'nodeposit' && !ndLoaded.value) await loadNoDepositTab()
  if (tab.paneName === 'area' && !areaLoaded.value) await loadAreaTab()
  if (tab.paneName === 'periods' && !periodsLoaded.value) await loadPeriodsTab()

}

// -------- 篩選 --------
const clearFilter = () => {
  filter.value = {
    ...filter.value,
    month: null, grade: null, source: null, referrer: null,
    has_deposit: null, no_deposit_reason: null, keyword: '', page: 1,
  }
  fetchDetail()
}

const updateDetailFilter = (patch) => {
  filter.value = {
    ...filter.value,
    ...patch,
  }
}

const drillToDetail = (patch) => {
  filter.value = {
    month: null, grade: null, source: null, referrer: null,
    has_deposit: null, no_deposit_reason: null, keyword: '',
    page: 1, page_size: filter.value.page_size,
    ...patch,
  }
  activeTab.value = 'detail'
  detailLoaded.value = true
  fetchDetail()
}

const applyNoDepositFilter = async (patch = {}) => {
  ndFilter.value = {
    ...emptyNDFilter(),
    page_size: ndFilter.value.page_size,
    ...patch,
    page: 1,
  }
  activeTab.value = 'nodeposit'
  await loadNoDepositTab(true)
}

const handleDashboardTarget = async (target = {}) => {
  const targetTab = target.target_tab
  const targetFilter = target.target_filter || {}

  if (targetTab === 'detail') {
    filter.value = {
      month: null,
      grade: null,
      source: null,
      referrer: null,
      has_deposit: null,
      no_deposit_reason: null,
      keyword: '',
      page: 1,
      page_size: filter.value.page_size,
      ...targetFilter,
    }
    activeTab.value = 'detail'
    await loadDetailTab(true)
    return
  }

  if (targetTab === 'nodeposit') {
    await applyNoDepositFilter(targetFilter)
    return
  }

  if (targetTab === 'area') {
    activeTab.value = 'area'
    await loadAreaTab()
    if (targetFilter.district) selectedMarketDistrict.value = targetFilter.district
  }
}

const onPageChange = (page) => {
  filter.value.page = page
  fetchDetail()
}

const onNoDepositFilterChange = () => {
  ndFilter.value.page = 1
  fetchNoDeposit()
}

const onNDPageChange = (page) => {
  ndFilter.value.page = page
  fetchNoDeposit()
}

// -------- 訪視記錄 CRUD --------
const openAddDialog = async () => {
  await fetchOptions()
  form.value = emptyForm()
  dialogMode.value = 'add'
  editingId.value = null
  dialogVisible.value = true
}

const openEditDialog = async (row) => {
  await fetchOptions()
  form.value = {
    month: row.month,
    month_raw: rocDateToISO(row.visit_date) ?? rocMonthToISO(row.month),  // 優先用完整日期還原
    seq_no: row.seq_no,
    visit_date: row.visit_date ?? '',
    child_name: row.child_name, birthday: row.birthday,
    grade: row.grade, phone: row.phone, address: row.address,
    district: row.district, source: row.source, referrer: row.referrer,
    deposit_collector: row.deposit_collector, has_deposit: row.has_deposit,
    enrolled: row.enrolled ?? false, transfer_term: row.transfer_term ?? false,
    no_deposit_reason: row.no_deposit_reason ?? null,
    no_deposit_reason_detail: row.no_deposit_reason_detail ?? '',
    notes: row.notes, parent_response: row.parent_response,
  }
  dialogMode.value = 'edit'
  editingId.value = row.id
  dialogVisible.value = true
}

const handleSave = async () => {
  await formRef.value.validate()
  saving.value = true
  // 排除前端內部用的 month_raw，不送到後端
  const { month_raw: _mr, ...payload } = form.value
  try {
    if (dialogMode.value === 'add') {
      await createRecruitmentRecord(payload)
      ElMessage.success('新增成功')
    } else {
      await updateRecruitmentRecord(editingId.value, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    await fetchStats()
    invalidateOptions()
    invalidateLazyTabs()
    if (activeTab.value === 'detail') await loadDetailTab(true)
    if (activeTab.value === 'nodeposit') await loadNoDepositTab(true)
    if (activeTab.value === 'area') await loadAreaTab()
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  await ElMessageBox.confirm('確定刪除此筆記錄？', '確認', { type: 'warning', center: true })
  try {
    await deleteRecruitmentRecord(id)
    ElMessage.success('刪除成功')
    await fetchStats()
    invalidateOptions()
    invalidateLazyTabs()
    if (activeTab.value === 'detail') await loadDetailTab(true)
    if (activeTab.value === 'nodeposit') await loadNoDepositTab(true)
    if (activeTab.value === 'area') await loadAreaTab()
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// -------- 近五年期間 CRUD --------
const openPeriodAdd = () => {
  periodForm.value = emptyPeriodForm()
  periodDialogMode.value = 'add'
  editingPeriodId.value = null
  periodDialogVisible.value = true
}

const openPeriodEdit = (row) => {
  periodForm.value = {
    period_name: row.period_name,
    visit_count: row.visit_count,
    deposit_count: row.deposit_count,
    enrolled_count: row.enrolled_count,
    transfer_term_count: row.transfer_term_count,
    effective_deposit_count: row.effective_deposit_count,
    not_enrolled_deposit: row.not_enrolled_deposit,
    enrolled_after_school: row.enrolled_after_school,
    notes: row.notes ?? '',
    sort_order: row.sort_order,
  }
  periodDialogMode.value = 'edit'
  editingPeriodId.value = row.id
  periodDialogVisible.value = true
}

const handlePeriodSave = async () => {
  await periodFormRef.value.validate()
  savingPeriod.value = true
  try {
    if (periodDialogMode.value === 'add') {
      await createPeriod(periodForm.value)
      ElMessage.success('新增成功')
    } else {
      await updatePeriod(editingPeriodId.value, periodForm.value)
      ElMessage.success('更新成功')
    }
    periodDialogVisible.value = false
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    savingPeriod.value = false
  }
}

const handlePeriodDelete = async (id) => {
  await ElMessageBox.confirm('確定刪除此期間記錄？', '確認', { type: 'warning' })
  try {
    await deletePeriod(id)
    ElMessage.success('刪除成功')
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const handlePeriodSync = async (id) => {
  try {
    await syncPeriod(id)
    ElMessage.success('期間數據已從訪視明細更新')
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '同步失敗'))
  }
}

// -------- 輔助函式 --------
const fmtPct = (deposit, visit) => {
  if (!visit) return '0%'
  return (deposit / visit * 100).toFixed(1) + '%'
}

/** 將後端回傳的百分比數值格式化為字串，如 51.8 → "51.8%" */
const fmtRate = (rate) => {
  if (rate == null || rate === 0) return '0%'
  return Number(rate).toFixed(1) + '%'
}

/** 期間標籤縮短：114.09.16~115.03.15 → 114.09~115.03 */
const shortPeriodLabel = (name) => {
  const m = name.match(/(\d{3}\.\d{2})\.\d{2}[~-](\d{3}\.\d{2})\.\d{2}/)
  return m ? `${m[1]}~${m[2]}` : name.slice(0, 12)
}

const depositRowClass = ({ row }) => row.has_deposit ? 'deposit-row' : ''

// -------- 月度圖表 --------
const monthlyTableData = computed(() => stats.value.monthly)

const monthlyBarData = computed(() => {
  const data = stats.value.monthly
  if (!data.length) return null
  return {
    labels: data.map(m => m.month),
    datasets: [
      { label: '參觀人數', data: data.map(m => m.visit), backgroundColor: '#74c69d', borderRadius: 4 },
      { label: '預繳人數', data: data.map(m => m.deposit), backgroundColor: '#40916c', borderRadius: 4 },
      { label: '註冊人數', data: data.map(m => m.enrolled ?? 0), backgroundColor: '#1d4ed8', borderRadius: 4 },
    ],
  }
})

const monthlyRateData = computed(() => {
  const data = stats.value.monthly
  if (!data.length) return null
  return {
    labels: data.map(m => m.month),
    datasets: [
      {
        label: '參觀→預繳率 (%)',
        data: data.map(m => m.visit_to_deposit_rate ?? 0),
        borderColor: '#40916c',
        backgroundColor: 'rgba(64,145,108,0.15)',
        tension: 0.3,
        fill: false,
      },
      {
        label: '參觀→註冊率 (%)',
        data: data.map(m => m.visit_to_enrolled_rate ?? 0),
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29,78,216,0.15)',
        tension: 0.3,
        fill: false,
      },
      {
        label: '排除轉期→註冊率 (%)',
        data: data.map(m => m.effective_to_enrolled_rate ?? 0),
        borderColor: '#e76f51',
        backgroundColor: 'rgba(231,111,81,0.15)',
        tension: 0.3,
        fill: false,
      },
    ],
  }
})

// -------- 圖表互動 options --------
const monthlyBarOptions = computed(() => ({
  ...barOptions,
  onClick: (_ev, elements, chart) => {
    if (!elements.length) return
    drillToDetail({ month: chart.data.labels[elements[0].index] })
  },
}))

const classBarOptions = computed(() => ({
  ...barOptions,
  onClick: (_ev, elements, chart) => {
    if (!elements.length) return
    drillToDetail({ grade: chart.data.labels[elements[0].index] })
  },
}))

const sourceClickBarOptions = computed(() => ({
  ...horizBarOptions,
  onClick: (_ev, elements, chart) => {
    if (!elements.length) return
    drillToDetail({ source: chart.data.labels[elements[0].index] })
  },
}))

// -------- 班別圖表 --------
const gradeByMap = computed(() => new Map(stats.value.by_grade.map(g => [g.grade, g])))

const classBarData = computed(() => {
  const gm = gradeByMap.value
  return {
    labels: GRADES_ORDER,
    datasets: [
      { label: '參觀人數', data: GRADES_ORDER.map(g => gm.get(g)?.visit ?? 0), backgroundColor: '#74c69d', borderRadius: 4 },
    ],
  }
})

const classRateData = computed(() => {
  const gm = gradeByMap.value
  return {
    labels: GRADES_ORDER,
    datasets: [{
      label: '預繳率 (%)',
      data: GRADES_ORDER.map(g => { const d = gm.get(g); return d?.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0 }),
      backgroundColor: '#40916c',
      borderRadius: 4,
    }],
  }
})

const monthGradeTableData = computed(() => {
  const mg = stats.value.month_grade
  return Object.keys(mg).sort().map(m => ({ month: m, ...mg[m] }))
})

// -------- 來源圖表 --------
const sourceBarData = computed(() => {
  const data = stats.value.by_source
  if (!data.length) return null
  return {
    labels: data.map(d => d.source),
    datasets: [{
      label: '參觀人數',
      data: data.map(d => d.visit),
      backgroundColor: '#52b788',
      borderRadius: 4,
    }],
  }
})

const sourceRateData = computed(() => {
  const data = stats.value.by_source
  if (!data.length) return null
  return {
    labels: data.map(d => d.source),
    datasets: [{
      label: '預繳率 (%)',
      data: data.map(d => d.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0),
      backgroundColor: '#40916c',
      borderRadius: 4,
    }],
  }
})

// -------- 接待圖表 --------
const staffBarData = computed(() => {
  const data = stats.value.by_referrer
  if (!data.length) return null
  return {
    labels: data.map(d => d.referrer),
    datasets: [{
      label: '參觀人數',
      data: data.map(d => d.visit),
      backgroundColor: '#74c69d',
      borderRadius: 4,
    }],
  }
})

const staffRateData = computed(() => {
  const data = stats.value.by_referrer
  if (!data.length) return null
  return {
    labels: data.map(d => d.referrer),
    datasets: [{
      label: '預繳率 (%)',
      data: data.map(d => d.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0),
      backgroundColor: '#40916c',
      borderRadius: 4,
    }],
  }
})

// -------- 童年綠地 computed --------
const chuannianNoDeposit = computed(() =>
  (stats.value.chuannian_visit ?? 0) - (stats.value.chuannian_deposit ?? 0)
)

const chuannianExpectedBarData = computed(() => {
  const data = stats.value.chuannian_by_expected
  if (!data || !data.length) return null
  return {
    labels: data.map(d => d.expected_month),
    datasets: [
      { label: '預繳', data: data.map(d => d.deposit), backgroundColor: '#40916c', borderRadius: 4 },
      { label: '未預繳', data: data.map(d => d.visit - d.deposit), backgroundColor: '#e76f51', borderRadius: 4 },
    ],
  }
})

const chuannianGradeBarData = computed(() => {
  const data = stats.value.chuannian_by_grade
  if (!data || !data.length) return null
  return {
    labels: data.map(d => d.grade),
    datasets: [
      { label: '預繳', data: data.map(d => d.deposit), backgroundColor: '#40916c', borderRadius: 4 },
      { label: '未預繳', data: data.map(d => d.visit - d.deposit), backgroundColor: '#e76f51', borderRadius: 4 },
    ],
  }
})

// -------- 近五年轉換圖表 computed --------
const periodsTrendData = computed(() => {
  const trend = periodsSummary.value?.trend
  if (!trend || !trend.length) return null
  return {
    labels: trend.map(d => shortPeriodLabel(d.period_name)),
    datasets: [
      {
        label: '參觀→預繳率(%)',
        data: trend.map(d => d.visit_to_deposit_rate),
        borderColor: '#52b788',
        backgroundColor: 'rgba(82,183,136,0.15)',
        tension: 0.3,
        fill: false,
      },
      {
        label: '參觀→註冊率(%)',
        data: trend.map(d => d.visit_to_enrolled_rate),
        borderColor: '#40916c',
        backgroundColor: 'rgba(64,145,108,0.15)',
        tension: 0.3,
        fill: false,
      },
      {
        label: '預繳→註冊率(%)',
        data: trend.map(d => d.deposit_to_enrolled_rate),
        borderColor: '#3182ce',
        backgroundColor: 'rgba(49,130,206,0.15)',
        tension: 0.3,
        fill: false,
      },
    ],
  }
})

const periodsCountBarData = computed(() => {
  const trend = periodsSummary.value?.trend
  if (!trend || !trend.length) return null
  return {
    labels: trend.map(d => shortPeriodLabel(d.period_name)),
    datasets: [
      { label: '參觀', data: trend.map(d => d.visit_count), backgroundColor: '#74c69d', borderRadius: 4 },
      { label: '預繳', data: trend.map(d => d.deposit_count), backgroundColor: '#52b788', borderRadius: 4 },
      { label: '註冊', data: trend.map(d => d.enrolled_count), backgroundColor: '#40916c', borderRadius: 4 },
      { label: '未就讀退', data: trend.map(d => d.not_enrolled_deposit ?? 0), backgroundColor: '#f59e0b', borderRadius: 4 },
      { label: '註冊後退', data: trend.map(d => d.enrolled_after_school ?? 0), backgroundColor: '#e76f51', borderRadius: 4 },
    ],
  }
})

// -------- 未預繳原因圖表 --------
const noDepositReasonBarData = computed(() => {
  const data = stats.value.no_deposit_reasons
  if (!data || !data.length) return null
  return {
    labels: data.map(d => d.reason),
    datasets: [{
      label: '未預繳筆數',
      data: data.map(d => d.count),
      backgroundColor: '#e76f51',
      borderRadius: 4,
    }],
  }
})

const noDepositGradeBarData = computed(() => {
  const data = stats.value.no_deposit_reasons
  if (!data || !data.length) return null
  const colors = ['#74c69d', '#52b788', '#40916c', '#2d6a4f']
  return {
    labels: data.map(d => d.reason),
    datasets: GRADES_ORDER.map((g, i) => ({
      label: g,
      data: data.map(d => d.by_grade?.[g] ?? 0),
      backgroundColor: colors[i],
      borderRadius: 4,
    })),
  }
})

// -------- 區域圖表 --------
function travelBand(minutes) {
  if (minutes == null) return '未明'
  if (minutes <= 10) return '10 分鐘內'
  if (minutes <= 15) return '11-15 分鐘'
  if (minutes <= 20) return '16-20 分鐘'
  return '20 分鐘以上'
}

const currentCampus = computed(() => ({
  ...createEmptyCampus(FALLBACK_SCHOOL_LAT, FALLBACK_SCHOOL_LNG),
  ...campusSetting.value,
  ...(marketSnapshot.value.campus || {}),
  campus_lat: marketSnapshot.value.campus?.campus_lat ?? campusSetting.value.campus_lat ?? FALLBACK_SCHOOL_LAT,
  campus_lng: marketSnapshot.value.campus?.campus_lng ?? campusSetting.value.campus_lng ?? FALLBACK_SCHOOL_LNG,
}))

const districtMarketRows = computed(() =>
  (marketSnapshot.value.districts || []).map((row) => ({
    ...row,
    travel_band: travelBand(row.avg_travel_minutes),
  }))
)

const distanceBandKPI = computed(() => {
  const bands = ['10 分鐘內', '11-15 分鐘', '16-20 分鐘', '20 分鐘以上', '未明']
  return bands.map((label) => ({
    label,
    visit: districtMarketRows.value
      .filter((row) => row.travel_band === label)
      .reduce((sum, row) => sum + (row.lead_count_90d || 0), 0),
  }))
})

const distanceBandTotal = computed(() =>
  distanceBandKPI.value.reduce((sum, band) => sum + (band.visit || 0), 0)
)

const areaBandCardClass = (label) => {
  if (label === '10 分鐘內') return 'area-band-near'
  if (label === '11-15 分鐘') return 'area-band-mid'
  if (label === '16-20 分鐘') return 'area-band-far'
  if (label === '20 分鐘以上') return 'area-band-xfar'
  return 'area-band-unknown'
}

const areaBarData = computed(() => {
  const rows = districtMarketRows.value.filter((row) => row.district !== '未填寫')
  if (!rows.length) return null
  return {
    labels: rows.map((row) => row.district),
    datasets: [{
      label: '90 天來源量',
      data: rows.map((row) => row.lead_count_90d || 0),
      backgroundColor: '#52b788',
      borderRadius: 4,
    }],
  }
})

const distanceDoughnutData = computed(() => ({
  labels: distanceBandKPI.value.map((item) => item.label),
  datasets: [{
    data: distanceBandKPI.value.map((item) => item.visit),
    backgroundColor: ['#2f855a', '#52b788', '#f4a261', '#e76f51', '#a0aec0'],
  }],
}))

// -------- Chart options --------
const truncateChartLabel = (label, max = 12) => (
  typeof label === 'string' && label.length > max ? `${label.slice(0, max)}…` : label
)

const extractChartValue = (context) => {
  const parsed = context?.parsed
  if (typeof parsed === 'number') return parsed
  if (parsed && typeof parsed.y === 'number') return parsed.y
  if (parsed && typeof parsed.x === 'number') return parsed.x
  return Number(context?.raw ?? 0)
}

const formatPercentTooltip = (context) => {
  const label = context?.dataset?.label ? `${context.dataset.label}: ` : ''
  const value = Number(extractChartValue(context) ?? 0)
  return `${label}${value.toFixed(1)}%`
}

const percentTickFormatter = (value) => `${value}%`

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
}

const barOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'top' } },
}

const horizBarOptions = {
  ...commonChartOptions,
  indexAxis: 'y',
  plugins: { legend: { display: false } },
}

const percentBarOptions = {
  ...barOptions,
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: percentTickFormatter },
    },
  },
  plugins: {
    ...barOptions.plugins,
    tooltip: {
      callbacks: {
        label: formatPercentTooltip,
      },
    },
  },
}

const percentHorizBarOptions = {
  ...horizBarOptions,
  scales: {
    x: {
      min: 0,
      max: 100,
      ticks: { callback: percentTickFormatter },
    },
  },
  plugins: {
    ...horizBarOptions.plugins,
    tooltip: {
      callbacks: {
        label: formatPercentTooltip,
      },
    },
  },
}

const lineOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'top' } },
}

const percentLineOptions = {
  ...lineOptions,
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: percentTickFormatter },
    },
  },
  plugins: {
    ...lineOptions.plugins,
    tooltip: {
      callbacks: {
        label: formatPercentTooltip,
      },
    },
  },
}

const noDepositGradeBarOptions = {
  ...barOptions,
  scales: {
    x: {
      ticks: {
        callback(value) {
          return truncateChartLabel(this.getLabelForValue(value))
        },
        maxRotation: 0,
        minRotation: 0,
      },
    },
  },
}

const doughnutOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'bottom' } },
}
</script>

<style scoped>
/* ── Design Tokens ── */
.recruitment-view {
  --rv-primary:      #1E40AF;
  --rv-primary-lt:   #DBEAFE;
  --rv-secondary:    #3B82F6;
  --rv-accent:       #D97706;
  --rv-bg:           #F8FAFC;
  --rv-surface:      #FFFFFF;
  --rv-muted:        #E9EEF6;
  --rv-border:       #DBEAFE;
  --rv-text:         #1E293B;
  --rv-text-2:       #64748B;
  --rv-success:      #16A34A;
  --rv-danger:       #DC2626;
  --rv-font-num:     'Fira Code', ui-monospace, monospace;
}

.recruitment-view {
  padding: 24px;
  background: var(--rv-bg);
  min-height: 100%;
}

/* ── Page Header ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--rv-surface);
  border: 1px solid var(--rv-border);
  border-radius: 14px;
  border-left: 4px solid var(--rv-primary);
  box-shadow: 0 1px 4px rgba(30,64,175,0.07);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--rv-primary-lt);
  color: var(--rv-primary);
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--rv-text);
  letter-spacing: -0.01em;
}

.page-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--rv-text-2);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.form-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  border-left: 3px solid #409eff;
  padding-left: 8px;
  margin: 12px 0 8px;
  line-height: 1.4;
}
.form-section-title:first-child {
  margin-top: 0;
}
:deep(.kpi-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
:deep(.kpi-card) {
  flex: 1;
  min-width: 130px;
  border-left: 4px solid var(--rv-primary, #1E40AF);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
:deep(.kpi-card:hover) {
  box-shadow: 0 4px 16px rgba(30, 64, 175, 0.10);
  transform: translateY(-1px);
}
:deep(.kpi-card.kpi-accent) { border-left-color: #D97706; }
:deep(.kpi-card.kpi-blue)   { border-left-color: #3B82F6; }
:deep(.kpi-card.kpi-teal)   { border-left-color: #0891B2; }
:deep(.kpi-card.kpi-green)  { border-left-color: #16A34A; }
:deep(.kpi-value) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--rv-primary, #1E3A8A);
  font-variant-numeric: tabular-nums;
}
:deep(.kpi-card.kpi-accent .kpi-value) { color: #B45309; }
:deep(.kpi-card.kpi-blue   .kpi-value) { color: #1D4ED8; }
:deep(.kpi-card.kpi-teal   .kpi-value) { color: #0E7490; }
:deep(.kpi-card.kpi-green  .kpi-value) { color: #15803D; }
:deep(.kpi-label) {
  font-size: 0.78rem;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
:deep(.kpi-sub) { font-size: 0.78rem; color: #94A3B8; }
:deep(.chart-row) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
:deep(.chart-card) { overflow: hidden; }
:deep(.chart-box) {
  height: 280px;
  position: relative;
}
:deep(.chart-box-tall) { height: 360px; }
:deep(.filter-bar) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
:deep(.record-count) {
  margin-left: auto;
  font-size: 0.85rem;
  color: #718096;
}
:deep(.pagination) {
  margin-top: 12px;
  justify-content: flex-end;
}
:deep(.deposit-row) { background: #f0fff4 !important; }

/* -------- 區域分析：標頭 -------- */
.area-header-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--rv-surface, #fff);
  border: 1px solid var(--rv-border, #DBEAFE);
  border-left: 4px solid var(--rv-secondary, #3B82F6);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(30, 64, 175, 0.06);
}
.area-campus-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 180px;
}
.area-campus-name {
  font-weight: 700;
  font-size: 0.97rem;
  color: var(--rv-text, #1E293B);
}
.area-campus-addr {
  font-size: 0.8rem;
  color: var(--rv-text-2, #64748B);
}
.area-campus-coord {
  font-size: 0.75rem;
  color: #94A3B8;
  font-variant-numeric: tabular-nums;
  font-family: 'Fira Code', ui-monospace, monospace;
}
.area-header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.area-sync-time {
  font-size: 0.75rem;
  color: #94A3B8;
}

/* -------- KPI 生活圈進度條 -------- */
.area-kpi-row {
  margin-bottom: 16px;
}
.area-band-card {
  border-left: 4px solid #40916c;
}
.area-band-near  { border-left-color: #2f855a; }
.area-band-mid   { border-left-color: #52b788; }
.area-band-far   { border-left-color: #f4a261; }
.area-band-xfar  { border-left-color: #e76f51; }
.area-band-unknown { border-left-color: #a0aec0; }

.area-band-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}
.area-band-pct {
  font-size: 0.82rem;
  font-weight: 600;
  color: #718096;
}
.area-band-bar-track {
  margin-top: 6px;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.area-band-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: currentColor;
  transition: width 0.4s ease;
}
.area-band-near  .area-band-bar-fill { background: #2f855a; }
.area-band-mid   .area-band-bar-fill { background: #52b788; }
.area-band-far   .area-band-bar-fill { background: #f4a261; }
.area-band-xfar  .area-band-bar-fill { background: #e76f51; }
.area-band-unknown .area-band-bar-fill { background: #a0aec0; }

/* -------- 園所座標狀態 -------- */
.area-campus-coord-warn {
  color: #c05621 !important;
  font-weight: 600;
}

.campus-coord-preview {
  margin-bottom: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f0fff4;
  border: 1px solid #c6f6d5;
  font-size: 0.8rem;
  color: #276749;
}
.campus-coord-preview a {
  color: #276749;
}

/* -------- 行政區比較表 -------- */
.area-table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.area-table-hint {
  font-size: 0.75rem;
  color: #a0aec0;
  font-weight: 400;
}
:deep(.district-row-selected td) {
  background: #f0fff4 !important;
  font-weight: 600;
}
:deep(.district-row-selected td .cell) {
  color: #22543d;
}

@media (max-width: 768px) {
  .area-header-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 768px) {
  .recruitment-view {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  :deep(.chart-row) {
    grid-template-columns: 1fr;
  }

  :deep(.chart-box) {
    height: 240px;
  }

  :deep(.chart-box-tall) {
    height: 300px;
  }
}
</style>
