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

    const topics = result.rows.map(row => ({
      ...row,
      id: Number(row.id),
    }));

    res.json(topics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/topics
router.post('/', async (req, res) => {
  console.log('POST /api/topics called with body:', req.body);
  try {
    const { name, destination, category } = req.body;

    if (!name || !destination || !category) {
      console.log('Missing fields:', { name, destination, category });
      return res.status(400).json({ error: 'Nom, destination et catégorie requis' });
    }

    const createdAt = new Date().toISOString();
    console.log('Inserting topic:', { name, destination, category, createdAt });
    const result = await db.execute(`
      INSERT INTO topics (name, destination, category, is_seed, created_at)
      VALUES (?, ?, ?, 0, ?)
    `, [name, destination, category, createdAt]);

    console.log('Topic inserted successfully, ID:', result.lastInsertRowid);
    res.status(201).json({
      message: 'Topic ajouté avec succès',
      topic: {
        id: Number(result.lastInsertRowid),
        name,
        destination,
        category,
        created_at: createdAt,
      },
    });
  } catch (err) {
    console.error('Error adding topic:', err);
    if (err?.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Destination déjà utilisée' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/topics/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    console.log('DELETE /api/topics called with id:', req.params.id, 'parsed:', id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID de topic invalide' });
    }

    const result = await db.execute(`
      DELETE FROM topics
      WHERE id = ?
    `, [id]);

    console.log('Delete result:', result);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting topic:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
