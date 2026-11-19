import { useEffect, useRef } from 'react'
import {
  DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three'
import { acquireHull, loadHull, releaseHull, trimHullAssets } from './liveHullAssets'

type Entry = { element: HTMLElement; key: string; landscape: boolean; group: Group | null }
const entries = new Set<Entry>()
let renderer: WebGLRenderer | null = null
let pendingFrame = 0
let resizeWidth = 0, resizeHeight = 0, resizeDensity = 0
const scene = new Scene()
const camera = new PerspectiveCamera(35, 1, 1, 10000)
const light = new DirectionalLight(0xfff0de, 2)
light.position.set(-500, 700, 1600)
scene.add(new HemisphereLight(0xe0efff, 0x172238, 2.1), light)
let eventsBound = false

function schedule() {
  if (!pendingFrame && entries.size) pendingFrame = requestAnimationFrame(paint)
}

function paint() {
  pendingFrame = 0
  if (!entries.size) return
  if (!renderer) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(1)
    renderer.setClearColor(0, 0)
    Object.assign(renderer.domElement.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '100000',
    })
    renderer.domElement.setAttribute('aria-hidden', 'true')
    document.body.appendChild(renderer.domElement)
  }
  const density = window.devicePixelRatio || 1
  const width = window.innerWidth, height = window.innerHeight
  if (width !== resizeWidth || height !== resizeHeight || density !== resizeDensity) {
    renderer.setSize(Math.ceil(width*density), Math.ceil(height*density), false)
    renderer.domElement.style.width = width+'px'
    renderer.domElement.style.height = height+'px'
    resizeWidth = width; resizeHeight = height; resizeDensity = density
  }
  renderer.setScissorTest(false)
  renderer.clear()
  renderer.setScissorTest(true)
  for (const entry of entries) {
    const rect = entry.element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= width ||
      rect.bottom <= 0 || rect.top >= height || !entry.element.checkVisibility()) {
      if (entry.group) { releaseHull(entry.key, entry.group.children[0]); entry.group = null }
      continue
    }
    const top = document.elementFromPoint(Math.min(width-1,Math.max(0,rect.left+rect.width*.5)),
      Math.min(height-1,Math.max(0,rect.top+rect.height*.5)))
    if (top && top !== entry.element && !top.contains(entry.element) && !entry.element.contains(top)) continue
    if (!entry.group) {
      const asset = acquireHull(entry.key)
      if (!asset) {
        void loadHull(entry.key).then(schedule).catch(() => {})
        continue
      }
      entry.group = new Group()
      entry.group.add(asset.object)
      entry.group.userData.registration = asset.registration.registration
    }
    const group = entry.group
    const [sx, sy, ox, oy] = group.userData.registration as number[]
    const size = Math.min(rect.width, rect.height)
    group.scale.set(size*sx/448, size*sy/448, size*sx/448)
    group.position.set((144*sx+ox-224)*size/448, (224-144*sy-oy)*size/448, 0)
    const hover = Number(entry.element.dataset.orbitX) || 0
    group.rotation.y = (entry.landscape ? -56*Math.PI/180 : 0) + hover*.32
    scene.add(group)
    const x = Math.round(rect.left*density), y = Math.round((height-rect.bottom)*density)
    renderer.setViewport(x, y, Math.round(rect.width*density), Math.round(rect.height*density))
    renderer.setScissor(Math.max(0,x), Math.max(0,y),
      Math.max(0,Math.min(width*density,x+rect.width*density)-Math.max(0,x)),
      Math.max(0,Math.min(height*density,y+rect.height*density)-Math.max(0,y)))
    camera.aspect = rect.width/rect.height
    camera.position.z = rect.height*.5/Math.tan(35*Math.PI/360)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    scene.remove(group)
  }
  trimHullAssets()
}

export function ThreeHullPreview({ shipKey, landscape, className, size }: {
  shipKey: string; landscape: boolean; className?: string; size?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = ref.current!
    const entry: Entry = { element, key: shipKey, landscape, group: null }
    entries.add(entry)
    if (!eventsBound) {
      window.addEventListener('resize', schedule)
      window.addEventListener('scroll', schedule, true)
      eventsBound = true
    }
    const observer = new ResizeObserver(schedule)
    const visibility = new IntersectionObserver(schedule)
    observer.observe(element); visibility.observe(element)
    schedule()
    return () => {
      entries.delete(entry)
      observer.disconnect(); visibility.disconnect()
      if (entry.group) releaseHull(entry.key, entry.group.children[0])
      if (!entries.size) {
        cancelAnimationFrame(pendingFrame); pendingFrame = 0
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
        eventsBound = false
        renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); renderer = null
        resizeWidth = resizeHeight = resizeDensity = 0
      } else schedule()
    }
  }, [shipKey, landscape])
  return <span ref={ref} className={className} aria-hidden="true"
    onPointerMove={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      event.currentTarget.dataset.orbitX = String((event.clientX-bounds.left)/bounds.width-.5)
      schedule()
    }}
    onPointerLeave={event => { event.currentTarget.dataset.orbitX = '0'; schedule() }}
    style={{ display: 'inline-block', position: 'relative', width: size ?? (className ? undefined : '100%'), height: size ?? (className ? undefined : '100%'), flexShrink: 0 }} />
}
