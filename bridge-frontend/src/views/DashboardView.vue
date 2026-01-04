<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getOverview, getBridgesWithSensors, getRealTimeData, getSensorLatest, getAlarms } from '../api/dashboard.js'

// ========= 工具 =========
const chunk = (arr, size) => {
  const res = []
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
  return res
}
const clampIndex = (idx, len) => (len <= 0 ? 0 : Math.max(0, Math.min(idx, len - 1)))

const formatHms = date => {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ========= 数据状态 =========
const currentTime = ref('')
const lastRefreshTime = ref('')
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

// 大屏轮巡开关
const autoRotateBridge = ref(true)
const autoRotateSensor = ref(true)

// 分页轮播配置
const sensorPageSize = ref(12)
const alarmPageSize = ref(8)

// 当前页索引（各表独立轮播）
const allSensorsPageIndex = ref(0)
const exceededPageIndex = ref(0)
const offlinePageIndex = ref(0)
const alarmPageIndex = ref(0)

// 图表轮播索引
const chartSlideIndex = ref(0)

// 图表 DOM & 实例
const realtimeChartEl = ref(null)
const alarmTrendChartEl = ref(null)
const typePieChartEl = ref(null)
const sectionMultiChartEl = ref(null)

let realtimeChart = null
let alarmTrendChart = null
let typePieChart = null
let sectionMultiChart = null

const maxSectionSeries = ref(6)
const lastSectionChartUpdateAt = ref(0)
const minSectionChartIntervalMs = 20000

// timers
let timeTimer = null
let refreshTimer = null
let bridgeRotateTimer = null
let sensorRotateTimer = null
let pageRotateTimer = null
let resizeHandler = null

// ========= 计算属性 =========
const currentBridge = computed(() => {
  if (!selectedBridgeId.value) return null
  return bridgesData.value.find(b => b.id === selectedBridgeId.value) || null
})

const flatSensors = computed(() => {
  if (!currentBridge.value) return []
  const res = []
  currentBridge.value.sections?.forEach(section => {
    section.sensors?.forEach(sensor => {
      const rt = realtimeData.value.find(r => r.sensor_code === sensor.sensor_code)
      const value = rt?.value ?? null
      const isOnline = rt && value !== null && value !== undefined && value !== ''
      res.push({
        ...sensor,
        section_name: section.name,
        realtime: rt || null,
        realtime_value: value,
        is_online: !!isOnline
      })
    })
  })
  return res
})

const offlineSensors = computed(() => flatSensors.value.filter(s => !s.is_online))

const isSensorExceeded = sensorLike => {
  if (!sensorLike) return false
  const v = sensorLike.realtime_value ?? sensorLike.value
  if (v === undefined || v === null || v === '') return false
  const val = parseFloat(v)
  if (Number.isNaN(val)) return false

  const max = sensorLike.limit_max
  const min = sensorLike.limit_min
  if (max !== undefined && max !== null && max !== '' && val > parseFloat(max)) return true
  if (min !== undefined && min !== null && min !== '' && val < parseFloat(min)) return true
  return false
}

const exceededSensors = computed(() => {
  const res = flatSensors.value
    .filter(s => s.is_online && isSensorExceeded(s))
    .map(s => {
      const val = parseFloat(s.realtime_value)
      const max = s.limit_max !== undefined && s.limit_max !== null && s.limit_max !== '' ? parseFloat(s.limit_max) : null
      const min = s.limit_min !== undefined && s.limit_min !== null && s.limit_min !== '' ? parseFloat(s.limit_min) : null
      let exceed = 0
      if (max !== null && !Number.isNaN(max) && val > max) exceed = val - max
      if (min !== null && !Number.isNaN(min) && val < min) exceed = min - val
      return { ...s, exceed }
    })
    .sort((a, b) => b.exceed - a.exceed)
  return res
})

const sensorTypeStats = computed(() => {
  const map = new Map()
  flatSensors.value.forEach(s => {
    const k = s.sensor_type || 'unknown'
    map.set(k, (map.get(k) || 0) + 1)
  })
  return Array.from(map.entries()).map(([type, count]) => ({ type, count }))
})

const offlineCount = computed(() => offlineSensors.value.length)
const exceededCount = computed(() => exceededSensors.value.length)

// 表格分页数据
const allSensorsPages = computed(() => chunk(flatSensors.value, sensorPageSize.value))
const exceededPages = computed(() => chunk(exceededSensors.value, sensorPageSize.value))
const offlinePages = computed(() => chunk(offlineSensors.value, sensorPageSize.value))
const alarmPages = computed(() => chunk(alarmsList.value, alarmPageSize.value))

const allSensorsPage = computed(() => allSensorsPages.value[clampIndex(allSensorsPageIndex.value, allSensorsPages.value.length)] || [])
const exceededPage = computed(() => exceededPages.value[clampIndex(exceededPageIndex.value, exceededPages.value.length)] || [])
const offlinePage = computed(() => offlinePages.value[clampIndex(offlinePageIndex.value, offlinePages.value.length)] || [])
const alarmPage = computed(() => alarmPages.value[clampIndex(alarmPageIndex.value, alarmPages.value.length)] || [])

// 选中传感器所在断面（用于“断面多传感器叠加曲线”）
const selectedSection = computed(() => {
  const bridge = currentBridge.value
  if (!bridge?.sections?.length) return null

  const code = selectedSensorCode.value
  if (code) {
    for (const section of bridge.sections) {
      if (section?.sensors?.some(s => s.sensor_code === code)) return section
    }
  }
  return bridge.sections[0] || null
})

const sectionSensorsForChart = computed(() => {
  const sensors = selectedSection.value?.sensors || []
  return sensors.slice(0, maxSectionSeries.value)
})

// ========= 全局滚动条（超限/离线摘要） =========
const tickerItems = computed(() => {
  const items = []

  // 超限摘要（取前 10）
  exceededSensors.value.slice(0, 10).forEach(s => {
    const val = s.realtime_value ?? '--'
    const max = s.limit_max ?? '--'
    const min = s.limit_min ?? '--'
    items.push(`【超限】${s.section_name}-${s.sensor_name}(${s.sensor_code})=${val}${s.unit || ''} [min:${min} max:${max}]`)
  })

  // 离线摘要（取前 12）
  offlineSensors.value.slice(0, 12).forEach(s => {
    items.push(`【离线】${s.section_name}-${s.sensor_name}(${s.sensor_code})`)
  })

  return items
})

const tickerIsStatic = computed(() => tickerItems.value.length === 0)

const tickerText = computed(() => {
  if (tickerIsStatic.value) return '系统运行正常：暂无超限/离线点位'
  return tickerItems.value.join('   ｜   ')
})

const marqueeDuration = computed(() => {
  // 文本越长滚动越慢（更易读）
  const len = tickerText.value.length
  // 经验值：大概每秒滚 6~10 个字符的观感
  const duration = Math.round(Math.max(14, Math.min(48, len / 6)))
  return duration
})

// ========= 显示映射 =========
const getSensorTypeName = type => {
  const typeMap = { strain: '应变', disp: '位移', press: '压力', vib: '振动', rebar: '钢筋应力' }
  return typeMap[type] || type || '--'
}

// ========= 方法 =========
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

const markRefreshTime = () => {
  const now = new Date()
  lastRefreshTime.value = now.toLocaleString('zh-CN', { hour12: false })
}

const loadOverview = async () => {
  const res = await getOverview()
  if (res.data?.success) overview.value = res.data.data
}

const loadBridgesData = async () => {
  const res = await getBridgesWithSensors()
  if (res.data?.success) {
    bridgesData.value = res.data.data || []
    if (bridgesData.value.length > 0 && !selectedBridgeId.value) {
      selectedBridgeId.value = bridgesData.value[0].id
    }
  }
}

const loadRealtimeData = async () => {
  const res = await getRealTimeData()
  if (res.data?.success) realtimeData.value = res.data.data || []
}

const loadAlarms = async () => {
  const res = await getAlarms()
  if (res.data?.success) {
    // 大屏建议多取一些再分页轮播
    alarmsList.value = (res.data.data || []).slice(0, 50)
  }
}

const refreshAllData = async () => {
  try {
    await Promise.all([loadOverview(), loadRealtimeData(), loadAlarms()])
    markRefreshTime()
    updateAlarmTrendChart()
    updateTypePieChart()

    if (selectedSensorCode.value) {
      await loadSensorChart(selectedSensorCode.value)
    }

    // 如果当前停留在“断面叠加曲线”页，则允许按最小间隔刷新一次
    if (chartSlideIndex.value === 3) {
      await updateSectionMultiChart(false)
    }
  } catch (e) {
    console.error('刷新失败:', e)
  }
}

const pickDefaultSensor = () => {
  const list = flatSensors.value
  if (list.length > 0) selectedSensorCode.value = list[0].sensor_code
}

const rotateBridgeOnce = () => {
  if (!bridgesData.value.length) return
  const idx = bridgesData.value.findIndex(b => b.id === selectedBridgeId.value)
  const nextIdx = idx >= 0 ? (idx + 1) % bridgesData.value.length : 0
  selectedBridgeId.value = bridgesData.value[nextIdx].id
}

const rotateSensorOnce = () => {
  const list = flatSensors.value
  if (!list.length) return
  const idx = list.findIndex(s => s.sensor_code === selectedSensorCode.value)
  const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0
  selectedSensorCode.value = list[nextIdx].sensor_code
}

// ========= 图表 =========
const ensureMainCharts = () => {
  if (!realtimeChart && realtimeChartEl.value) realtimeChart = echarts.init(realtimeChartEl.value)
  if (!alarmTrendChart && alarmTrendChartEl.value) alarmTrendChart = echarts.init(alarmTrendChartEl.value)
  if (!typePieChart && typePieChartEl.value) typePieChart = echarts.init(typePieChartEl.value)
}

const ensureSectionChart = () => {
  if (!sectionMultiChart && sectionMultiChartEl.value) sectionMultiChart = echarts.init(sectionMultiChartEl.value)
}

const loadSensorChart = async sensorCode => {
  try {
    ensureMainCharts()
    if (!realtimeChart) return

    const res = await getSensorLatest(sensorCode, 60)
    const data = res.data?.success ? res.data.data || [] : []
    if (!data.length) {
      realtimeChart.setOption({
        title: {
          text: `实时曲线（${sensorCode}，暂无数据）`,
          left: 'center',
          top: 10,
          textStyle: { color: '#00d4ff', fontSize: 14 }
        },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: [] }]
      })
      return
    }

    const times = data.map(item => formatHms(item.created_at))
    const values = data.map(item => parseFloat(item.value))

    realtimeChart.setOption({
      backgroundColor: 'transparent',
      title: { text: `实时曲线（${sensorCode}）`, left: 'center', top: 10, textStyle: { color: '#00d4ff', fontSize: 14 } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 20, 40, 0.85)', borderColor: '#00d4ff', textStyle: { color: '#fff' } },
      grid: { left: '8%', right: '5%', top: '18%', bottom: '14%' },
      xAxis: { type: 'category', data: times, axisLine: { lineStyle: { color: '#00d4ff' } }, axisLabel: { color: '#8899aa' } },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#00d4ff' } },
        axisLabel: { color: '#8899aa' },
        splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.1)' } }
      },
      series: [
        {
          name: '数值',
          type: 'line',
          smooth: true,
          data: values,
          lineStyle: { color: '#00d4ff', width: 2, shadowColor: 'rgba(0, 212, 255, 0.5)', shadowBlur: 10 },
          itemStyle: { color: '#00d4ff' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0, 212, 255, 0.25)' },
                { offset: 1, color: 'rgba(0, 212, 255, 0.03)' }
              ]
            }
          }
        }
      ]
    })
  } catch (e) {
    console.error('加载传感器曲线失败:', e)
  }
}

