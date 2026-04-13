const { db } = require('./db');

const SEED_TOPICS = [
  {
    name: 'Stations de Swap',
    category: 'station',
    destination: '/topics/events/swap-stations/0167c645-03d9-479c-945c-f7c8ea542576',
    is_seed: 1,
  },
  {
    name: 'Batteries',
    category: 'battery',
    destination: '/topics/events/batteries/52f1e989-3439-46c7-bfeb-035ae9aa0dc7',
    is_seed: 1,
  },
];

async function seedTopics() {
  await db.execute({
    sql: `
      DELETE FROM topics
      WHERE destination IN (?, ?)
    `,
    args: [
      '/topics/events/swap-stations/xxx',
      '/topics/events/batteries/xxx',
    ],
  });

  for (const t of SEED_TOPICS) {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO topics (name, category, destination, is_seed, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [t.name, t.category, t.destination, t.is_seed, new Date().toISOString()],
    });
  }
}

module.exports = { seedTopics };
