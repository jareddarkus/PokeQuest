import { useEffect, useRef } from 'react'
import { BattleBackdrop3D, ENVIRONMENTS, type BattleLayout } from '../rom/battleScene'
import { getBallModel, getBattleFiles } from '../rom/store'

/** The 3D battle scenery from the player's game file. It tells the screen where the two platforms are. */
export default function BattleBackdrop({ env = 'grass', onLayout, sceneRef }: { env?: string; onLayout: (l: BattleLayout) => void; sceneRef?: React.MutableRefObject<BattleBackdrop3D | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let live = true
    let scene: BattleBackdrop3D | null = null
    let onResize = () => {}
    void Promise.all([getBattleFiles(), getBallModel()]).then(([files, ball]) => {
      if (!live || !files || !ref.current) return
      scene = new BattleBackdrop3D(ref.current, files, ENVIRONMENTS[env] ?? ENVIRONMENTS.grass, ball)
      onResize = () => scene && onLayout(scene.layout())
      scene.onFrame = onLayout
      if (sceneRef) sceneRef.current = scene
      onResize()
      window.addEventListener('resize', onResize)
    })
    return () => {
      live = false
      window.removeEventListener('resize', onResize)
      scene?.dispose()
      if (sceneRef) sceneRef.current = null
    }
  }, [env])
  return <div ref={ref} className="battle-backdrop" />
}