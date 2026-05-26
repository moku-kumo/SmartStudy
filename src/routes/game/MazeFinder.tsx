import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { playCorrect } from '@/lib/audio'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGameTimer } from '@/hooks/useGameTimer'

// ── 미로 생성 (반복적 DFS) ─────────────────────────────────
const N = 1, E = 2, S = 4, W = 8
const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E }
const DELTA: Record<number, [number, number]> = {
  [N]: [-1, 0], [E]: [0, 1], [S]: [1, 0], [W]: [0, -1],
}

function generateMaze(rows: number, cols: number): number[][] {
  const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
  const stack: [number, number][] = [[0, 0]]
  visited[0][0] = true

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]
    const dirs = [N, E, S, W].filter((d) => {
      const [dr, dc] = DELTA[d]
      const nr = r + dr, nc = c + dc
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]
    })

    if (dirs.length === 0) {
      stack.pop()
    } else {
      const dir = dirs[Math.floor(Math.random() * dirs.length)]
      const [dr, dc] = DELTA[dir]
      const nr = r + dr, nc = c + dc
      grid[r][c] |= dir
      grid[nr][nc] |= OPP[dir]
      visited[nr][nc] = true
      stack.push([nr, nc])
    }
  }
  return grid
}

// ── 레벨 설정 ─────────────────────────────────────────────
const LEVELS = [
  { rows: 6,  cols: 8,  time: 45, label: '레벨 1 🌱' },
  { rows: 8,  cols: 10, time: 60, label: '레벨 2 🌿' },
  { rows: 10, cols: 12, time: 75, label: '레벨 3 🌳' },
]

type Phase = 'idle' | 'playing' | 'levelup' | 'done'

