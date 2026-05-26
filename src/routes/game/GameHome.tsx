import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Lock, Clock, Unlock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStudyTimeStore, getTodaySeconds, isGameUnlocked, canPlayGame, getRemainingGameSeconds, isTimeLimitOff, REQUIRED_STUDY_SECONDS } from '@/stores/studyTimeStore'
import SubjectCard from '@/components/SubjectCard'
import { randInt } from '@/lib/random'

function genMathProblem() {
  const a = randInt(2, 9)
  const b = randInt(2, 9)
  return { a, b, answer: a * b }
}

const games = [
  { to: '/game/whack', emoji: '🐹', label: '두더지잡기' },
  { to: '/game/dodge', emoji: '💩', label: '똥 피하기' },
  { to: '/game/spot', emoji: '🔍', label: '틀린그림찾기' },
  { to: '/game/maze', emoji: '🌀', label: '미로찾기' },
]

export default function GameHome() {
  const todaySeconds = useStudyTimeStore(getTodaySeconds)
  const unlocked = useStudyTimeStore(isGameUnlocked)
  const playable = useStudyTimeStore(canPlayGame)
  const remainingGame = useStudyTimeStore(getRemainingGameSeconds)
  const timeLimitOff = useStudyTimeStore(isTimeLimitOff)
  const setTimeLimitOff = useStudyTimeStore(s => s.setTimeLimitOff)
  const clearTimeLimitOff = useStudyTimeStore(s => s.clearTimeLimitOff)
  const required = REQUIRED_STUDY_SECONDS

  const mins = Math.floor(todaySeconds / 60)
  const secs = todaySeconds % 60
  const requiredMins = Math.floor(required / 60)
  const progress = Math.min(100, (todaySeconds / required) * 100)
  const remMins = Math.floor(remainingGame / 60)
  const remSecs = remainingGame % 60

  // 곱하기 문제 모달
  const [showMath, setShowMath] = useState(false)
  const [mathProblem, setMathProblem] = useState(() => genMathProblem())
  const [mathAnswer, setMathAnswer] = useState('')
  const [mathError, setMathError] = useState(false)

  const openMathModal = useCallback(() => {
    setMathProblem(genMathProblem())
    setMathAnswer('')
    setMathError(false)
    setShowMath(true)
  }, [])

  const checkMathAnswer = useCallback(() => {
    if (Number(mathAnswer) === mathProblem.answer) {
      setTimeLimitOff()
      setShowMath(false)
    } else {
      setMathError(true)
      setMathProblem(genMathProblem())
      setMathAnswer('')
    }
  }, [mathAnswer, mathProblem.answer, setTimeLimitOff])

  return (
    <div className="min-h-dvh bg-gradient-to-br from-pink-50 to-orange-50 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link to="/" className="inline-flex items-center gap-1 text-pink-500 hover:text-pink-700 mb-6">
        <ChevronLeft size={20} /> 홈으로
      </Link>
      <h1 className="text-4xl font-bold text-pink-600 mb-4 text-center">🎮 게임</h1>

      {/* 공부 시간 프로그레스 */}
      <div className="max-w-xs mx-auto mb-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1">
          <span>오늘 공부 시간</span>
          <span>{mins}분 {secs}초 / {requiredMins}분</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${unlocked ? 'bg-green-400' : 'bg-orange-400'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        {!unlocked && (
          <p className="text-center text-sm text-gray-400 mt-2">
            {requiredMins}분 이상 공부하면 게임을 할 수 있어요! 🔓
          </p>
        )}
      </div>

      {/* 남은 게임 시간 / 시간제한 해제 */}
      <div className="max-w-xs mx-auto mb-8 text-center">
        {timeLimitOff ? (
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-green-50 rounded-2xl px-4 py-2 shadow-sm border border-green-200">
              <Unlock size={18} className="text-green-500" />
              <span className="font-bold text-green-600">시간제한 해제됨! 🎉</span>
            </div>
            <button
              onClick={clearTimeLimitOff}
              className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-xl font-bold text-sm transition-colors shadow-md"
            >
              🔒 다시 잠그기
            </button>
          </div>
        ) : unlocked ? (
          <>
            <div className="inline-flex items-center gap-2 bg-white rounded-2xl px-4 py-2 shadow-sm">
              <Clock size={18} className={playable ? 'text-green-500' : 'text-red-400'} />
              <span className={`font-bold ${playable ? 'text-green-600' : 'text-red-500'}`}>
                남은 게임 시간: {remMins}분 {remSecs}초
              </span>
            </div>
            {playable ? (
              <p className="text-xs text-gray-400 mt-1">공부한 만큼 게임할 수 있어요!</p>
            ) : (
              <p className="text-xs text-red-400 mt-1">게임 시간을 다 썼어요! 더 공부하면 시간이 늘어나요 📚</p>
            )}
          </>
        ) : null}
        {!timeLimitOff && (
          <button
            onClick={openMathModal}
            className="mt-3 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold text-sm transition-colors shadow-md"
          >
            🧮 곱하기 문제 풀고 시간제한 해제
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto">
        {games.map((g, i) =>
          playable ? (
            <SubjectCard key={g.to} {...g} index={i} />
          ) : (
            <div
              key={g.to}
              className="relative flex flex-col items-center justify-center gap-2 rounded-3xl bg-gray-200 text-gray-400 p-8 min-h-[140px]"
            >
              <span className="text-5xl grayscale opacity-50">{g.emoji}</span>
              <span className="text-2xl font-bold">{g.label}</span>
              <Lock size={28} className="absolute top-4 right-4 text-gray-400" />
            </div>
          ),
        )}
      </div>

      {/* 곱하기 문제 모달 */}
      <AnimatePresence>
        {showMath && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setShowMath(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-center text-purple-600 mb-2">🧮 곱하기 문제</h3>
              <p className="text-center text-sm text-gray-400 mb-6">정답을 맞히면 게임 시간제한이 해제됩니다</p>
              <p className="text-4xl font-bold text-center mb-6">
                {mathProblem.a} × {mathProblem.b} = ?
              </p>
              {mathError && (
                <p className="text-center text-red-500 text-sm mb-3">틀렸어요! 다시 풀어보세요 🤔</p>
              )}
              <input
                type="number"
                inputMode="numeric"
                value={mathAnswer}
                onChange={e => { setMathAnswer(e.target.value); setMathError(false) }}
                onKeyDown={e => e.key === 'Enter' && checkMathAnswer()}
                placeholder="답을 입력하세요"
                className="w-full text-center text-2xl font-bold border-2 border-purple-200 rounded-xl py-3 mb-4 focus:border-purple-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowMath(false)}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-bold text-gray-600 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={checkMathAnswer}
                  className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