const updateAlarmTrendChart = () => {
  ensureMainCharts()
  if (!alarmTrendChart) return

  // 仅用当前 alarmsList 做一个“按小时统计”（准确度取决于 getAlarms 返回量）
  const buckets = new Map()
  alarmsList.value.forEach(a => {
    const d = new Date(a.created_at)
    if (Number.isNaN(d.getTime())) return
    const key = `${String(d.getHours()).padStart(2, '0')}:00`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  })

  const x = Array.from(buckets.keys()).sort()
  const y = x.map(k => buckets.get(k))

  alarmTrendChart.setOption({
    backgroundColor: 'transparent',
    title: { text: '告警趋势（按小时）', left: 'center', top: 10, textStyle: { color: '#00d4ff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '10%', right: '5%', top: '22%', bottom: '14%' },
    xAxis: { type: 'category', data: x, axisLine: { lineStyle: { color: '#00d4ff' } }, axisLabel: { color: '#8899aa' } },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#00d4ff' } },
      axisLabel: { color: '#8899aa' },
      splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.1)' } }
    },
    series: [{ type: 'bar', data: y, itemStyle: { color: 'rgba(255, 77, 79, 0.85)' } }]
  })
}

const updateTypePieChart = () => {
  ensureMainCharts()
  if (!typePieChart) return

  typePieChart.setOption({
    backgroundColor: 'transparent',
    title: { text: '传感器类型分布', left: 'center', top: 10, textStyle: { color: '#00d4ff', fontSize: 14 } },
    tooltip: { trigger: 'item' },
    legend: { bottom: 5, textStyle: { color: '#8899aa' } },
    series: [
      {
        type: 'pie',
        radius: ['35%', '60%'],
        center: ['50%', '52%'],
        data: sensorTypeStats.value.map(i => ({ name: getSensorTypeName(i.type), value: i.count })),
        label: { color: '#e0e6ed' }
      }
    ]
  })
}

