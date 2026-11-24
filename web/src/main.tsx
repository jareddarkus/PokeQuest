import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// developer tools (local test server only): ?mapview&map=1  and  ?worldmap
const MapViewer = import.meta.env.DEV ? lazy(() => import('./dev/MapViewer')) : null
const WorldMap = import.meta.env.DEV ? lazy(() => import('./dev/WorldMap')) : null
const q = new URLSearchParams(location.search)
const showViewer = import.meta.env.DEV && q.has('mapview')
const showWorld = import.meta.env.DEV && q.has('worldmap')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showViewer && MapViewer ? (
      <Suspense fallback={null}>
        <MapViewer />
      </Suspense>
    ) : showWorld && WorldMap ? (
      <Suspense fallback={null}>
        <WorldMap />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
