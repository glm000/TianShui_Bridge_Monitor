<script setup>
import { ref, computed, shallowRef, watch, nextTick, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { getOverview, getBridgesWithSensors, getRealTimeData, getSensorLatest, getAlarms } from '../api/dashboard.js'

// ========== 状态 ==========
const currentTime = ref('')
const overview = ref({
  bridgeCount: 0,
  sensorCount: 0,
  onlineSensors: 0,
  onlineRate: '0',
  todayAlarms: 0,
  unhandledAlarms: 0
})

const bridgesData = ref([])
const selectedBridgeId = ref(null)

const realtimeData = ref([])
const alarmsList = ref([])

const selectedSensorCode = ref(null)

const chartEl = ref(null)
const chartInstance = shallowRef(null)

const refreshing = ref(false)

let timeTimer = null
let refreshTimer = null

// ========== 计算属性 ==========
const currentBridge = computed(() => {
  if (!selectedBridgeId.value) return null
  return bridgesData.value.find(b => b.id === selectedBridgeId.value) || null
})

const realtimeMap = computed(() => {
  const m = new Map()
  for (const it of realtimeData.value) m.set(it.sensor_code, it)
  return m
})

const isSensorExceeded = (sensorMeta, realtimeVal) => {
  if (realtimeVal === undefined || realtimeVal === null || realtimeVal === '--') return false
  const val = Number(realtimeVal)
  if (Number.isNaN(val)) return false

  const hasMax = sensorMeta?.limit_max !== undefined && sensorMeta?.limit_max !== null && sensorMeta?.limit_max !== ''
  const hasMin = sensorMeta?.limit_min !== undefined && sensorMeta?.limit_min !== null && sensorMeta?.limit_min !== ''

  if (hasMax && val > Number(sensorMeta.limit_max)) return true
  if (hasMin && val < Number(sensorMeta.limit_min)) return true
  return false
}

const viewSections = computed(() => {
  const b = currentBridge.value
  if (!b?.sections?.length) return []

  return b.sections.map(sec => ({
    ...sec,
    viewSensors: (sec.sensors || []).map(s => {
      const rt = realtimeMap.value.get(s.sensor_code)
      const val = rt?.value ?? null
      return {
        ...s,
        rt,
        displayValue: val ?? '--',
        exceeded: isSensorExceeded(s, val)
      }
    })
  }))
})

const firstSensorCodeInCurrentBridge = computed(() => {
  return viewSections.value?.[0]?.viewSensors?.[0]?.sensor_code || null
})

const selectedSensorMeta = computed(() => {
  const code = selectedSensorCode.value
  if (!code) return null
  for (const sec of viewSections.value) {
    const s = sec.viewSensors?.find(x => x.sensor_code === code)
    if (s) return s
  }
  return null
})

// ========== 展示工具 ==========
const getSensorTypeName = type => {
  const typeMap = {
    strain: '应变',
    disp: '位移',
    press: '压力',
    vib: '振动',
    rebar: '钢筋应力'
  }
  return typeMap[type] || type
}

const formatNum = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '--'
}

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// ========== API ==========
const loadOverview = async () => {
  try {
    const res = await getOverview()
    if (res.data?.success) overview.value = res.data.data
  } catch (err) {
    console.error('加载概览数据失败:', err)
  }
}

const loadBridgesData = async () => {
  try {
    const res = await getBridgesWithSensors()
    if (res.data?.success) {
      bridgesData.value = res.data.data || []
      if (bridgesData.value.length > 0 && !selectedBridgeId.value) {
        selectedBridgeId.value = bridgesData.value[0].id
      }
    }
  } catch (err) {
    console.error('加载桥梁数据失败:', err)
  }
}

const loadRealtimeData = async () => {
  try {
    const res = await getRealTimeData()
    if (res.data?.success) realtimeData.value = res.data.data || []
  } catch (err) {
    console.error('加载实时数据失败:', err)
  }
}

const loadAlarms = async () => {
  try {
    const res = await getAlarms()
    if (res.data?.success) alarmsList.value = (res.data.data || []).slice(0, 10)
  } catch (err) {
    console.error('加载告警数据失败:', err)
  }
}

