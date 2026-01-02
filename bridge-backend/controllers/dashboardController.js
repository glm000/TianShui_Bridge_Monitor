exports.getOverview = async (req, res) => {
  try {
    const [bridge] = await db.query('SELECT COUNT(*) as total FROM bridges')
    const [sensor] = await db.query('SELECT COUNT(*) as online FROM sensors WHERE status=1')
    const [alarm] = await db.query('SELECT COUNT(*) as count FROM alarms WHERE status=0')
    res.json({
      success: true,
      data: {
        totalBridge: bridge[0].total,
        onlineSensor: sensor[0].online,
        alarmCount: alarm[0].count
      }
    })
  } catch (err) {
    res.json({ success: false, msg: '查询失败' })
  }
}
