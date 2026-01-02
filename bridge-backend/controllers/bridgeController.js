exports.getList = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id,name,lng,lat,image_url,status FROM bridges')
    res.json({ success: true, data: rows })
  } catch (err) {
    res.json({ success: false, msg: '查询失败' })
  }
}
