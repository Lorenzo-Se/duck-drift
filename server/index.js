const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const highscores = new Map();

app.get('/api/highscores', (_req, res) => {
  const top10 = [...highscores.entries()]
    .map(([playerName, wins]) => ({ playerName, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);

  res.json(top10);
});

app.post('/api/highscores', (req, res) => {
  const { playerName, won } = req.body;

  if (!playerName || won !== true) {
    return res.status(400).json({ error: 'playerName and won: true required' });
  }

  const currentWins = highscores.get(playerName) || 0;
  highscores.set(playerName, currentWins + 1);

  console.log(`Highscore updated: ${playerName} -> ${currentWins + 1} wins`);
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
