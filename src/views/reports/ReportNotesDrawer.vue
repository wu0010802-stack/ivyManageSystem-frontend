<script setup lang="ts">
/**
 * 口徑說明（2026-10-12 報表改版）：原本藏在總覽右下角的折疊區，改成頁首「口徑說明」開啟的
 * 側欄，所有分頁都看得到。內容以業主／會計看得懂的白話寫，欄位名與實作細節留在程式註解。
 *
 * 口徑事實來源：ivy-backend `services/finance_report_service.build_finance_summary`
 * （年終撥款自 2026-07-09 起計入、代收手續費自 2026-10-12 起計入）。
 */
const open = defineModel<boolean>({ required: true })
</script>

<template>
  <el-drawer v-model="open" title="口徑說明" size="440px" append-to-body data-test="report-notes-drawer">
    <dl class="notes">
      <dt>怎麼算</dt>
      <dd>
        現金收付實現制：收入與退款以實際收付款日計入，薪資依結算月份計入，其他支出以實際付款日計入。
        淨現金＝收入 − 退款 − 支出。
      </dd>

      <dt>收入包含</dt>
      <dd>學費、才藝收入、雜項收款、預繳款（新收）。</dd>

      <dt>支出包含</dt>
      <dd>
        員工應發薪資與雇主保費、勞退（只算已封存的月份）、廠商付款、固定支出（租金、水電、電話、零用金、
        餐點、舊制勞退準備金）、年終撥款、表外獎金撥款、永豐代收手續費。
      </dd>

      <dt>還沒算進來的</dt>
      <dd>
        二代健保補充保費（雇主負擔）尚未計算；畢業紀念冊等沒有專屬類別的項目，請看「現金收支表」底部清單。
      </dd>

      <dt>月份焦點</dt>
      <dd>
        右上角的月份會套用到所有分頁，預設是最近一個完整的月份。本月標示「進行中」，數字還會變動。
      </dd>

      <dt>結帳狀態</dt>
      <dd>
        固定支出沒登錄、薪資沒封存的月份，支出會偏低、淨現金會偏高。總覽的「結帳狀態」會標出缺哪幾個月；
        查不到的資料（例如沒有權限）會寫「無法確認」，不會當成已完成。
      </dd>

      <dt>教職員出勤</dt>
      <dd>依教職員打卡紀錄計算，不是幼生出席。班級為員工目前所屬班級，調班前的月份也算在現在的班。</dd>

      <dt>注意</dt>
      <dd>
        固定支出與廠商付款不會自動去重，同一筆支出請只登錄在一處。報表數字有短暫快取，剛登錄的資料沒出現時，
        稍候再重新整理。
      </dd>
    </dl>
  </el-drawer>
</template>

<style scoped>
.notes { margin: 0; font-size: var(--text-sm); line-height: 1.75; color: var(--text-secondary); }
.notes dt { font-weight: 600; color: var(--text-primary); margin-top: var(--space-4); }
.notes dt:first-child { margin-top: 0; }
.notes dd { margin: 2px 0 0; }
</style>
