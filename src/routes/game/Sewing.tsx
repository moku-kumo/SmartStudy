import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { playCorrect, playWrong } from '@/lib/audio'
import { useGameTimer } from '@/hooks/useGameTimer'

// -- Road: array of x-offsets for center of road --
function generateRoad(length: number, difficulty: number): number[] {
  const road: number[] = []
  let x = 0
  let dx = 0
  const STRAIGHT_ROWS = 45 // ~3초간 직선 구간
  // Use sine-based curves for smooth roads
  const numCurves = Math.floor(length / 40) + 5
  const curves: { start: number; len: number; amp: number }[] = []
  for (let c = 0; c < numCurves; c++) {
    const start = STRAIGHT_ROWS + Math.floor((c / numCurves) * (length - STRAIGHT_ROWS))
    const len = 35 + Math.floor(Math.random() * 50)
    const amp = (0.6 + Math.random() * 1.0) * difficulty * 0.7 * (Math.random() > 0.5 ? 1 : -1)
    curves.push({ start, len, amp })
  }
  for (let i = 0; i < length; i++) {
    let target = 0
    for (const c of curves) {
      if (i >= c.start && i < c.start + c.len) {
        const t = (i - c.start) / c.len
        target += c.amp * Math.sin(t * Math.PI)
      }
    }
    target = Math.max(-3, Math.min(3, target))
    // Smooth interpolation
    dx = (target - x) * 0.12
    x += dx
    road.push(x)
  }
  return road
}

const LEVELS = [
  { speed: 200, length: 500, difficulty: 2.5, roadW: 50, label: '쉬움 🟢' },
  { speed: 270, length: 650, difficulty: 3.5, roadW: 38, label: '보통 🟡' },
  { speed: 340, length: 800, difficulty: 4.5, roadW: 30, label: '어려움 🔴' },
]

