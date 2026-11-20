/** Opt-in asynchronous telemetry for the Three context. Pixi has a separate
 * context, so its GPU query cannot measure ship shading or geometry. */
export class ShipGpuTimer {
  private query: WebGLQuery | null = null
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null
  private gl: WebGL2RenderingContext | null = null
  private lastSample = -Infinity
  private elapsed: number | null = null
  private sampledAt = 0
  private disabled = false
  get milliseconds() { return this.elapsed }
  get age() { return this.elapsed === null ? null : performance.now() - this.sampledAt }
  render(gl: WebGL2RenderingContext, enabled: boolean, draw: () => void) {
    if (!enabled || this.disabled) { draw(); return }
    const now = performance.now()
    let active = false
    try {
      if (!this.gl) {
        this.gl = gl; this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2')
        if (!this.extension) this.disabled = true
      }
      const ext = this.extension
      if (ext && gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        this.reset(); draw(); return
      }
      if (ext && this.query && gl.getQueryParameter(this.query,gl.QUERY_RESULT_AVAILABLE)) {
        this.elapsed = Number(gl.getQueryParameter(this.query,gl.QUERY_RESULT)) / 1e6
        this.sampledAt = now
        gl.deleteQuery(this.query); this.query = null
      }
      if (ext && !this.query && now - this.lastSample >= 300) {
        const query = gl.createQuery()
        if (query) { gl.beginQuery(ext.TIME_ELAPSED_EXT,query); this.query = query; active = true; this.lastSample = now }
      }
    } catch { this.disabled = true; this.elapsed = null }
    // Drawing happens once, even if telemetry is unsupported or disjoint.
    try { draw() } finally {
      if (active) { try { gl.endQuery(this.extension!.TIME_ELAPSED_EXT) } catch { this.disabled = true } }
    }
  }
  reset() {
    if (this.query && this.gl && !this.gl.isContextLost()) this.gl.deleteQuery(this.query)
    this.query = null; this.gl = null; this.extension = null
    this.elapsed = null; this.sampledAt = 0; this.lastSample = -Infinity; this.disabled = false
  }
}