// ── 컴포넌트 ──────────────────────────────────────────────
export default function MazeFinder() {
  useGameTimer()
  const { soundEnabled } = useSettingsStore()

  const [phase, setPhase]       = useState<Phase>('idle')
  const [level, setLevel]       = useState(0)
  const [maze, setMaze]         = useState<number[][]>([])
  const [playerR, setPlayerR]   = useState(0)
  const [playerC, setPlayerC]   = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [score, setScore]       = useState(0)
  const [won, setWon]           = useState(false)

  // 클로저에서 최신 값 참조용 refs
  const phaseRef    = useRef<Phase>('idle')
  const levelRef    = useRef(0)
  const playerRRef  = useRef(0)
  const playerCRef  = useRef(0)
  const mazeRef     = useRef<number[][]>([])
  const timeLeftRef = useRef(0)
  const scoreRef    = useRef(0)
  const timerRef    = useRef<ReturnType<typeof setInterval>>(undefined)

  // 화면 크기에 따라 셀 크기 결정
  const cellSize = useMemo(() => {
    const maxW = Math.min(window.innerWidth - 40, 480)
    const maxH = Math.min(window.innerHeight - 260, 420)
    const { rows, cols } = LEVELS[level]
    return Math.max(24, Math.min(52, Math.floor(Math.min(maxW / cols, maxH / rows))))
  }, [level])

  // ── 타이머 시작 ────────────────────────────────────────
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) {
        clearInterval(timerRef.current)
        phaseRef.current = 'done'
        setPhase('done')
        setWon(false)
      }
    }, 1000)
  }, [])

  // ── 레벨 초기화 ────────────────────────────────────────
  const startLevel = useCallback((lvl: number) => {
    const { rows, cols, time } = LEVELS[lvl]
    const m = generateMaze(rows, cols)
    mazeRef.current    = m
    levelRef.current   = lvl
    playerRRef.current = 0
    playerCRef.current = 0
    timeLeftRef.current = time

    setMaze(m)
    setLevel(lvl)
    setPlayerR(0)
    setPlayerC(0)
    setTimeLeft(time)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  // ── 게임 시작 ──────────────────────────────────────────
  const handleStart = useCallback(() => {
    scoreRef.current = 0
    setScore(0)
    setWon(false)
    startLevel(0)
    setTimeout(() => startTimer(), 50)
  }, [startLevel, startTimer])

  // ── 이동 처리 ──────────────────────────────────────────
  // ── 벽 충돌 피드백 ───────────────────────────────────────
  const [wallBump, setWallBump] = useState(0)

  const tryMove = useCallback((dir: number) => {
    if (phaseRef.current !== 'playing') return
    const r = playerRRef.current
    const c = playerCRef.current
    const cell = mazeRef.current[r]?.[c]
    if (cell === undefined || !(cell & dir)) {
      // 벽 충돌: 진동 + 시각 피드백
      if (navigator.vibrate) navigator.vibrate(40)
      setWallBump((n) => n + 1)
      return
    }

    const [dr, dc] = DELTA[dir]
    const nr = r + dr, nc = c + dc
    playerRRef.current = nr
    playerCRef.current = nc
    setPlayerR(nr)
    setPlayerC(nc)

    // 출구 도달 확인
    const lvl = levelRef.current
    const { rows: lvlR, cols: lvlC } = LEVELS[lvl]
    if (nr === lvlR - 1 && nc === lvlC - 1) {
      clearInterval(timerRef.current)
      const bonus = timeLeftRef.current * 10
      scoreRef.current += bonus
      setScore(scoreRef.current)
      if (soundEnabled) playCorrect()

      if (lvl < LEVELS.length - 1) {
        phaseRef.current = 'levelup'
        setPhase('levelup')
        setTimeout(() => {
          startLevel(lvl + 1)
          setTimeout(() => startTimer(), 50)
        }, 1800)
      } else {
        phaseRef.current = 'done'
        setPhase('done')
        setWon(true)
      }
    }
  }, [soundEnabled, startLevel, startTimer])

  // ── 키보드 입력 ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp'    || e.key === 'w') { e.preventDefault(); tryMove(N) }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); tryMove(E) }
      if (e.key === 'ArrowDown'  || e.key === 's') { e.preventDefault(); tryMove(S) }
      if (e.key === 'ArrowLeft'  || e.key === 'a') { e.preventDefault(); tryMove(W) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryMove])

  // ── 터치 스와이프 (SVG 전용) ────────────────────────────
  const touchStartRef = useRef<[number, number] | null>(null)
  const onSvgTouchStart = (e: React.TouchEvent) => {
    e.preventDefault() // 스크롤 방지
    const t = e.touches[0]
    touchStartRef.current = [t.clientX, t.clientY]
  }
  const onSvgTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (!touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current[0]
    const dy = t.clientY - touchStartRef.current[1]
    touchStartRef.current = null
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? E : W)
    else tryMove(dy > 0 ? S : N)
  }

  // 언마운트 시 타이머 정리
  useEffect(() => () => clearInterval(timerRef.current), [])

  // ── SVG 미로 렌더링 ────────────────────────────────────
  const { rows, cols } = LEVELS[level]
  const mazeW = cols * cellSize
  const mazeH = rows * cellSize
  const wallColor  = '#6d28d9'
  const wallWidth  = Math.max(2, Math.ceil(cellSize / 14))
  const emojiSize  = Math.floor(cellSize * 0.68)

  const wallLines = useMemo(() => {
    if (!maze.length) return []
    const lines: React.ReactElement[] = []
    maze.forEach((row, r) => {
      row.forEach((cell, c) => {
        const x = c * cellSize, y = r * cellSize
        if (!(cell & S) && r < rows - 1)
          lines.push(<line key={`s${r}_${c}`} x1={x} y1={y + cellSize} x2={x + cellSize} y2={y + cellSize} stroke={wallColor} strokeWidth={wallWidth} strokeLinecap="round" />)
        if (!(cell & E) && c < cols - 1)
          lines.push(<line key={`e${r}_${c}`} x1={x + cellSize} y1={y} x2={x + cellSize} y2={y + cellSize} stroke={wallColor} strokeWidth={wallWidth} strokeLinecap="round" />)
      })
    })
    return lines
  }, [maze, cellSize, rows, cols, wallWidth])

  const isActive = phase === 'playing' || phase === 'levelup'

  return (
    <div className="min-h-dvh bg-gradient-to-br from-purple-50 to-indigo-50 flex flex-col p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* 상단 */}
      <Link to="/game" className="inline-flex items-center gap-1 text-purple-500 hover:text-purple-700 mb-2">
        <ChevronLeft size={20} /> 게임 홈
      </Link>
      <h1 className="text-3xl font-bold text-purple-700 text-center mb-2">🌀 미로찾기</h1>

      {/* 점수 / 타이머 */}
      {isActive && (
        <div className="flex justify-between items-center max-w-sm mx-auto w-full mb-3 gap-2">
          <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow text-center text-sm font-bold text-yellow-600">
            ⭐ {score}점
          </div>
          <div className={`flex-1 rounded-xl px-3 py-2 shadow text-center text-sm font-bold transition-colors ${timeLeft <= 10 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-white text-blue-600'}`}>
            ⏱ {timeLeft}초
          </div>
          <div className="flex-1 bg-white rounded-xl px-3 py-2 shadow text-center text-xs font-bold text-gray-500">
            {LEVELS[level].label}
          </div>
        </div>
      )}

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">

        {/* ── 시작 화면 ── */}
        {phase === 'idle' && (
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center px-4"
          >
            <div className="text-7xl mb-4">🌀</div>
            <h2 className="text-2xl font-bold text-purple-700 mb-2">미로를 탈출하라!</h2>
            <p className="text-gray-500 mb-1">🐭 쥐를 출구 🏁 까지 이동시키세요</p>
            <p className="text-gray-400 text-sm mb-1">방향키 / WASD · 화면 스와이프 · 버튼</p>
            <p className="text-gray-400 text-sm mb-6">빨리 클리어할수록 보너스 점수!</p>
            <div className="flex gap-2 justify-center text-sm text-gray-400 mb-6">
              {LEVELS.map((l, i) => (
                <span key={i} className="bg-white rounded-lg px-3 py-1 shadow-sm border border-purple-100">
                  {l.label} {l.cols}×{l.rows}
                </span>
              ))}
            </div>
            <button
              onClick={handleStart}
              className="px-10 py-4 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white text-xl font-bold rounded-2xl shadow-lg transition-colors"
            >
              시작하기 🚀
            </button>
          </motion.div>
        )}

        {/* ── 게임 화면 ── */}
        {(phase === 'playing' || phase === 'levelup') && maze.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            {/* SVG 미로 — 스와이프는 여기서만 */}
            <svg
              width={mazeW}
              height={mazeH}
              style={{ display: 'block', borderRadius: 8, border: `${wallWidth * 2}px solid ${wallColor}`, touchAction: 'none' }}
              onTouchStart={onSvgTouchStart}
              onTouchEnd={onSvgTouchEnd}
            >
              {/* 배경 */}
              <rect x={0} y={0} width={mazeW} height={mazeH} fill="#ede9fe" />
              {/* 시작 셀 */}
              <rect x={0} y={0} width={cellSize} height={cellSize} fill="#c4b5fd" rx={3} />
              {/* 출구 셀 */}
              <rect
                x={(cols - 1) * cellSize} y={(rows - 1) * cellSize}
                width={cellSize} height={cellSize}
                fill="#fde68a" rx={3}
              />
              {/* 벽 */}
              {wallLines}
              {/* 출구 이모지 */}
              <text
                x={(cols - 1) * cellSize + cellSize / 2}
                y={(rows - 1) * cellSize + cellSize / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={emojiSize}
              >🏁</text>
              {/* 플레이어 (부드럽게 이동 + 벽 충돌 시 흔들림) */}
              <motion.g
                animate={{
                  x: playerC * cellSize + cellSize / 2,
                  y: playerR * cellSize + cellSize / 2,
                }}
                transition={{ type: 'tween', duration: 0.08 }}
              >
                <motion.text
                  key={wallBump}
                  textAnchor="middle" dominantBaseline="middle" fontSize={emojiSize}
                  animate={wallBump > 0 ? { x: [-4, 4, -3, 3, 0] } : {}}
                  transition={{ duration: 0.25 }}
                >🐭</motion.text>
              </motion.g>
            </svg>

            {/* D-패드 */}
            <div className="grid grid-cols-3 gap-2 select-none">
              <div />
              <DPadBtn onClick={() => tryMove(N)}>▲</DPadBtn>
              <div />
              <DPadBtn onClick={() => tryMove(W)}>◀</DPadBtn>
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-2xl">🐭</div>
              <DPadBtn onClick={() => tryMove(E)}>▶</DPadBtn>
              <div />
              <DPadBtn onClick={() => tryMove(S)}>▼</DPadBtn>
              <div />
            </div>
          </div>
        )}

        {/* ── 완료 화면 ── */}
        {phase === 'done' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4"
          >
            <div className="text-6xl mb-3">{won ? '🎉' : '😢'}</div>
            <h2 className="text-2xl font-bold text-purple-700 mb-1">
              {won ? '완전 클리어!' : '시간 초과!'}
            </h2>
            <p className="text-gray-400 text-sm mb-3">
              {won ? '모든 미로를 탈출했어요! 대단해요!' : '아쉬워요, 다시 도전해봐요!'}
            </p>
            <div className="text-5xl font-bold text-yellow-500 mb-1">{score}점</div>
            <p className="text-gray-300 text-xs mb-6">남은 시간 × 10점</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleStart}
                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl shadow transition-colors"
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

      {/* ── 레벨업 오버레이 ── */}
      <AnimatePresence>
        {phase === 'levelup' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.4, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="bg-white rounded-3xl px-10 py-8 text-center shadow-2xl"
            >
              <div className="text-5xl mb-2">🎊</div>
              <div className="text-2xl font-bold text-purple-700">레벨 클리어!</div>
              <div className="text-purple-400 mt-1">다음 레벨로 이동 중...</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── D-패드 버튼 ───────────────────────────────────────────
function DPadBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick() }}
      className="w-16 h-16 bg-white hover:bg-purple-50 active:bg-purple-200 rounded-2xl shadow-md text-2xl flex items-center justify-center border-2 border-purple-200 transition-colors select-none"
    >
      {children}
    </button>
  )
}
