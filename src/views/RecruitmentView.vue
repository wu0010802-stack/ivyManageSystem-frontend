<template>
  <div class="recruitment-view" v-loading="loadingStats">
    <div class="page-header">
      <h2>招生統計儀表板</h2>
      <div class="header-actions">
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
        <div class="kpi-row" style="margin-bottom:16px">
          <el-card class="kpi-card" shadow="hover" v-for="band in distanceBandKPI" :key="band.label">
            <div class="kpi-value">{{ band.visit }}</div>
            <div class="kpi-label">{{ band.label }}</div>
          </el-card>
        </div>
        <el-card style="margin-bottom:16px">
          <template #header>行政區排名</template>
          <el-table :data="districtWithDistance" border stripe size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="district" label="行政區" width="100" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
            </el-table-column>
            <el-table-column label="距離" align="center" width="100">
              <template #default="{ row }">{{ row.km != null ? row.km.toFixed(1) + ' km' : '—' }}</template>
            </el-table-column>
            <el-table-column label="距離帶" align="center" width="100">
              <template #default="{ row }">{{ row.band }}</template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card style="margin-bottom:16px" v-loading="loadingAreaHotspots">
          <template #header>家長地址熱點圖</template>
          <RecruitmentAddressHeatmap
            :hotspots="areaHotspotsSummary.hotspots"
            :records-with-address="areaHotspotsSummary.records_with_address"
            :total-hotspots="areaHotspotsSummary.total_hotspots"
            :geocoded-hotspots="areaHotspotsSummary.geocoded_hotspots"
            :pending-hotspots="areaHotspotsSummary.pending_hotspots"
            :failed-hotspots="areaHotspotsSummary.failed_hotspots"
            :provider-available="areaHotspotsSummary.provider_available"
            :provider-name="areaHotspotsSummary.provider_name"
            :school-lat="SCHOOL_LAT"
            :school-lng="SCHOOL_LNG"
            :can-write="canWrite"
            :syncing="syncingAreaHotspots"
            :fmt-pct="fmtPct"
            @sync="handleAreaHotspotSync"
          />
        </el-card>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各行政區參觀人數</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('area') && areaBarData" :data="areaBarData" :options="horizBarOptions" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>距離帶分佈</template>
            <div class="chart-box">
              <Doughnut v-if="isChartTabActive('area') && distanceDoughnutData" :data="distanceDoughnutData" :options="doughnutOptions" />
            </div>
          </el-card>
        </div>
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
          :reason="ndFilter.reason"
          :grade="ndFilter.grade"
          :page="ndFilter.page"
          :page-size="ndFilter.page_size"
          :total="ndTotal"
          :records="ndData"
          :loading="loadingND"
          @update:reason="ndFilter.reason = $event"
          @update:grade="ndFilter.grade = $event"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRecruitmentStats,
  getRecruitmentOptions,
  getRecruitmentRecords,
  createRecruitmentRecord,
  updateRecruitmentRecord,
  deleteRecruitmentRecord,
  getNoDepositAnalysis,
  getRecruitmentAddressHotspots,
  syncRecruitmentAddressHotspots,
  getPeriods,
  getPeriodsSummary,
  createPeriod,
  updatePeriod,
  deletePeriod,
  syncPeriod,
  exportRecruitmentStats,
  getMonths,
  addMonth,
  deleteMonth,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { getUserInfo, PERMISSION_VALUES } from '@/utils/auth'
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
const SCHOOL_LAT = 22.6420
const SCHOOL_LNG = 120.3243
const AREA_COORDS = {
  '三民區': [22.646, 120.3208],
  '鳳山區': [22.6269, 120.3578],
  '鳥松區': [22.6596, 120.3648],
  '苓雅區': [22.6248, 120.3155],
  '仁武區': [22.7019, 120.3471],
  '前鎮區': [22.5941, 120.3089],
  '大寮區': [22.607, 120.3978],
  '大樹區': [22.7106, 120.433],
  '左營區': [22.6742, 120.2928],
}

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
const loadingStats = ref(false)
const loadingDetail = ref(false)
const loadingND = ref(false)
const loadingAreaHotspots = ref(false)
const syncingAreaHotspots = ref(false)
const loadingPeriods = ref(false)
const saving = ref(false)
const savingPeriod = ref(false)
const optionsLoaded = ref(false)
const detailLoaded = ref(false)
const ndLoaded = ref(false)
const areaLoaded = ref(false)
const periodsLoaded = ref(false)

