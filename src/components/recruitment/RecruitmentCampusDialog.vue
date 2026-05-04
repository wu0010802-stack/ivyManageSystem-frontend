<template>
  <el-dialog
    :model-value="visible"
    title="設定園所中心點"
    width="540px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" label-width="100px" size="small">
      <el-form-item label="園所名稱">
        <el-input v-model="form.campus_name" />
      </el-form-item>
      <el-form-item label="園所地址">
        <div style="display:flex;gap:8px;width:100%">
          <el-input
            v-model="form.campus_address"
            placeholder="請填完整地址，例：高雄市三民區義華路68號"
            style="flex:1"
            @change="geocodeDirty = true"
          />
          <el-button
            size="small"
            :loading="geocoding"
            :disabled="!form.campus_address"
            @click="geocodeAddress"
          >自動定位</el-button>
        </div>
      </el-form-item>

      <el-alert
        v-if="form.campus_lat == null || form.campus_lng == null"
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
              v-model="form.campus_lat"
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
              v-model="form.campus_lng"
              :step="0.0001"
              :precision="6"
              placeholder="例：120.314xxx"
              style="width:100%"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <div
        v-if="form.campus_lat != null && form.campus_lng != null"
        class="campus-coord-preview"
      >
        <span>預覽：</span>
        <a
          :href="`https://www.openstreetmap.org/?mlat=${form.campus_lat}&mlon=${form.campus_lng}#map=17/${form.campus_lat}/${form.campus_lng}`"
          target="_blank"
          rel="noreferrer"
        >
          {{ form.campus_lat.toFixed(6) }}, {{ form.campus_lng.toFixed(6) }} →在地圖上確認
        </a>
      </div>

      <el-form-item label="交通模式">
        <el-select v-model="form.travel_mode" style="width:100%">
          <el-option label="開車" value="driving" />
          <el-option label="步行" value="walking" />
          <el-option label="騎車" value="cycling" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('save')">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { geocodeAddress as geocodeAddressViaNominatim } from '@/utils/geocoding'

const props = defineProps({
  visible: { type: Boolean, required: true },
  form: { type: Object, required: true },
  saving: { type: Boolean, default: false },
})

defineEmits(['update:visible', 'save'])

const geocoding = ref(false)
const geocodeDirty = ref(false)

const geocodeAddress = async () => {
  const address = props.form?.campus_address
  if (!address) return
  geocoding.value = true
  try {
    const hit = await geocodeAddressViaNominatim(address)
    if (hit) {
      props.form.campus_lat = hit.lat
      props.form.campus_lng = hit.lng
      geocodeDirty.value = false
      ElMessage.success(`已定位：${hit.displayName}`)
    } else {
      ElMessage.warning('找不到此地址，請嘗試填寫更精確的地址（含縣市區），或直接手動輸入座標')
    }
  } catch {
    ElMessage.error('自動定位服務暫時無法使用，請手動輸入緯度 / 經度')
  } finally {
    geocoding.value = false
  }
}
</script>
