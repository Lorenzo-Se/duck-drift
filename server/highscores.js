const { createClient } = require('redis');

const KEY = 'highscores';

let client = null;
let memoryScores = {};

function useRedis() {
  return Boolean(process.env.REDIS_URL);
}

async function connect() {
  if (!useRedis()) {
    console.warn('REDIS_URL not set — using in-memory highscore storage');
    return;
  }

  client = createClient({
    url: process.env.REDIS_URL,
    socket: process.env.REDIS_URL.startsWith('rediss://')
      ? { tls: true, rejectUnauthorized: false }
      : undefined,
  });

  client.on('error', (err) => {
    console.error('Redis error:', err.message);
  });

  await client.connect();
  console.log('Connected to Redis for highscores');
}

function getTop10FromMemory() {
  return Object.entries(memoryScores)
    .map(([playerName, wins]) => ({ playerName, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);
}

async function getTop10() {
  if (!useRedis()) {
    return getTop10FromMemory();
  }

  const entries = await client.zRangeWithScores(KEY, 0, 9, { REV: true });
  return entries.map(({ value, score }) => ({
    playerName: value,
    wins: score,
  }));
}

async function recordWin(playerName) {
  if (!useRedis()) {
    memoryScores[playerName] = (memoryScores[playerName] || 0) + 1;
    return memoryScores[playerName];
  }

  return client.zIncrBy(KEY, 1, playerName);
}

module.exports = { connect, getTop10, recordWin };
