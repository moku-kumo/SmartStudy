import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/routes/Home'
import MathHome from '@/routes/math/MathHome'
import Addition from '@/routes/math/Addition'
import BlankFill from '@/routes/math/BlankFill'
import Pattern from '@/routes/math/Pattern'
import EnglishHome from '@/routes/english/EnglishHome'
import Alphabet from '@/routes/english/Alphabet'
import PictureWord from '@/routes/english/PictureWord'
import ListenWord from '@/routes/english/ListenWord'
import KoreanHome from '@/routes/korean/KoreanHome'
import Jamo from '@/routes/korean/Jamo'
import ReadWord from '@/routes/korean/ReadWord'
import GameHome from '@/routes/game/GameHome'
import WhackAMole from '@/routes/game/WhackAMole'
import DodgePoop from '@/routes/game/DodgePoop'
import SpotDiff from '@/routes/game/SpotDiff'
import MazeFinder from '@/routes/game/MazeFinder'
import Sewing from '@/routes/game/Sewing'
import ParentDashboard from '@/routes/ParentDashboard'
import Phonics from '@/routes/english/Phonics'

function App() {
  return (
    <BrowserRouter basename="/smart-study">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/math" element={<MathHome />} />
        <Route path="/math/addition" element={<Addition />} />
        <Route path="/math/blank" element={<BlankFill />} />
        <Route path="/math/pattern" element={<Pattern />} />
        <Route path="/english" element={<EnglishHome />} />
        <Route path="/english/alphabet" element={<Alphabet />} />
        <Route path="/english/picture" element={<PictureWord />} />
        <Route path="/english/listen" element={<ListenWord />} />
        <Route path="/korean" element={<KoreanHome />} />
        <Route path="/korean/jamo" element={<Jamo />} />
        <Route path="/korean/word" element={<ReadWord />} />
        <Route path="/game" element={<GameHome />} />
        <Route path="/game/whack" element={<WhackAMole />} />
        <Route path="/game/dodge" element={<DodgePoop />} />
        <Route path="/game/spot" element={<SpotDiff />} />
        <Route path="/game/maze" element={<MazeFinder />} />
        <Route path="/game/sewing" element={<Sewing />} />
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/english/phonics" element={<Phonics />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
