const db = require('../config/db')

// 获取传感器历史数据 (折线图)
exports.getSensorHistory = async (req, res) => {
  try {
    const { code } = req.query // ?code=B1_MID_STR_01
    if (!code) return res.status(400).json({ msg: '缺少 sensor_code' })

    const [rows] = await db.query('SELECT value, created_at FROM sensor_data WHERE sensor_code = ? ORDER BY created_at DESC LIMIT 50', [code])
    // 翻转数组，让时间从左到右 (旧 -> 新)
    res.json({ success: true, data: rows.reverse() })
  } catch (err) {
    res.status(500).json({ msg: err.message })
  }
}

// 获取最新报警列表
exports.getAlarms = async (req, res) => {
  try {
    const sql = `
            SELECT a.*, s.sensor_name, s.sensor_code, b.name as bridge_name 
            FROM alarms a
            JOIN sensors s ON a.sensor_id = s.id
            JOIN sections sec ON s.section_id = sec.id
            JOIN bridges b ON sec.bridge_id = b.id
            ORDER BY a.created_at DESC LIMIT 20
        `
    const [rows] = await db.query(sql)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ msg: err.message })
  }
}
