import { useState, useEffect, useRef, useCallback } from 'react'
import Lineups from './Lineups.jsx'
import './index.css'

function contrastText(hex) {
  if (!hex || typeof hex !== 'string') return '#ffffff'
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  if (h.length !== 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? '#111111' : '#ffffff'
}

// ── Constants ────────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 1050
const CANVAS_HEIGHT = 680
const PADDING = 40
const FIELD_W = CANVAS_WIDTH - 2 * PADDING
const FIELD_H = CANVAS_HEIGHT - 2 * PADDING

function App() {
  const canvasRef = useRef(null)
  const wsRef = useRef(null)

  // Match metadata
  const [matchInfo, setMatchInfo] = useState(null)
  const [lineups, setLineups] = useState(null)
  const [totalFrames, setTotalFrames] = useState(0)
  const [periods, setPeriods] = useState([])
  const [activeTab, setActiveTab] = useState('tracker')

  // Playback state
  const [currentFrame, setCurrentFrame] = useState(0)
  const [frameData, setFrameData] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const playingRef = useRef(false)

  // Clipping state
  const [clipStart, setClipStart] = useState(null)
  const [clipEnd, setClipEnd] = useState(null)
  const [isClipping, setIsClipping] = useState(false)

  // ── Fetch match info on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch('http://localhost:8000/')
      .then(r => r.json())
      .then(data => {
        setMatchInfo(data.match)
        setLineups(data.lineups || null)
        setTotalFrames(data.total_frames)
        setPeriods(data.periods || [])
        // Jump to first actual frame of period 1
        if (data.periods && data.periods.length > 0) {
          const startFrame = data.periods[0].start_frame
          setCurrentFrame(startFrame)
        }
      })
      .catch(err => console.error('Failed to fetch match info:', err))
  }, [])

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/match')
    ws.onopen = () => console.log('WebSocket connected')
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setFrameData(data)
    }
    ws.onclose = () => console.log('WebSocket disconnected')
    wsRef.current = ws
    return () => ws.close()
  }, [])

  // ── Request a frame via WebSocket ──────────────────────────────────────────
  const requestFrame = useCallback((idx) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ frame_idx: idx }))
    }
  }, [])

  // Request frame whenever currentFrame changes
  useEffect(() => {
    requestFrame(currentFrame)
  }, [currentFrame, requestFrame])

  // ── Playback loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      if (!playingRef.current) return
      setCurrentFrame(prev => {
        const next = prev + 1
        if (next >= totalFrames) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, 100 / playbackSpeed) // 10fps base
    return () => clearInterval(interval)
  }, [isPlaying, totalFrames, playbackSpeed])

  // ── Canvas rendering ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !matchInfo) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = CANVAS_WIDTH + 'px'
    canvas.style.height = CANVAS_HEIGHT + 'px'

    const pitchL = matchInfo.pitch_length || 105
    const pitchW = matchInfo.pitch_width || 68

    // Map pitch coords (meters, center=0) to canvas pixels
    const mapX = (x) => PADDING + ((x + pitchL / 2) / pitchL) * FIELD_W
    const mapY = (y) => PADDING + ((pitchW / 2 - y) / pitchW) * FIELD_H  // flip Y

    // ── Draw pitch ───────────────────────────────────────────────────────────
    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Grass with subtle striping
    ctx.fillStyle = '#2d6a4f'
    ctx.fillRect(PADDING, PADDING, FIELD_W, FIELD_H)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    const stripeW = FIELD_W / 12
    for (let i = 0; i < 12; i += 2) {
      ctx.fillRect(PADDING + i * stripeW, PADDING, stripeW, FIELD_H)
    }

    // Pitch lines
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(PADDING, PADDING, FIELD_W, FIELD_H)

    // Center line
    ctx.beginPath()
    ctx.moveTo(CANVAS_WIDTH / 2, PADDING)
    ctx.lineTo(CANVAS_WIDTH / 2, PADDING + FIELD_H)
    ctx.stroke()

    // Center circle
    ctx.beginPath()
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, (9.15 / pitchL) * FIELD_W, 0, Math.PI * 2)
    ctx.stroke()

    // Center dot
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 3, 0, Math.PI * 2)
    ctx.fill()

    // Penalty areas
    const penW = (16.5 / pitchL) * FIELD_W
    const penH = (40.32 / pitchW) * FIELD_H
    const penY = (CANVAS_HEIGHT - penH) / 2
    ctx.strokeRect(PADDING, penY, penW, penH)
    ctx.strokeRect(PADDING + FIELD_W - penW, penY, penW, penH)

    // Goal areas
    const goalW = (5.5 / pitchL) * FIELD_W
    const goalH = (18.32 / pitchW) * FIELD_H
    const goalY = (CANVAS_HEIGHT - goalH) / 2
    ctx.strokeRect(PADDING, goalY, goalW, goalH)
    ctx.strokeRect(PADDING + FIELD_W - goalW, goalY, goalW, goalH)

    // Goals
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 3
    const glH = (7.32 / pitchW) * FIELD_H
    const glY = (CANVAS_HEIGHT - glH) / 2
    ctx.beginPath()
    ctx.moveTo(PADDING, glY)
    ctx.lineTo(PADDING, glY + glH)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(PADDING + FIELD_W, glY)
    ctx.lineTo(PADDING + FIELD_W, glY + glH)
    ctx.stroke()
    ctx.lineWidth = 1.5

    if (!frameData) return

    // ── Draw players ─────────────────────────────────────────────────────────
    const homeKit = matchInfo.home_jersey_color || '#001536'
    const awayKit = matchInfo.away_jersey_color || '#ffffff'
    const homeInk = matchInfo.home_number_color || contrastText(homeKit)
    const awayInk = matchInfo.away_number_color || contrastText(awayKit)

    const drawPlayer = (p, color, textColor) => {
      if (p.x == null || p.y == null) return
      const px = mapX(p.x)
      const py = mapY(p.y)
      const radius = 13
      const lightKit = contrastText(color) === '#111111'

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      ctx.ellipse(px + 1, py + 2, radius + 1, 5, 0, 0, Math.PI * 2)
      ctx.fill()

      // Player dot in the team kit color
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = lightKit ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)'
      ctx.lineWidth = p.detected ? 2 : 1
      ctx.stroke()

      // Jersey number, unique to this player
      if (p.number != null) {
        const label = String(p.number)
        ctx.font = `bold ${label.length > 2 ? 9 : 11}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 3
        ctx.strokeStyle = lightKit ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
        ctx.strokeText(label, px, py + 0.5)
        ctx.fillStyle = textColor
        ctx.fillText(label, px, py + 0.5)
      }
    }

    // Home players
    ;(frameData.home || []).forEach(p => {
      drawPlayer(p, homeKit, homeInk)
    })

    // Away players
    ;(frameData.away || []).forEach(p => {
      drawPlayer(p, awayKit, awayInk)
    })

    // ── Draw ball ────────────────────────────────────────────────────────────
    const ball = frameData.ball
    if (ball && ball.x != null && ball.y != null) {
      const bx = mapX(ball.x)
      const by = mapY(ball.y)
      // Ball shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.ellipse(bx + 1, by + 2, 6, 3, 0, 0, Math.PI * 2)
      ctx.fill()
      // Ball
      ctx.fillStyle = '#ffff00'
      ctx.beginPath()
      ctx.arc(bx, by, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── HUD overlay ──────────────────────────────────────────────────────────
    const ts = frameData.timestamp || ''
    const period = frameData.period || ''
    const possession = frameData.possession?.group || ''

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(PADDING, PADDING, 220, 30)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px Inter, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      `${period ? 'P' + period : ''}  ${ts}  ${possession ? '⚽ ' + possession : ''}`,
      PADDING + 10, PADDING + 15
    )

  }, [frameData, matchInfo, activeTab])

  // ── Slider handler ─────────────────────────────────────────────────────────
  const handleSlider = (e) => {
    const val = parseInt(e.target.value, 10)
    setCurrentFrame(val)
  }

  // ── Clip generation ────────────────────────────────────────────────────────
  const handleClip = async () => {
    if (clipStart == null || clipEnd == null) return
    const s = Math.min(clipStart, clipEnd)
    const e = Math.max(clipStart, clipEnd)
    if (e - s > 300) {
      alert('Clip too long! Maximum 30 seconds (300 frames).')
      return
    }
    setIsClipping(true)
    try {
      const res = await fetch('http://localhost:8000/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_frame: s, end_frame: e }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clip_${s}_${e}.gif`
      a.click()
    } catch (err) {
      alert('Error generating clip: ' + err.message)
    } finally {
      setIsClipping(false)
    }
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const formatTimestamp = () => {
    if (!frameData) return '--:--'
    return frameData.timestamp || `Frame ${frameData.frame}`
  }

  const currentPeriod = () => {
    if (!frameData || !frameData.period) return ''
    return frameData.period === 1 ? '1st Half' : '2nd Half'
  }

  const clipDuration = () => {
    if (clipStart == null || clipEnd == null) return null
    const diff = Math.abs(clipEnd - clipStart)
    return (diff / 10).toFixed(1)
  }

  // Period quick-jump buttons
  const jumpToPeriod = (p) => {
    const period = periods.find(pr => pr.period === p)
    if (period) {
      setCurrentFrame(period.start_frame)
      setIsPlaying(false)
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="title">SkillCorner Tracker</h1>
          {matchInfo && (
            <div className="match-badge">
              <span className="team home">{matchInfo.home_team}</span>
              <span className="score">
                {matchInfo.home_score} – {matchInfo.away_score}
              </span>
              <span className="team away">{matchInfo.away_team}</span>
            </div>
          )}
        </div>
        <div className="header-right">
          <span className="period-label">{currentPeriod()}</span>
          <span className="timestamp">{formatTimestamp()}</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Match sections">
        <button
          className={`tab ${activeTab === 'tracker' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracker')}
        >
          Tracker
        </button>
        <button
          className={`tab ${activeTab === 'lineups' ? 'active' : ''}`}
          onClick={() => setActiveTab('lineups')}
        >
          Lineups
        </button>
      </nav>

      {activeTab === 'lineups' && (
        <Lineups match={matchInfo} lineups={lineups} />
      )}

      {activeTab === 'tracker' && (
      <>
      {/* Canvas */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
          className="pitch-canvas"
        />
        {/* Legend overlay */}
        <div className="legend">
          {matchInfo && (
            <>
              <span className="legend-dot" style={{ background: matchInfo.home_jersey_color, border: '2px solid white' }} />
              <span>{matchInfo.home_team}</span>
              <span className="legend-dot" style={{ background: matchInfo.away_jersey_color, border: '2px solid black' }} />
              <span>{matchInfo.away_team}</span>
              <span className="legend-dot ball" />
              <span>Ball</span>
            </>
          )}
        </div>
      </div>

      {/* Transport Controls */}
      <div className="controls">
        <div className="transport">
          <button className="btn-icon" onClick={() => { setCurrentFrame(prev => Math.max(0, prev - 10)); setIsPlaying(false) }} title="Back 1s">
            ⏪
          </button>
          <button className="btn-play" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="btn-icon" onClick={() => { setCurrentFrame(prev => Math.min(totalFrames - 1, prev + 10)); setIsPlaying(false) }} title="Forward 1s">
            ⏩
          </button>
          <select className="speed-select" value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={handleSlider}
          className="timeline"
        />

        <div className="period-jumps">
          {periods.map(p => (
            <button key={p.period} className="btn-period" onClick={() => jumpToPeriod(p.period)}>
              P{p.period}
            </button>
          ))}
        </div>
      </div>

      {/* Clipping Controls */}
      <div className="clip-section">
        <button className="btn-clip" onClick={() => setClipStart(currentFrame)}>
          Mark In {clipStart != null ? `[${clipStart}]` : ''}
        </button>
        <button className="btn-clip" onClick={() => setClipEnd(currentFrame)}>
          Mark Out {clipEnd != null ? `[${clipEnd}]` : ''}
        </button>
        {clipDuration() && (
          <span className="clip-info">{clipDuration()}s selected</span>
        )}
        <button
          className="btn-download"
          disabled={clipStart == null || clipEnd == null || isClipping}
          onClick={handleClip}
        >
          {isClipping ? 'Generating…' : '⬇ Download GIF'}
        </button>
      </div>
      </>
      )}
    </div>
  )
}

export default App
