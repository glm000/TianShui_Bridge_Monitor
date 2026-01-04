<template>
  <div class="analysis-page">
    <div class="page-header">
      <h2>📊 历史数据分析</h2>
    </div>

    <!-- 筛选条件区域 -->
    <el-card class="filter-card" shadow="hover">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="桥梁">
          <el-select v-model="filterForm.bridgeId" placeholder="全部" clearable @change="onBridgeChange" style="width: 150px">
            <el-option label="全部" :value="null" />
            <el-option v-for="bridge in bridges" :key="bridge.id" :label="bridge.name" :value="bridge.id" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="断面">
          <el-select v-model="filterForm.sectionId" placeholder="全部" clearable @change="onSectionChange" style="width: 150px">
            <el-option label="全部" :value="null" />
            <el-option v-for="section in sections" :key="section.id" :label="section.name" :value="section.id" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="传感器">
          <el-select v-model="filterForm.sensorCode" placeholder="全部" clearable style="width: 200px">
            <el-option label="全部" :value="null" />
            <el-option v-for="sensor in sensors" :key="sensor.sensor_code" 
              :label="`${sensor.sensor_name} (${sensor.sensor_code})`" 
              :value="sensor.sensor_code" />
          </el-select>
        </el-form-item>

        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="~"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 380px"
          />
        </el-form-item>

        <el-form-item>
          <el-button-group>
            <el-button @click="setQuickDate('today')">今日</el-button>
            <el-button @click="setQuickDate('week')">本周</el-button>
            <el-button @click="setQuickDate('month')">本月</el-button>
            <el-button @click="setQuickDate('7days')">近7天</el-button>
            <el-button @click="setQuickDate('30days')">近30天</el-button>
          </el-button-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleQuery" :loading="loading">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="handleExport" :disabled="!filterForm.sensorCode">
            <el-icon><Download /></el-icon>
            导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 -->
    <div class="stats-cards" v-if="statistics.count > 0">
      <el-card class="stat-card stat-card-blue">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-label">数据总量</div>
          <div class="stat-value">{{ statistics.count.toLocaleString() }}</div>
          <div class="stat-unit">条</div>
        </div>
      </el-card>

      <el-card class="stat-card stat-card-green">
        <div class="stat-icon">📈</div>
        <div class="stat-content">
          <div class="stat-label">最大值</div>
          <div class="stat-value">{{ statistics.maxValue.toFixed(2) }}</div>
          <div class="stat-unit">{{ statistics.unit }}</div>
        </div>
      </el-card>

      <el-card class="stat-card stat-card-orange">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">最小值</div>
          <div class="stat-value">{{ statistics.minValue.toFixed(2) }}</div>
          <div class="stat-unit">{{ statistics.unit }}</div>
        </div>
      </el-card>

      <el-card class="stat-card stat-card-purple">
        <div class="stat-icon">📐</div>
        <div class="stat-content">
          <div class="stat-label">平均值</div>
          <div class="stat-value">{{ statistics.avgValue.toFixed(2) }}</div>
          <div class="stat-unit">{{ statistics.unit }}</div>
        </div>
      </el-card>

      <el-card class="stat-card stat-card-red">
        <div class="stat-icon">⚠️</div>
        <div class="stat-content">
          <div class="stat-label">超限次数</div>
          <div class="stat-value">{{ statistics.exceedCount.toLocaleString() }}</div>
          <div class="stat-unit">次</div>
        </div>
      </el-card>
    </div>

    <!-- 趋势图表区域 -->
    <el-card class="chart-card" shadow="hover" v-if="filterForm.sensorCode">
      <template #header>
        <div class="chart-header">
          <el-tabs v-model="activeTab" @tab-change="onTabChange">
            <el-tab-pane label="单传感器趋势" name="trend"></el-tab-pane>
            <el-tab-pane label="多传感器对比" name="compare"></el-tab-pane>
            <el-tab-pane label="告警趋势" name="alarm"></el-tab-pane>
          </el-tabs>
          
          <div class="chart-controls">
            <el-radio-group v-model="granularity" size="small" @change="onGranularityChange">
              <el-radio-button label="minute">分钟</el-radio-button>
              <el-radio-button label="hour">小时</el-radio-button>
              <el-radio-button label="day">天</el-radio-button>
            </el-radio-group>
            
            <el-radio-group v-model="chartType" size="small" style="margin-left: 10px" @change="updateChart">
              <el-radio-button label="line">折线</el-radio-button>
              <el-radio-button label="bar">柱状</el-radio-button>
              <el-radio-button label="area">面积</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <!-- 多传感器对比选择器 -->
      <div v-if="activeTab === 'compare'" class="compare-selector">
        <el-select v-model="compareSensors" multiple placeholder="选择传感器进行对比（最多5个）" 
          style="width: 100%; margin-bottom: 15px" :max-collapse-tags="3">
          <el-option v-for="sensor in sensors" :key="sensor.sensor_code" 
            :label="`${sensor.sensor_name} (${sensor.sensor_code})`" 
            :value="sensor.sensor_code"
            :disabled="compareSensors.length >= 5 && !compareSensors.includes(sensor.sensor_code)" />
        </el-select>
      </div>

      <div ref="chartEl" class="chart-container" v-loading="chartLoading"></div>
    </el-card>

    <!-- 底部区域（左右分栏） -->
    <div class="bottom-section" v-if="filterForm.sensorCode">
      <el-card class="distribution-card" shadow="hover">
        <template #header>
          <h3>数据分布</h3>
        </template>
        <div ref="distributionChartEl" class="distribution-chart" v-loading="distributionLoading"></div>
      </el-card>

      <el-card class="alarm-card" shadow="hover">
        <template #header>
          <h3>告警分析</h3>
        </template>
        <div ref="alarmChartEl" class="alarm-chart" v-loading="alarmLoading"></div>
      </el-card>
    </div>

    <!-- 数据明细表格 -->
    <el-card class="table-card" shadow="hover" v-if="filterForm.sensorCode">
      <template #header>
        <h3>数据明细</h3>
      </template>
      
      <el-table :data="historyData" stripe v-loading="tableLoading" border>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="bridge_name" label="桥梁" width="120" />
        <el-table-column prop="section_name" label="断面" width="120" />
        <el-table-column prop="sensor_name" label="传感器" width="150" />
        <el-table-column prop="value" label="数值" width="120">
          <template #default="{ row }">
            {{ parseFloat(row.value).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="isExceeded(row)" type="danger">⚠️超限</el-tag>
            <el-tag v-else type="success">✅正常</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="pagination.total > 0"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleQuery"
        @current-change="handleQuery"
        style="margin-top: 20px; justify-content: center"
      />

      <el-empty v-if="!tableLoading && historyData.length === 0" description="暂无数据" />
    </el-card>

    <el-empty v-if="!filterForm.sensorCode && !loading" 
      description="请选择传感器并点击查询按钮" 
      style="margin-top: 50px" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { Search, Download } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { 
  getHistoryData, 
  getStatistics, 
  getTrendData, 
  getDistribution, 
  getCompareData,
  getAlarmStats,
  exportData 
} from '../api/analysis.js'
import { getBridgesWithSensors } from '../api/dashboard.js'

// 数据
const bridges = ref([])
const sections = ref([])
const sensors = ref([])

const filterForm = reactive({
  bridgeId: null,
  sectionId: null,
  sensorCode: null
})

const dateRange = ref([])
const loading = ref(false)
const chartLoading = ref(false)
const tableLoading = ref(false)
const distributionLoading = ref(false)
const alarmLoading = ref(false)

const statistics = reactive({
  count: 0,
  maxValue: 0,
  minValue: 0,
  avgValue: 0,
  stdDev: 0,
  exceedCount: 0,
  unit: ''
})

const historyData = ref([])
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const activeTab = ref('trend')
const granularity = ref('hour')
const chartType = ref('line')
const compareSensors = ref([])

// 图表实例
const chartEl = ref(null)
const distributionChartEl = ref(null)
const alarmChartEl = ref(null)
let chartInstance = null
let distributionChartInstance = null
let alarmChartInstance = null

// 方法
const loadBridgesData = async () => {
  try {
    const res = await getBridgesWithSensors()
    if (res.data.success) {
      bridges.value = res.data.data || []
    }
  } catch (err) {
    console.error('加载桥梁数据失败:', err)
  }
}

const onBridgeChange = () => {
  filterForm.sectionId = null
  filterForm.sensorCode = null
  sections.value = []
  sensors.value = []
  
  if (filterForm.bridgeId) {
    const bridge = bridges.value.find(b => b.id === filterForm.bridgeId)
    if (bridge && bridge.sections) {
      sections.value = bridge.sections
    }
  }
}

const onSectionChange = () => {
  filterForm.sensorCode = null
  sensors.value = []
  
  if (filterForm.sectionId) {
    const section = sections.value.find(s => s.id === filterForm.sectionId)
    if (section && section.sensors) {
      sensors.value = section.sensors
    }
  } else if (filterForm.bridgeId) {
    // 如果清空了断面，显示该桥梁所有传感器
    const bridge = bridges.value.find(b => b.id === filterForm.bridgeId)
    if (bridge && bridge.sections) {
      sensors.value = bridge.sections.flatMap(s => s.sensors || [])
    }
  } else {
    // 显示所有传感器
    sensors.value = bridges.value.flatMap(b => 
      (b.sections || []).flatMap(s => s.sensors || [])
    )
  }
}

const setQuickDate = (type) => {
  const now = new Date()
  const start = new Date()
  
  switch (type) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(now.getDate() - now.getDay())
      start.setHours(0, 0, 0, 0)
      break
    case 'month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case '7days':
      start.setDate(now.getDate() - 7)
      break
    case '30days':
      start.setDate(now.getDate() - 30)
      break
  }
  
  dateRange.value = [
    formatDateTime(start),
    formatDateTime(now)
  ]
}

const formatDateTime = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const handleQuery = async () => {
  if (!filterForm.sensorCode) {
    ElMessage.warning('请选择传感器')
    return
  }
  
  loading.value = true
  
  try {
    // 查询统计数据
    await loadStatistics()
    
    // 查询历史数据
    await loadHistoryData()
    
    // 加载图表数据
    if (activeTab.value === 'trend') {
      await loadTrendChart()
    } else if (activeTab.value === 'compare') {
      await loadCompareChart()
    } else if (activeTab.value === 'alarm') {
      await loadAlarmChart()
    }
    
    // 加载分布图
    await loadDistributionChart()
    
    // 加载告警分析
    await loadAlarmAnalysis()
  } catch (err) {
    console.error('查询失败:', err)
    ElMessage.error('查询失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

const loadStatistics = async () => {
  const params = {
    sensorCode: filterForm.sensorCode,
    startTime: dateRange.value[0],
    endTime: dateRange.value[1]
  }
  
  const res = await getStatistics(params)
  if (res.data.success) {
    Object.assign(statistics, res.data.data)
  }
}

const loadHistoryData = async () => {
  tableLoading.value = true
  
  try {
    const params = {
      bridgeId: filterForm.bridgeId,
      sectionId: filterForm.sectionId,
      sensorCode: filterForm.sensorCode,
      startTime: dateRange.value[0],
      endTime: dateRange.value[1],
      page: pagination.page,
      pageSize: pagination.pageSize
    }
    
    const res = await getHistoryData(params)
    if (res.data.success) {
      historyData.value = res.data.data
      Object.assign(pagination, res.data.pagination)
    }
  } finally {
    tableLoading.value = false
  }
}

const loadTrendChart = async () => {
  chartLoading.value = true
  
  try {
    const params = {
      sensorCode: filterForm.sensorCode,
      startTime: dateRange.value[0],
      endTime: dateRange.value[1],
      granularity: granularity.value
    }
    
    const res = await getTrendData(params)
    if (res.data.success) {
      renderTrendChart(res.data.data)
    }
  } finally {
    chartLoading.value = false
  }
}

const loadCompareChart = async () => {
  if (compareSensors.value.length === 0) {
    if (chartInstance) {
      chartInstance.clear()
    }
    return
  }
  
  chartLoading.value = true
  
  try {
    const params = {
      sensorCodes: compareSensors.value.join(','),
      startTime: dateRange.value[0],
      endTime: dateRange.value[1],
      granularity: granularity.value
    }
    
    const res = await getCompareData(params)
    if (res.data.success) {
      renderCompareChart(res.data.data)
    }
  } finally {
    chartLoading.value = false
  }
}

const loadAlarmChart = async () => {
  chartLoading.value = true
  
  try {
    const params = {
      startTime: dateRange.value[0],
      endTime: dateRange.value[1]
    }
    
    const res = await getAlarmStats(params)
    if (res.data.success) {
      renderAlarmTrendChart(res.data.data.dailyTrend)
    }
  } finally {
    chartLoading.value = false
  }
}

const loadDistributionChart = async () => {
  distributionLoading.value = true
  
  try {
    const params = {
      sensorCode: filterForm.sensorCode,
      startTime: dateRange.value[0],
      endTime: dateRange.value[1],
      bins: 10
    }
    
    const res = await getDistribution(params)
    if (res.data.success) {
      renderDistributionChart(res.data.data)
    }
  } finally {
    distributionLoading.value = false
  }
}

const loadAlarmAnalysis = async () => {
  alarmLoading.value = true
  
  try {
    const params = {
      startTime: dateRange.value[0],
      endTime: dateRange.value[1]
    }
    
    const res = await getAlarmStats(params)
    if (res.data.success) {
      renderAlarmPieChart(res.data.data.typeDistribution)
    }
  } finally {
    alarmLoading.value = false
  }
}

const renderTrendChart = (data) => {
  if (!chartInstance) {
    chartInstance = echarts.init(chartEl.value)
  }
  
  const times = data.map(d => d.time)
  const values = data.map(d => d.avgValue)
  
  let seriesConfig = {
    name: '数值',
    data: values,
    smooth: true
  }
  
  if (chartType.value === 'line') {
    seriesConfig.type = 'line'
  } else if (chartType.value === 'bar') {
    seriesConfig.type = 'bar'
  } else if (chartType.value === 'area') {
    seriesConfig.type = 'line'
    seriesConfig.areaStyle = {}
  }
  
  const option = {
    title: {
      text: '传感器数据趋势',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      top: 30
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: statistics.unit
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        start: 0,
        end: 100
      }
    ],
    series: [seriesConfig]
  }
  
  chartInstance.setOption(option)
}

const renderCompareChart = (data) => {
  if (!chartInstance) {
    chartInstance = echarts.init(chartEl.value)
  }
  
  const allTimes = new Set()
  Object.values(data).forEach(sensor => {
    sensor.data.forEach(d => allTimes.add(d.time))
  })
  const times = Array.from(allTimes).sort()
  
  const series = Object.entries(data).map(([code, sensor]) => {
    const valueMap = new Map(sensor.data.map(d => [d.time, d.value]))
    const values = times.map(t => valueMap.get(t) || null)
    
    return {
      name: sensor.sensorName,
      type: chartType.value === 'bar' ? 'bar' : 'line',
      data: values,
      smooth: true,
      areaStyle: chartType.value === 'area' ? {} : undefined
    }
  })
  
  const option = {
    title: {
      text: '多传感器对比',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      top: 30,
      type: 'scroll'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value'
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        start: 0,
        end: 100
      }
    ],
    series
  }
  
  chartInstance.setOption(option)
}

const renderAlarmTrendChart = (data) => {
  if (!chartInstance) {
    chartInstance = echarts.init(chartEl.value)
  }
  
  const dates = data.map(d => d.date)
  const counts = data.map(d => d.count)
  
  const option = {
    title: {
      text: '告警趋势',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: '告警数量'
    },
    series: [
      {
        name: '告警数量',
        type: 'bar',
        data: counts,
        itemStyle: {
          color: '#f56c6c'
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

const renderDistributionChart = (data) => {
  if (!distributionChartInstance) {
    distributionChartInstance = echarts.init(distributionChartEl.value)
  }
  
  const ranges = data.map(d => d.range)
  const counts = data.map(d => d.count)
  
  const option = {
    title: {
      text: '数据分布直方图',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: ranges,
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: '数据数量'
    },
    series: [
      {
        name: '数量',
        type: 'bar',
        data: counts,
        itemStyle: {
          color: '#409eff'
        }
      }
    ]
  }
  
  distributionChartInstance.setOption(option)
}

const renderAlarmPieChart = (data) => {
  if (!alarmChartInstance) {
    alarmChartInstance = echarts.init(alarmChartEl.value)
  }
  
  const typeMap = {
    exceed_max: '超上限',
    exceed_min: '超下限',
    unknown: '未知'
  }
  
  const pieData = data.map(d => ({
    name: typeMap[d.type] || d.type,
    value: d.count
  }))
  
  const option = {
    title: {
      text: '告警类型分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [
      {
        name: '告警类型',
        type: 'pie',
        radius: '60%',
        data: pieData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }
  
  alarmChartInstance.setOption(option)
}

const updateChart = () => {
  if (activeTab.value === 'trend') {
    loadTrendChart()
  } else if (activeTab.value === 'compare') {
    loadCompareChart()
  }
}

const onTabChange = (tabName) => {
  if (tabName === 'trend') {
    loadTrendChart()
  } else if (tabName === 'compare') {
    if (compareSensors.value.length === 0) {
      compareSensors.value = [filterForm.sensorCode]
    }
    loadCompareChart()
  } else if (tabName === 'alarm') {
    loadAlarmChart()
  }
}

const onGranularityChange = () => {
  if (activeTab.value === 'trend') {
    loadTrendChart()
  } else if (activeTab.value === 'compare') {
    loadCompareChart()
  }
}

const isExceeded = (row) => {
  const value = parseFloat(row.value)
  if (row.limit_max !== null && value > parseFloat(row.limit_max)) return true
  if (row.limit_min !== null && value < parseFloat(row.limit_min)) return true
  return false
}

const handleExport = () => {
  const params = {
    bridgeId: filterForm.bridgeId,
    sectionId: filterForm.sectionId,
    sensorCode: filterForm.sensorCode,
    startTime: dateRange.value[0],
    endTime: dateRange.value[1]
  }
  
  const url = exportData(params)
  window.open(url, '_blank')
  ElMessage.success('导出请求已发送')
}

// 监听对比传感器变化
watch(compareSensors, () => {
  if (activeTab.value === 'compare') {
    loadCompareChart()
  }
})

// 窗口大小变化时调整图表
const handleResize = () => {
  chartInstance?.resize()
  distributionChartInstance?.resize()
  alarmChartInstance?.resize()
}

onMounted(async () => {
  await loadBridgesData()
  
  // 默认选择近7天
  setQuickDate('7days')
  
  // 显示所有传感器
  sensors.value = bridges.value.flatMap(b => 
    (b.sections || []).flatMap(s => s.sensors || [])
  )
  
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  distributionChartInstance?.dispose()
  alarmChartInstance?.dispose()
})
</script>

<style scoped>
.analysis-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  font-size: 24px;
  color: #303133;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-card-blue {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.stat-card-green {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.stat-card-orange {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.stat-card-purple {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  color: white;
}

.stat-card-red {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
  color: white;
}

.stat-icon {
  font-size: 48px;
  margin-right: 20px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  line-height: 1;
  margin-bottom: 5px;
}

.stat-unit {
  font-size: 14px;
  opacity: 0.8;
}

.chart-card {
  margin-bottom: 20px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-controls {
  display: flex;
  align-items: center;
}

.compare-selector {
  margin-bottom: 15px;
}

.chart-container {
  width: 100%;
  height: 350px;
}

.bottom-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.distribution-chart,
.alarm-chart {
  width: 100%;
  height: 300px;
}

.table-card {
  margin-bottom: 20px;
}

@media (max-width: 1200px) {
  .bottom-section {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stats-cards {
    grid-template-columns: 1fr;
  }
  
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .chart-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
