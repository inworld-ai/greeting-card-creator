import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import GreetingCardCreator from './components/GreetingCardCreator'
import SharedCard from './components/SharedCard'
import './App.css'

function App() {
  const location = useLocation()
  
  // Update document title based on current path
  useEffect(() => {
    if (location.pathname.startsWith('/share/')) {
      document.title = 'View Your Card'
    } else {
      document.title = 'Greeting Card Creator'
    }
  }, [location.pathname])

  return (
    <Routes>
      <Route path="/" element={<GreetingCardCreator />} />
      <Route path="/share/:cardId" element={<SharedCard />} />
    </Routes>
  )
}

export default App
