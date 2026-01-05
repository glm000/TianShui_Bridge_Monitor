<template>
  <div class="analysis-page">
    <!-- 1. 顶部标题区域 -->
    <div class="page-header">
      <div class="header-content">
        <h2 class="title">历史数据分析</h2>
        <p class="sub-title">趋势监测与异常溯源</p>
      </div>
    </div>

    <!-- 2. 筛选条件区域 (更紧凑) -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <div class="form-left">
          <!-- 优化：使用级联选择器代替3个独立下拉框 -->
          <el-form-item label="监测点位">
            <el-cascader v-model="cascaderValue" :options="cascaderOptions" :props="{ checkStrictly: false, emitPath: false, value: 'value', label: 'label' }" placeholder="请选择 桥梁 / 断面 / 传感器" filterable clearable style="width: 300px" @change="onCascaderChange" />
          </el-form-item>

          <el-form-item label="时间范围">
            <el-date-picker v-model="dateRange" type="datetimerange" :shortcuts="dateShortcuts" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD HH:mm:ss" :default-time="defaultTime" style="width: 340px" />
          </el-form-item>
        </div>

        <div class="form-right">
          <el-button type="primary" @click="handleQuery" :loading="loading">
            <el-icon class="el-icon--left"><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="handleExport" :disabled="!canExport">
            <el-icon class="el-icon--left"><Download /></el-icon>
            导出
          </el-button>
        </div>
      </el-form>
    </el-card>

    <!-- 3. 统计指标栏 (修复配色：白底深字 + 彩色图标) -->
    <div class="stats-row" v-if="filterForm.sensorCode && statistics.count > 0" v-loading="loading">
      <div class="stat-card blue">
        <div class="stat-icon">
          <el-icon><DataLine /></el-icon>
        </div>
        <div class="stat-info">
          <span class="label">数据总量</span>
          <div class="value-group">
            <span class="value">{{ statistics.count.toLocaleString() }}</span>
            <span class="unit">条</span>
          </div>
        </div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">
          <el-icon><Top /></el-icon>
        </div>
        <div class="stat-info">
          <span class="label">最大值</span>
          <div class="value-group">
            <span class="value">{{ statistics.maxValue?.toFixed?.(2) ?? '—' }}</span>
            <span class="unit">{{ statistics.unit }}</span>
          </div>
        </div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon">
          <el-icon><Bottom /></el-icon>
        </div>
        <div class="stat-info">
          <span class="label">最小值</span>
          <div class="value-group">
            <span class="value">{{ statistics.minValue?.toFixed?.(2) ?? '—' }}</span>
            <span class="unit">{{ statistics.unit }}</span>
          </div>
        </div>
      </div>
      <div class="stat-card teal">
        <div class="stat-icon">
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div class="stat-info">
          <span class="label">平均值</span>
          <div class="value-group">
            <span class="value">{{ statistics.avgValue?.toFixed?.(2) ?? '—' }}</span>
            <span class="unit">{{ statistics.unit }}</span>
          </div>
        </div>
      </div>
      <!-- 只有超限时才会闪烁红色 -->
      <div class="stat-card red" :class="{ 'has-alarm': statistics.exceedCount > 0 }">
        <div class="stat-icon">
          <el-icon><Warning /></el-icon>
        </div>
        <div class="stat-info">
          <span class="label">超限次数</span>
          <div class="value-group">
            <span class="value">{{ statistics.exceedCount?.toLocaleString?.() ?? '—' }}</span>
            <span class="unit">次</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. 主内容区：Grid 布局 (左大右小) -->
    <div class="main-content" v-if="filterForm.sensorCode">
      <!-- 4.1 左侧：图表区域 (占据 75% 宽度) -->
      <div class="chart-section panel-box">
        <div class="panel-header">
          <div class="header-left">
            <el-radio-group v-model="activeTab" size="small" @change="onTabChange">
              <el-radio-button label="trend">趋势分析</el-radio-button>
              <el-radio-button label="compare">对比分析</el-radio-button>
            </el-radio-group>
          </div>
          <div class="header-right">
            <div class="control-group">
              <span class="control-label">统计粒度:</span>
              <el-dropdown trigger="click" @command="handleGranularityCmd">
                <span class="el-dropdown-link">
                  {{ granularityMaps[granularity] }}
                  <el-icon class="el-icon--right"><arrow-down /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="minute">分钟</el-dropdown-item>
                    <el-dropdown-item command="hour">小时</el-dropdown-item>
                    <el-dropdown-item command="day">天</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <el-divider direction="vertical" />

            <el-radio-group v-model="chartType" size="small" @change="updateChart">
              <el-radio-button label="line">
                <el-icon><Share /></el-icon>
              </el-radio-button>
              <el-radio-button label="bar">
                <el-icon><Histogram /></el-icon>
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div v-if="activeTab === 'compare'" class="compare-toolbar">
          <el-select v-model="compareSensors" multiple collapse-tags collapse-tags-tooltip placeholder="添加对比传感器 (最多5个)" size="small" style="width: 100%" :max-collapse-tags="4" @change="handleCompareChange">
            <el-option v-for="s in availableSensors" :key="s.sensor_code" :label="`${s.sensor_name}`" :value="s.sensor_code" :disabled="compareSensors.length >= 5 && !compareSensors.includes(s.sensor_code)" />
          </el-select>
        </div>

        <div class="chart-wrapper">
          <div ref="chartEl" class="echarts-container" v-loading="chartLoading"></div>
          <el-empty v-if="!chartLoading && chartEmpty" :image-size="100" description="暂无图表数据" />
        </div>
      </div>

      <!-- 4.2 右侧：表格区域 (占据 25% 宽度，只看核心数据) -->
      <div class="table-section panel-box">
        <div class="panel-header">
          <span class="panel-title">明细列表</span>
          <el-tag size="small" type="info" effect="plain" round>TOP {{ pagination.total > 1000 ? 1000 : pagination.total }}</el-tag>
        </div>

        <div class="table-wrapper" ref="tableBodyEl">
          <el-table :data="historyData" height="100%" style="width: 100%" v-loading="tableLoading" :header-cell-style="{ background: '#f5f7fa', color: '#606266' }" size="small" stripe>
            <el-table-column prop="created_at" label="时间" min-width="140" show-overflow-tooltip />

            <el-table-column prop="value" label="数值" width="90" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-danger': isExceeded(row), 'font-mono': true }">
                  {{ Number(row.value).toFixed(2) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="状态" width="60" align="center">
              <template #default="{ row }">
                <div class="status-dot" :class="isExceeded(row) ? 'error' : 'success'"></div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="pagination-footer">
          <el-pagination v-if="pagination.total > 0" :current-page="pagination.page" :page-size="pagination.pageSize" :page-sizes="[20, 50]" :total="pagination.total" small background layout="total, prev, pager, next" @update:current-page="val => (pagination.page = val)" @update:page-size="val => (pagination.pageSize = val)" @size-change="handleTableQuery" @current-change="handleTableQuery" />
        </div>
      </div>
    </div>

    <!-- 初始空状态 -->
    <div v-else-if="!loading" class="empty-guide">
      <el-empty description="请在上方选择传感器与时间范围进行查询">
        <template #image>
          <el-icon :size="60" color="#dcdfe6"><DataAnalysis /></el-icon>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { Search, Download, DataLine, Top, Bottom, TrendCharts, Warning, Share, Histogram, ArrowDown, DataAnalysis } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'

// 模拟导入 (保持你原有的 API 路径)
import { getHistoryData, getStatistics, getTrendData, getCompareData, exportData } from '../api/analysis.js'
import { getBridgesWithSensors } from '../api/dashboard.js'

// --- 状态数据 ---
const bridges = ref([])
const allSensorsMap = ref(new Map()) // 扁平化存储所有传感器信息

const filterForm = reactive({
  bridgeId: null,
  sectionId: null,
  sensorCode: null
})

// 级联选择器数据
const cascaderValue = ref(null)
const cascaderOptions = ref([])

const dateRange = ref([])
const defaultTime = [new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]

const loading = ref(false)
const chartLoading = ref(false)
const tableLoading = ref(false)

const statistics = reactive({
  count: 0,
  maxValue: 0,
  minValue: 0,
  avgValue: 0,
  exceedCount: 0,
  unit: ''
})

const historyData = ref([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const activeTab = ref('trend')
const granularity = ref('hour')
const granularityMaps = { minute: '分钟', hour: '小时', day: '天' }
const chartType = ref('line')
const compareSensors = ref([])

const chartEmpty = ref(false)
const chartEl = ref(null)
let chartInstance = null

// --- 配置项 ---
const dateShortcuts = [
  {
    text: '今天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      return [start, end]
    }
  },
  {
    text: '近3天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 3)
      return [start, end]
    }
  },
  {
    text: '近7天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 7)
      return [start, end]
    }
  }
]

const canExport = computed(() => Boolean(filterForm.sensorCode && dateRange.value?.length === 2 && historyData.value.length > 0))

// 仅用于对比选择的传感器列表
const availableSensors = computed(() => {
  return Array.from(allSensorsMap.value.values())
})

// --- 初始化与加载 ---
const loadBridgesData = async () => {
  try {
    const res = await getBridgesWithSensors()
    if (res.data.success) {
      bridges.value = res.data.data || []
      processCascaderOptions(bridges.value)
    }
  } catch (err) {
    ElMessage.error('加载桥梁数据失败')
  }
}

// 转换级联数据结构
const processCascaderOptions = data => {
  allSensorsMap.value.clear()
  cascaderOptions.value = data.map(bridge => ({
    value: bridge.id,
    label: bridge.name,
    children: (bridge.sections || []).map(section => ({
      value: section.id,
      label: section.name,
      children: (section.sensors || []).map(sensor => {
        allSensorsMap.value.set(sensor.sensor_code, { ...sensor, bridgeId: bridge.id, sectionId: section.id })
        return {
          value: sensor.sensor_code,
          label: sensor.sensor_name,
          leaf: true
        }
      })
    }))
  }))
}

// 级联选择变化
const onCascaderChange = val => {
  if (!val) {
    filterForm.sensorCode = null
    return
  }
  // 如果选中了传感器（叶子节点）
  if (allSensorsMap.value.has(val)) {
    const sensor = allSensorsMap.value.get(val)
    filterForm.bridgeId = sensor.bridgeId
    filterForm.sectionId = sensor.sectionId
    filterForm.sensorCode = sensor.sensor_code
  }
}

// --- 核心逻辑 ---
const setQuickDate = () => {
  const end = new Date()
  const start = new Date()
  start.setTime(start.getTime() - 3600 * 1000 * 24 * 7) // 默认7天
  dateRange.value = [formatDate(start), formatDate(end)]
}
const formatDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')

const handleQuery = async () => {
  if (!filterForm.sensorCode) return ElMessage.warning('请先在左侧选择传感器')
  if (!dateRange.value?.length) return ElMessage.warning('请选择时间范围')

  loading.value = true
  pagination.page = 1

  try {
    await Promise.all([loadStatistics(), loadHistoryData(), updateChartInternal()])
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const loadStatistics = async () => {
  const res = await getStatistics({ sensorCode: filterForm.sensorCode, startTime: dateRange.value[0], endTime: dateRange.value[1] })
  if (res.data.success) Object.assign(statistics, res.data.data)
}

const loadHistoryData = async () => {
  tableLoading.value = true
  try {
    const res = await getHistoryData({
      sensorCode: filterForm.sensorCode,
      startTime: dateRange.value[0],
      endTime: dateRange.value[1],
      page: pagination.page,
      pageSize: pagination.pageSize
    })

    if (res.data.success) {
      historyData.value = res.data.data || []

      // --- 修改开始：增强赋值健壮性 ---
      if (res.data.pagination && res.data.pagination.total) {
        // 情况A：后端返回了标准的 pagination 对象
        Object.assign(pagination, res.data.pagination)
      } else if (typeof res.data.total === 'number') {
        // 情况B：后端把 total 直接放在了 data 根节点
        pagination.total = res.data.total
      } else {
        // 情况C：完全没返回 total，用当前数组长度兜底，防止分页栏消失
        pagination.total = historyData.value.length
      }
      // --- 修改结束 ---
    }
  } finally {
    tableLoading.value = false
  }
}

const handleTableQuery = () => loadHistoryData()

// --- 图表逻辑 ---
const handleGranularityCmd = cmd => {
  granularity.value = cmd
  updateChartInternal()
}

const updateChart = () => updateChartInternal()
const onTabChange = () => {
  if (activeTab.value === 'compare' && compareSensors.value.length === 0 && filterForm.sensorCode) {
    compareSensors.value = [filterForm.sensorCode]
  }
  updateChartInternal()
}
const handleCompareChange = () => updateChartInternal()

const updateChartInternal = async () => {
  if (!filterForm.sensorCode) return
  chartLoading.value = true

  try {
    // 确保 DOM 存在
    await nextTick()
    if (!chartInstance && chartEl.value) {
      chartInstance = echarts.init(chartEl.value)
      window.addEventListener('resize', () => chartInstance.resize())
    }

    chartInstance.clear()

    if (activeTab.value === 'trend') {
      const res = await getTrendData({
        sensorCode: filterForm.sensorCode,
        startTime: dateRange.value[0],
        endTime: dateRange.value[1],
        granularity: granularity.value
      })
      const data = res.data.data || []
      chartEmpty.value = data.length === 0
      renderTrendChart(data)
    } else {
      const sensorList = compareSensors.value.length ? compareSensors.value.join(',') : filterForm.sensorCode
      const res = await getCompareData({
        sensorCodes: sensorList,
        startTime: dateRange.value[0],
        endTime: dateRange.value[1],
        granularity: granularity.value
      })
      const data = res.data.data || {}
      chartEmpty.value = Object.keys(data).length === 0
      renderCompareChart(data)
    }
  } finally {
    chartLoading.value = false
  }
}

const commonChartOptions = {
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
  grid: { left: '4%', right: '3%', top: 50, bottom: 40, containLabel: true },
  toolbox: { feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: {} } },
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 5 }]
}

