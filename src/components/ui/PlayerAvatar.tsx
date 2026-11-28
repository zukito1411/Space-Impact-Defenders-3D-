import { HomeMenuIcon } from './HomeMenuIcon'

export function PlayerAvatar({ picture }: { picture: string | null }) {
  return (
    <span className="player-avatar" aria-hidden="true">
      {picture ? <img src={picture} alt="" /> : <HomeMenuIcon name="profile" />}
    </span>
  )
}
