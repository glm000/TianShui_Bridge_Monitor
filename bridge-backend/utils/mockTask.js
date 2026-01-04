const db = require('../config/db')

// 模拟生成数据的任务
const startMockTask = () => {
  console.log('🛠️  数据模拟生成器已启动 (每10秒更新)...')

  setInterval(async () => {
    try {
      // 1. 获取所有传感器（包含阈值信息）
      const [sensors] = await db.query('SELECT id, sensor_code, sensor_type, sensor_name, limit_max, limit_min, unit FROM sensors')

      for (let sensor of sensors) {
        // 2. 根据类型生成合理波动值
        let val = 0
        if (sensor.sensor_type === 'strain') val = 300 + (Math.random() - 0.5) * 50 // 300左右波动
        else if (sensor.sensor_type === 'vib') val = Math.random() * 0.5
        else if (sensor.sensor_type === 'press') val = 50 + Math.random() * 20 // 压力 50-70
        else if (sensor.sensor_type === 'rebar') val = 50 + Math.random() * 30 // 钢筋应力 50-80
        else val = 50 + Math.random() * 20

        // 3. 插入传感器数据
        await db.query('INSERT INTO sensor_data (sensor_id, sensor_code, value) VALUES (?, ?, ?)', [sensor.id, sensor.sensor_code, val])

        // 4. 检测是否超限，自动生成告警
        let isExceeded = false
        let alarmMsg = ''

        if (sensor.limit_max !== null && val > parseFloat(sensor.limit_max)) {
          isExceeded = true
          alarmMsg = `${sensor.sensor_name} 超过上限 (上限:  ${sensor.limit_max}${sensor.unit || ''})`
        } else if (sensor.limit_min !== null && val < parseFloat(sensor.limit_min)) {
          isExceeded = true
          alarmMsg = `${sensor.sensor_name} 低于下限 (下限: ${sensor.limit_min}${sensor.unit || ''})`
        }

        // 5. 如果超限，写入告警表
        if (isExceeded) {
          await db.query('INSERT INTO alarms (sensor_id, val, msg, is_handled) VALUES (?, ?, ?, ?)', [sensor.id, val, alarmMsg, 0])
          console.log(`⚠️  告警:  ${sensor.sensor_code} - ${alarmMsg}, 当前值: ${val.toFixed(2)}`)
        }
      }
      // console.log(`[Mock] Generated data for ${sensors.length} sensors. `);
    } catch (err) {
      console.error('Mock Data Error:', err.message)
    }
  }, 10000) // 10秒一次
}

module.exports = startMockTask
