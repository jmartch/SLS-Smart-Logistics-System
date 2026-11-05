import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { Brand } from "./PortalShell"

export function NotFound() {
  return (
    <main className="not-found">
      <Brand />
      <span>404</span>
      <h1>Esta ruta no existe</h1>
      <p>Vuelve al inicio para continuar navegando por SLS.</p>
      <Link className="form-submit" to="/">
        Ir al inicio <ArrowRight size={18} />
      </Link>
    </main>
  )
}