// ========== ECharts（阈值线 + 无醒目标记） ==========
const ensureChart = async () => {
  await nextTick()
  if (!chartEl.value) return

  if (chartInstance.value && chartInstance.value.getDom() !== chartEl.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
  if (!chartInstance.value) chartInstance.value = echarts.init(chartEl.value)
}

const buildThreshold = sensorMeta => {
  const max = sensorMeta?.limit_max
  const min = sensorMeta?.limit_min
  const hasMax = max !== undefined && max !== null && max !== ''
  const hasMin = min !== undefined && min !== null && min !== ''
  return {
    hasMax,
    hasMin,
    max: hasMax ? Number(max) : null,
    min: hasMin ? Number(min) : null
  }
}

const updateChart = async (times, values, sensorMeta) => {
  await ensureChart()
  if (!chartInstance.value) return

  const sensorCode = sensorMeta?.sensor_code || selectedSensorCode.value || ''
  const unit = sensorMeta?.unit ? `（${sensorMeta.unit}）` : ''
  const th = buildThreshold(sensorMeta)

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `传感器 ${sensorCode} 实时数据${unit}`,
      left: 'center',
      top: 10,
      textStyle: { color: '#40f3ff', fontSize: 16 }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 20, 40, 0.88)',
      borderColor: '#40f3ff',
      textStyle: { color: '#fff' },
      formatter: params => {
        const p = params?.[0]
        if (!p) return ''
        return `${p.axisValue}<br/>数值：${formatNum(p.data)}`
      }
    },
    grid: { left: '8%', right: '5%', top: '20%', bottom: '15%' },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#40f3ff' } },
      axisLabel: { color: 'rgba(160, 180, 206, 0.95)' }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#40f3ff' } },
      axisLabel: { color: 'rgba(160, 180, 206, 0.95)' },
      splitLine: { lineStyle: { color: 'rgba(64, 243, 255, 0.08)' } }
    },
    series: [
      {
        name: '数值',
        type: 'line',
        smooth: true,
        data: values,

        // 最干净：默认不画点
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,

        // hover 点按超限着色（如果你也不想要，可改成固定 '#40f3ff'）
        itemStyle: {
          color: params => {
            const v = Number(params.value)
            const ex = (th.hasMax && v > th.max) || (th.hasMin && v < th.min)
            return ex ? '#ff4d4f' : '#40f3ff'
          },
          borderColor: '#ffffff',
          borderWidth: 1.2
        },

        lineStyle: {
          color: '#40f3ff',
          width: 2,
          shadowColor: 'rgba(64, 243, 255, 0.35)',
          shadowBlur: 10
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 243, 255, 0.18)' },
              { offset: 1, color: 'rgba(64, 243, 255, 0.02)' }
            ]
          }
        },

        // 阈值线（max/min）
        markLine: {
          symbol: 'none',
          silent: true,
          label: { color: '#ff7875', position: 'end' },
          lineStyle: { color: '#ff4d4f', type: 'dashed', width: 1.5 },
          data: [...(th.hasMax ? [{ yAxis: th.max, label: { formatter: `上限：${formatNum(th.max)}` } }] : []), ...(th.hasMin ? [{ yAxis: th.min, label: { formatter: `下限：${formatNum(th.min)}` } }] : [])]
        }
      }
    ]
  }

  chartInstance.value.setOption(option, { notMerge: true, lazyUpdate: true })
  chartInstance.value.resize()
}

const loadSensorChart = async sensorCode => {
  try {
    const res = await getSensorLatest(sensorCode, 30)
    const data = res.data?.success ? res.data.data || [] : []
    const meta = selectedSensorMeta.value

    if (!data.length) {
      await updateChart([], [], meta)
      return
    }

    const times = data.map(item => {
      const date = new Date(item.created_at)
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    })
    const values = data.map(item => Number(item.value))

    await updateChart(times, values, meta)
  } catch (err) {
    console.error('加载传感器曲线失败:', err)
  }
}

