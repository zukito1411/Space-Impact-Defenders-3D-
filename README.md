# Space Impact Defenders 3D

Gradius Raid is a scrolling space shooter. Fly the story campaign, survive Endless Mode, or take on the Boss Rush. Co-op supports Same Wi-Fi play, Online Co-op, and a shared screen.

Open the Command Deck for your profile, achievements, missions, hangar, Codex, and Almanac. Leaderboards are available directly from the title screen.

Enemy wings bank across the screen and set up timed crossfire. The lead fighter glows gold as it prepares the volley. Destroy it to break the attack.

## Signed Android APK releases

Game updates pushed to `main` publish a production-signed Android APK and keep the **three latest Android releases**. Changes limited to workflow files, documentation, or review captures skip the APK release and Pages deployment. Both workflows can also be run manually. See [Android release setup](docs/android-release-setup.md) for signing and update requirements.

## Getting Started

### Prerequisites
- Node.js 16+ with npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the game at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Output goes to the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Game Mechanics

### Wave Progression
- 5 waves per stage
- 10 stages total
- Wave 5 of each stage has a boss enemy
- Stage 10 final boss destroys towers and requires more strategy

### Enemy Types
- **Normal Enemies**: Standard enemies with varying stats
- **Boss Enemies**: High HP, reduced speed, tower destruction ability (stage 10)

### Towers
- Click a tower button and place on the grid
- Click existing tower to select and see upgrade/sell options
- Upgrade increases damage and fire rate
- Sell returns 70% of tower cost

### Resources
- **Gold**: Earned from defeating enemies, spent on towers and upgrades
- **Lives**: Start with 20, lose lives when enemies reach the end
- **Score**: Accumulated from enemy rewards

## Architecture

Built with:
- **React 19**: UI framework with hooks
- **TypeScript**: Type-safe game logic
- **Vite 7**: Build tool and dev server
- **Web Audio API**: Procedural sound generation

### Key Components
- `SpaceImpactDefense.tsx`: Main game orchestration component
- `sound.ts`: Audio engine with 13+ sound effects
- `types.ts`: Shared TypeScript types

## Performance

- 60 FPS game loop using requestAnimationFrame
- Frame time capped at 100ms to prevent simulation jumps
- Efficient ref-based state management for game data
- ~187KB gzipped bundle size

## Controls

- **Mouse**: Click to place towers and interact with UI
- **Settings Modal**: Configure audio mix (master/BGM/explosions/beams/UI), SFX toggle, and mobile layout mode
- **Auto-Play**: Automatically start next wave (optional)

## License

MIT

## Author

nbernardo1411

---

**Deploy to Netlify**: Add `_redirects` file or configure `netlify.toml` for SPA routing.
