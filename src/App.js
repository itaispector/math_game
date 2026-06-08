import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import './App.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function Stars() {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: Math.random() * 2.5 + 0.5,
    dur: Math.random() * 4 + 2,
    delay: Math.random() * 5,
  }));
  return (
    <div className="stars">
      {stars.map(s => (
        <div
          key={s.id}
          className="star"
          style={{
            top: s.top, left: s.left,
            width: s.size, height: s.size,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Confetti({ active, origin }) {
  const pieces = Array.from({ length: 14 }, (_, i) => i);
  const colors = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#fb923c'];
  if (!active) return null;
  return (
    <>
      {pieces.map(i => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: (origin?.x ?? window.innerWidth / 2) + (Math.random() - 0.5) * 120,
            top: (origin?.y ?? window.innerHeight / 2) - 20,
            width: Math.random() * 8 + 5,
            height: Math.random() * 8 + 5,
            background: colors[i % colors.length],
            animationDuration: `${Math.random() * 0.5 + 0.6}s`,
            animationDelay: `${Math.random() * 0.2}s`,
          }}
        />
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

// Timer: starts at 10s, decreases 0.4s every step, floor 2s
function getTimerDuration(step) {
  return Math.max(2000, 10000 - step * 400);
}

function timerColor(pct) {
  if (pct > 0.5) return '#34d399';
  if (pct > 0.25) return '#fbbf24';
  return '#f87171';
}

// ── screens ──────────────────────────────────────────────────────────────────

function NameScreen({ onStart }) {
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
      <div className="card">
        <div className="game-title">JUMP MATH</div>
        <div className="game-subtitle">train your brain</div>
        <form onSubmit={submit}>
          <div className="input-wrapper">
            <label>Your name</label>
            <input
              ref={inputRef}
              type="text"
              className={err ? 'error' : ''}
              placeholder="Enter name..."
              value={name}
              maxLength={18}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Continue →
          </button>
        </form>
      </div>
    </div>
  );
}

function SetupScreen({ playerName, onPlay, onScores }) {
  const [jumps, setJumps] = useState(1);
  const scores = loadScores().slice(0, 3);

  return (
    <div className="screen">
      <Stars />
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

        <button className="btn btn-primary" onClick={() => onPlay(jumps)}>
          🎲 Randomize &amp; Play
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

function GameScreen({ playerName, jumpCount, onGameOver }) {
  // Generate random jump values once
  const [jumpValues] = useState(() =>
    Array.from({ length: jumpCount }, () => randomInt(5, 30))
  );
  const [current, setCurrent] = useState(0);      // running total
  const [step, setStep] = useState(0);             // how many correct so far
  const [input, setInput] = useState('');
  const [inputErr, setInputErr] = useState(false);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [confettiOrigin, setConfettiOrigin] = useState(null);
  const [timeLeft, setTimeLeft] = useState(1);     // fraction 0-1
  const [rawTime, setRawTime] = useState(0);

  const timerRef = useRef(null);
  const startRef = useRef(Date.now());
  const durationRef = useRef(getTimerDuration(0));
  const inputRef = useRef();

  const nextJump = jumpValues[step % jumpCount];
  const expectedAnswer = current + nextJump;

  const endGame = useCallback((stepsCompleted) => {
    clearInterval(timerRef.current);
    onGameOver(stepsCompleted, jumpValues);
  }, [onGameOver, jumpValues]);

  // Timer tick
  useEffect(() => {
    startRef.current = Date.now();
    durationRef.current = getTimerDuration(step);
    setRawTime(durationRef.current);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, durationRef.current - elapsed);
      setTimeLeft(remaining / durationRef.current);
      setRawTime(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        endGame(step);
      }
    }, 60);

    return () => clearInterval(timerRef.current);
  }, [step, endGame]);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  function handleSubmit(e) {
    e.preventDefault();
    const val = parseInt(input, 10);
    if (isNaN(val)) return;

    if (val === expectedAnswer) {
      // Correct!
      clearInterval(timerRef.current);
      setFlashCorrect(true);
      setConfetti(true);
      setConfettiOrigin({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setTimeout(() => { setFlashCorrect(false); setConfetti(false); }, 500);
      setCurrent(expectedAnswer);
      setInput('');
      setStep(s => s + 1);
    } else {
      // Wrong!
      setInputErr(true);
      setTimeout(() => {
        setInputErr(false);
        endGame(step);
      }, 500);
    }
  }

  const timerSecs = (rawTime / 1000).toFixed(1);
  const dur = durationRef.current / 1000;
  const barColor = timerColor(timeLeft);

  return (
    <div className="screen">
      <Stars />
      {flashCorrect && <div className="correct-flash-overlay" />}
      <Confetti active={confetti} origin={confettiOrigin} />

      <div className="card">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="stat-label">Player: <span style={{ color: '#a78bfa', fontFamily: 'Orbitron', fontSize: '0.85rem' }}>{playerName}</span></div>
          <div className="stat-label">Score: <span style={{ color: '#60a5fa', fontFamily: 'Orbitron', fontSize: '0.85rem' }}>{calcScore(step, jumpCount)}</span></div>
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className="timer-meta">
            <span>Time</span>
            <span style={{ color: barColor, fontFamily: 'Orbitron', fontWeight: 700 }}>{timerSecs}s</span>
          </div>
          <div className="timer-bar-bg">
            <div
              className="timer-bar"
              style={{ width: `${timeLeft * 100}%`, background: barColor }}
            />
          </div>
          <div className="speed-indicator" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Limit: {dur.toFixed(1)}s — step {step + 1}
          </div>
        </div>

        {/* Jump chips */}
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

        {/* Current number */}
        <div className="current-number-label">Current total</div>
        <div className="big-number">{current}</div>

        {/* Prompt */}
        <div className="next-prompt">
          Add <strong>+{nextJump}</strong> → what is the next number?
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="number"
            className={`answer-input ${inputErr ? 'error' : ''} ${flashCorrect ? 'flash-correct' : ''}`}
            placeholder="?"
            value={input}
            onChange={e => setInput(e.target.value)}
            autoComplete="off"
          />
        </form>

        {/* Step counter */}
        <div className="streak" style={{ marginTop: '1rem' }}>
          {step > 0 && <><span>{step}</span> correct so far 🔥</>}
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ playerName, steps, jumpCount, jumpValues, onPlayAgain, onMenu }) {
  const score = calcScore(steps, jumpCount);
  const allScores = useRef(saveScore({ name: playerName, score, steps, jumps: jumpCount, date: new Date().toLocaleDateString() }));
  const rank = allScores.current.findIndex(s => s.name === playerName && s.score === score && s.steps === steps) + 1;
  const isNewRecord = rank === 1 && allScores.current.length > 0;

  return (
    <div className="screen">
      <Stars />
      <div className="card">
        <div className="game-over-title">Game Over</div>
        {isNewRecord && <div style={{ textAlign: 'center', margin: '0.4rem 0' }}><span className="new-record-badge">🏆 New Record!</span></div>}

        <div className="final-score">{score}</div>
        <div className="score-pts-label">points</div>

        <div className="divider" />

        <div className="stat-row">
          <span className="stat-label">Player</span>
          <span className="stat-value">{playerName}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Steps</span>
          <span className="stat-value">{steps}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Jumps</span>
          <span className="stat-value">
            {jumpValues.map((v, i) => <span key={i} className="jump-chip" style={{ marginLeft: i > 0 ? '4px' : 0 }}>+{v}</span>)}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Difficulty</span>
          <span className="stat-value">{jumpCount} jump{jumpCount > 1 ? 's' : ''}</span>
        </div>
        {rank > 0 && (
          <div className="stat-row">
            <span className="stat-label">Rank</span>
            <span className="stat-value" style={{ color: rank === 1 ? '#fbbf24' : rank <= 3 ? '#94a3b8' : '#a78bfa' }}>#{rank}</span>
          </div>
        )}

        <div className="btn-row">
          <button className="btn btn-primary" onClick={onPlayAgain}>Play Again</button>
          <button className="btn btn-secondary" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function ScoresScreen({ onBack }) {
  const scores = loadScores();

  return (
    <div className="screen">
      <Stars />
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

// ── root app ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('name');
  const [playerName, setPlayerName] = useState('');
  const [jumpCount, setJumpCount] = useState(1);
  const [gameResult, setGameResult] = useState(null);

  function handleName(name) {
    setPlayerName(name);
    setScreen('setup');
  }

  function handlePlay(jumps) {
    setJumpCount(jumps);
    setScreen('game');
  }

  function handleGameOver(steps, jumpValues) {
    setGameResult({ steps, jumpValues });
    setScreen('gameover');
  }

  function handlePlayAgain() {
    setScreen('game');
    setGameResult(null);
  }

  function handleMenu() {
    setScreen('setup');
    setGameResult(null);
  }

  if (screen === 'name') return <NameScreen onStart={handleName} />;
  if (screen === 'setup') return <SetupScreen playerName={playerName} onPlay={handlePlay} onScores={() => setScreen('scores')} />;
  if (screen === 'game') return (
    <GameScreen
      key={Date.now()}
      playerName={playerName}
      jumpCount={jumpCount}
      onGameOver={handleGameOver}
    />
  );
  if (screen === 'gameover') return (
    <GameOverScreen
      playerName={playerName}
      steps={gameResult.steps}
      jumpCount={jumpCount}
      jumpValues={gameResult.jumpValues}
      onPlayAgain={handlePlayAgain}
      onMenu={handleMenu}
    />
  );
  if (screen === 'scores') return <ScoresScreen onBack={() => setScreen('setup')} />;
  return null;
}
