import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// developer tools (local test server only): ?mapview&map=1  and  ?worldmap
const MapViewer = import.meta.env.DEV ? lazy(() => import('./dev/MapViewer')) : null
const WorldMap = import.meta.env.DEV ? lazy(() => import('./dev/WorldMap')) : null
const BtlView = import.meta.env.DEV ? lazy(() => import('./dev/BtlView')) : null
const AnimTest = import.meta.env.DEV ? lazy(() => import('./dev/AnimTest')) : null
const OwView = import.meta.env.DEV ? lazy(() => import('./dev/OwView')) : null
const BldView = import.meta.env.DEV ? lazy(() => import('./dev/BldView')) : null
const FolMap = import.meta.env.DEV ? lazy(() => import('./dev/FolMap')) : null
const FontView = import.meta.env.DEV ? lazy(() => import('./dev/FontView')) : null
const HpView = import.meta.env.DEV ? lazy(() => import('./dev/HpView')) : null
const TransView = import.meta.env.DEV ? lazy(() => import('./dev/TransView')) : null
const TrView = import.meta.env.DEV ? lazy(() => import('./dev/TrView')) : null
const SfxTest = lazy(() => import('./dev/SfxTest'))
const OwPeople = import.meta.env.DEV ? lazy(() => import('./dev/OwPeople')) : null
const q = new URLSearchParams(location.search)
const showOwPeople = import.meta.env.DEV && q.has('owpeople')
const showSfx = q.has('sfxtest')
const showBld = import.meta.env.DEV && q.has('bldview')
const showOw = import.meta.env.DEV && q.has('owview')
const showFol = import.meta.env.DEV && q.has('folmap')
const showHp = import.meta.env.DEV && q.has('hpview')
const showTv = import.meta.env.DEV && q.has('transview')
const showTr = import.meta.env.DEV && q.has('trview')
const showFont = import.meta.env.DEV && q.has('fontview')
const showViewer = import.meta.env.DEV && q.has('mapview')
const showWorld = import.meta.env.DEV && q.has('worldmap')
const showBtl = import.meta.env.DEV && q.has('btlview')
const showAnim = import.meta.env.DEV && q.has('animtest')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showOwPeople && OwPeople ? (
      <Suspense fallback={null}>
        <OwPeople />
      </Suspense>
    ) : showSfx ? (
      <Suspense fallback={null}>
        <SfxTest />
      </Suspense>
    ) : showTv && TransView ? (
      <Suspense fallback={null}>
        <TransView />
      </Suspense>
    ) : showHp && HpView ? (
      <Suspense fallback={null}>
        <HpView />
      </Suspense>
    ) : showTr && TrView ? (
      <Suspense fallback={null}>
        <TrView />
      </Suspense>
    ) : showFont && FontView ? (
      <Suspense fallback={null}>
        <FontView />
      </Suspense>
    ) : showFol && FolMap ? (
      <Suspense fallback={null}>
        <FolMap />
      </Suspense>
    ) : showBld && BldView ? (
      <Suspense fallback={null}>
        <BldView />
      </Suspense>
    ) : showOw && OwView ? (
      <Suspense fallback={null}>
        <OwView />
      </Suspense>
    ) : showViewer && MapViewer ? (
      <Suspense fallback={null}>
        <MapViewer />
      </Suspense>
    ) : showBtl && BtlView ? (
      <Suspense fallback={null}>
        <BtlView />
      </Suspense>
    ) : showAnim && AnimTest ? (
      <Suspense fallback={null}>
        <AnimTest />
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
