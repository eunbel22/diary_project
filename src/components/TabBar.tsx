interface Tab<T extends string> {
  key: T
  label: string
  icon: string
}

interface Props<T extends string> {
  tabs: readonly Tab<T>[]
  active: T
  onChange: (key: T) => void
}

export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
            active === tab.key ? 'text-amber-600' : 'text-stone-400'
          }`}
        >
          <span className="text-lg">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
