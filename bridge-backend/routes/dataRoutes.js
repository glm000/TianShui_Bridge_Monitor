const express = require('express')
const router = express.Router()
const controller = require('../controllers/dataController')

router.get('/history', controller.getSensorHistory)
router.get('/alarms', controller.getAlarms)

module.exports = router
