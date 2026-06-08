import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import './App.css';

// ── audio ─────────────────────────────────────────────────────────────────────

let _actx = null;
function actx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

function note(freq, dur, type = 'sine', vol = 0.25, delay = 0) {
  try {
    const ctx = actx();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {}
}

const SFX = {
  keyPress:     () => note(1000, 0.05, 'sine', 0.07),
  correct:      () => { note(523, 0.1, 'sine', 0.2); note(659, 0.1, 'sine', 0.2, 0.1); note(784, 0.2, 'sine', 0.25, 0.2); },
  wrong:        () => { note(220, 0.15, 'sawtooth', 0.3); note(160, 0.35, 'sawtooth', 0.2, 0.15); },
  gameStart:    () => [261, 330, 392, 523].forEach((f, i) => note(f, 0.18, 'sine', 0.2, i * 0.11)),
  gameFail:     () => [300, 250, 200, 150].forEach((f, i) => note(f, 0.22, 'sawtooth', 0.2, i * 0.14)),
  gameWin:      () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, 0.15, 'sine', 0.28, i * 0.1)),
  playerJoined: () => { note(880, 0.08, 'sine', 0.12); note(1100, 0.12, 'sine', 0.12, 0.08); },
  playerLeft:   () => { note(440, 0.1, 'sine', 0.1); note(330, 0.15, 'sine', 0.08, 0.1); },
  vote:         () => note(660, 0.1, 'sine', 0.15),
  approved:     () => { note(523, 0.1, 'sine', 0.2); note(784, 0.2, 'sine', 0.25, 0.1); },
  rejected:     () => note(200, 0.35, 'sawtooth', 0.2),
  tick:         () => note(800, 0.04, 'square', 0.06),
};

// Background music ─────────────────────────────────────────────────────────────
let bgActive = false;
let bgTimer = null;

function startBgMusic() {
  if (bgActive) return;
  bgActive = true;
  scheduleBg();
}

function stopBgMusic() {
  bgActive = false;
  if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
}

