import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { playCorrect, playWrong } from '@/lib/audio'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGameTimer } from '@/hooks/useGameTimer'
import { randInt } from '@/lib/random'

// ── 경로 생성 (스크롤 세그먼트) ───────────────────────────
// 화면 높이를 세그먼트로 나누고, 각 세그먼트에서 X가 부드럽게 이동
interface PathPoint {
  y: number
  x: number // 0~1 normalized
}

function generatePath(segCount: number): PathPoint[] {
  const points: PathPoint[] = []
  let x = 0.5
  for (let i = 0; i <= segCount; i++) {
    points.push({ y: i, x })
    // 다음 위치: 부드러운 곡선을 위해 제한된 변화
    const delta = (Math.random() - 0.5) * 0.35
    x = Math.max(0.15, Math.min(0.85, x + delta))
  }
  return points
}

// 두 포인트 사이를 보간 (linear)
function interpolateX(points: PathPoint[], y: number): number {
  if (y <= 0) return points[0].x
  if (y >= points.length - 1) return points[points.length - 1].x
  const i = Math.floor(y)
  const t = y - i
  return points[i].x + (points[i + 1].x - points[i].x) * t
}

// ── 레벨 설정 ─────────────────────────────────────────────
const LEVELS = [
  { speed: 100, segments: 20, tolerance: 0.12, label: '쉬움 🌱' },
  { speed: 140, segments: 30, tolerance: 0.09, label: '보통 🌿' },
  { speed: 180, segments: 40, tolerance: 0.07, label: '어려움 🌳' },
]

const GAME_AREA_W = 320
const GAME_AREA_H = 480
const STITCH_INTERVAL = 12 // px 간격마다 스티치 점 생성

type Phase = 'idle' | 'playing' | 'done'

