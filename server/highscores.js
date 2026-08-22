const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'highscores.json');

let scores = {};

function save() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(scores, null, 2));
}

function loadHighscores() {
  try {
    if (fs.existsSync(dataFile)) {
      scores = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } else {
      scores = {};
    }
  } catch (err) {
    console.warn('Could not load highscores, starting fresh:', err.message);
    scores = {};
  }
}

function getTop10() {
  return Object.entries(scores)
    .map(([playerName, wins]) => ({ playerName, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);
}

function recordWin(playerName) {
  scores[playerName] = (scores[playerName] || 0) + 1;
  save();
  return scores[playerName];
}

module.exports = { loadHighscores, getTop10, recordWin };