function scheduleBg() {
  if (!bgActive) return;
  try {
    const ctx = actx();
    const beat = 0.5;
    const chords = [
      [220, 277, 330],   // Am
      [175, 220, 262],   // F
      [131, 165, 196],   // C
      [196, 247, 294],   // G
    ];
    const now = ctx.currentTime;
    chords.forEach((chord, ci) => {
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 900;
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'triangle';
        const s = now + ci * beat * 4;
        gain.gain.setValueAtTime(0, s);
        gain.gain.linearRampToValueAtTime(0.035, s + 0.3);
        gain.gain.setValueAtTime(0.035, s + beat * 4 - 0.3);
        gain.gain.linearRampToValueAtTime(0, s + beat * 4);
        osc.start(s);
        osc.stop(s + beat * 4 + 0.05);
      });
    });
    bgTimer = setTimeout(scheduleBg, chords.length * beat * 4 * 1000 - 80);
  } catch {}
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Stars() {
  const stars = useRef(
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 2.5 + 0.5,
      dur: Math.random() * 4 + 2,
      delay: Math.random() * 5,
    }))
  ).current;
  return (
    <div className="stars">
      {stars.map(s => (
        <div key={s.id} className="star" style={{
          top: s.top, left: s.left, width: s.size, height: s.size,
          animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`,
        }} />
      ))}
    </div>
  );
}

function Confetti({ active }) {
  const pieces = useRef(Array.from({ length: 18 }, (_, i) => i)).current;
  const colors = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#fb923c'];
  if (!active) return null;
  return (
    <>
      {pieces.map(i => (
        <div key={i} className="confetti-piece" style={{
          left: window.innerWidth / 2 + (Math.random() - 0.5) * 160,
          top: window.innerHeight * 0.35,
          width: Math.random() * 10 + 6,
          height: Math.random() * 10 + 6,
          background: colors[i % colors.length],
          animationDuration: `${Math.random() * 0.5 + 0.6}s`,
          animationDelay: `${Math.random() * 0.25}s`,
        }} />
      ))}
    </>
  );
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcScore(steps, jumps) {
  return Math.round(steps * jumps * 10);
}

const LS_KEY = 'mathgame_scores_v1';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}

function saveScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 20);
  localStorage.setItem(LS_KEY, JSON.stringify(top));
  return top;
}

// Timer: starts at 15s, decreases 0.4s every step, floor 3s
function getTimerDuration(step) {
  return Math.max(3000, 15000 - step * 400);
}

function timerColor(pct) {
  if (pct > 0.5) return '#34d399';
  if (pct > 0.25) return '#fbbf24';
  return '#f87171';
}

// ── custom keyboard ───────────────────────────────────────────────────────────

function CustomKeyboard({ value, onChange, onSubmit, disabled }) {
  function press(k) {
    if (disabled) return;
    SFX.keyPress();
    if (k === '←') { onChange(value.slice(0, -1)); return; }
    if (k === '✓') { onSubmit(); return; }
    if (value.length >= 6) return;
    onChange(value + k);
  }
  const keys = ['7','8','9','4','5','6','1','2','3','←','0','✓'];
  return (
    <div className="custom-kbd">
      <div className={`kbd-display ${disabled ? 'kbd-disabled' : ''}`}>
        {value || <span className="kbd-placeholder">?</span>}
      </div>
      <div className="kbd-grid">
        {keys.map(k => (
          <button
            key={k}
            className={`kbd-key ${k === '✓' ? 'kbd-submit' : ''} ${k === '←' ? 'kbd-back' : ''}`}
            onPointerDown={e => { e.preventDefault(); press(k); }}
            disabled={disabled}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── mute button ───────────────────────────────────────────────────────────────

function MuteBtn({ muted, onToggle }) {
  return (
    <button className="mute-btn" onClick={onToggle} title={muted ? 'Unmute' : 'Mute'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

// ── solo screens ──────────────────────────────────────────────────────────────

function NameScreen({ onStart, muted, onToggleMute }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState(false);
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr(true); setTimeout(() => setErr(false), 600); return; }
    onStart(name.trim());
  }

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card">
        <div className="game-title">JUMP MATH</div>
        <div className="game-subtitle">train your brain</div>
        <form onSubmit={submit}>
          <div className="input-wrapper">
            <label>Your name</label>
            <input ref={inputRef} type="text" className={err ? 'error' : ''}
              placeholder="Enter name..." value={name} maxLength={18}
              onChange={e => setName(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary">Continue →</button>
        </form>
      </div>
    </div>
  );
}

function SetupScreen({ playerName, onPlay, onScores, onMultiplayer, muted, onToggleMute }) {
  const [jumps, setJumps] = useState(1);
  const scores = loadScores().slice(0, 3);

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card">
        <div className="game-title">JUMP MATH</div>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ color: '#a78bfa', fontFamily: 'Orbitron', fontWeight: 700 }}>{playerName}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}> — choose difficulty</span>
        </div>

        <label style={{ textAlign: 'center', display: 'block' }}>Number of jumps</label>
        <div className="jump-counter">
          <button className="jump-btn" onClick={() => setJumps(j => Math.max(1, j - 1))} disabled={jumps <= 1}>−</button>
          <div className="jump-value">{jumps}</div>
          <button className="jump-btn" onClick={() => setJumps(j => Math.min(6, j + 1))} disabled={jumps >= 6}>+</button>
        </div>
        <div className="jump-label">
          {jumps === 1 ? 'Easy' : jumps === 2 ? 'Medium' : jumps <= 4 ? 'Hard' : 'Insane'} · {jumps} jump{jumps > 1 ? 's' : ''}
        </div>

        <button className="btn btn-primary" onClick={() => { SFX.gameStart(); onPlay(jumps); }}>
          🎲 Randomize &amp; Play
        </button>

        <button className="btn btn-mp" style={{ marginTop: '0.75rem', width: '100%' }} onClick={onMultiplayer}>
          👥 Multiplayer (Local Network)
        </button>

        <div className="divider" />

        <div className="section-title">Top Scores</div>
        {scores.length === 0
          ? <div className="no-scores">No scores yet — be the first!</div>
          : <div className="scores-list">
              {scores.map((s, i) => (
                <div key={i} className="score-item">
                  <div className={`score-rank rank-${i < 3 ? i + 1 : 'other'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </div>
                  <div className="score-name">{s.name}</div>
                  <div>
                    <div className="score-pts">{s.score}</div>
                    <div className="score-meta">{s.jumps}j · {s.steps} steps</div>
                  </div>
                </div>
              ))}
            </div>
        }

        <div className="btn-row" style={{ marginTop: '1rem' }}>
          <button className="btn btn-ghost" onClick={onScores}>All Scores</button>
        </div>
      </div>
    </div>
  );
}

function GameScreen({ playerName, jumpCount, onGameOver, muted, onToggleMute }) {
  const [jumpValues] = useState(() =>
    Array.from({ length: jumpCount }, () => randomInt(5, 30))
  );
  const [current, setCurrent] = useState(0);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState('');
  const [inputErr, setInputErr] = useState(false);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1);
  const [rawTime, setRawTime] = useState(0);

  const timerRef = useRef(null);
  const startRef = useRef(Date.now());
  const durationRef = useRef(getTimerDuration(0));
  const prevSecRef = useRef(null);

  const nextJump = jumpValues[step % jumpCount];
  const expectedAnswer = current + nextJump;

  const endGame = useCallback((stepsCompleted) => {
    clearInterval(timerRef.current);
    if (!muted) SFX.gameFail();
    onGameOver(stepsCompleted, jumpValues);
  }, [onGameOver, jumpValues, muted]);

  useEffect(() => {
    startRef.current = Date.now();
    durationRef.current = getTimerDuration(step);
    setRawTime(durationRef.current);
    prevSecRef.current = null;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, durationRef.current - elapsed);
      setTimeLeft(remaining / durationRef.current);
      setRawTime(remaining);
      // tick when each second crosses
      const sec = Math.ceil(remaining / 1000);
      if (prevSecRef.current !== null && sec !== prevSecRef.current && remaining > 0 && !muted) {
        if (remaining / durationRef.current < 0.4) SFX.tick();
      }
      prevSecRef.current = sec;
      if (remaining <= 0) { clearInterval(timerRef.current); endGame(step); }
    }, 60);

    return () => clearInterval(timerRef.current);
  }, [step, endGame, muted]);

  function handleInput(val) { setInput(val); }

  function handleSubmit() {
    const val = parseInt(input, 10);
    if (isNaN(val)) return;
    if (val === expectedAnswer) {
      clearInterval(timerRef.current);
      if (!muted) SFX.correct();
      setFlashCorrect(true);
      setConfetti(true);
      setTimeout(() => { setFlashCorrect(false); setConfetti(false); }, 500);
      setCurrent(expectedAnswer);
      setInput('');
      setStep(s => s + 1);
    } else {
      if (!muted) SFX.wrong();
      setInputErr(true);
      setTimeout(() => { setInputErr(false); endGame(step); }, 500);
    }
  }

  const timerSecs = (rawTime / 1000).toFixed(1);
  const dur = durationRef.current / 1000;
  const barColor = timerColor(timeLeft);

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      {flashCorrect && <div className="correct-flash-overlay" />}
      <Confetti active={confetti} />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="stat-label">Player: <span style={{ color: '#a78bfa', fontFamily: 'Orbitron', fontSize: '0.85rem' }}>{playerName}</span></div>
          <div className="stat-label">Score: <span style={{ color: '#60a5fa', fontFamily: 'Orbitron', fontSize: '0.85rem' }}>{calcScore(step, jumpCount)}</span></div>
        </div>

        <div className="timer-container">
          <div className="timer-meta">
            <span>Time</span>
            <span style={{ color: barColor, fontFamily: 'Orbitron', fontWeight: 700 }}>{timerSecs}s</span>
          </div>
          <div className="timer-bar-bg">
            <div className="timer-bar" style={{ width: `${timeLeft * 100}%`, background: barColor }} />
          </div>
          <div className="speed-indicator" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Limit: {dur.toFixed(1)}s — step {step + 1}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.75rem', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '0.4rem' }}>
          Jump pattern
        </div>
        <div className="jumps-display">
          {jumpValues.map((v, i) => (
            <div key={i} className="jump-chip" style={i === step % jumpCount ? { borderColor: '#60a5fa', color: '#60a5fa', background: 'rgba(96,165,250,0.15)' } : {}}>
              +{v}
            </div>
          ))}
        </div>

        <div className="current-number-label">Current total</div>
        <div className="big-number">{current}</div>

        <div className="next-prompt">
          Add <strong>+{nextJump}</strong> → what is the next number?
        </div>

        <CustomKeyboard
          value={input}
          onChange={handleInput}
          onSubmit={handleSubmit}
          disabled={inputErr}
        />

        <div className="streak" style={{ marginTop: '0.75rem' }}>
          {step > 0 && <><span>{step}</span> correct so far 🔥</>}
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ playerName, steps, jumpCount, jumpValues, onPlayAgain, onMenu, muted, onToggleMute }) {
  const score = calcScore(steps, jumpCount);
  const allScores = useRef(saveScore({ name: playerName, score, steps, jumps: jumpCount, date: new Date().toLocaleDateString() }));
  const rank = allScores.current.findIndex(s => s.name === playerName && s.score === score && s.steps === steps) + 1;
  const isNewRecord = rank === 1;

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card">
        <div className="game-over-title">Game Over</div>
        {isNewRecord && <div style={{ textAlign: 'center', margin: '0.4rem 0' }}><span className="new-record-badge">🏆 New Record!</span></div>}
        <div className="final-score">{score}</div>
        <div className="score-pts-label">points</div>
        <div className="divider" />
        <div className="stat-row"><span className="stat-label">Player</span><span className="stat-value">{playerName}</span></div>
        <div className="stat-row"><span className="stat-label">Steps</span><span className="stat-value">{steps}</span></div>
        <div className="stat-row">
          <span className="stat-label">Jumps</span>
          <span className="stat-value">{jumpValues.map((v, i) => <span key={i} className="jump-chip" style={{ marginLeft: i > 0 ? 4 : 0 }}>+{v}</span>)}</span>
        </div>
        <div className="stat-row"><span className="stat-label">Difficulty</span><span className="stat-value">{jumpCount} jump{jumpCount > 1 ? 's' : ''}</span></div>
        {rank > 0 && <div className="stat-row"><span className="stat-label">Rank</span><span className="stat-value" style={{ color: rank === 1 ? '#fbbf24' : rank <= 3 ? '#94a3b8' : '#a78bfa' }}>#{rank}</span></div>}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onPlayAgain}>Play Again</button>
          <button className="btn btn-secondary" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function ScoresScreen({ onBack, muted, onToggleMute }) {
  const scores = loadScores();
  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="game-title" style={{ fontSize: '1.8rem' }}>High Scores</div>
        <div className="game-subtitle">Top 20 all-time</div>
        {scores.length === 0
          ? <div className="no-scores">No scores yet — play to set the first!</div>
          : <div className="scores-list">
              {scores.map((s, i) => (
                <div key={i} className="score-item">
                  <div className={`score-rank rank-${i < 3 ? i + 1 : 'other'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </div>
                  <div>
                    <div className="score-name">{s.name}</div>
                    <div className="score-meta">{s.date}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ textAlign: 'right' }}>
                    <div className="score-pts">{s.score}</div>
                    <div className="score-meta">{s.jumps}j · {s.steps} steps</div>
                  </div>
                </div>
              ))}
            </div>
        }
        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}

// ── multiplayer screens ───────────────────────────────────────────────────────

function getWsUrl() {
  const host = window.location.hostname || 'localhost';
  return `ws://${host}:3001`;
}

function MPMenuScreen({ playerName, onBack, onRoomJoined, muted, onToggleMute }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef(null);

  function connect(onOpen) {
    setConnecting(true);
    setError('');
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => { setConnecting(false); onOpen(ws); };
    ws.onerror = () => { setConnecting(false); setError('Cannot connect to server. Make sure the game server is running on the host device.'); };
    ws.onclose = () => { setConnecting(false); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ROOM_JOINED') { onRoomJoined(ws, msg.playerId, msg.room); }
      if (msg.type === 'ERROR') { setError(msg.message); setConnecting(false); }
    };
  }

  function createRoom() {
    connect(ws => ws.send(JSON.stringify({ type: 'CREATE_ROOM', name: playerName })));
  }

  function joinRoom() {
    if (!code.trim()) { setError('Enter a room code'); return; }
    connect(ws => ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: code.toUpperCase(), name: playerName })));
  }

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card">
        <div className="game-title" style={{ fontSize: '1.8rem' }}>Multiplayer</div>
        <div className="game-subtitle">same wifi network</div>

        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={() => { setMode('create'); createRoom(); }}>
              🏠 Create Game
            </button>
            <button className="btn btn-secondary" onClick={() => setMode('join')}>
              🔗 Join Game
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div style={{ marginTop: '0.5rem' }}>
            <label>Room code</label>
            <input
              type="text"
              placeholder="XXXX"
              value={code}
              maxLength={4}
              style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '6px', fontSize: '1.6rem' }}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={joinRoom} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Join Room'}
            </button>
          </div>
        )}

        {connecting && mode === 'create' && (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,0.5)' }}>Connecting…</div>
        )}

        {error && <div className="mp-error">{error}</div>}

        <div className="mp-hint">
          All players must be on the same WiFi. The host runs <code>npm run server</code> on their computer and shares their local IP address.
        </div>

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function MPLobbyScreen({ ws, playerId, initialRoom, onGameStarted, onBack, muted, onToggleMute }) {
  const [room, setRoom] = useState(initialRoom);
  const [jumpCount, setJumpCount] = useState(initialRoom.jumpCount || 3);
  const [voteStatus, setVoteStatus] = useState(null); // 'waiting' | 'approved' | 'rejected'
  const [myVote, setMyVote] = useState(null);

  const isHost = room.hostId === playerId;

  useEffect(() => {
    if (!ws) return;
    function onMsg(e) {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'ROOM_UPDATE':
          setRoom(msg.room);
          if (!muted) SFX.playerJoined();
          break;
        case 'PLAYER_LEFT':
          setRoom(msg.room);
          if (!muted) SFX.playerLeft();
          break;
        case 'VOTE_REQUEST':
          setRoom(msg.room);
          setVoteStatus('waiting');
          setMyVote(null);
          break;
        case 'VOTE_RESULT':
          setRoom(msg.room);
          if (msg.approved) {
            setVoteStatus('approved');
            if (!muted) SFX.approved();
          } else {
            setVoteStatus('rejected');
            if (!muted) SFX.rejected();
            setTimeout(() => setVoteStatus(null), 2000);
          }
          break;
        case 'GAME_STARTED':
          onGameStarted(msg.room);
          break;
        default: break;
      }
    }
    ws.addEventListener('message', onMsg);
    return () => ws.removeEventListener('message', onMsg);
  }, [ws, onGameStarted, muted]);

  function proposeJumps() {
    ws.send(JSON.stringify({ type: 'SET_JUMPS', jumpCount }));
  }

  function vote(approve) {
    setMyVote(approve);
    if (!muted) SFX.vote();
    ws.send(JSON.stringify({ type: 'VOTE', approve }));
  }

  function startGame() {
    if (!muted) SFX.gameStart();
    ws.send(JSON.stringify({ type: 'START_GAME' }));
  }

  const nonHostPlayers = room.players.filter(p => p.id !== room.hostId);
  const voteCount = Object.keys(room.votes || {}).length;

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      <div className="card">
        <div className="game-title" style={{ fontSize: '1.6rem' }}>Room <span style={{ color: '#60a5fa' }}>{room.code}</span></div>
        <div className="game-subtitle">waiting for players</div>

        <div className="mp-players-list">
          {room.players.map(p => (
            <div key={p.id} className="mp-player-row">
              <span className="mp-player-dot" style={{ background: p.id === room.hostId ? '#fbbf24' : '#34d399' }} />
              <span className="mp-player-name">{p.name}</span>
              {p.id === room.hostId && <span className="mp-badge host">HOST</span>}
              {p.id === playerId && <span className="mp-badge you">YOU</span>}
            </div>
          ))}
        </div>

        <div className="divider" />

        {/* Host: set jumps + propose */}
        {isHost && (room.state === 'lobby' || room.state === 'voting') && voteStatus !== 'approved' && (
          <div>
            <label style={{ textAlign: 'center', display: 'block' }}>Propose number of jumps</label>
            <div className="jump-counter">
              <button className="jump-btn" onClick={() => setJumpCount(j => Math.max(1, j - 1))} disabled={jumpCount <= 1}>−</button>
              <div className="jump-value">{jumpCount}</div>
              <button className="jump-btn" onClick={() => setJumpCount(j => Math.min(6, j + 1))} disabled={jumpCount >= 6}>+</button>
            </div>
            <div className="jump-label">
              {jumpCount === 1 ? 'Easy' : jumpCount === 2 ? 'Medium' : jumpCount <= 4 ? 'Hard' : 'Insane'}
            </div>
            {voteStatus === 'rejected' && (
              <div className="mp-error" style={{ marginBottom: '0.75rem' }}>Players rejected — try a different count!</div>
            )}
            <button className="btn btn-primary"
              onClick={proposeJumps}
              disabled={room.state === 'voting' && voteStatus === 'waiting'}
            >
              {room.state === 'voting' && voteStatus === 'waiting'
                ? `Waiting for votes… (${voteCount}/${nonHostPlayers.length})`
                : 'Propose Jumps'}
            </button>
          </div>
        )}

        {/* Host: approved, can start */}
        {isHost && voteStatus === 'approved' && (
          <div>
            <div style={{ textAlign: 'center', color: '#34d399', marginBottom: '1rem', fontFamily: 'Orbitron', fontSize: '0.9rem' }}>
              ✓ All players approved {room.jumpCount} jump{room.jumpCount > 1 ? 's' : ''}!
            </div>
            <button className="btn btn-primary" onClick={startGame}>🎲 Random &amp; Play!</button>
          </div>
        )}

        {/* Non-host: voting */}
        {!isHost && room.state === 'voting' && voteStatus === 'waiting' && myVote === null && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Host proposes</div>
              <div className="jump-value" style={{ fontSize: '3rem' }}>{room.jumpCount}</div>
              <div className="jump-label">{room.jumpCount === 1 ? 'Easy' : room.jumpCount === 2 ? 'Medium' : room.jumpCount <= 4 ? 'Hard' : 'Insane'} difficulty</div>
            </div>
            <div className="btn-row">
              <button className="btn btn-approve" onClick={() => vote(true)}>✓ Approve</button>
              <button className="btn btn-reject" onClick={() => vote(false)}>✗ Reject</button>
            </div>
          </div>
        )}

        {!isHost && myVote !== null && voteStatus === 'waiting' && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', padding: '1rem 0', fontSize: '0.85rem', letterSpacing: '2px' }}>
            {myVote ? 'You approved ✓' : 'You rejected ✗'} — waiting for others…
          </div>
        )}

        {!isHost && room.state === 'lobby' && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '1rem 0', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Waiting for host to propose jumps…
          </div>
        )}

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={onBack}>
          Leave Room
        </button>
      </div>
    </div>
  );
}