const W = 320
const H = 520
const ROWS = 60 // visible road rows

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
  const [steer, setSteer] = useState(0)
  const [speed, setSpeed] = useState(0)

  const phaseRef = useRef<Phase>('idle')
  const roadRef = useRef<number[]>([])
  const posRef = useRef(0)
  const bikeXRef = useRef(W / 2)
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
  const shakeRef = useRef(0)

  const handleStart = useCallback((lvl: number) => {
    roadRef.current = generateRoad(LEVELS[lvl].length + ROWS, LEVELS[lvl].difficulty)
    posRef.current = 0
    bikeXRef.current = W / 2
    steerRef.current = 0
    livesRef.current = 3
    scoreRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    lastTimeRef.current = 0
    hitCooldown.current = 0
    levelRef.current = lvl
    speedRef.current = LEVELS[lvl].speed
    shakeRef.current = 0

    setLevel(lvl)
    setPhase('playing')
    phaseRef.current = 'playing'
    setSteer(0)
    setLives(3)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setProgress(0)
    setSpeed(LEVELS[lvl].speed)

    frameRef.current = requestAnimationFrame(gameLoop)
  }, [])

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const road = roadRef.current
    const pos = posRef.current
    const seg = Math.floor(pos)
    const frac = pos - seg
    const lvl = LEVELS[levelRef.current]
    const roadW = lvl.roadW
    const bikeX = bikeXRef.current
    const rowH = H / ROWS

    // Shake
    ctx.save()
    if (shakeRef.current > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4)
    }

    // Background (grass/dirt)
    ctx.fillStyle = '#2d5a27'
    ctx.fillRect(0, 0, W, H)

    // Draw road rows (top to bottom = far to near)
    for (let i = 0; i < ROWS; i++) {
      const roadIdx = seg + (ROWS - i)
      if (roadIdx < 0 || roadIdx >= road.length) continue

      const roadCenterOffset = road[roadIdx] * 30 // scale to pixels
      const y = i * rowH - frac * rowH
      const centerX = W / 2 + roadCenterOffset

      // Asphalt
      const stripe = (roadIdx % 4) < 2
      ctx.fillStyle = stripe ? '#3a3a3a' : '#424242'
      ctx.fillRect(centerX - roadW / 2, y, roadW, rowH + 1)

      // White edge lines
      ctx.fillStyle = '#ddd'
      ctx.fillRect(centerX - roadW / 2 - 2, y, 3, rowH + 1)
      ctx.fillRect(centerX + roadW / 2 - 1, y, 3, rowH + 1)

      // Center dashes
      if ((roadIdx % 6) < 3) {
        ctx.fillStyle = '#FFD700'
        ctx.fillRect(centerX - 1, y, 2, rowH * 0.5)
      }

      // Rumble strips
      if ((roadIdx % 3) === 0) {
        ctx.fillStyle = '#cc3333'
        ctx.fillRect(centerX - roadW / 2 - 6, y, 4, rowH + 1)
        ctx.fillRect(centerX + roadW / 2 + 2, y, 4, rowH + 1)
      }
    }

    // Bike position (fixed at bottom area)
    const bikeY = H - 70
    const leanAngle = steerRef.current * 15

    ctx.save()
    ctx.translate(bikeX, bikeY)
    ctx.rotate(leanAngle * Math.PI / 180)

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 20, 14, 5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Back wheel
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.ellipse(0, 14, 10, 5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Body
    ctx.fillStyle = '#e63946'
    ctx.fillRect(-5, -10, 10, 22)
    ctx.fillStyle = '#b71c1c'
    ctx.fillRect(-4, -4, 8, 10)

    // Front wheel
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.ellipse(0, -12, 8, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // Headlight
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(0, -16, 3, 0, Math.PI * 2)
    ctx.fill()

    // Rider
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.ellipse(0, -2, 6, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e63946'
    ctx.beginPath()
    ctx.arc(0, -10, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    // Off-road indicator
    const currentRoadIdx = seg + 5
    if (currentRoadIdx < road.length) {
      const roadCenter = W / 2 + road[currentRoadIdx] * 30
      const dist = Math.abs(bikeX - roadCenter)
      if (dist > roadW / 2 * 0.7) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'
        ctx.fillRect(0, 0, W, H)
      }
    }

    ctx.restore()
  }, [])

  const gameLoop = useCallback((time: number) => {
    if (phaseRef.current !== 'playing') return
    if (!lastTimeRef.current) lastTimeRef.current = time
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = time

    const lvlIdx = levelRef.current
    const lvl = LEVELS[lvlIdx]

    // Speed gradually increases
    speedRef.current = Math.min(lvl.speed * 1.6, lvl.speed + posRef.current * 0.015)
    setSpeed(Math.floor(speedRef.current))

    // Advance position
    posRef.current += speedRef.current * dt * 0.15
    const seg = Math.floor(posRef.current)
    setProgress(Math.min(1, seg / lvl.length))

    // Steer bike
    bikeXRef.current += steerRef.current * 220 * dt
    bikeXRef.current = Math.max(20, Math.min(W - 20, bikeXRef.current))

    // Check if on road
    const checkIdx = seg + 5 // check slightly ahead where bike is visually
    const road = roadRef.current
    const roadCenter = W / 2 + (road[Math.min(checkIdx, road.length - 1)] ?? 0) * 30
    const dist = Math.abs(bikeXRef.current - roadCenter)
    const halfRoad = lvl.roadW / 2

    hitCooldown.current = Math.max(0, hitCooldown.current - dt)
    shakeRef.current = Math.max(0, shakeRef.current - dt)

    if (dist > halfRoad) {
      // Off road!
      if (hitCooldown.current <= 0) {
        hitCooldown.current = 0.7
        shakeRef.current = 0.3
        livesRef.current--
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
      // On road - score
      scoreRef.current += Math.round(speedRef.current * dt * 0.5)
      comboRef.current = Math.min(99, comboRef.current + Math.round(dt * 3))
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

    drawFrame()
    frameRef.current = requestAnimationFrame(gameLoop)
  }, [drawFrame])

  // Pointer controls
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
              className={`rounded-2xl shadow-lg border-2 border-gray-700 transition-colors`}
              style={{ touchAction: 'none', maxHeight: '60vh', width: 'auto' }}
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
