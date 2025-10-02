const express = require('express');
const router = express.Router();
const { ALLOWED_CURRENCIES } = require('../config/currencies');

router.get('/currencies', (_req, res) => {
  res.json(ALLOWED_CURRENCIES);
});

module.exports = router;