const handleSensorClick = async sensorCode => {
  if (!sensorCode) return
  selectedSensorCode.value = sensorCode
  await loadSensorChart(sensorCode)
}

// ========== 刷新调度 ==========
const refreshAllData = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await Promise.all([loadOverview(), loadRealtimeData(), loadAlarms()])
    if (selectedSensorCode.value) await loadSensorChart(selectedSensorCode.value)
  } finally {
    refreshing.value = false
  }
}

const startRefreshTimer = () => {
  stopRefreshTimer()
  refreshTimer = setInterval(refreshAllData, 10000)
}

const stopRefreshTimer = () => {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
}

const handleResize = () => {
  chartInstance.value?.resize()
  updateSensorViewport()
}

// 页面后台暂停轮询，回前台立即刷新
const handleVisibilityChange = async () => {
  if (document.hidden) {
    stopRefreshTimer()
  } else {
    await refreshAllData()
    startRefreshTimer()
  }
}

// ========== 切桥自动选第一个传感器 ==========
watch(
  selectedBridgeId,
  async () => {
    selectedSensorCode.value = null
    await nextTick()

    const first = firstSensorCodeInCurrentBridge.value
    if (first) await handleSensorClick(first)

    if (sensorsListEl.value) sensorsListEl.value.scrollTop = 0
  },
  { flush: 'post' }
)

// ========== 告警轮播（按行） ==========
const alarmsListEl = ref(null)
let alarmScrollTimer = null
const alarmPaused = ref(false)

// 行“节距”：height(46) + margin-bottom(8) = 54
const ALARM_ROW_PITCH = 54

const startAlarmAutoScroll = () => {
  stopAlarmAutoScroll()
  alarmScrollTimer = setInterval(() => {
    if (alarmPaused.value) return
    const el = alarmsListEl.value
    if (!el) return
    if (el.scrollHeight <= el.clientHeight) return

    const maxTop = el.scrollHeight - el.clientHeight
    const nextTop = el.scrollTop + ALARM_ROW_PITCH
    el.scrollTo({ top: nextTop >= maxTop ? 0 : nextTop, behavior: 'smooth' })
  }, 2000)
}

const stopAlarmAutoScroll = () => {
  if (alarmScrollTimer) clearInterval(alarmScrollTimer)
  alarmScrollTimer = null
}

const pauseAlarmScroll = () => (alarmPaused.value = true)
const resumeAlarmScroll = () => (alarmPaused.value = false)

// ========== 传感器列表虚拟滚动（无依赖） ==========
const sensorsListEl = ref(null)
const sensorScrollTop = ref(0)
const sensorViewportHeight = ref(0)

const H_SECTION = 34
// 传感器行节距：height(78) + margin-bottom(8) = 86
const H_SENSOR_PITCH = 86
const OVERSCAN_PX = 300

const onSensorsScroll = e => {
  sensorScrollTop.value = e.target.scrollTop
}

const updateSensorViewport = () => {
  const el = sensorsListEl.value
  if (!el) return
  sensorViewportHeight.value = el.clientHeight
}

const flatSensorItems = computed(() => {
  const items = []
  for (const sec of viewSections.value) {
    items.push({ type: 'section', key: `sec-${sec.id}`, name: sec.name })
    for (const s of sec.viewSensors || []) {
      items.push({ type: 'sensor', key: `sensor-${s.id}`, sensor: s })
    }
  }
  return items
})

const itemHeight = item => (item.type === 'section' ? H_SECTION : H_SENSOR_PITCH)

const prefixHeights = computed(() => {
  const items = flatSensorItems.value
  const prefix = new Array(items.length + 1)
  prefix[0] = 0
  for (let i = 0; i < items.length; i++) {
    prefix[i + 1] = prefix[i] + itemHeight(items[i])
  }
  return prefix
})

const totalSensorListHeight = computed(() => {
  const p = prefixHeights.value
  return p[p.length - 1] || 0
})

const lowerBoundPrefix = (prefix, y) => {
  let l = 0
  let r = prefix.length - 1
  while (l < r) {
    const mid = Math.floor((l + r + 1) / 2)
    if (prefix[mid] <= y) l = mid
    else r = mid - 1
  }
  return l
}