const updateSectionMultiChart = async force => {
  const now = Date.now()
  if (!force && now - lastSectionChartUpdateAt.value < minSectionChartIntervalMs) return
  if (chartSlideIndex.value !== 3) return

  await nextTick()
  ensureSectionChart()
  if (!sectionMultiChart) return

  const section = selectedSection.value
  const sensors = sectionSensorsForChart.value

  if (!section || sensors.length === 0) {
    sectionMultiChart.setOption({
      backgroundColor: 'transparent',
      title: { text: '断面多传感器叠加（暂无数据）', left: 'center', top: 10, textStyle: { color: '#00d4ff', fontSize: 14 } },
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: []
    })
    lastSectionChartUpdateAt.value = now
    return
  }

  const results = await Promise.allSettled(sensors.map(s => getSensorLatest(s.sensor_code, 60)))

  // 汇总所有时间点
  const timeToTs = new Map()
  const seriesMaps = []
  results.forEach((r, idx) => {
    const sensor = sensors[idx]
    if (r.status !== 'fulfilled') {
      seriesMaps.push({ sensor, map: new Map() })
      return
    }
    const data = r.value?.data?.success ? r.value.data.data || [] : []
    const map = new Map()
    data.forEach(item => {
      const d = new Date(item.created_at)
      const ts = d.getTime()
      if (Number.isNaN(ts)) return
      const label = formatHms(d)
      timeToTs.set(label, ts)
      map.set(label, parseFloat(item.value))
    })
    seriesMaps.push({ sensor, map })
  })

  const times = Array.from(timeToTs.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label)

  const palette = ['#00d4ff', '#4d9eff', '#36cfc9', '#ffa940', '#ff4d4f', '#9254de', '#73d13d', '#f759ab']
  const series = seriesMaps.map((sm, i) => {
    const name = sm.sensor.sensor_name || sm.sensor.sensor_code
    const data = times.map(t => {
      const v = sm.map.get(t)
      return v === undefined ? null : v
    })
    return {
      name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data,
      lineStyle: { width: 2, color: palette[i % palette.length] },
      itemStyle: { color: palette[i % palette.length] },
      emphasis: { focus: 'series' }
    }
  })

  sectionMultiChart.setOption({
    backgroundColor: 'transparent',
    title: { text: `断面多传感器叠加（${section.name}）`, left: 'center', top: 10, textStyle: { color: '#00d4ff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { top: 38, left: 'center', textStyle: { color: '#a0c4d9' } },
    grid: { left: '8%', right: '5%', top: '25%', bottom: '14%' },
    xAxis: { type: 'category', data: times, axisLine: { lineStyle: { color: '#00d4ff' } }, axisLabel: { color: '#8899aa' } },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#00d4ff' } },
      axisLabel: { color: '#8899aa' },
      splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.1)' } }
    },
    dataZoom: [{ type: 'inside' }],
    series
  })

  lastSectionChartUpdateAt.value = now
}

