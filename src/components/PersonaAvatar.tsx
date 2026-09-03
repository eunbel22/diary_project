const FALLBACK_COLORS = [
  'bg-amber-200 text-amber-800',
  'bg-rose-200 text-rose-800',
  'bg-emerald-200 text-emerald-800',
  'bg-sky-200 text-sky-800',
  'bg-violet-200 text-violet-800',
]

function colorForName(name: string) {
  const code = name.charCodeAt(0) || 0
  return FALLBACK_COLORS[code % FALLBACK_COLORS.length]
}

interface Props {
  name: string
  imageUrl: string | null
  size?: number
}

export function PersonaAvatar({ name, imageUrl, size = 128 }: Props) {
  const style = { width: size, height: size }

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover shadow-sm"
      />
    )
  }

  return (
    <div
      style={style}
      className={`flex items-center justify-center rounded-full text-4xl font-semibold shadow-sm ${colorForName(name)}`}
    >
      {name.charAt(0)}
    </div>
  )
}
