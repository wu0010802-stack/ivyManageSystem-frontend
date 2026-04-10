<template>
  <div>
    <div class="kpi-row" v-if="periodsSummary">
      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_visit }}</div>
        <div class="kpi-label">近五年總參觀</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_deposit }}</div>
        <div class="kpi-label">近五年總預繳</div>
      </el-card>
      <el-card class="kpi-card kpi-green" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_enrolled }}</div>
        <div class="kpi-label">近五年總註冊</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_not_enrolled_deposit }}</div>
        <div class="kpi-label">未就讀退預繳</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_enrolled_after_school }}</div>
        <div class="kpi-label">註冊後退學</div>
      </el-card>
      <el-card class="kpi-card kpi-blue" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.visit_to_deposit_rate }}%</div>
        <div class="kpi-label">整體參觀→預繳率</div>
      </el-card>
      <el-card class="kpi-card kpi-blue" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.visit_to_enrolled_rate }}%</div>
        <div class="kpi-label">整體參觀→註冊率</div>
      </el-card>
      <el-card class="kpi-card kpi-blue" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.deposit_to_enrolled_rate }}%</div>
        <div class="kpi-label">整體預繳→註冊率</div>
      </el-card>
      <el-card class="kpi-card kpi-teal" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.effective_to_enrolled_rate }}%</div>
        <div class="kpi-label">排除轉期→註冊率</div>
      </el-card>
    </div>

    <div class="kpi-row" v-if="periodsSummary" style="margin-bottom:16px">
      <el-card class="kpi-card kpi-teal" shadow="hover">
        <div class="kpi-value">{{ periodsSummary.total_net_enrolled }}</div>
        <div class="kpi-label">近五年淨註冊</div>
      </el-card>
      <el-card class="kpi-card kpi-green" shadow="hover">
        <div class="kpi-value" style="font-size:1rem">{{ periodsSummary.best_visit_to_enrolled?.period ?? '—' }}</div>
        <div class="kpi-label">最高參觀→註冊率</div>
        <div class="kpi-sub">{{ periodsSummary.best_visit_to_enrolled?.rate }}%</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value" style="font-size:1rem">{{ periodsSummary.worst_visit_to_enrolled?.period ?? '—' }}</div>
        <div class="kpi-label">最低參觀→註冊率</div>
        <div class="kpi-sub">{{ periodsSummary.worst_visit_to_enrolled?.rate }}%</div>
      </el-card>
      <el-card class="kpi-card kpi-green" shadow="hover">
        <div class="kpi-value" style="font-size:1rem">{{ periodsSummary.best_deposit_to_enrolled?.period ?? '—' }}</div>
        <div class="kpi-label">最高預繳→註冊率</div>
        <div class="kpi-sub">{{ periodsSummary.best_deposit_to_enrolled?.rate }}%</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value" style="font-size:1rem">{{ periodsSummary.worst_deposit_to_enrolled?.period ?? '—' }}</div>
        <div class="kpi-label">最低預繳→註冊率</div>
        <div class="kpi-sub">{{ periodsSummary.worst_deposit_to_enrolled?.rate }}%</div>
      </el-card>
    </div>

    <div class="chart-row" style="margin-bottom:16px">
      <el-card class="chart-card">
        <template #header>各期間轉換率走勢（%）</template>
        <div class="chart-box">
          <component :is="lineComponent" v-if="showCharts && periodsTrendData" :data="periodsTrendData" :options="lineOptions" />
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>各期間量體與流失結構</template>
        <div class="chart-box">
          <component :is="barComponent" v-if="showCharts && periodsCountBarData" :data="periodsCountBarData" :options="barOptions" />
        </div>
      </el-card>
    </div>

    <el-card style="margin-bottom:16px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>各期間轉換明細</span>
          <el-button v-if="canWrite" type="primary" size="small" @click="$emit('open-add')">新增期間</el-button>
        </div>
      </template>
      <el-table :data="periods" border stripe size="small" v-loading="loadingPeriods" style="overflow-x:auto">
        <el-table-column prop="period_name" label="期間" min-width="160" fixed="left" />
        <el-table-column prop="visit_count" label="參觀" align="center" width="70" />
        <el-table-column prop="deposit_count" label="預繳" align="center" width="70" />
        <el-table-column prop="enrolled_count" label="註冊" align="center" width="70" />
        <el-table-column prop="transfer_term_count" label="轉學期" align="center" width="75" />
        <el-table-column prop="effective_deposit_count" label="有效預繳" align="center" width="85" />
        <el-table-column prop="not_enrolled_deposit" label="未就讀退" align="center" width="80" />
        <el-table-column prop="enrolled_after_school" label="註冊後退" align="center" width="80" />
        <el-table-column label="參觀→預繳" align="center" width="95">
          <template #default="{ row }">{{ fmtRate(row.visit_to_deposit_rate) }}</template>
        </el-table-column>
        <el-table-column label="參觀→註冊" align="center" width="95">
          <template #default="{ row }">{{ fmtRate(row.visit_to_enrolled_rate) }}</template>
        </el-table-column>
        <el-table-column label="預繳→註冊" align="center" width="95">
          <template #default="{ row }">{{ fmtRate(row.deposit_to_enrolled_rate) }}</template>
        </el-table-column>
        <el-table-column label="排除轉→註冊" align="center" width="105">
          <template #default="{ row }">{{ fmtRate(row.effective_to_enrolled_rate) }}</template>
        </el-table-column>
        <el-table-column prop="notes" label="備註" min-width="110" show-overflow-tooltip />
        <el-table-column v-if="canWrite" label="操作" width="175" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="$emit('sync', row.id)">同步</el-button>
            <el-button size="small" @click="$emit('edit', row)">編輯</el-button>
            <el-button size="small" type="danger" @click="$emit('delete', row.id)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="periodsSummary && periodsSummary.by_grade && periodsSummary.by_grade.length">
      <template #header>近五年班別轉換分析</template>
      <el-table :data="periodsSummary.by_grade" border stripe size="small">
        <el-table-column prop="grade" label="班別" width="100" />
        <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
        <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
        <el-table-column prop="enrolled" label="註冊人數" align="center" width="100" />
        <el-table-column label="參觀→預繳率" align="center" width="110">
          <template #default="{ row }">{{ row.visit_to_deposit_rate }}%</template>
        </el-table-column>
        <el-table-column label="參觀→註冊率" align="center" width="110">
          <template #default="{ row }">{{ row.visit_to_enrolled_rate }}%</template>
        </el-table-column>
        <el-table-column label="預繳→註冊率" align="center" width="110">
          <template #default="{ row }">{{ row.deposit_to_enrolled_rate }}%</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
defineProps({
  canWrite: { type: Boolean, required: true },
  showCharts: { type: Boolean, required: true },
  periodsSummary: { type: Object, default: null },
  periods: { type: Array, required: true },
  loadingPeriods: { type: Boolean, required: true },
  periodsTrendData: { type: Object, default: null },
  periodsCountBarData: { type: Object, default: null },
  lineOptions: { type: Object, required: true },
  barOptions: { type: Object, required: true },
  lineComponent: { type: [Object, Function], required: true },
  barComponent: { type: [Object, Function], required: true },
  fmtRate: { type: Function, required: true },
})

defineEmits(['open-add', 'sync', 'edit', 'delete'])
</script>