function MPGameScreen({ ws, playerId, initialRoom, onGameOver, muted, onToggleMute }) {
  const [room, setRoom] = useState(initialRoom);
  const [currentNumber, setCurrentNumber] = useState(initialRoom.currentNumber ?? 0);
  const [currentStep, setCurrentStep] = useState(initialRoom.currentStep ?? 0);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [input, setInput] = useState('');
  const [inputErr, setInputErr] = useState(false);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1);
  const [rawTime, setRawTime] = useState(0);
  const [eliminated, setEliminated] = useState(false);
  const [lastEvent, setLastEvent] = useState('');

  const timerRef = useRef(null);
  const startRef = useRef(null);
  const durationRef = useRef(null);
  const isMyTurn = activePlayerId === playerId;

  const jumpValues = room.jumpValues;
  const jumpCount = room.jumpCount;
  const nextJump = jumpValues[currentStep % jumpCount];
  const expectedAnswer = currentNumber + nextJump;

  // Start / stop timer when turn changes
  const startTimer = useCallback((step) => {
    clearInterval(timerRef.current);
    const dur = getTimerDuration(step);
    durationRef.current = dur;
    startRef.current = Date.now();
    setRawTime(dur);
    setTimeLeft(1);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, dur - elapsed);
      setTimeLeft(remaining / dur);
      setRawTime(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (!muted) SFX.gameFail();
        ws.send(JSON.stringify({ type: 'TIMEOUT' }));
      }
    }, 60);
  }, [ws, muted]);

  useEffect(() => {
    if (!ws) return;
    function onMsg(e) {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'TURN_START':
          setRoom(msg.room);
          setCurrentNumber(msg.currentNumber);
          setCurrentStep(msg.currentStep);
          setActivePlayerId(msg.currentPlayerId);
          setInput('');
          setLastEvent('');
          if (msg.currentPlayerId === playerId) {
            if (!muted) SFX.gameStart();
            startTimer(msg.currentStep);
          } else {
            clearInterval(timerRef.current);
            setTimeLeft(1);
          }
          break;
        case 'ANSWER_RESULT':
          setRoom(msg.room);
          if (msg.correct) {
            if (!muted) SFX.correct();
            setFlashCorrect(true);
            setConfetti(true);
            setTimeout(() => { setFlashCorrect(false); setConfetti(false); }, 500);
          } else {
            if (!muted) SFX.wrong();
            const p = msg.room.players.find(x => x.id === msg.playerId);
            setLastEvent(`${p?.name || 'Player'} got it wrong!`);
            if (msg.playerId === playerId) setEliminated(true);
          }
          break;
        case 'PLAYER_TIMEOUT': {
          setRoom(msg.room);
          if (!muted) SFX.wrong();
          const p = msg.room.players.find(x => x.id === msg.playerId);
          setLastEvent(`${p?.name || 'Player'} ran out of time!`);
          if (msg.playerId === playerId) setEliminated(true);
          break;
        }
        case 'PLAYER_LEFT':
          setRoom(msg.room);
          if (!muted) SFX.playerLeft();
          break;
        case 'GAME_OVER':
          clearInterval(timerRef.current);
          onGameOver(msg.winnerId, msg.room);
          break;
        default: break;
      }
    }
    ws.addEventListener('message', onMsg);
    return () => { ws.removeEventListener('message', onMsg); clearInterval(timerRef.current); };
  }, [ws, playerId, startTimer, onGameOver, muted]);

  function handleSubmit() {
    if (!isMyTurn || eliminated) return;
    const val = parseInt(input, 10);
    if (isNaN(val)) return;
    clearInterval(timerRef.current);
    ws.send(JSON.stringify({ type: 'SUBMIT_ANSWER', answer: val }));
    if (val !== expectedAnswer) {
      setInputErr(true);
      setTimeout(() => setInputErr(false), 500);
    }
  }

  const barColor = timerColor(timeLeft);
  const activeName = room.players.find(p => p.id === activePlayerId)?.name || '';
  const alivePlayers = room.players.filter(p => p.alive);

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      {flashCorrect && <div className="correct-flash-overlay" />}
      <Confetti active={confetti} />

      <div className="card">
        {/* Players alive row */}
        <div className="mp-alive-row">
          {room.players.map(p => (
            <div key={p.id} className={`mp-alive-chip ${!p.alive ? 'mp-dead' : ''} ${p.id === activePlayerId ? 'mp-active-chip' : ''}`}>
              {p.name.slice(0, 6)}
              {p.id === playerId && <span className="mp-you-tag">you</span>}
            </div>
          ))}
        </div>

        {/* Timer — only shown when it's your turn */}
        {isMyTurn && !eliminated && (
          <div className="timer-container">
            <div className="timer-meta">
              <span>Your turn!</span>
              <span style={{ color: barColor, fontFamily: 'Orbitron', fontWeight: 700 }}>{(rawTime / 1000).toFixed(1)}s</span>
            </div>
            <div className="timer-bar-bg">
              <div className="timer-bar" style={{ width: `${timeLeft * 100}%`, background: barColor }} />
            </div>
          </div>
        )}

        {!isMyTurn && !eliminated && activePlayerId && (
          <div className="mp-waiting-banner">
            ⏳ {activeName}'s turn…
          </div>
        )}

        {eliminated && (
          <div className="mp-eliminated-banner">
            ☠ You were eliminated! Watching the game…
          </div>
        )}

        {lastEvent && (
          <div className="mp-event">{lastEvent}</div>
        )}

        {/* Jump pattern */}
        <div style={{ textAlign: 'center', fontSize: '0.72rem', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '0.3rem' }}>Jump pattern</div>
        <div className="jumps-display">
          {jumpValues.map((v, i) => (
            <div key={i} className="jump-chip" style={i === currentStep % jumpCount ? { borderColor: '#60a5fa', color: '#60a5fa', background: 'rgba(96,165,250,0.15)' } : {}}>
              +{v}
            </div>
          ))}
        </div>

        <div className="current-number-label">Current total</div>
        <div className="big-number">{currentNumber}</div>

        <div className="next-prompt">
          Add <strong>+{nextJump}</strong> → what is the next number?
        </div>

        <CustomKeyboard
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={!isMyTurn || eliminated || inputErr}
        />

        <div className="streak" style={{ marginTop: '0.75rem' }}>
          {alivePlayers.length} player{alivePlayers.length !== 1 ? 's' : ''} remaining · step {currentStep + 1}
        </div>
      </div>
    </div>
  );
}