const renderTrendChart = data => {
  const times = data.map(d => d.time)
  const values = data.map(d => d.avgValue)

  chartInstance.setOption({
    ...commonChartOptions,
    xAxis: { type: 'category', data: times, boundaryGap: false },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        name: '数值',
        type: chartType.value === 'bar' ? 'bar' : 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#409EFF' },
        areaStyle:
          chartType.value === 'line'
            ? {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(64,158,255,0.4)' },
                  { offset: 1, color: 'rgba(64,158,255,0.01)' }
                ])
              }
            : undefined
      }
    ]
  })
}

const renderCompareChart = dataMap => {
  const timestamps = new Set()
  Object.values(dataMap).forEach(sensor => (sensor.data || []).forEach(d => timestamps.add(d.time)))
  const dates = Array.from(timestamps).sort()

  const series = Object.values(dataMap).map(sensor => {
    const map = new Map((sensor.data || []).map(i => [i.time, i.value]))
    return {
      name: sensor.sensorName,
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: dates.map(d => map.get(d) || null)
    }
  })

  chartInstance.setOption({
    ...commonChartOptions,
    legend: { top: 0, type: 'scroll' },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { type: 'dashed' } } },
    series
  })
}

// --- 辅助功能 ---
const isExceeded = row => {
  const val = Number(row.value)
  if (row.limit_max != null && val > row.limit_max) return true
  if (row.limit_min != null && val < row.limit_min) return true
  return false
}

