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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function randomJumps(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 26) + 5);
}

function roomView(room) {
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive })),
    jumpCount: room.jumpCount,
    jumpValues: room.jumpValues,
    currentPlayerIndex: room.currentPlayerIndex,
    currentNumber: room.currentNumber,
    currentStep: room.currentStep,
    votes: room.votes,
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
        players: [player],
        jumpCount: 3, jumpValues: [],
        currentPlayerIndex: 0, currentNumber: 0, currentStep: 0,
        votes: {},
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

    case 'SET_JUMPS': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.hostId !== ws.id || room.state === 'playing') return;
      room.jumpCount = Math.max(1, Math.min(6, Number(msg.jumpCount) || 3));
      room.votes = {};
      room.state = 'voting';
      broadcast(room, { type: 'VOTE_REQUEST', room: roomView(room) });
      break;
    }

    case 'VOTE': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'voting' || room.hostId === ws.id) return;
      room.votes[ws.id] = !!msg.approve;
      const nonHost = room.players.filter(p => p.id !== room.hostId);
      const allVoted = nonHost.every(p => room.votes[p.id] !== undefined);
      if (allVoted) {
        const approved = nonHost.every(p => room.votes[p.id]);
        if (approved) {
          room.state = 'approved';
        } else {
          room.state = 'lobby';
          room.votes = {};
        }
        broadcast(room, { type: 'VOTE_RESULT', approved, room: roomView(room) });
      } else {
        broadcast(room, { type: 'ROOM_UPDATE', room: roomView(room) });
      }
      break;
    }

    case 'START_GAME': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.hostId !== ws.id) return;
      if (room.state !== 'approved' && room.state !== 'lobby') return;
      room.jumpValues = randomJumps(room.jumpCount);
      room.state = 'playing';
      room.currentNumber = 0;
      room.currentStep = 0;
      room.currentPlayerIndex = 0;
      room.players.forEach(p => { p.alive = true; });
      room.votes = {};
      broadcast(room, { type: 'GAME_STARTED', room: roomView(room) });
      setTimeout(() => {
        broadcast(room, {
          type: 'TURN_START',
          currentPlayerId: room.players[0].id,
          currentNumber: 0,
          currentStep: 0,
          room: roomView(room),
        });
      }, 300);
      break;
    }

    case 'SUBMIT_ANSWER': {
      const room = rooms.get(clientRoom.get(ws));
      if (!room || room.state !== 'playing') return;
      const cur = room.players[room.currentPlayerIndex];
      if (!cur || cur.id !== ws.id) return;

      const jump = room.jumpValues[room.currentStep % room.jumpCount];
      const expected = room.currentNumber + jump;
      const correct = Number(msg.answer) === expected;

      if (correct) {
        room.currentNumber = expected;
        room.currentStep++;
        broadcast(room, { type: 'ANSWER_RESULT', correct: true, playerId: ws.id, newNumber: room.currentNumber, room: roomView(room) });
        advanceTurn(room);
        setTimeout(() => {
          broadcast(room, {
            type: 'TURN_START',
            currentPlayerId: room.players[room.currentPlayerIndex].id,
            currentNumber: room.currentNumber,
            currentStep: room.currentStep,
            room: roomView(room),
          });
        }, 600);
      } else {
        cur.alive = false;
        broadcast(room, { type: 'ANSWER_RESULT', correct: false, playerId: ws.id, room: roomView(room) });
        const winner = checkGameOver(room);
        if (winner) {
          setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 800);
        } else {
          advanceTurn(room);
          setTimeout(() => {
            broadcast(room, {
              type: 'TURN_START',
              currentPlayerId: room.players[room.currentPlayerIndex].id,
              currentNumber: room.currentNumber,
              currentStep: room.currentStep,
              room: roomView(room),
            });
          }, 800);
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
      broadcast(room, { type: 'PLAYER_TIMEOUT', playerId: ws.id, room: roomView(room) });
      const winner = checkGameOver(room);
      if (winner) {
        setTimeout(() => broadcast(room, { type: 'GAME_OVER', winnerId: winner.id, room: roomView(room) }), 800);
      } else {
        advanceTurn(room);
        setTimeout(() => {
          broadcast(room, {
            type: 'TURN_START',
            currentPlayerId: room.players[room.currentPlayerIndex].id,
            currentNumber: room.currentNumber,
            currentStep: room.currentStep,
            room: roomView(room),
          });
        }, 800);
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
      // Fix currentPlayerIndex after splice
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