const resizeCharts = () => {
  realtimeChart?.resize()
  alarmTrendChart?.resize()
  typePieChart?.resize()
  sectionMultiChart?.resize()
}

// ========= 轮播/分页定时器 =========
const startTimers = () => {
  stopTimers()

  // 分页轮播（让表格显示更多数据）
  pageRotateTimer = setInterval(() => {
    allSensorsPageIndex.value = clampIndex(allSensorsPageIndex.value + 1, allSensorsPages.value.length)
    exceededPageIndex.value = clampIndex(exceededPageIndex.value + 1, exceededPages.value.length)
    offlinePageIndex.value = clampIndex(offlinePageIndex.value + 1, offlinePages.value.length)
    alarmPageIndex.value = clampIndex(alarmPageIndex.value + 1, alarmPages.value.length)
  }, 4000)

  // 桥梁轮巡
  bridgeRotateTimer = setInterval(() => {
    if (autoRotateBridge.value) rotateBridgeOnce()
  }, 20000)

  // 传感器轮巡
  sensorRotateTimer = setInterval(() => {
    if (autoRotateSensor.value) rotateSensorOnce()
  }, 6000)
}

const stopTimers = () => {
  if (pageRotateTimer) clearInterval(pageRotateTimer)
  if (bridgeRotateTimer) clearInterval(bridgeRotateTimer)
  if (sensorRotateTimer) clearInterval(sensorRotateTimer)
  pageRotateTimer = null
  bridgeRotateTimer = null
  sensorRotateTimer = null
}

