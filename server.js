const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'build', 'index.html'))
);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();       // code -> room
const clientRoom = new Map();  // ws -> code

function makeCode() {
  return String(Math.floor(Math.random() * 90) + 10);
}

function randomTurnNumbers() {
  const nums = new Set();
  while (nums.size < 3) nums.add(Math.floor(Math.random() * 99) + 1);
  return [...nums];
}

function randomNDigitNumber(n) {
  const min = Math.pow(10, n - 1);
  const max = Math.pow(10, n) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function roomView(room) {
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    gameType: room.gameType || 'jumpmath',
    players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive })),
    currentPlayerIndex: room.currentPlayerIndex,
    currentNumber: room.currentNumber,
    currentStep: room.currentStep,
  };
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  });
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function advanceTurn(room) {
  const n = room.players.length;
  let idx = (room.currentPlayerIndex + 1) % n;
  let guard = 0;
  while (!room.players[idx].alive && guard < n) {
    idx = (idx + 1) % n;
    guard++;
  }
  room.currentPlayerIndex = idx;
}

function checkGameOver(room) {
  const alive = room.players.filter(p => p.alive);
  if (alive.length <= 1) {
    room.state = 'finished';
    return alive[0] || null;
  }
  return null;
}

function broadcastTurnStart(room, delay) {
  setTimeout(() => {
    const currentPlayer = room.players[room.currentPlayerIndex];
    const msg = {
      type: 'TURN_START',
      currentPlayerId: currentPlayer.id,
      currentStep: room.currentStep,
      room: roomView(room),
    };

    if (room.gameType === 'memoryman') {
      const digits = room.currentStep + 2;
      const targetNumber = randomNDigitNumber(digits);
      room.currentTargetNumber = targetNumber;
      msg.targetNumber = targetNumber;
    } else {
      const cupNumbers = randomTurnNumbers();
      room.currentCupNumbers = cupNumbers;
      room.currentJump = null;
      msg.currentNumber = room.currentNumber;
      msg.cupNumbers = cupNumbers;
    }

    broadcast(room, msg);
  }, delay);
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2, 11);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMsg(ws, msg);
  });

  ws.on('close', () => handleLeave(ws, true));
  ws.on('error', () => handleLeave(ws, false));
});