const handleExport = () => {
  const url = exportData({ ...filterForm, startTime: dateRange.value[0], endTime: dateRange.value[1] })
  window.open(url, '_blank')
}

// 自动调整布局
const tableBodyEl = ref(null)

onMounted(async () => {
  await loadBridgesData()
  setQuickDate()
})

onUnmounted(() => {
  chartInstance?.dispose()
})
</script>

<style scoped>
/* 定义 CSS 变量方便维护 */
:root {
  --bg-color: #ebeef5;
}

.analysis-page {
  /* 页面全屏容器，不可滚动，内部区域独立滚动 */
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background-color: #f0f2f5;
  box-sizing: border-box;
  gap: 12px;
}

/* 1. 标题 */
.page-header .title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2f3d;
}
.page-header .sub-title {
  margin: 4px 0 0;
  font-size: 12px;
  color: #909399;
}

/* 2. 筛选卡片 */
.filter-card :deep(.el-card__body) {
  padding: 12px 16px;
}
.filter-form {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.form-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.form-right {
  display: flex;
  align-items: center;
}
.filter-form .el-form-item {
  margin-bottom: 0;
  margin-right: 0;
}

/* 3. 统计卡片 (核心修复：白底深字) */
.stats-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* 5列等宽 */
  gap: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  /* 阴影和左侧边框条 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #ddd;
  transition: all 0.2s;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.stat-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.stat-info .label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}
.stat-info .value {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  font-family: 'DIN Alternate', sans-serif;
}
.stat-info .unit {
  font-size: 12px;
  color: #999;
  margin-left: 4px;
}

/* 颜色风格 */
.stat-card.blue {
  border-color: #409eff;
}
.stat-card.blue .stat-icon {
  background: #ecf5ff;
  color: #409eff;
}

.stat-card.green {
  border-color: #67c23a;
}
.stat-card.green .stat-icon {
  background: #f0f9eb;
  color: #67c23a;
}

.stat-card.orange {
  border-color: #e6a23c;
}
.stat-card.orange .stat-icon {
  background: #fdf6ec;
  color: #e6a23c;
}

.stat-card.teal {
  border-color: #20b2aa;
}
.stat-card.teal .stat-icon {
  background: rgba(32, 178, 170, 0.1);
  color: #20b2aa;
}

.stat-card.red {
  border-color: #909399;
}
.stat-card.red .stat-icon {
  background: #f4f4f5;
  color: #909399;
}

/* 告警状态 */
.stat-card.has-alarm {
  border-color: #f56c6c;
  animation: shadowPulse 2s infinite;
}
.stat-card.has-alarm .stat-icon {
  background: #fef0f0;
  color: #f56c6c;
}
.stat-card.has-alarm .value {
  color: #f56c6c;
}

@keyframes shadowPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(245, 108, 108, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
  }
}

