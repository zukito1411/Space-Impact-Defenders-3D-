# Two-player connections and public rooms

Both Same Wi-Fi and Cloud Relay retain a host-authoritative game. The guest predicts its own movement and weapon presentation; the host owns damage, rewards, enemies and stage progression.

## Connection handling

- Each game session measures a peer-to-peer round trip through its existing relay. The separate socket heartbeat still detects a dead relay connection.
- Host snapshots carry a source timestamp. The guest maps this clock into its own timeline and adjusts its interpolation buffer to packet spacing and arrival jitter, rather than imposing a fixed 100 ms minimum on LAN.
- Wi-Fi sends inputs every 25 ms; cloud sends them every 33 ms. LAN snapshots can use 33 ms for small packets, retaining 50 ms for larger scenes to bound serialization work. Cloud snapshots retain 50 ms. Simulation/rendering still run independently.
- Movement messages contain only a position pair, rather than spreading the entire player object into `input.position`. Inputs have a sequence number. The host acknowledges the processed sequence and its position at that point; the guest compares this with its bounded history of sent positions. Repeated acknowledgements do not repeatedly pull the ship backward.
- A guest applies only the newest received snapshot at each animation frame. Browser send queues are capped; the cloud relay replaces pending gameplay updates with the newest snapshot/input when a recipient is congested. Room/control messages remain separate. Each state is complete, so skipping a superseded state does not invalidate a delta chain.
- Stale guest input releases held movement controls. Disconnecting removes the remote pilot; a disconnected guest exits the session instead of accidentally starting its own authoritative simulation. Snapshot, peer and room checks reject old or unrelated gameplay messages. The native Android relay remains wire compatible and already disables TCP delayed sending.

These changes do not establish a measured latency/FPS guarantee. They cannot remove physical network latency or a sleeping/disconnected host. Test actual devices and both network paths before claiming end-to-end performance.

## Online directory

Online lobbies connect to the configured cloud relay and subscribe with `list-rooms`. An advertised `public-rooms-v1` capability enables the directory. A host opts into listing with `create-room.public`; old clients without this field create private rooms. Code-based joining remains available.

The directory publishes up to 64 open, one-player public rooms. Joining is checked against live membership; rooms that fill, start, empty or lose their connection leave the list. Changes are coalesced into a short directory update. Private rooms never appear. `GET /rooms` exposes the same open-room directory, and `/health` reports protocol 2 and capabilities.

The relay stores rooms in memory within one process. All players browsing the same directory must use that relay instance. Restarting it clears rooms and connections; multiple independent instances need shared discovery and room routing before horizontal scaling.

## Deploying the relay

The frontend and `server/raid-relay.mjs` must both be updated. The existing Render service configuration runs `npm run relay`. Redeploy that service from the updated `main`; updating GitHub Pages or the APK alone does not update the separately hosted relay. `/health` must advertise `public-rooms-v1` before public browsing is available. A client connected to an older relay displays an update-needed message and retains room-code joining.

The checked-in service uses Render's free plan. Keeping an always-available lobby requires hosting that remains awake; this change does not alter the hosting plan or provision paid infrastructure.