function handleMsg(ws, msg) {
  switch (msg.type) {

    case 'CREATE_ROOM': {
      handleLeave(ws, false);
      let code;
      do { code = makeCode(); } while (rooms.has(code));
      const player = { id: ws.id, name: msg.name || 'Player', ws, alive: true };
      const room = {
        code, state: 'lobby', hostId: ws.id,
        gameType: msg.gameType || 'jumpmath',
        players: [player],
        currentPlayerIndex: 0, currentNumber: 0, currentStep: 0,
        currentJump: null, currentCupNumbers: [], currentTargetNumber: null,
      };
      rooms.set(code, room);
      clientRoom.set(ws, code);
      send(ws, { type: 'ROOM_JOINED', playerId: ws.id, room: roomView(room) });
      break;
    }

    case 'JOIN_ROOM': {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(ws, { type: 'ERROR', message: 'Room not found' }); return; }
      if (room.state !== 'lobby') { send(ws, { type: 'ERROR', message: 'Game already started' }); return; }
      handleLeave(ws, false);
      const player = { id: ws.id, name: msg.name || 'Player', ws, alive: true };
      room.players.push(player);
      clientRoom.set(ws, code);
      send(ws, { type: 'ROOM_JOINED', playerId: ws.id, room: roomView(room) });
      broadcast(room, { type: 'ROOM_UPDATE', room: roomView(room) });
      break;
    }

    case 'START_GAME': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.hostId !== ws.id) return;
      if (room.state !== 'lobby') return;
      room.state = 'playing';
      room.currentNumber = 0;
      room.currentStep = 0;
      room.currentPlayerIndex = 0;
      room.currentJump = null;
      room.players.forEach(p => { p.alive = true; });
      broadcast(room, { type: 'GAME_STARTED', room: roomView(room) });
      broadcastTurnStart(room, 300);
      break;
    }

    case 'CUP_PICKED': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'playing') return;
      const cur = room.players[room.currentPlayerIndex];
      if (!cur || cur.id !== ws.id) return;
      if (room.currentJump !== null) return;
      const number = Number(msg.number);
      if (!room.currentCupNumbers.includes(number)) return;
      room.currentJump = number;
      broadcast(room, { type: 'CUP_REVEALED', number, room: roomView(room) });
      break;
    }

    case 'SUBMIT_ANSWER': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'playing') return;
      const cur = room.players[room.currentPlayerIndex];
      if (!cur || cur.id !== ws.id) return;
      if (room.currentJump === null) return;

      const expected = room.currentNumber + room.currentJump;
      const correct = Number(msg.answer) === expected;

      if (correct) {
        room.currentNumber = expected;
        room.currentStep++;
        room.currentJump = null;
        broadcast(room, { type: 'ANSWER_RESULT', correct: true, playerId: ws.id, newNumber: room.currentNumber, room: roomView(room) });
        advanceTurn(room);
        broadcastTurnStart(room, 600);
      } else {
        cur.alive = false;
        broadcast(room, { type: 'ANSWER_RESULT', correct: false, playerId: ws.id, room: roomView(room) });
        const winner = checkGameOver(room);
        if (winner) {
          setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 800);
        } else {
          advanceTurn(room);
          broadcastTurnStart(room, 800);
        }
      }
      break;
    }

    case 'MEMORY_SUBMIT_ANSWER': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'playing' || room.gameType !== 'memoryman') return;
      const cur = room.players[room.currentPlayerIndex];
      if (!cur || cur.id !== ws.id || !room.currentTargetNumber) return;

      const correct = msg.answer === room.currentTargetNumber;
      room.currentTargetNumber = null;

      if (correct) {
        room.currentStep++;
        broadcast(room, { type: 'ANSWER_RESULT', correct: true, playerId: ws.id, room: roomView(room) });
        advanceTurn(room);
        broadcastTurnStart(room, 600);
      } else {
        cur.alive = false;
        broadcast(room, { type: 'ANSWER_RESULT', correct: false, playerId: ws.id, room: roomView(room) });
        const winner = checkGameOver(room);
        if (winner) {
          setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 800);
        } else {
          advanceTurn(room);
          broadcastTurnStart(room, 800);
        }
      }
      break;
    }

    case 'TIMEOUT': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'playing') return;
      const cur = room.players[room.currentPlayerIndex];
      if (!cur || cur.id !== ws.id) return;
      cur.alive = false;
      room.currentJump = null;
      room.currentTargetNumber = null;
      broadcast(room, { type: 'PLAYER_TIMEOUT', playerId: ws.id, room: roomView(room) });
      const winner = checkGameOver(room);
      if (winner) {
        setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 800);
      } else {
        advanceTurn(room);
        broadcastTurnStart(room, 800);
      }
      break;
    }

    default: break;
  }
}

function handleLeave(ws, notify) {
  const code = clientRoom.get(ws);
  if (!code) return;
  clientRoom.delete(ws);
  const room = rooms.get(code);
  if (!room) return;

  const idx = room.players.findIndex(p => p.id === ws.id);
  if (idx === -1) return;
  const [removed] = room.players.splice(idx, 1);

  if (room.players.length === 0) { rooms.delete(code); return; }
  if (room.hostId === ws.id) room.hostId = room.players[0].id;

  if (notify) {
    if (room.state === 'playing') {
      if (room.currentPlayerIndex >= room.players.length) room.currentPlayerIndex = 0;
      const winner = checkGameOver(room);
      if (winner) {
        setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 300);
        return;
      }
    }
    broadcast(room, { type: 'PLAYER_LEFT', playerId: removed.id, room: roomView(room) });
  }
}

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n🎮  JUMP MATH — Multiplayer Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${ip}:${PORT}`);
  console.log(`\n  Share the Network URL with players on the same WiFi!\n`);
});
