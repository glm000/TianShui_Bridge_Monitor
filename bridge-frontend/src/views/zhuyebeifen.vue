<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getOverview, getBridgesWithSensors, getRealTimeData, getSensorLatest, getAlarms } from '../api/dashboard.js'

// ========== 数据状态 ==========
const currentTime = ref('')
const overview = ref({
  bridgeCount: 0,
  sensorCount: 0,
  onlineSensors: 0,
  onlineRate: '0',
  todayAlarms: 0,
  unhandledAlarms: 0
})

const bridgesData = ref([]) // 桥梁结构树数据
const selectedBridgeId = ref(null) // 当前选择的桥梁ID
const realtimeData = ref([]) // 所有传感器实时数据
const alarmsList = ref([]) // 告警列表

const selectedSensorCode = ref(null) // 当前选中的传感器编码
const chartInstance = ref(null) // ECharts实例

let refreshTimer = null

// ========== 计算属性 ==========
// 当前选中桥梁的数据
const currentBridge = computed(() => {
  if (!selectedBridgeId.value) return null
  return bridgesData.value.find(b => b.id === selectedBridgeId.value)
})

// 当前桥梁下的传感器实时数据
const currentBridgeSensors = computed(() => {
  if (!currentBridge.value) return []

  const result = []
  currentBridge.value.sections?.forEach(section => {
    section.sensors?.forEach(sensor => {
      const realtimeItem = realtimeData.value.find(rt => rt.sensor_code === sensor.sensor_code)
      result.push({
        ...sensor,
        section_name: section.name,
        ...realtimeItem
      })
    })
  })
  return result
})

// ========== 方法 ==========
// 更新时间
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

// 加载概览数据
const loadOverview = async () => {
  try {
    const res = await getOverview()
    if (res.data.success) {
      overview.value = res.data.data
    }
  } catch (err) {
    console.error('加载概览数据失败:', err)
  }
}

// 加载桥梁结构树
const loadBridgesData = async () => {
  try {
    const res = await getBridgesWithSensors()
    if (res.data.success) {
      bridgesData.value = res.data.data
      // 默认选择第一个桥梁
      if (bridgesData.value.length > 0 && !selectedBridgeId.value) {
        selectedBridgeId.value = bridgesData.value[0].id
      }
    }
  } catch (err) {
    console.error('加载桥梁数据失败:', err)
  }
}

// 加载实时数据
const loadRealtimeData = async () => {
  try {
    const res = await getRealTimeData()
    if (res.data.success) {
      realtimeData.value = res.data.data
    }
  } catch (err) {
    console.error('加载实时数据失败:', err)
  }
}

// 加载告警列表
const loadAlarms = async () => {
  try {
    const res = await getAlarms()
    if (res.data.success) {
      alarmsList.value = res.data.data.slice(0, 10) // 只显示最新10条
    }
  } catch (err) {
    console.error('加载告警数据失败:', err)
  }
}

// 点击传感器，显示曲线图
const handleSensorClick = async sensorCode => {
  selectedSensorCode.value = sensorCode
  await loadSensorChart(sensorCode)
}

// 加载传感器曲线图
const loadSensorChart = async sensorCode => {
  try {
    const res = await getSensorLatest(sensorCode, 30)
    if (res.data.success && res.data.data.length > 0) {
      const data = res.data.data
      const times = data.map(item => {
        const date = new Date(item.created_at)
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
      })
      const values = data.map(item => parseFloat(item.value))

      updateChart(times, values, sensorCode)
    }
  } catch (err) {
    console.error('加载传感器曲线失败:', err)
  }
}

// 更新图表
const updateChart = (times, values, sensorCode) => {
  if (!chartInstance.value) {
    const chartDom = document.getElementById('realtimeChart')
    if (chartDom) {
      chartInstance.value = echarts.init(chartDom)
    }
  }

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `传感器 ${sensorCode} 实时数据`,
      left: 'center',
      top: 10,
      textStyle: {
        color: '#00d4ff',
        fontSize: 16
      }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 20, 40, 0.8)',
      borderColor: '#00d4ff',
      textStyle: { color: '#fff' }
    },
    grid: {
      left: '8%',
      right: '5%',
      top: '20%',
      bottom: '15%'
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#00d4ff' } },
      axisLabel: { color: '#8899aa' }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#00d4ff' } },
      axisLabel: { color: '#8899aa' },
      splitLine: {
        lineStyle: { color: 'rgba(0, 212, 255, 0.1)' }
      }
    },
    series: [
      {
        name: '数值',
        type: 'line',
        smooth: true,
        data: values,
        lineStyle: {
          color: '#00d4ff',
          width: 2,
          shadowColor: 'rgba(0, 212, 255, 0.5)',
          shadowBlur: 10
        },
        itemStyle: {
          color: '#00d4ff',
          borderColor: '#fff',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
              { offset: 1, color: 'rgba(0, 212, 255, 0.05)' }
            ]
          }
        }
      }
    ]
  }

  chartInstance.value.setOption(option)
}