const visibleRange = computed(() => {
  const items = flatSensorItems.value
  const prefix = prefixHeights.value
  if (!items.length) return { start: 0, end: 0, padTop: 0, padBottom: 0 }

  const top = Math.max(0, sensorScrollTop.value - OVERSCAN_PX)
  const bottom = sensorScrollTop.value + sensorViewportHeight.value + OVERSCAN_PX

  const start = Math.max(0, lowerBoundPrefix(prefix, top))
  const end = Math.min(items.length, lowerBoundPrefix(prefix, bottom))

  const padTop = prefix[start]
  const padBottom = prefix[items.length] - prefix[end]
  return { start, end, padTop, padBottom }
})

const visibleSensorItems = computed(() => {
  const { start, end } = visibleRange.value
  return flatSensorItems.value.slice(start, end)
})

// ========== 生命周期 ==========
onMounted(async () => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)

  await loadBridgesData()
  await refreshAllData()

  if (!selectedSensorCode.value && firstSensorCodeInCurrentBridge.value) {
    await handleSensorClick(firstSensorCodeInCurrentBridge.value)
  }

  startRefreshTimer()
  startAlarmAutoScroll()

  window.addEventListener('resize', handleResize)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  await nextTick()
  updateSensorViewport()
})

onUnmounted(() => {
  stopRefreshTimer()
  stopAlarmAutoScroll()

  if (timeTimer) clearInterval(timeTimer)
  timeTimer = null

  window.removeEventListener('resize', handleResize)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
})
</script>