// ========= 监听 =========
watch(selectedBridgeId, async () => {
  allSensorsPageIndex.value = 0
  exceededPageIndex.value = 0
  offlinePageIndex.value = 0

  await nextTick()
  pickDefaultSensor()
  updateTypePieChart()
  resizeCharts()

  if (chartSlideIndex.value === 3) {
    await updateSectionMultiChart(true)
  }
})

watch(selectedSensorCode, async code => {
  if (!code) return
  await nextTick()
  await loadSensorChart(code)

  if (chartSlideIndex.value === 3) {
    await updateSectionMultiChart(true)
  }
})

watch(chartSlideIndex, async idx => {
  await nextTick()
  resizeCharts()
  if (idx === 3) {
    await updateSectionMultiChart(true)
  }
})

watch([allSensorsPages, exceededPages, offlinePages, alarmPages], () => {
  allSensorsPageIndex.value = clampIndex(allSensorsPageIndex.value, allSensorsPages.value.length)
  exceededPageIndex.value = clampIndex(exceededPageIndex.value, exceededPages.value.length)
  offlinePageIndex.value = clampIndex(offlinePageIndex.value, offlinePages.value.length)
  alarmPageIndex.value = clampIndex(alarmPageIndex.value, alarmPages.value.length)
})

// ========= 生命周期 =========
onMounted(async () => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)

  await loadBridgesData()
  await refreshAllData()
  pickDefaultSensor()

  refreshTimer = setInterval(refreshAllData, 10000)

  resizeHandler = () => resizeCharts()
  window.addEventListener('resize', resizeHandler)

  await nextTick()
  ensureMainCharts()
  updateAlarmTrendChart()
  updateTypePieChart()
  if (selectedSensorCode.value) await loadSensorChart(selectedSensorCode.value)

  startTimers()
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  stopTimers()

  if (resizeHandler) window.removeEventListener('resize', resizeHandler)

  realtimeChart?.dispose()
  alarmTrendChart?.dispose()
  typePieChart?.dispose()
  sectionMultiChart?.dispose()
  realtimeChart = null
  alarmTrendChart = null
  typePieChart = null
  sectionMultiChart = null
})
</script>