const stats = ref({
  total_visit: 0,
  total_deposit: 0,
  total_enrolled: 0,
  total_transfer_term: 0,
  total_pending_deposit: 0,
  total_effective_deposit: 0,
  unique_visit: 0,
  unique_deposit: 0,
  visit_to_deposit_rate: 0,
  visit_to_enrolled_rate: 0,
  deposit_to_enrolled_rate: 0,
  effective_to_enrolled_rate: 0,
  chuannian_visit: 0,
  chuannian_deposit: 0,
  monthly: [],
  by_grade: [],
  month_grade: {},
  by_source: [],
  by_referrer: [],
  by_district: [],
  referrer_source_cross: null,
  no_deposit_reasons: [],
  chuannian_by_expected: [],
  chuannian_by_grade: [],
  by_year: [],
})

const options = ref({ months: [], grades: [], sources: [], referrers: [], no_deposit_reasons: [] })

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
const ndFilter = ref({ reason: null, grade: null, page: 1, page_size: 50 })

const emptyAreaHotspotsSummary = () => ({
  records_with_address: 0,
  total_hotspots: 0,
  geocoded_hotspots: 0,
  pending_hotspots: 0,
  failed_hotspots: 0,
  provider_available: false,
  provider_name: null,
  hotspots: [],
})

const normalizeAreaHotspotsSummary = (payload = {}) => ({
  ...emptyAreaHotspotsSummary(),
  ...payload,
  hotspots: payload.hotspots ?? [],
})

const areaHotspotsSummary = ref({
  ...emptyAreaHotspotsSummary(),
})

// 近五年期間
const periods = ref([])
const periodsSummary = ref(null)

let debounceTimer = null
let optionsPromise = null
const fetchDetailDebounced = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDetail(), 400)
}

