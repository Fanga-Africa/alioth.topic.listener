const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/topics
router.get('/', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT * FROM topics
      ORDER BY is_seed DESC, created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