function MPWinnerScreen({ winnerId, room, playerId, onMenu, muted, onToggleMute }) {
  const winner = room.players.find(p => p.id === winnerId);
  const isWinner = winnerId === playerId;

  useEffect(() => {
    if (!muted) {
      if (isWinner) SFX.gameWin();
      else SFX.gameFail();
    }
  }, [isWinner, muted]);

  return (
    <div className="screen">
      <Stars />
      <MuteBtn muted={muted} onToggle={onToggleMute} />
      {isWinner && <Confetti active />}
      <div className="card">
        <div className="game-title" style={{ fontSize: isWinner ? '2rem' : '1.6rem', marginBottom: '0.5rem' }}>
          {isWinner ? '🏆 You Win!' : '🎮 Game Over'}
        </div>
        {winner && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Winner</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: '1.8rem', fontWeight: 900, color: '#fbbf24' }}>{winner.name}</div>
          </div>
        )}
        <div className="divider" />
        <div className="section-title" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Final standings</div>
        {room.players.map((p, i) => (
          <div key={p.id} className="mp-player-row" style={{ padding: '0.4rem 0' }}>
            <span style={{ color: p.alive ? '#fbbf24' : '#f87171', marginRight: '0.5rem' }}>{p.alive ? '👑' : '💀'}</span>
            <span className="mp-player-name">{p.name}</span>
            {p.id === playerId && <span className="mp-badge you">YOU</span>}
          </div>
        ))}
        <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={onMenu}>← Main Menu</button>
      </div>
    </div>
  );
}

