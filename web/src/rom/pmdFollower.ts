// Walking pictures for the follower of every Pokémon that has none in the game file (Unova's Pokémon and everything from generation 6 on):
// the open "SpriteCollab" pixel-art walking sprites (8 directions, 4 pictures each). They are read while playing and never stored by us.
const memory = new Map<number, Promise<HTMLCanvasElement | null>>()
const base = (dex: number) => `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${String(dex).padStart(4, '0')}`

/**
 * A strip of 8 pictures of the same size in the order the game uses for walking Pokémon: up, up, down, down, left, left, right, right
 * (two pictures per direction). null when the picture cannot be loaded.
 */
export function loadPmdStrip(dex: number): Promise<HTMLCanvasElement | null> {
  let p = memory.get(dex)
  if (!p) {
    p = (async () => {
      try {
        const [xml, img] = await Promise.all([
          fetch(`${base(dex)}/AnimData.xml`).then((r) => (r.ok ? r.text() : '')),
          new Promise<HTMLImageElement | null>((res) => {
            const im = new Image()
            im.crossOrigin = 'anonymous'
            im.onload = () => res(im)
            im.onerror = () => res(null)
            im.src = `${base(dex)}/Walk-Anim.png`
          }),
        ])
        if (!img) return null
        const m = /<Name>Walk<\/Name>[\s\S]*?<FrameWidth>(\d+)<\/FrameWidth>\s*<FrameHeight>(\d+)<\/FrameHeight>/.exec(xml)
        const fw = m ? Number(m[1]) : Math.round(img.naturalWidth / 4), fh = m ? Number(m[2]) : Math.round(img.naturalHeight / 8)
        // rows of the sheet: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left; columns = the 4 walking pictures
        const row = { up: 4, down: 0, left: 6, right: 2 }
        const out = document.createElement('canvas')
        out.width = fw * 8; out.height = fh
        const ctx = out.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        const order: Array<keyof typeof row> = ['up', 'down', 'left', 'right']
        order.forEach((d, di) => {
          for (let f = 0; f < 2; f++) ctx.drawImage(img, (f === 0 ? 0 : 1) * fw, row[d] * fh, fw, fh, (di * 2 + f) * fw, 0, fw, fh)
        })
        return out
      } catch { return null }
    })()
    memory.set(dex, p)
  }
  return p
}
