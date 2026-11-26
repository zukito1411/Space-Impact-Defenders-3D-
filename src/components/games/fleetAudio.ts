import { SampleScene } from './presentationAudio'

type FleetMessage = 'departure' | 'steer' | 'charge' | 'recovery' | 'defense-orders' | 'deployed'

export class FleetAudio {
  private music = new SampleScene()
  private transmissions = new SampleScene()
  private lastMessage: FleetMessage | null = null
  private lastTransmission = -Infinity

  signal() {
    this.music.play('fleet-motif', .33, 0, 'bgm', 4, 0, 850)
  }

  radio(message: FleetMessage) {
    const now = performance.now()
    const cooldown = message === 'deployed' ? 6500 : 2400
    if (this.lastMessage === message && now - this.lastTransmission < cooldown) return
    this.lastMessage = message
    this.lastTransmission = now
    this.transmissions.stop()
    this.transmissions.play(`fleet-${message}`, .54, 0, 'ui', 5, 0, cooldown)
  }

  stop() {
    this.lastMessage = null
    this.lastTransmission = -Infinity
    this.music.stop()
    this.transmissions.stop()
  }
}
