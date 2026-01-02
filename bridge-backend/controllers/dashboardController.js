const db = require('../config/db')

// 获取统计概览
exports.getOverview = async (req, res) => {
  try {
    // 桥梁总数
    const [bridgeCount] = await db.query('SELECT COUNT(*) as total FROM bridges')
    
    // 传感器总数
    const [sensorCount] = await db.query('SELECT COUNT(*) as total FROM sensors')
    
    // 在线传感器数 (假设所有传感器都在线，或者根据最近数据判断)
    const [onlineSensors] = await db.query(`
      SELECT COUNT(DISTINCT sensor_id) as online 
      FROM sensor_data 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `)
    
    // 今日告警数
    const [todayAlarms] = await db.query(`
      SELECT COUNT(*) as count 
      FROM alarms 
      WHERE DATE(created_at) = CURDATE()
    `)
    
    // 未处理告警数
    const [unhandledAlarms] = await db.query(`
      SELECT COUNT(*) as count 
      FROM alarms 
      WHERE is_handled = 0
    `)
    
    const totalSensors = sensorCount[0].total
    const onlineCount = onlineSensors[0].online
    const onlineRate = totalSensors > 0 ? ((onlineCount / totalSensors) * 100).toFixed(1) : '0'
    
    res.json({
      success: true,
      data: {
        bridgeCount: bridgeCount[0].total,
        sensorCount: totalSensors,
        onlineSensors: onlineCount,
        onlineRate: onlineRate,
        todayAlarms: todayAlarms[0].count,
        unhandledAlarms: unhandledAlarms[0].count
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, msg: '查询失败', error: err.message })
  }
}

// 获取完整桥梁结构树（包含断面和传感器）
exports.getBridgesWithSensors = async (req, res) => {
  try {
    // 查询所有桥梁
    const [bridges] = await db.query('SELECT * FROM bridges ORDER BY id')
    
    // 查询所有断面
    const [sections] = await db.query('SELECT * FROM sections ORDER BY bridge_id, id')
    
    // 查询所有传感器
    const [sensors] = await db.query('SELECT * FROM sensors ORDER BY section_id, id')
    
    // 组装树形结构
    const tree = bridges.map(bridge => ({
      ...bridge,
      sections: sections.filter(s => s.bridge_id === bridge.id).map(section => ({
        ...section,
        sensors: sensors.filter(sen => sen.section_id === section.id)
      }))
    }))
    
    res.json({ success: true, data: tree })
  } catch (err) {
    res.status(500).json({ success: false, msg: '查询失败', error: err.message })
  }
}

// 获取所有传感器最新数据
exports.getRealTimeData = async (req, res) => {
  try {
    const sql = `
      SELECT 
        s.id as sensor_id,
        s.sensor_code,
        s.sensor_name,
        s.sensor_type,
        s.unit,
        s.limit_max,
        s.limit_min,
        sec.name as section_name,
        b.name as bridge_name,
        sd.value,
        sd.created_at
      FROM sensors s
      LEFT JOIN sections sec ON s.section_id = sec.id
      LEFT JOIN bridges b ON sec.bridge_id = b.id
      LEFT JOIN (
        SELECT sensor_id, value, created_at
        FROM sensor_data sd1
        WHERE created_at = (
          SELECT MAX(created_at) 
          FROM sensor_data sd2 
          WHERE sd2.sensor_id = sd1.sensor_id
        )
      ) sd ON s.id = sd.sensor_id
      ORDER BY b.id, sec.id, s.id
    `
    
    const [rows] = await db.query(sql)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, msg: '查询失败', error: err.message })
  }
}

// 获取单个传感器最新N条数据
exports.getSensorLatest = async (req, res) => {
  try {
    const { code } = req.query
    const limit = parseInt(req.query.limit) || 30
    
    if (!code) {
      return res.status(400).json({ success: false, msg: '缺少 sensor_code 参数' })
    }
    
    const sql = `
      SELECT value, created_at 
      FROM sensor_data 
      WHERE sensor_code = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `
    
    const [rows] = await db.query(sql, [code, limit])
    
    // 翻转数组，让时间从旧到新排序（用于绘制曲线）
    res.json({ success: true, data: rows.reverse() })
  } catch (err) {
    res.status(500).json({ success: false, msg: '查询失败', error: err.message })
  }
}