/* 4. 主区域 Grid 布局 (图表大，表格小) */
.main-content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 3fr 1fr; /* 左3右1 */
  gap: 12px;
}

/* 2. 强制卡片占满 Grid 格子，且设为 Flex 列布局 */
.panel-box {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  /* 关键：必须是 flex 并且高度 100% 才能限制内部元素 */
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  flex: 0 0 40px; /* 头部高度固定 */
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  background: #fafafa;
}

/* 图表区 */
.chart-section .header-left,
.chart-section .header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chart-section .control-label {
  font-size: 12px;
  color: #666;
}
.chart-section .el-dropdown-link {
  cursor: pointer;
  font-size: 12px;
  color: #409eff;
}
.chart-section .compare-toolbar {
  padding: 8px 12px;
  border-bottom: 1px dashed #eee;
}
.chart-section .chart-wrapper {
  flex: 1;
  min-height: 0;
  padding: 10px;
  position: relative;
}
.echarts-container {
  width: 100%;
  height: 100%;
}

/* 表格区 */
.table-section .panel-title {
  font-weight: 600;
  font-size: 13px;
  color: #333;
}
/* 3. 这里的改动最重要：限制表格区域 */
.table-section .table-wrapper {
  flex: 1; /* 占据剩余所有空间 */
  min-height: 0; /* 【核心】允许 Flex 子项收缩，否则会被表格内容撑爆 */
  position: relative;
  display: flex; /* 使得 el-table 的 height="100%" 生效 */
  flex-direction: column;
}
/* 4. 确保底部分页栏不被挤压 */
.table-section .pagination-footer {
  flex: 0 0 auto; /* 高度根据内容自动，但不允许被压缩 */
  padding: 8px 0;
  display: flex;
  justify-content: center; /* 居中显示 */
  border-top: 1px solid #ebeef5;
  background-color: #fff; /* 加上背景色，防止透明叠加 */
  z-index: 10;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.success {
  background: #67c23a;
}
.status-dot.error {
  background: #f56c6c;
}
.font-mono {
  font-family: Consolas, monospace;
}
.text-danger {
  color: #f56c6c;
  font-weight: bold;
}

.empty-guide {
  flex: 1;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
</style>
