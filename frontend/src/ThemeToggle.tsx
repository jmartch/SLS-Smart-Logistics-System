import { Contrast, Moon, Sun } from "lucide-react"
import { useLayoutEffect, useState } from "react"

type Theme = "light" | "dark" | "contrast"

const THEME_STORAGE_KEY = "sls-theme"

const themes: Array<{
  value: Theme
  label: string
  icon: typeof Sun
}> = [
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema oscuro", icon: Moon },
  { value: "contrast", label: "Alto contraste", icon: Contrast },
]

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "contrast") {
    return stored
  }
  return "light"
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <div className="theme-toggle" aria-label="Selector de tema">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={theme === value ? "theme-toggle__button theme-toggle__button--active" : "theme-toggle__button"}
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
