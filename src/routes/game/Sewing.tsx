import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { playCorrect, playWrong } from '@/lib/audio'
import { useGameTimer } from '@/hooks/useGameTimer'

// -- Road generation --
interface Segment { curve: number }

function generateRoad(length: number, difficulty: number): Segment[] {
  const segs: Segment[] = []
  let curve = 0
  for (let i = 0; i < length; i++) {
    const maxDelta = 0.02 + difficulty * 0.012
    curve += (Math.random() - 0.5) * maxDelta * 2
    curve = Math.max(-1, Math.min(1, curve)) * 0.95
    segs.push({ curve })
  }
  return segs
}

// -- Levels --
const LEVELS = [
  { speed: 80, length: 500, difficulty: 1, tolerance: 0.5, label: '쉼움 🟢' },
  { speed: 120, length: 600, difficulty: 2, tolerance: 0.38, label: '보통 🟡' },
  { speed: 160, length: 700, difficulty: 3, tolerance: 0.28, label: '어려움 🔴' },
]

const W = 340
const H = 480
const ROAD_W = 0.45
const DRAW_DIST = 80

function getScale(i: number): number {
  return 1 / (1 + i * 0.08)
}

type Phase = 'idle' | 'playing' | 'done'

export default function Sewing() {
  useGameTimer()

  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [lives, setLives] = useState(3)
  const [progress, setProgress] = useState(0)
  const [playerX, setPlayerX] = useState(0)
  const [steer, setSteer] = useState(0)
  const [speed, setSpeed] = useState(0)

  const phaseRef = useRef<Phase>('idle')
  const roadRef = useRef<Segment[]>([])
  const posRef = useRef(0)
  const playerXRef = useRef(0)
  const steerRef = useRef(0)
  const frameRef = useRef<number>(undefined)
  const lastTimeRef = useRef(0)
  const livesRef = useRef(3)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitCooldown = useRef(0)
  const levelRef = useRef(0)
  const speedRef = useRef(0)

  const handleStart = useCallback((lvl: number) => {
    const road = generateRoad(LEVELS[lvl].length, LEVELS[lvl].difficulty)
    roadRef.current = road
    posRef.current = 0
    playerXRef.current = 0
    steerRef.current = 0
    livesRef.current = 3
    scoreRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    lastTimeRef.current = 0
    hitCooldown.current = 0
    levelRef.current = lvl
    speedRef.current = LEVELS[lvl].speed

    setLevel(lvl)
    setPhase('playing')
    phaseRef.current = 'playing'
    setPlayerX(0)
    setSteer(0)
    setLives(3)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setProgress(0)
    setSpeed(LEVELS[lvl].speed)

    frameRef.current = requestAnimationFrame(gameLoop)
  }, [])

  const drawRoad = useCallback((currentSeg: number, lvlIdx: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const road = roadRef.current
    const px = playerXRef.current

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.35)
    sky.addColorStop(0, '#1a1a2e')
    sky.addColorStop(1, '#16213e')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H * 0.35)

    // Stars in sky
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 20; i++) {
      const sx = (i * 73 + currentSeg * 0.1) % W
      const sy = (i * 37) % (H * 0.3)
      ctx.globalAlpha = 0.3 + Math.sin(i + currentSeg * 0.05) * 0.3
      ctx.fillRect(sx, sy, 1.5, 1.5)
    }
    ctx.globalAlpha = 1

    // Ground
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, H * 0.35, W, H * 0.65)

    // Road segments (back to front)
    let cumulX = 0
    const segH = H / DRAW_DIST

    for (let i = DRAW_DIST - 1; i >= 0; i--) {
      const segIdx = currentSeg + i
      const seg = road[Math.min(segIdx, road.length - 1)]
      if (!seg) continue

      const scale = getScale(i)
      const y = H - (DRAW_DIST - i) * segH * 0.65 - 40

      cumulX += seg.curve * scale * 14

      const centerX = W / 2 + (cumulX - px * 90) * scale
      const roadHalfW = ROAD_W * W * 0.5 * scale

      // Asphalt
      const isStripe = (segIdx % 6) < 3
      ctx.fillStyle = isStripe ? '#2d2d2d' : '#333333'
      ctx.fillRect(centerX - roadHalfW, y, roadHalfW * 2, segH + 1)

      // Center dashed line
      if ((segIdx % 4) < 2 && scale > 0.15) {
        ctx.fillStyle = '#FFD700'
        const dashW = Math.max(1, 3 * scale)
        ctx.fillRect(centerX - dashW / 2, y, dashW, segH * 0.6)
      }

      // Road edges (white lines)
      ctx.fillStyle = '#ffffff'
      const edgeW = Math.max(1, 3 * scale)
      ctx.fillRect(centerX - roadHalfW, y, edgeW, segH + 1)
      ctx.fillRect(centerX + roadHalfW - edgeW, y, edgeW, segH + 1)

      // Roadside rumble strips
      if ((segIdx % 3) === 0 && scale > 0.2) {
        ctx.fillStyle = '#ff4444'
        ctx.fillRect(centerX - roadHalfW - 4 * scale, y, 4 * scale, segH)
        ctx.fillRect(centerX + roadHalfW, y, 4 * scale, segH)
      }
    }

    // Motorcycle (player)
    const bikeX = W / 2
    const bikeY = H - 80
    const lean = -steerRef.current * 12

    ctx.save()
    ctx.translate(bikeX, bikeY)
    ctx.rotate(lean * Math.PI / 180)

    // Wheel back
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.ellipse(0, 18, 12, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 2
    ctx.stroke()

    // Body frame
    ctx.fillStyle = '#e63946'
    ctx.beginPath()
    ctx.moveTo(-6, 10)
    ctx.lineTo(-4, -15)
    ctx.lineTo(6, -20)
    ctx.lineTo(8, -5)
    ctx.lineTo(6, 10)
    ctx.closePath()
    ctx.fill()

    // Handlebar
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-10, -18)
    ctx.lineTo(10, -18)
    ctx.stroke()

    // Headlight
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(2, -22, 3, 0, Math.PI * 2)
    ctx.fill()

    // Rider silhouette
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.ellipse(0, -30, 7, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    // Helmet
    ctx.fillStyle = '#e63946'
    ctx.beginPath()
    ctx.arc(0, -38, 7, 0, Math.PI * 2)
    ctx.fill()
    // Visor
    ctx.fillStyle = '#111'
    ctx.fillRect(-5, -38, 10, 4)

    ctx.restore()

    // Speed lines
    if (speedRef.current > 100) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const lx = bikeX + (Math.random() - 0.5) * 60
        const ly = bikeY - 30 + Math.random() * 40
        ctx.beginPath()
        ctx.moveTo(lx, ly)
        ctx.lineTo(lx, ly + 15 + Math.random() * 10)
        ctx.stroke()
      }
    }

    // Out-of-bounds warning
    const lvl = LEVELS[lvlIdx]
    if (Math.abs(playerXRef.current) > lvl.tolerance * 0.75) {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.12)'
      ctx.fillRect(0, 0, W, H)
    }
  }, [])

  const gameLoop = useCallback((time: number) => {
    if (phaseRef.current !== 'playing') return
    if (!lastTimeRef.current) lastTimeRef.current = time
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = time

    const lvlIdx = levelRef.current
    const lvl = LEVELS[lvlIdx]

    // Gradually speed up
    speedRef.current = Math.min(lvl.speed * 1.8, lvl.speed + posRef.current * 0.02)
    setSpeed(Math.floor(speedRef.current))

    posRef.current += speedRef.current * dt
    const seg = Math.floor(posRef.current)
    setProgress(Math.min(1, seg / lvl.length))

    const road = roadRef.current
    const currentCurve = road[Math.min(seg, road.length - 1)]?.curve ?? 0
    // Curve pushes player outward
    playerXRef.current += currentCurve * dt * 2.8
    // Player steering input
    playerXRef.current += steerRef.current * dt * 3.2
    playerXRef.current = Math.max(-1.5, Math.min(1.5, playerXRef.current))

    setPlayerX(playerXRef.current)

    // Off-road check
    hitCooldown.current = Math.max(0, hitCooldown.current - dt)
    if (Math.abs(playerXRef.current) > lvl.tolerance) {
      if (hitCooldown.current <= 0) {
        hitCooldown.current = 0.6
        livesRef.current -= 1
        comboRef.current = 0
        setLives(livesRef.current)
        setCombo(0)
        playWrong()
        if (navigator.vibrate) navigator.vibrate(80)

        if (livesRef.current <= 0) {
          phaseRef.current = 'done'
          setPhase('done')
          return
        }
      }
    } else {
      scoreRef.current += Math.round(speedRef.current * dt * 0.8)
      comboRef.current = Math.min(99, comboRef.current + Math.round(dt * 4))
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
      setScore(scoreRef.current)
      setCombo(comboRef.current)
      setMaxCombo(maxComboRef.current)
    }

    // Finish
    if (seg >= lvl.length) {
      playCorrect()
      phaseRef.current = 'done'
      setPhase('done')
      setProgress(1)
      return
    }

    drawRoad(seg, lvlIdx)
    frameRef.current = requestAnimationFrame(gameLoop)
  }, [drawRoad])

  // Pointer steering
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const normalized = ((x / rect.width) - 0.5) * 2
    steerRef.current = Math.max(-1, Math.min(1, normalized * 1.5))
    setSteer(steerRef.current)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!e.buttons) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const normalized = ((x / rect.width) - 0.5) * 2
    steerRef.current = Math.max(-1, Math.min(1, normalized * 1.5))
    setSteer(steerRef.current)
  }, [])

  const onPointerUp = useCallback(() => {
    steerRef.current = 0
    setSteer(0)
  }, [])

  // Keyboard
  useEffect(() => {
    const keys = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      keys.add(e.key)
      if (e.key === 'ArrowLeft' || e.key === 'a') { steerRef.current = -1; setSteer(-1) }
      if (e.key === 'ArrowRight' || e.key === 'd') { steerRef.current = 1; setSteer(1) }
    }
    const onUp = (e: KeyboardEvent) => {
      keys.delete(e.key)
      if (!keys.has('ArrowLeft') && !keys.has('a') && !keys.has('ArrowRight') && !keys.has('d')) {
        steerRef.current = 0
        setSteer(0)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

  const isOutOfBounds = Math.abs(playerX) > (LEVELS[level]?.tolerance ?? 0.5) * 0.75

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link to="/game" className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 mb-2">
        <ChevronLeft size={20} /> 게임 홈
      </Link>
      <h1 className="text-3xl font-bold text-red-400 text-center mb-2">🏍️ 오토바이 러시</h1>

      {phase === 'playing' && (
        <div className="flex justify-between items-center max-w-sm mx-auto w-full mb-2 gap-2">
          <div className="flex-1 bg-gray-800 rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-yellow-400">
            ⭐ {score}
          </div>
          <div className="flex-1 bg-gray-800 rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-orange-400">
            🔥 {combo}
          </div>
          <div className="flex-1 bg-gray-800 rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-red-400">
            {'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <div className="max-w-sm mx-auto w-full mb-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
            <span>{Math.floor(progress * 100)}%</span>
            <span>{speed} km/h</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-red-500 rounded-full transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center">
        {phase === 'idle' && (
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center px-4">
            <div className="text-7xl mb-4">🏍️</div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">오토바이 러시!</h2>
            <p className="text-gray-400 mb-1">커브 도로를 따라 달려요!</p>
            <p className="text-gray-500 text-sm mb-1">← → / 화면 좌우 터치로 조향</p>
            <p className="text-gray-500 text-sm mb-6">도로에서 벗어나면 충돌!</p>
            <div className="flex flex-col gap-3">
              {LEVELS.map((l, i) => (
                <button
                  key={i}
                  onClick={() => handleStart(i)}
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-lg font-bold rounded-2xl shadow-lg transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'playing' && (
          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className={`rounded-2xl shadow-lg border-2 ${isOutOfBounds ? 'border-red-500' : 'border-gray-700'} transition-colors`}
              style={{ touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="flex items-center gap-4 text-gray-500 text-sm">
              <span className={`transition-colors ${steer < 0 ? 'text-red-400 font-bold' : ''}`}>◀ 왼쪽</span>
              <span className="w-10 h-1.5 bg-gray-700 rounded relative overflow-hidden">
                <span
                  className="absolute top-0 h-full w-3 bg-red-500 rounded transition-[left] duration-75"
                  style={{ left: `${(steer + 1) / 2 * 100 - 15}%` }}
                />
              </span>
              <span className={`transition-colors ${steer > 0 ? 'text-red-400 font-bold' : ''}`}>오른쪽 ▶</span>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center p-8 bg-gray-800 rounded-3xl shadow-xl max-w-sm w-full mx-4 border border-gray-700">
            <div className="text-6xl mb-3">{progress >= 1 ? '🏆' : '💥'}</div>
            <h2 className="text-2xl font-bold text-red-400 mb-1">
              {progress >= 1 ? '완주 성공!' : '충돌!'}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              {progress >= 1 ? '멋진 라이더!' : `${Math.floor(progress * 100)}% 진행`}
            </p>
            <div className="text-4xl font-bold text-yellow-400 mb-1">{score}점</div>
            <p className="text-gray-500 text-xs mb-6">최대 콤보: {maxCombo} 🔥</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleStart(level)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow transition-colors"
              >
                다시하기 🔄
              </button>
              <Link
                to="/game"
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-xl shadow transition-colors"
              >
                게임 홈
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
