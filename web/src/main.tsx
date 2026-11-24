import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// developer map viewer (local test server only): http://localhost:5199/PokeQuest/?mapview&map=1
const MapViewer = import.meta.env.DEV ? lazy(() => import('./dev/MapViewer')) : null
const showViewer = import.meta.env.DEV && new URLSearchParams(location.search).has('mapview')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showViewer && MapViewer ? (
      <Suspense fallback={null}>
        <MapViewer />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
