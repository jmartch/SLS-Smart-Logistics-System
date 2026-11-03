import { ArrowRight, Building2, Search } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Brand } from "../shared/ui/PortalShell"

export function TrackingPage() {
  const [tracking, setTracking] = useState("")
  const navigate = useNavigate()
  return (
    <main className="tracking-page">
      <header className="portal-topbar">
        <Brand />
        <nav aria-label="Acciones de usuario">
          <Link className="portal-login" to="/login">
            Acceso empresas <Building2 size={17} />
          </Link>
        </nav>
      </header>
      <section className="tracking-hero">
        <div className="tracking-heading">
          <h1>Rastrea tu paquete</h1>
        </div>
        <form
          className="tracking-search"
          onSubmit={(event) => {
            event.preventDefault()
            navigate(`/track?code=${encodeURIComponent(tracking)}`)
          }}
        >
          <Search size={21} aria-hidden="true" />
          <input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            aria-label="Número de seguimiento"
            placeholder="Ej. SLS-2048-ES"
            required
          />
          <button type="submit">
            Rastrear <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  )
}