// 刷新所有数据
const refreshAllData = async () => {
  await Promise.all([loadOverview(), loadRealtimeData(), loadAlarms()])

  // 如果有选中的传感器，更新曲线图
  if (selectedSensorCode.value) {
    await loadSensorChart(selectedSensorCode.value)
  }
}

// 判断传感器是否超限
// 判断传感器是否超限 - 修复空值判断
const isSensorExceeded = sensor => {
  // 增加空值保护
  if (!sensor || sensor.value === undefined || sensor.value === null) return false
  const val = parseFloat(sensor.value)
  if (sensor.limit_max && val > parseFloat(sensor.limit_max)) return true
  if (sensor.limit_min && val < parseFloat(sensor.limit_min)) return true
  return false
}

// 获取传感器类型显示名称
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

// ========== 生命周期 ==========
onMounted(async () => {
  updateTime()
  setInterval(updateTime, 1000)

  // 初始加载数据
  await loadBridgesData()
  await refreshAllData()

  // 自动刷新（每10秒）
  refreshTimer = setInterval(refreshAllData, 10000)

  // 初始化图表（选择第一个传感器）
  if (currentBridgeSensors.value.length > 0) {
    handleSensorClick(currentBridgeSensors.value[0].sensor_code)
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  if (chartInstance.value) {
    chartInstance.value.dispose()
  }
})
</script>

<template>
  <div class="dashboard-container">
    <!-- 顶部标题栏 -->
    <div class="dashboard-header">
      <div class="header-left">
        <span class="title-icon">🌉</span>
        <span class="title-text">天水桥梁健康监测系统</span>
      </div>
      <div class="header-center">
        <span class="current-time">{{ currentTime }}</span>
      </div>
      <div class="header-right">
        <span class="label">选择桥梁：</span>
        <el-select v-model="selectedBridgeId" placeholder="请选择桥梁" size="large" style="width: 200px">
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
      <!-- 左侧：断面/传感器列表 -->
      <div class="left-panel">
        <div class="panel-title">传感器实时状态</div>
        <div class="sensors-list">
          <div v-if="!currentBridge" class="empty-tip">请选择桥梁</div>
          <div v-else-if="currentBridge.sections?.length === 0" class="empty-tip">该桥梁暂无断面数据</div>
          <div v-else>
            <div v-for="section in currentBridge.sections" :key="section.id" class="section-group">
              <div class="section-title">{{ section.name }}</div>
              <div
                v-for="sensor in section.sensors"
                :key="sensor.id"
                class="sensor-item"
                :class="{
                  active: selectedSensorCode === sensor.sensor_code,
                  exceeded: isSensorExceeded(realtimeData.find(rt => rt.sensor_code === sensor.sensor_code))
                }"
                @click="handleSensorClick(sensor.sensor_code)"
              >
                <div class="sensor-name">
                  <span class="sensor-icon">📡</span>
                  <span>{{ sensor.sensor_name }}</span>
                </div>
                <div class="sensor-type">{{ getSensorTypeName(sensor.sensor_type) }}</div>
                <div class="sensor-value">
                  {{ realtimeData.find(rt => rt.sensor_code === sensor.sensor_code)?.value || '--' }}
                  <span class="unit">{{ sensor.unit }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：实时曲线图 -->
      <div class="right-panel">
        <div class="panel-title">实时数据曲线</div>
        <div class="chart-container">
          <div v-if="!selectedSensorCode" class="empty-tip">请点击左侧传感器查看曲线</div>
          <div v-else id="realtimeChart" class="chart"></div>
        </div>
      </div>
    </div>

    <!-- 底部：告警滚动列表 -->
    <div class="alarms-panel">
      <div class="panel-title">最新告警</div>
      <div class="alarms-list">
        <div v-if="alarmsList.length === 0" class="empty-tip">暂无告警</div>
        <div v-for="alarm in alarmsList" :key="alarm.id" class="alarm-item">
          <span class="alarm-icon">⚠️</span>
          <span class="alarm-time">{{ alarm.created_at }}</span>
          <span class="alarm-bridge">{{ alarm.bridge_name }}</span>
          <span class="alarm-sensor">{{ alarm.sensor_name }}</span>
          <span class="alarm-msg">{{ alarm.msg }}</span>
          <span class="alarm-value">数值: {{ alarm.val }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  width: 100%;
  min-height: calc(100vh - 140px);
  background: linear-gradient(135deg, #0a1628 0%, #1a2a4a 100%);
  padding: 20px;
  color: #e0e6ed;
}

/* ========== 顶部标题栏 ========== */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  padding: 0 30px;
  margin-bottom: 20px;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 28px;
}

.title-text {
  font-size: 24px;
  font-weight: bold;
  color: #00d4ff;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

.header-center {
  flex: 1;
  text-align: center;
}

.current-time {
  font-size: 18px;
  color: #a0c4d9;
  font-family: 'Courier New', monospace;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-right .label {
  color: #8899aa;
  font-size: 14px;
}

/* ========== 统计卡片 ========== */
.stats-cards {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  flex: 1;
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.15);
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 25px rgba(0, 212, 255, 0.3);
  border-color: rgba(0, 212, 255, 0.6);
}

.stat-label {
  font-size: 14px;
  color: #8899aa;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 36px;
  font-weight: bold;
  color: #00d4ff;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
  margin-bottom: 5px;
}

.stat-value.warning {
  color: #ff4d4f;
  text-shadow: 0 0 10px rgba(255, 77, 79, 0.5);
}

.stat-unit {
  font-size: 12px;
  color: #667788;
}

/* ========== 主体内容区 ========== */
.main-content {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  height: 450px;
}

.left-panel,
.right-panel {
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.15);
}

.left-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel-title {
  font-size: 18px;
  font-weight: bold;
  color: #00d4ff;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0, 212, 255, 0.3);
}

.sensors-list {
  flex: 1;
  overflow-y: auto;
}

.section-group {
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  color: #4d9eff;
  font-weight: bold;
  margin-bottom: 10px;
  padding-left: 10px;
  border-left: 3px solid #4d9eff;
}

.sensor-item {
  background: rgba(0, 40, 80, 0.3);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.sensor-item:hover {
  background: rgba(0, 60, 120, 0.4);
  border-color: rgba(0, 212, 255, 0.5);
  transform: translateX(5px);
}

.sensor-item.active {
  background: rgba(0, 212, 255, 0.2);
  border-color: #00d4ff;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
}

.sensor-item.exceeded {
  border-color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
}

.sensor-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #e0e6ed;
  margin-bottom: 5px;
}

.sensor-icon {
  font-size: 16px;
}

.sensor-type {
  font-size: 12px;
  color: #8899aa;
  margin-bottom: 5px;
}

.sensor-value {
  font-size: 18px;
  font-weight: bold;
  color: #00d4ff;
}

.sensor-value .unit {
  font-size: 12px;
  color: #667788;
  margin-left: 5px;
}

.chart-container {
  flex: 1;
  position: relative;
}

.chart {
  width: 100%;
  height: 100%;
}

.empty-tip {
  text-align: center;
  color: #667788;
  padding: 40px;
  font-size: 14px;
}

/* ========== 告警面板 ========== */
.alarms-panel {
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.15);
  height: 180px;
  display: flex;
  flex-direction: column;
}

.alarms-list {
  flex: 1;
  overflow-y: auto;
}

.alarm-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  margin-bottom: 8px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 4px;
  font-size: 13px;
  color: #e0e6ed;
}

.alarm-icon {
  font-size: 18px;
}

.alarm-time {
  color: #8899aa;
  min-width: 140px;
}

.alarm-bridge {
  color: #00d4ff;
  font-weight: bold;
  min-width: 100px;
}

.alarm-sensor {
  color: #ffa940;
  min-width: 120px;
}

.alarm-msg {
  flex: 1;
  color: #ff7875;
}

.alarm-value {
  color: #ff4d4f;
  font-weight: bold;
}

/* 滚动条样式 */
.sensors-list::-webkit-scrollbar,
.alarms-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.sensors-list::-webkit-scrollbar-thumb,
.alarms-list::-webkit-scrollbar-thumb {
  background: rgba(0, 212, 255, 0.3);
  border-radius: 3px;
}

.sensors-list::-webkit-scrollbar-thumb:hover,
.alarms-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 212, 255, 0.5);
}

.sensors-list::-webkit-scrollbar-track,
.alarms-list::-webkit-scrollbar-track {
  background: rgba(0, 20, 40, 0.3);
}
</style>
