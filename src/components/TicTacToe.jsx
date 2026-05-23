import { useState } from 'react'

function calculateWinner(squares) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]
  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { winner: squares[a], line: [a, b, c] }
    }
  }
  return null
}

export default function TicTacToe({ isPremium, loginCount }) {
  const [squares, setSquares] = useState(Array(9).fill(null))
  const [xIsNext, setXIsNext] = useState(true)
  const [score, setScore] = useState({ X: 0, O: 0, draws: 0 })
  const [history, setHistory] = useState([])

  const result = calculateWinner(squares)
  const winner = result?.winner
  const winLine = result?.line || []
  const isDraw = !winner && squares.every(Boolean)

  function handleClick(i) {
    if (squares[i] || winner) return
    const next = squares.slice()
    next[i] = xIsNext ? 'X' : 'O'
    setSquares(next)
    setXIsNext(!xIsNext)

    const newResult = calculateWinner(next)
    if (newResult?.winner) {
      setScore(s => ({ ...s, [newResult.winner]: s[newResult.winner] + 1 }))
      setHistory(h => [...h, { winner: newResult.winner, time: new Date().toLocaleTimeString() }])
    } else if (next.every(Boolean)) {
      setScore(s => ({ ...s, draws: s.draws + 1 }))
      setHistory(h => [...h, { winner: 'Draw', time: new Date().toLocaleTimeString() }])
    }
  }

  function reset() {
    setSquares(Array(9).fill(null))
    setXIsNext(true)
  }

  let status
  if (winner) status = `${winner} wins!`
  else if (isDraw) status = "It's a draw!"
  else status = `Next: ${xIsNext ? 'X' : 'O'}`

  const totalGames = score.X + score.O + score.draws
  const winRate = totalGames > 0 ? Math.round((score.X / totalGames) * 100) : 0

  return (
    <div className="game-page">
      <h1>Tic Tac Toe</h1>

      {loginCount !== undefined && (
        <p className="login-info">Login #{loginCount}</p>
      )}

      <div className="scoreboard">
        <div className="score-item"><span className="score-label">X</span><span className="score-val">{score.X}</span></div>
        <div className="score-item"><span className="score-label">Draw</span><span className="score-val">{score.draws}</span></div>
        <div className="score-item"><span className="score-label">O</span><span className="score-val">{score.O}</span></div>
      </div>
      <div className={`status ${winner ? 'winner' : ''} ${isDraw ? 'draw' : ''}`}>{status}</div>
      <div className="board">
        {squares.map((val, i) => (
          <button
            key={i}
            className={`cell ${val || ''} ${winLine.includes(i) ? 'win-cell' : ''}`}
            onClick={() => handleClick(i)}
          >
            {val}
          </button>
        ))}
      </div>
      <button className="btn reset-btn" onClick={reset}>
        {winner || isDraw ? 'Play Again' : 'Reset'}
      </button>

      {/* Premium-only feature: game stats & history */}
      <div className={`premium-section ${isPremium ? '' : 'locked'}`}>
        <div className="premium-header">
          <h3>Game Stats & History</h3>
          {!isPremium && <span className="lock-badge">PREMIUM ONLY</span>}
        </div>
        {isPremium ? (
          <>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-val">{totalGames}</span>
                <span className="stat-label">Games</span>
              </div>
              <div className="stat">
                <span className="stat-val">{winRate}%</span>
                <span className="stat-label">X Win Rate</span>
              </div>
            </div>
            {history.length > 0 && (
              <div className="game-history">
                <h4>Recent Games</h4>
                {history.slice(-5).reverse().map((g, i) => (
                  <div key={i} className="history-item">
                    <span>{g.winner === 'Draw' ? 'Draw' : `${g.winner} won`}</span>
                    <span className="history-time">{g.time}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="premium-msg">Log in more than 5 times to unlock stats. This is controlled by an Auth0 Action — no app code change needed to adjust the threshold.</p>
        )}
      </div>
    </div>
  )
}
