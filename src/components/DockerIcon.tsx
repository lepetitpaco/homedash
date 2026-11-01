import { monogram } from '../lib/dockerTabs'

/** Icône d'une ligne Docker : deux lettres sur une couleur stable. */
export default function DockerIcon({ name }: { name: string }) {
  const { letters, color } = monogram(name)
  return (
    <span className="docker-icon" style={{ background: color }}>
      {letters}
    </span>
  )
}