const invalidateOptions = () => {
  optionsLoaded.value = false
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

// -------- 匯出 Excel --------
const exportingExcel = ref(false)
const handleExportExcel = async () => {
  exportingExcel.value = true
  try {
    const res = await exportRecruitmentStats()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '招生統計.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  } catch (e) {
    ElMessage.error('匯出失敗：' + (e.message || '未知錯誤'))
  } finally {
    exportingExcel.value = false
  }
}

// -------- 載入 --------
const fetchOptions = async (force = false) => {
  if (optionsLoaded.value && !force) return true
  if (optionsPromise && !force) return optionsPromise

  optionsPromise = (async () => {
    try {
      const res = await getRecruitmentOptions()
      options.value = res.data
      optionsLoaded.value = true
      return true
    } catch (e) {
      ElMessage.error(apiError(e, '載入篩選選項失敗'))
      return false
    } finally {
      optionsPromise = null
    }
  })()

  return optionsPromise
}

const fetchStats = async () => {
  loadingStats.value = true
  try {
    const statsRes = await getRecruitmentStats()
    stats.value = statsRes.data
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入統計資料失敗'))
    return false
  } finally {
    loadingStats.value = false
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
    if (ndFilter.value.reason) params.reason = ndFilter.value.reason
    if (ndFilter.value.grade) params.grade = ndFilter.value.grade
    const res = await getNoDepositAnalysis(params)
    ndData.value = res.data.records
    ndTotal.value = res.data.total
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入未預繳資料失敗'))
    return false
  } finally {
    loadingND.value = false
  }
}

const fetchAreaHotspots = async () => {
  loadingAreaHotspots.value = true
  try {
    const res = await getRecruitmentAddressHotspots({ limit: 200 })
    areaHotspotsSummary.value = normalizeAreaHotspotsSummary(res.data)
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入地址熱點失敗'))
    return false
  } finally {
    loadingAreaHotspots.value = false
  }
}

const handleAreaHotspotSync = async () => {
  syncingAreaHotspots.value = true
  try {
    const res = await syncRecruitmentAddressHotspots({ batch_size: 10, limit: 200 })
    areaHotspotsSummary.value = normalizeAreaHotspotsSummary(res.data)
    areaLoaded.value = true

    if (res.data.synced > 0) {
      const suffix = res.data.pending_hotspots > 0 ? `，尚有 ${res.data.pending_hotspots} 個地址待同步` : ''
      ElMessage.success(`已同步 ${res.data.synced} 個地址座標${suffix}`)
    } else if (res.data.failed > 0) {
      ElMessage.warning(`本次同步失敗 ${res.data.failed} 個地址，請檢查地址內容或 geocoding 設定`)
    } else {
      ElMessage.success('目前沒有需要同步的新地址座標')
    }
  } catch (e) {
    ElMessage.error(apiError(e, '同步地址座標失敗'))
  } finally {
    syncingAreaHotspots.value = false
  }
}

const fetchPeriods = async () => {
  loadingPeriods.value = true
  try {
    const [listRes, summaryRes] = await Promise.all([getPeriods(), getPeriodsSummary()])
    periods.value = listRes.data
    periodsSummary.value = summaryRes.data
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入期間資料失敗'))
    return false
  } finally {
    loadingPeriods.value = false
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
  const ok = await fetchAreaHotspots()
  if (ok) areaLoaded.value = true
}

const loadPeriodsTab = async () => {
  const ok = await fetchPeriods()
  if (ok) periodsLoaded.value = true
}

onMounted(() => {
  fetchStats()
})

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
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceBand(km) {
  if (km == null) return '未明'
  if (km < 3) return '0-3km'
  if (km < 6) return '3-6km'
  if (km < 10) return '6-10km'
  return '10km+'
}

const districtWithDistance = computed(() =>
  stats.value.by_district.map(d => {
    const coords = AREA_COORDS[d.district]
    const km = coords ? haversine(SCHOOL_LAT, SCHOOL_LNG, coords[0], coords[1]) : null
    return { ...d, km, band: distanceBand(km) }
  })
)

const distanceBandKPI = computed(() => {
  const bands = ['0-3km', '3-6km', '6-10km', '10km+', '未明']
  return bands.map(b => ({
    label: b,
    visit: districtWithDistance.value
      .filter(d => d.band === b)
      .reduce((s, d) => s + d.visit, 0),
  }))
})

const areaBarData = computed(() => {
  const known = districtWithDistance.value.filter(d => d.district !== '未填寫')
  if (!known.length) return null
  return {
    labels: known.map(d => d.district),
    datasets: [{
      label: '參觀人數',
      data: known.map(d => d.visit),
      backgroundColor: '#52b788',
      borderRadius: 4,
    }],
  }
})

const distanceDoughnutData = computed(() => {
  const bands = ['0-3km', '3-6km', '6-10km', '10km+', '未明']
  const counts = distanceBandKPI.value.map(b => b.visit)
  return {
    labels: bands,
    datasets: [{
      data: counts,
      backgroundColor: ['#40916c', '#52b788', '#f4a261', '#e76f51', '#a0aec0'],
    }],
  }
})

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
.recruitment-view {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 1.3rem;
}
.header-actions {
  display: flex;
  gap: 8px;
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
  border-left: 4px solid #40916c;
}
:deep(.kpi-card.kpi-accent) { border-left-color: #e76f51; }
:deep(.kpi-card.kpi-blue)  { border-left-color: #3182ce; }
:deep(.kpi-card.kpi-teal)  { border-left-color: #319795; }
:deep(.kpi-card.kpi-green) { border-left-color: #2f855a; }
:deep(.kpi-value) {
  font-size: 1.8rem;
  font-weight: 700;
  color: #2d6a4f;
}
:deep(.kpi-card.kpi-accent .kpi-value) { color: #c25a3d; }
:deep(.kpi-card.kpi-blue .kpi-value)  { color: #2b6cb0; }
:deep(.kpi-card.kpi-teal .kpi-value)  { color: #2c7a7b; }
:deep(.kpi-card.kpi-green .kpi-value) { color: #22543d; }
:deep(.kpi-label) {
  font-size: 0.78rem;
  color: #718096;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
:deep(.kpi-sub) { font-size: 0.8rem; color: #a0aec0; }
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