<template>
  <div class="screen">
    <!-- 顶部 -->
    <div class="topbar">
      <div class="topbar-left">
        <div class="title">天水桥梁健康监测系统</div>
        <div class="subtitle">
          <span>当前时间：{{ currentTime }}</span>
          <span class="divider">|</span>
          <span>数据刷新：{{ lastRefreshTime || '--' }}</span>
        </div>
      </div>

      <div class="topbar-right">
        <div class="controls">
          <div class="ctrl">
            <span class="label">桥梁：</span>
            <el-select v-model="selectedBridgeId" size="large" style="width: 240px" placeholder="请选择桥梁">
              <el-option v-for="b in bridgesData" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </div>

          <div class="ctrl switch">
            <span class="label">桥梁轮巡</span>
            <el-switch v-model="autoRotateBridge" />
          </div>

          <div class="ctrl switch">
            <span class="label">传感器轮巡</span>
            <el-switch v-model="autoRotateSensor" />
          </div>
        </div>
      </div>
    </div>

    <!-- KPI -->
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">桥梁总数</div>
        <div class="kpi-value">{{ overview.bridgeCount }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">传感器总数</div>
        <div class="kpi-value">{{ overview.sensorCount }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">在线传感器</div>
        <div class="kpi-value">{{ overview.onlineSensors }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">离线/无数据</div>
        <div class="kpi-value warn">{{ offlineCount }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">超限点位</div>
        <div class="kpi-value warn">{{ exceededCount }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">在线率(%)</div>
        <div class="kpi-value">{{ overview.onlineRate }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">待处理告警</div>
        <div class="kpi-value warn">{{ overview.unhandledAlarms }}</div>
      </div>
    </div>

    <!-- 全局滚动条（摘要） -->
    <div class="ticker">
      <div class="ticker-label">实时摘要</div>
      <div class="ticker-viewport" :class="{ static: tickerIsStatic }">
        <div class="ticker-track" :class="{ static: tickerIsStatic }" :style="{ animationDuration: marqueeDuration + 's' }">
          <span class="ticker-text">{{ tickerText }}</span>
          <span class="ticker-gap">　　</span>
          <span v-if="!tickerIsStatic" class="ticker-text">{{ tickerText }}</span>
        </div>
      </div>
    </div>

    <!-- 主体：左表 + 中图 + 右表 -->
    <div class="grid">
      <!-- 左：传感器轮播表 -->
      <div class="panel">
        <div class="panel-title">
          传感器轮播表
          <span class="panel-sub">（{{ currentBridge?.name || '未选择桥梁' }}）</span>
        </div>

        <el-carousel height="420px" :interval="9000" indicator-position="outside" @change="resizeCharts">
          <el-carousel-item>
            <div class="table-head">
              <span>全部点位</span>
              <span class="page">{{ allSensorsPageIndex + 1 }}/{{ allSensorsPages.length || 1 }}</span>
            </div>
            <el-table :data="allSensorsPage" height="380" size="small" class="table">
              <el-table-column label="断面" prop="section_name" width="110" />
              <el-table-column label="名称" prop="sensor_name" min-width="130" />
              <el-table-column label="类型" width="90">
                <template #default="{ row }">{{ getSensorTypeName(row.sensor_type) }}</template>
              </el-table-column>
              <el-table-column label="值" width="120">
                <template #default="{ row }">
                  <span :class="['val', isSensorExceeded(row) ? 'warn' : 'ok']">
                    {{ row.realtime_value ?? '--' }}
                  </span>
                  <span class="unit">{{ row.unit }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <span :class="row.is_online ? 'ok' : 'warn'">{{ row.is_online ? '在线' : '离线' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-carousel-item>

          <el-carousel-item>
            <div class="table-head">
              <span>超限 TOP</span>
              <span class="page">{{ exceededPageIndex + 1 }}/{{ exceededPages.length || 1 }}</span>
            </div>
            <el-table :data="exceededPage" height="380" size="small" class="table">
              <el-table-column label="断面" prop="section_name" width="110" />
              <el-table-column label="名称" prop="sensor_name" min-width="140" />
              <el-table-column label="值" width="120">
                <template #default="{ row }">
                  <span class="val warn">{{ row.realtime_value }}</span>
                  <span class="unit">{{ row.unit }}</span>
                </template>
              </el-table-column>
              <el-table-column label="超限幅度" width="110">
                <template #default="{ row }">{{ row.exceed?.toFixed?.(3) ?? row.exceed }}</template>
              </el-table-column>
            </el-table>
          </el-carousel-item>

          <el-carousel-item>
            <div class="table-head">
              <span>离线/无数据</span>
              <span class="page">{{ offlinePageIndex + 1 }}/{{ offlinePages.length || 1 }}</span>
            </div>
            <el-table :data="offlinePage" height="380" size="small" class="table">
              <el-table-column label="断面" prop="section_name" width="110" />
              <el-table-column label="名称" prop="sensor_name" min-width="160" />
              <el-table-column label="类型" width="100">
                <template #default="{ row }">{{ getSensorTypeName(row.sensor_type) }}</template>
              </el-table-column>
              <el-table-column label="编码" prop="sensor_code" min-width="140" />
            </el-table>
          </el-carousel-item>
        </el-carousel>
      </div>

      <!-- 中：图表轮播 -->
      <div class="panel">
        <div class="panel-title">
          图表轮播
          <span class="panel-sub">（传感器：{{ selectedSensorCode || '--' }}）</span>
        </div>

        <el-carousel v-model="chartSlideIndex" height="420px" :interval="12000" indicator-position="outside" @change="resizeCharts">
          <el-carousel-item>
            <div ref="realtimeChartEl" class="chart"></div>
          </el-carousel-item>
          <el-carousel-item>
            <div ref="alarmTrendChartEl" class="chart"></div>
          </el-carousel-item>
          <el-carousel-item>
            <div ref="typePieChartEl" class="chart"></div>
          </el-carousel-item>
          <el-carousel-item>
            <div ref="sectionMultiChartEl" class="chart"></div>
          </el-carousel-item>
        </el-carousel>
      </div>

      <!-- 右：告警轮播表 -->
      <div class="panel">
        <div class="panel-title">最新告警（轮播）</div>

        <div class="table-head">
          <span>告警列表</span>
          <span class="page">{{ alarmPageIndex + 1 }}/{{ alarmPages.length || 1 }}</span>
        </div>

        <el-table :data="alarmPage" height="380" size="small" class="table alarm-table">
          <el-table-column label="时间" prop="created_at" width="160" />
          <el-table-column label="桥梁" prop="bridge_name" width="120" />
          <el-table-column label="传感器" prop="sensor_name" min-width="140" />
          <el-table-column label="告警" prop="msg" min-width="160" />
          <el-table-column label="数值" prop="val" width="110" />
        </el-table>

        <div class="hint">如需更准确的“趋势/占比”，建议后端 `getAlarms` 支持 `limit`/时间范围；前端即可展示近 24h 全量告警并统计。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen {
  width: 100%;
  min-height: calc(100vh - 140px);
  background: radial-gradient(1200px 600px at 20% 0%, rgba(0, 212, 255, 0.18), transparent 60%), linear-gradient(135deg, #06101f 0%, #122343 60%, #0a1628 100%);
  padding: 18px;
  color: #e0e6ed;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid rgba(0, 212, 255, 0.28);
  background: rgba(0, 20, 40, 0.55);
  border-radius: 10px;
  box-shadow: 0 0 22px rgba(0, 212, 255, 0.18);
  margin-bottom: 14px;
}

.title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #00d4ff;
  text-shadow: 0 0 12px rgba(0, 212, 255, 0.35);
}

.subtitle {
  margin-top: 4px;
  color: #8fb4c9;
  font-size: 13px;
}

.divider {
  margin: 0 10px;
  color: rgba(0, 212, 255, 0.35);
}

.controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl.switch {
  padding: 8px 10px;
  border: 1px solid rgba(0, 212, 255, 0.18);
  background: rgba(0, 40, 80, 0.25);
  border-radius: 8px;
}

.label {
  color: #a0c4d9;
  font-size: 13px;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.kpi {
  border: 1px solid rgba(0, 212, 255, 0.22);
  background: rgba(0, 20, 40, 0.55);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 0 18px rgba(0, 212, 255, 0.12);
}

.kpi-label {
  font-size: 12px;
  color: #88a2b6;
}

.kpi-value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 800;
  color: #00d4ff;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.25);
}

.kpi-value.warn {
  color: #ff4d4f;
  text-shadow: 0 0 10px rgba(255, 77, 79, 0.25);
}

/* ===== 全局滚动条 ===== */
.ticker {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 212, 255, 0.22);
  background: rgba(0, 20, 40, 0.55);
  border-radius: 10px;
  box-shadow: 0 0 18px rgba(0, 212, 255, 0.12);
  margin-bottom: 14px;
}

.ticker-label {
  color: rgba(0, 212, 255, 0.95);
  font-weight: 800;
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid rgba(0, 212, 255, 0.18);
  background: rgba(0, 40, 80, 0.25);
  border-radius: 8px;
  white-space: nowrap;
}

.ticker-viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 6px 0;
  border-radius: 8px;
}

.ticker-viewport::before,
.ticker-viewport::after {
  content: '';
  position: absolute;
  top: 0;
  width: 48px;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}
.ticker-viewport::before {
  left: 0;
  background: linear-gradient(90deg, rgba(8, 20, 40, 0.9), rgba(8, 20, 40, 0));
}
.ticker-viewport::after {
  right: 0;
  background: linear-gradient(270deg, rgba(8, 20, 40, 0.9), rgba(8, 20, 40, 0));
}

.ticker-track {
  display: inline-flex;
  align-items: center;
  gap: 24px;
  white-space: nowrap;
  will-change: transform;
  animation-name: marquee;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.ticker-track.static {
  animation: none;
  transform: translateX(0);
}

.ticker-viewport:hover .ticker-track {
  animation-play-state: paused;
}

.ticker-text {
  color: #a0c4d9;
  font-size: 13px;
}

.ticker-gap {
  opacity: 0.4;
}

@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.grid {
  display: grid;
  grid-template-columns: 1.05fr 1.3fr 1.15fr;
  gap: 12px;
}

.panel {
  border: 1px solid rgba(0, 212, 255, 0.22);
  background: rgba(0, 20, 40, 0.55);
  border-radius: 10px;
  padding: 14px 14px 10px;
  box-shadow: 0 0 18px rgba(0, 212, 255, 0.12);
  min-height: 490px;
}

.panel-title {
  font-size: 16px;
  font-weight: 800;
  color: #00d4ff;
  margin-bottom: 10px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.panel-sub {
  font-size: 12px;
  color: #8fb4c9;
  font-weight: 500;
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #a0c4d9;
  font-size: 12px;
  margin-bottom: 6px;
}

.page {
  color: rgba(0, 212, 255, 0.85);
}

.table :deep(.el-table) {
  background: transparent;
}

.table :deep(.el-table__inner-wrapper),
.table :deep(.el-table__body-wrapper),
.table :deep(.el-scrollbar__wrap) {
  background: transparent;
}

.table :deep(th.el-table__cell) {
  background: rgba(0, 40, 80, 0.25);
  color: #a0c4d9;
  border-bottom: 1px solid rgba(0, 212, 255, 0.18);
}

.table :deep(td.el-table__cell) {
  border-bottom: 1px solid rgba(0, 212, 255, 0.08);
  color: #e0e6ed;
}

.table :deep(.el-table__row:hover > td.el-table__cell) {
  background: rgba(0, 212, 255, 0.06);
}

.val.ok {
  color: #00d4ff;
  font-weight: 700;
}
.val.warn {
  color: #ff4d4f;
  font-weight: 900;
}
.ok {
  color: #00d4ff;
}
.warn {
  color: #ff4d4f;
}
.unit {
  margin-left: 6px;
  color: #6d879a;
  font-size: 12px;
}

.chart {
  width: 100%;
  height: 420px;
}

.hint {
  margin-top: 10px;
  color: #6d879a;
  font-size: 12px;
  line-height: 1.4;
}
</style>
