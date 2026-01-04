const express = require('express')
const router = express.Router()
const controller = require('../controllers/userController')

router.post('/login', controller.login)
router.get('/logs', controller.getLogs)

module.exports = router