// ── root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('name');
  const [playerName, setPlayerName] = useState('');
  const [jumpCount, setJumpCount] = useState(1);
  const [gameResult, setGameResult] = useState(null);
  const [muted, setMuted] = useState(false);

  // Multiplayer state
  const [mpWs, setMpWs] = useState(null);
  const [mpPlayerId, setMpPlayerId] = useState(null);
  const [mpRoom, setMpRoom] = useState(null);
  const [mpWinnerId, setMpWinnerId] = useState(null);

  // Start background music on first interaction
  const musicStarted = useRef(false);
  useEffect(() => {
    function tryStart() {
      if (!musicStarted.current && !muted) {
        musicStarted.current = true;
        startBgMusic();
      }
    }
    window.addEventListener('pointerdown', tryStart, { once: true });
    return () => window.removeEventListener('pointerdown', tryStart);
  }, [muted]);

  function toggleMute() {
    setMuted(m => {
      if (!m) { stopBgMusic(); }
      else { startBgMusic(); musicStarted.current = true; }
      return !m;
    });
  }

  const commonProps = { muted, onToggleMute: toggleMute };

  function handleName(name) { setPlayerName(name); setScreen('setup'); }

  function handlePlay(jumps) { setJumpCount(jumps); setScreen('game'); }

  function handleGameOver(steps, jumpValues) {
    setGameResult({ steps, jumpValues });
    setScreen('gameover');
  }

  function handleMpRoomJoined(ws, pid, room) {
    setMpWs(ws);
    setMpPlayerId(pid);
    setMpRoom(room);
    if (!muted) SFX.playerJoined();
    setScreen('mp-lobby');
  }

  function handleMpGameStarted(room) {
    setMpRoom(room);
    setScreen('mp-game');
  }

  function handleMpGameOver(winnerId, room) {
    setMpWinnerId(winnerId);
    setMpRoom(room);
    setScreen('mp-winner');
  }

  function leaveMp() {
    if (mpWs) { try { mpWs.close(); } catch {} setMpWs(null); }
    setMpRoom(null);
    setMpPlayerId(null);
    setMpWinnerId(null);
    setScreen('setup');
  }

  if (screen === 'name') return <NameScreen onStart={handleName} {...commonProps} />;

  if (screen === 'setup') return (
    <SetupScreen playerName={playerName} onPlay={handlePlay}
      onScores={() => setScreen('scores')}
      onMultiplayer={() => setScreen('mp-menu')}
      {...commonProps} />
  );

  if (screen === 'game') return (
    <GameScreen key={Date.now()} playerName={playerName} jumpCount={jumpCount}
      onGameOver={handleGameOver} {...commonProps} />
  );

  if (screen === 'gameover') return (
    <GameOverScreen playerName={playerName} steps={gameResult.steps}
      jumpCount={jumpCount} jumpValues={gameResult.jumpValues}
      onPlayAgain={() => { setGameResult(null); setScreen('game'); }}
      onMenu={() => { setGameResult(null); setScreen('setup'); }}
      {...commonProps} />
  );

  if (screen === 'scores') return <ScoresScreen onBack={() => setScreen('setup')} {...commonProps} />;

  if (screen === 'mp-menu') return (
    <MPMenuScreen playerName={playerName} onBack={() => setScreen('setup')}
      onRoomJoined={handleMpRoomJoined} {...commonProps} />
  );

  if (screen === 'mp-lobby') return (
    <MPLobbyScreen ws={mpWs} playerId={mpPlayerId} initialRoom={mpRoom}
      onGameStarted={handleMpGameStarted} onBack={leaveMp} {...commonProps} />
  );

  if (screen === 'mp-game') return (
    <MPGameScreen ws={mpWs} playerId={mpPlayerId} initialRoom={mpRoom}
      onGameOver={handleMpGameOver} {...commonProps} />
  );

  if (screen === 'mp-winner') return (
    <MPWinnerScreen winnerId={mpWinnerId} room={mpRoom} playerId={mpPlayerId}
      onMenu={leaveMp} {...commonProps} />
  );

  return null;
}
