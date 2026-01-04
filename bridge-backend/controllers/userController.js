// 负责登录与日志
const db = require('../config/db')

// 用户登录
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body
    // 1. 查询用户 (生产环境请勿使用明文存储密码！)
    const [users] = await db.query('SELECT * FROM sys_users WHERE username = ? AND password = ?', [username, password])

    if (users.length > 0) {
      const user = users[0]
      // 2. 记录登录日志
      await db.query('INSERT INTO sys_logs (user_id, username, action, ip_addr, details) VALUES (?, ?, ?, ?, ?)', [user.id, user.username, 'LOGIN', req.ip, '用户登录成功'])

      // 3. 返回用户信息 (去掉密码)
      delete user.password
      res.json({ success: true, user })
    } else {
      res.status(401).json({ success: false, msg: '账号或密码错误' })
    }
  } catch (err) {
    res.status(500).json({ msg: err.message })
  }
}

// 获取操作日志
exports.getLogs = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sys_logs ORDER BY created_at DESC LIMIT 100')
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ msg: err.message })
  }
}
