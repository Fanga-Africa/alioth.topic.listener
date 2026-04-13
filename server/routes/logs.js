const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/logs?category=&topic_id=&destination=&date_from=&date_to=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const {
      category,
      topic_id,
      destination,
      date_from,
      date_to,
      limit,
      offset,
    } = req.query;

    const where = [];
    const args = [];

    if (category && category !== 'all') {
      where.push('category = ?');
      args.push(category);
    }

    if (topic_id) {
      where.push('topic_id = ?');
      args.push(Number(topic_id));
    }

    if (destination) {
      where.push('destination = ?');
      args.push(destination);
    }

    if (date_from) {
      where.push('received_at >= ?');
      args.push(date_from);
    }

    if (date_to) {
      where.push('received_at <= ?');
      args.push(date_to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const safeLimit = Math.min(Number.parseInt(limit, 10) || 100, 500);
    const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);

    const result = await db.execute({
      sql: `
        SELECT * FROM logs
        ${whereSql}
        ORDER BY received_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [...args, safeLimit, safeOffset],
    });

    const countResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total
        FROM logs
        ${whereSql}
      `,
      args,
    });

    res.json({
      total: countResult.rows?.[0]?.total ?? result.rows.length,
      logs: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
