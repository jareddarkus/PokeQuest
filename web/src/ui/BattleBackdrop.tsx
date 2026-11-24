import { useEffect, useRef } from 'react'
import { BattleBackdrop3D, ENVIRONMENTS, type BattleLayout } from '../rom/battleScene'
import { getBattleFiles } from '../rom/store'

/** The 3D battle scenery from the player's game file. It tells the screen where the two platforms are. */
export default function BattleBackdrop({ env = 'grass', onLayout }: { env?: string; onLayout: (l: BattleLayout) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let live = true
    let scene: BattleBackdrop3D | null = null
    let onResize = () => {}
    void getBattleFiles().then((files) => {
      if (!live || !files || !ref.current) return
      scene = new BattleBackdrop3D(ref.current, files, ENVIRONMENTS[env] ?? ENVIRONMENTS.grass)
      onResize = () => scene && onLayout(scene.layout())
      onResize()
      window.addEventListener('resize', onResize)
    })
    return () => {
      live = false
      window.removeEventListener('resize', onResize)
      scene?.dispose()
    }
  }, [env])
  return <div ref={ref} className="battle-backdrop" />
}