<template>
  <div class="dashboard-container">
    <!-- 由于 Layout.vue 已有顶部标题行，这里只保留工具栏（时间 + 桥梁选择） -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-label">当前时间</span>
        <span class="toolbar-time">{{ currentTime }}</span>
      </div>

      <div class="toolbar-right">
        <span class="toolbar-label">桥梁</span>
        <el-select v-model="selectedBridgeId" placeholder="请选择桥梁" size="large" style="width: 220px">
          <el-option v-for="bridge in bridgesData" :key="bridge.id" :label="bridge.name" :value="bridge.id" />
        </el-select>
      </div>
    </div>

    <!-- 统计卡片区 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-label">桥梁总数</div>
        <div class="stat-value">{{ overview.bridgeCount }}</div>
        <div class="stat-unit">座</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">传感器总数</div>
        <div class="stat-value">{{ overview.sensorCount }}</div>
        <div class="stat-unit">个</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">在线率</div>
        <div class="stat-value">{{ overview.onlineRate }}</div>
        <div class="stat-unit">%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日告警</div>
        <div class="stat-value">{{ overview.todayAlarms }}</div>
        <div class="stat-unit">条</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">待处理告警</div>
        <div class="stat-value warning">{{ overview.unhandledAlarms }}</div>
        <div class="stat-unit">条</div>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="main-content">
      <!-- 左侧：断面/传感器列表（虚拟滚动） -->
      <div class="left-panel">
        <div class="panel-title">传感器实时状态</div>

        <div ref="sensorsListEl" class="sensors-list" @scroll="onSensorsScroll">
          <div v-if="!currentBridge" class="empty-tip">请选择桥梁</div>
          <div v-else-if="!viewSections.length" class="empty-tip">该桥梁暂无断面数据</div>

          <template v-else>
            <div class="virtual-total" :style="{ height: totalSensorListHeight + 'px' }">
              <div
                class="virtual-pad"
                :style="{
                  paddingTop: visibleRange.padTop + 'px',
                  paddingBottom: visibleRange.padBottom + 'px'
                }"
              >
                <template v-for="item in visibleSensorItems" :key="item.key">
                  <div v-if="item.type === 'section'" class="section-row">
                    <div class="section-title">{{ item.name }}</div>
                  </div>

                  <div
                    v-else
                    class="sensor-item sensor-row"
                    :class="{
                      active: selectedSensorCode === item.sensor.sensor_code,
                      exceeded: item.sensor.exceeded
                    }"
                    @click="handleSensorClick(item.sensor.sensor_code)"
                  >
                    <div class="sensor-name">
                      <span class="sensor-icon">📡</span>
                      <span class="sensor-name-text">{{ item.sensor.sensor_name }}</span>
                    </div>
                    <!-- <div class="sensor-type">{{ getSensorTypeName(item.sensor.sensor_type) }}</div> -->
                    <div class="sensor-value">
                      <span class="sensor-type">{{ getSensorTypeName(item.sensor.sensor_type) }}值：</span>
                      {{ item.sensor.displayValue }}
                      <span class="unit">{{ item.sensor.unit }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 右侧：实时曲线图 -->
      <div class="right-panel">
        <div class="panel-title">实时数据曲线</div>
        <div class="chart-container">
          <div v-if="!selectedSensorCode" class="empty-tip">请点击左侧传感器查看曲线</div>
          <div ref="chartEl" class="chart" v-show="!!selectedSensorCode"></div>
        </div>
      </div>
    </div>

    <!-- 底部：告警自动轮播 -->
    <div class="alarms-panel">
      <div class="panel-title">最新告警</div>

      <div ref="alarmsListEl" class="alarms-list" @mouseenter="pauseAlarmScroll" @mouseleave="resumeAlarmScroll">
        <div v-if="alarmsList.length === 0" class="empty-tip">暂无告警</div>

        <div v-for="alarm in alarmsList" :key="alarm.id" class="alarm-item">
          <span class="alarm-icon">⚠️</span>
          <span class="alarm-time">{{ alarm.created_at }}</span>
          <span class="alarm-bridge">{{ alarm.bridge_name }}</span>
          <span class="alarm-sensor">{{ alarm.sensor_name }}</span>
          <span class="alarm-msg" :title="alarm.msg">{{ alarm.msg }}</span>
          <span class="alarm-value">数值: {{ alarm.val }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  color: rgba(255, 255, 255, 0.92);
  width: 100%;
  height: 100%; /* 修复：使用100%而不是100%-500px */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 禁止滚动 */
  box-sizing: border-box;
}

.toolbar {
  justify-content: space-between;
  gap: 16px;

  flex-shrink: 0; /* 工具栏不收缩 */
  display: flex;
  align-items: center;

  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(64, 243, 255, 0.18);
  background: rgba(10, 18, 36, 0.45);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.2);

  margin-bottom: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.toolbar-label {
  color: rgba(160, 180, 206, 0.95);
  font-size: 13px;
  white-space: nowrap;
}

.toolbar-time {
  color: rgba(160, 180, 206, 0.95);
  font-family: 'Courier New', monospace;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 统计卡片 */
.stats-cards {
  flex-shrink: 0; /* 统计卡片区不收缩 */
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 220px;
  background: rgba(10, 18, 36, 0.45);
  border: 1px solid rgba(64, 243, 255, 0.18);
  border-radius: 12px;
  padding: 18px 16px;
  text-align: center;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  transition: 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  border-color: rgba(64, 243, 255, 0.3);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
}

.stat-label {
  font-size: 13px;
  color: rgba(160, 180, 206, 0.95);
  margin-bottom: 10px;
}

.stat-value {
  font-size: clamp(24px, 2vw, 40px);
  font-weight: 800;
  color: #40f3ff;
  text-shadow: 0 0 12px rgba(64, 243, 255, 0.25);
  margin-bottom: 6px;
}

.stat-value.warning {
  color: #ff4d4f;
  text-shadow: 0 0 12px rgba(255, 77, 79, 0.22);
}

.stat-unit {
  font-size: 12px;
  color: rgba(160, 180, 206, 0.7);
}

/* 主体内容区 */
/* 内部各区块使用flex自适应 */
.main-content {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex: 1; /* 填充剩余空间 */
  min-height: 0; /* 重要！允许flex子元素收缩 */
}

.left-panel,
.right-panel {
  background: rgba(10, 18, 36, 0.45);
  border: 1px solid rgba(64, 243, 255, 0.18);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  min-height: 0; /* 允许收缩 */
}

/* 左右面板也需要自适应 */
.left-panel {
  width: clamp(360px, 22vw, 520px);
  flex-shrink: 0;
}

.right-panel {
  flex: 1;
}

.panel-title {
  font-size: 16px;
  font-weight: 800;
  color: #40f3ff;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(64, 243, 255, 0.18);
}

.sensors-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* 允许收缩 */
}

/* 虚拟列表占位 */
.virtual-total {
  position: relative;
  width: 100%;
}

.virtual-pad {
  position: relative;
}

/* 固定行高：虚拟滚动需要 */
.section-row {
  height: 34px;
  display: flex;
  align-items: center;
}

.section-title {
  width: 100%;
  font-size: 14px;
  color: #7aa8ff;
  font-weight: 800;
  padding-left: 10px;
  border-left: 3px solid #7aa8ff;
}

/* 传感器行：height 78 + margin-bottom 8 = 节距 86 */
.sensor-row {
  height: 78px;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.sensor-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(64, 243, 255, 0.14);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: 0.16s ease;
}

.sensor-item:hover {
  background: rgba(64, 243, 255, 0.06);
  border-color: rgba(64, 243, 255, 0.24);
  transform: translateX(3px);
}

.sensor-item.active {
  background: rgba(64, 243, 255, 0.12);
  border-color: rgba(64, 243, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(64, 243, 255, 0.1) inset;
}

.sensor-item.exceeded {
  border-color: rgba(255, 77, 79, 0.65);
  background: rgba(255, 77, 79, 0.08);
}

.sensor-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 6px;
}

.sensor-icon {
  font-size: 16px;
}

.sensor-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sensor-type {
  font-size: 12px;
  color: rgba(160, 180, 206, 0.85);
  margin-bottom: 4px;
}

.sensor-value {
  font-size: 18px;
  font-weight: 800;
  color: #40f3ff;
}

.sensor-value .unit {
  font-size: 12px;
  color: rgba(160, 180, 206, 0.75);
  margin-left: 5px;
}

/* 右侧图表 */
/* 图表容器自适应 */
.chart-container {
  flex: 1;
  min-height: 0; /* 允许收缩 */
}
.chart {
  width: 100%;
  height: 100%;
}

.empty-tip {
  text-align: center;
  color: rgba(160, 180, 206, 0.7);
  padding: 40px 10px;
  font-size: 14px;
}

/* 告警面板 - 使用flex-shrink控制 */
.alarms-panel {
  background: rgba(10, 18, 36, 0.45);
  border: 1px solid rgba(64, 243, 255, 0.18);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
  flex-shrink: 0; /* 不收缩 */
  height: 190px; /* 保持固定高度 */
  display: flex;
  flex-direction: column;
}

.alarms-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* 告警：栅格对齐 + 省略号（行高46，节距54） */
.alarm-item {
  height: 46px;
  display: grid;
  grid-template-columns: 26px 150px 110px 140px 1fr 120px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  margin-bottom: 8px;

  background: rgba(255, 77, 79, 0.06);
  border: 1px solid rgba(255, 77, 79, 0.2);
  border-radius: 10px;

  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.alarm-icon {
  font-size: 16px;
}

.alarm-time {
  color: rgba(160, 180, 206, 0.85);
  font-family: 'Courier New', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-bridge {
  color: #40f3ff;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-sensor {
  color: #ffa940;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-msg {
  color: #ff7875;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-value {
  color: #ff4d4f;
  font-weight: 800;
  justify-self: end;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 滚动条 */
.sensors-list::-webkit-scrollbar,
.alarms-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.sensors-list::-webkit-scrollbar-thumb,
.alarms-list::-webkit-scrollbar-thumb {
  background: rgba(64, 243, 255, 0.22);
  border-radius: 3px;
}

.sensors-list::-webkit-scrollbar-thumb:hover,
.alarms-list::-webkit-scrollbar-thumb:hover {
  background: rgba(64, 243, 255, 0.35);
}

.sensors-list::-webkit-scrollbar-track,
.alarms-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.15);
}
</style>
