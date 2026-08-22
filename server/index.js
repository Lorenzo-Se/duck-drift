const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const highscores = require('./highscores');

const PORT = process.env.PORT;
if (!PORT) {
  console.error('PORT environment variable is required');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use('/host', express.static(path.join(__dirname, 'public/host')));
app.use('/controller', express.static(path.join(__dirname, 'public/controller')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const rooms = new Map();

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function generatePlayerId(room) {
  let i = 1;
  while (room.phones.has(`p${i}`)) {
    i++;
  }
  return `p${i}`;
}

function findFreeSlot(room) {
  const usedSlots = new Set([...room.phones.values()].map((p) => p.slot));
  for (let slot = 0; slot < 4; slot++) {
    if (!usedSlots.has(slot)) {
      return slot;
    }
  }
  return null;
}

function getRoom(ws) {
  return ws.roomCode ? rooms.get(ws.roomCode) : null;
}

function relayToHost(ws, message, room) {
  if (ws.role !== 'phone') {
    send(ws, { type: 'error', message: 'Only phones can send to host' });
    return;
  }

  if (message.type !== 'input') {
    send(ws, { type: 'error', message: 'Only input messages can be sent to host' });
    return;
  }

  const { type, target, ...rest } = message;
  send(room.host, { type: 'playerInput', playerId: ws.playerId, ...rest });
}

function relayToPhones(ws, message, room) {
  if (ws.role !== 'host') {
    send(ws, { type: 'error', message: 'Only host can send to phones' });
    return;
  }

  const { target, ...payload } = message;
  if (payload.event === 'gameStart') {
    room.started = true;
  }
  room.phones.forEach(({ ws: phoneWs }) => {
    send(phoneWs, payload);
  });
}

function handleRelay(ws, message) {
  const room = getRoom(ws);
  if (!room) {
    send(ws, { type: 'error', message: 'Not in a room' });
    return;
  }

  if (message.target === 'host') {
    relayToHost(ws, message, room);
  } else if (message.target === 'phones') {
    relayToPhones(ws, message, room);
  } else {
    send(ws, { type: 'error', message: 'Unknown message type' });
  }
}

function handleCreateRoom(ws) {
  if (ws.roomCode) {
    send(ws, { type: 'error', message: 'Already in a room' });
    return;
  }

  const roomCode = generateRoomCode();
  rooms.set(roomCode, { host: ws, phones: new Map(), started: false });

  ws.role = 'host';
  ws.roomCode = roomCode;

  console.log(`Room created: ${roomCode}`);
  send(ws, { type: 'roomCreated', roomCode });
}

function handleJoin(ws, message) {
  const { roomCode, name } = message;

  if (ws.roomCode) {
    send(ws, { type: 'error', message: 'Already in a room' });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(ws, { type: 'error', message: 'Room not found' });
    return;
  }

  if (room.started) {
    send(ws, { type: 'error', message: 'Spiel bereits gestartet' });
    return;
  }

  const slot = findFreeSlot(room);
  if (slot === null) {
    send(ws, { type: 'error', message: 'Room full' });
    return;
  }

  const playerId = generatePlayerId(room);
  room.phones.set(playerId, { ws, name, slot });

  ws.role = 'phone';
  ws.roomCode = roomCode;
  ws.playerId = playerId;

  send(room.host, { type: 'playerJoined', playerId, name, slot });
  send(ws, { type: 'joined', playerId, slot });
  console.log(`Player joined room ${roomCode}: ${name} (${playerId}, slot ${slot})`);
}

function handleMessage(ws, message) {
  switch (message.type) {
    case 'createRoom':
      handleCreateRoom(ws);
      break;
    case 'join':
      handleJoin(ws, message);
      break;
    default:
      handleRelay(ws, message);
  }
}

function handleDisconnect(ws) {
  if (!ws.roomCode) {
    return;
  }

  const room = rooms.get(ws.roomCode);
  if (!room) {
    return;
  }

  if (ws.role === 'host') {
    rooms.delete(ws.roomCode);
    console.log(`Room deleted: ${ws.roomCode}`);
    return;
  }

  if (ws.role === 'phone' && ws.playerId) {
    room.phones.delete(ws.playerId);
    send(room.host, { type: 'playerLeft', playerId: ws.playerId });
    console.log(`Player left room ${ws.roomCode}: ${ws.playerId}`);
  }
}

app.get('/api/highscores', async (_req, res) => {
  try {
    res.json(await highscores.getTop10());
  } catch (err) {
    console.error('GET /api/highscores failed:', err);
    res.status(503).json({ error: 'Highscores unavailable' });
  }
});

app.post('/api/highscores', async (req, res) => {
  const { playerName, won } = req.body;

  if (!playerName || won !== true) {
    return res.status(400).json({ error: 'playerName and won: true required' });
  }

  try {
    const wins = await highscores.recordWin(playerName);
    console.log(`Highscore updated: ${playerName} -> ${wins} wins`);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/highscores failed:', err);
    res.status(503).json({ error: 'Highscores unavailable' });
  }
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
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    handleMessage(ws, message);
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    handleDisconnect(ws);
  });
});

highscores.connect().then(() => {
  server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
  process.exit(1);
});
