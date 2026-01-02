const db = require('../config/db')

// 模拟生成数据的任务
const startMockTask = () => {
  console.log('🛠️  数据模拟生成器已启动 (每10秒更新)...')

  setInterval(async () => {
    try {
      // 1. 获取所有传感器
      const [sensors] = await db.query('SELECT id, sensor_code, sensor_type FROM sensors')

      for (let s of sensors) {
        // 2. 根据类型生成合理波动值
        let val = 0
        if (s.sensor_type === 'strain') val = 300 + (Math.random() - 0.5) * 50 // 300左右波动
        else if (s.sensor_type === 'vib') val = Math.random() * 0.5
        else val = 50 + Math.random() * 20

        // 3. 插入数据
        await db.query('INSERT INTO sensor_data (sensor_id, sensor_code, value) VALUES (?, ?, ?)', [s.id, s.sensor_code, val])
      }
      // 仅在控制台打印简单的各点提示，不刷屏
      // console.log(`[Mock] Generated data for ${sensors.length} sensors.`);
    } catch (err) {
      console.error('Mock Data Error:', err.message)
    }
  }, 10000) // 10秒一次
}

module.exports = startMockTask