export default function Sewing() {
  useGameTimer()
  const { soundEnabled } = useSettingsStore()

  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [lives, setLives] = useState(3)
  const [progress, setProgress] = useState(0) // 0~1
  const [needleX, setNeedleX] = useState(0.5) // 0~1
  const [stitches, setStitches] = useState<{ x: number; y: number; good: boolean }[]>([])

  // Refs
  const phaseRef = useRef<Phase>('idle')
  const needleXRef = useRef(0.5)
  const scrollRef = useRef(0) // 현재 스크롤 위치 (세그먼트 단위)
  const pathRef = useRef<PathPoint[]>([])
  const frameRef = useRef<number>(undefined)
  const lastTimeRef = useRef(0)
  const livesRef = useRef(3)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const lastStitchY = useRef(0)
  const areaRef = useRef<HTMLDivElement>(null)

  // 터치/마우스 위치 추적
  const dragging = useRef(false)

  const currentLevel = LEVELS[level]

  // ── 시작 ───────────────────────────────────────────────
  const handleStart = useCallback((lvl: number) => {
    const path = generatePath(LEVELS[lvl].segments)
    pathRef.current = path
    scrollRef.current = 0
    needleXRef.current = path[0].x
    livesRef.current = 3
    scoreRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    lastStitchY.current = 0
    lastTimeRef.current = 0

    setLevel(lvl)
    setPhase('playing')
    phaseRef.current = 'playing'
    setNeedleX(path[0].x)
    setLives(3)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setProgress(0)
    setStitches([])

    frameRef.current = requestAnimationFrame(gameLoop)
  }, [])

  // ── 게임 루프 ─────────────────────────────────────────
  const gameLoop = useCallback((time: number) => {
    if (phaseRef.current !== 'playing') return
    if (!lastTimeRef.current) lastTimeRef.current = time
    const dt = (time - lastTimeRef.current) / 1000
    lastTimeRef.current = time

    const lvl = LEVELS[level]
    // 스크롤 진행
    const segPerSec = lvl.speed / GAME_AREA_H * (lvl.segments)
    scrollRef.current += segPerSec * dt
    const prog = scrollRef.current / lvl.segments
    setProgress(Math.min(1, prog))

    // 스티치 판정 (일정 간격마다)
    const pixelY = scrollRef.current * (GAME_AREA_H / lvl.segments)
    if (pixelY - lastStitchY.current >= STITCH_INTERVAL) {
      lastStitchY.current = pixelY
      const pathX = interpolateX(pathRef.current, scrollRef.current)
      const diff = Math.abs(needleXRef.current - pathX)
      const good = diff <= lvl.tolerance

      if (good) {
        scoreRef.current += 10 + comboRef.current * 2
        comboRef.current += 1
        if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
        setScore(scoreRef.current)
        setCombo(comboRef.current)
        setMaxCombo(maxComboRef.current)
      } else {
        comboRef.current = 0
        setCombo(0)
        livesRef.current -= 1
        setLives(livesRef.current)
        if (soundEnabled) playWrong()
        if (navigator.vibrate) navigator.vibrate(50)
      }

      // 스티치 포인트 추가 (최대 50개 유지)
      setStitches((prev) => {
        const next = [...prev, { x: needleXRef.current, y: scrollRef.current, good }]
        return next.length > 50 ? next.slice(-50) : next
      })

      if (livesRef.current <= 0) {
        phaseRef.current = 'done'
        setPhase('done')
        return
      }
    }

    // 완료 체크
    if (scrollRef.current >= lvl.segments) {
      if (soundEnabled) playCorrect()
      phaseRef.current = 'done'
      setPhase('done')
      setProgress(1)
      return
    }

    frameRef.current = requestAnimationFrame(gameLoop)
  }, [level, soundEnabled])

  // ── 바늘 위치 업데이트 (포인터 추적) ────────────────────
  const updateNeedle = useCallback((clientX: number) => {
    const area = areaRef.current
    if (!area) return
    const rect = area.getBoundingClientRect()
    const x = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width))
    needleXRef.current = x
    setNeedleX(x)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    updateNeedle(e.clientX)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [updateNeedle])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    updateNeedle(e.clientX)
  }, [updateNeedle])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // 클린업
  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
  }, [])

  // ── 경로 SVG 그리기 ────────────────────────────────────
  const visiblePath = useMemo(() => {
    if (!pathRef.current.length || phase === 'idle') return ''
    const points = pathRef.current
    const viewStart = scrollRef.current
    const viewEnd = viewStart + 5 // 5 세그먼트 분량 보여줌
    const pathParts: string[] = []

    for (let y = viewStart; y <= Math.min(viewEnd, points.length - 1); y += 0.1) {
      const x = interpolateX(points, y) * GAME_AREA_W
      const screenY = GAME_AREA_H - ((y - viewStart) / (viewEnd - viewStart)) * GAME_AREA_H
      pathParts.push(`${pathParts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${screenY.toFixed(1)}`)
    }
    return pathParts.join(' ')
  }, [phase, progress])

  // 바늘 SVG 위치
  const needleScreenX = needleX * GAME_AREA_W

  return (
    <div className="min-h-dvh bg-gradient-to-br from-rose-50 to-amber-50 flex flex-col p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link to="/game" className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-700 mb-2">
        <ChevronLeft size={20} /> 게임 홈
      </Link>
      <h1 className="text-3xl font-bold text-rose-700 text-center mb-2">🪡 바느질</h1>

      {/* 점수/콤보/목숨 */}
      {phase === 'playing' && (
        <div className="flex justify-between items-center max-w-sm mx-auto w-full mb-2 gap-2">
          <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-yellow-600">
            ⭐ {score}
          </div>
          <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-orange-500">
            🔥 {combo}콤보
          </div>
          <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-red-500">
            {'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}
          </div>
        </div>
      )}

      {/* 진행바 */}
      {phase === 'playing' && (
        <div className="max-w-sm mx-auto w-full mb-3">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-rose-400 rounded-full"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>
      )}

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center">

        {/* ── 시작 화면 ── */}
        {phase === 'idle' && (
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center px-4"
          >
            <div className="text-7xl mb-4">🪡</div>
            <h2 className="text-2xl font-bold text-rose-700 mb-2">바느질 마스터!</h2>
            <p className="text-gray-500 mb-1">바늘을 좌우로 움직여 바느질 선을 따라가세요</p>
            <p className="text-gray-400 text-sm mb-6">선에서 벗어나면 하트가 줄어요!</p>
            <div className="flex flex-col gap-3">
              {LEVELS.map((l, i) => (
                <button
                  key={i}
                  onClick={() => handleStart(i)}
                  className="px-8 py-3 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── 게임 화면 ── */}
        {phase === 'playing' && (
          <div
            ref={areaRef}
            className="relative bg-amber-50 rounded-2xl shadow-inner border-2 border-amber-200 overflow-hidden select-none"
            style={{ width: GAME_AREA_W, height: GAME_AREA_H, touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* 천 패턴 배경 */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 15px, #d97706 15px, #d97706 16px), repeating-linear-gradient(90deg, transparent, transparent 15px, #d97706 15px, #d97706 16px)',
              }}
            />

            {/* SVG 오버레이 */}
            <svg width={GAME_AREA_W} height={GAME_AREA_H} className="absolute inset-0">
              {/* 가이드 선 (점선) */}
              <path
                d={visiblePath}
                fill="none"
                stroke="#f87171"
                strokeWidth={LEVELS[level].tolerance * GAME_AREA_W * 2}
                strokeLinecap="round"
                opacity={0.25}
              />
              <path
                d={visiblePath}
                fill="none"
                stroke="#ef4444"
                strokeWidth={3}
                strokeDasharray="8 6"
                strokeLinecap="round"
              />

              {/* 스티치 점들 */}
              {stitches.slice(-30).map((s, i) => {
                const viewStart = scrollRef.current
                const viewEnd = viewStart + 5
                const screenY = GAME_AREA_H - ((s.y - viewStart) / (viewEnd - viewStart)) * GAME_AREA_H
                if (screenY < -10 || screenY > GAME_AREA_H + 10) return null
                return (
                  <circle
                    key={i}
                    cx={s.x * GAME_AREA_W}
                    cy={screenY}
                    r={s.good ? 3 : 4}
                    fill={s.good ? '#22c55e' : '#ef4444'}
                    opacity={0.8}
                  />
                )
              })}

              {/* 바늘 (하단 고정) */}
              <g>
                <line
                  x1={needleScreenX} y1={GAME_AREA_H - 60}
                  x2={needleScreenX} y2={GAME_AREA_H - 20}
                  stroke="#6b7280" strokeWidth={2.5} strokeLinecap="round"
                />
                {/* 바늘 구멍 */}
                <circle
                  cx={needleScreenX} cy={GAME_AREA_H - 60}
                  r={4} fill="none" stroke="#6b7280" strokeWidth={1.5}
                />
                {/* 바늘 끝 */}
                <circle
                  cx={needleScreenX} cy={GAME_AREA_H - 18}
                  r={2} fill="#374151"
                />
              </g>
            </svg>

            {/* 바늘 이모지 (시각적 보조) */}
            <div
              className="absolute text-2xl pointer-events-none"
              style={{
                left: needleScreenX - 14,
                bottom: 8,
                transition: 'left 0.03s linear',
              }}
            >
              🪡
            </div>
          </div>
        )}

        {/* ── 결과 화면 ── */}
        {phase === 'done' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4"
          >
            <div className="text-6xl mb-3">{progress >= 1 ? '🎉' : '😢'}</div>
            <h2 className="text-2xl font-bold text-rose-700 mb-1">
              {progress >= 1 ? '바느질 완성!' : '실이 끊어졌어요!'}
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {progress >= 1 ? '완벽한 솜씨예요!' : `${Math.floor(progress * 100)}% 진행`}
            </p>
            <div className="text-4xl font-bold text-yellow-500 mb-1">{score}점</div>
            <p className="text-gray-400 text-xs mb-1">최대 콤보: {maxCombo} 🔥</p>
            <p className="text-gray-300 text-xs mb-6">
              {progress >= 1 && lives === 3 ? '⭐ 퍼펙트!' : ''}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleStart(level)}
                className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow transition-colors"
              >
                다시하기 🔄
              </button>
              <Link
                to="/game"
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl shadow transition-colors"
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
