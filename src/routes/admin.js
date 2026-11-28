const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');

// Admin panel route - serve admin.html
router.get('/', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'admin.html'));
});

router.get('*', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'admin.html'));
});

module.exports = router;
