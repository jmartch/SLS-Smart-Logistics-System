import { ArrowRight, CircleUserRound } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { AuthShell, PasswordField, SuccessState } from "../../shared/ui/PortalShell"

export function UserRegistration() {
  const [submitted, setSubmitted] = useState(false)
  return (
    <AuthShell
      eyebrow="Cuenta personal"
      title="Crea tu cuenta"
      description="Regístrate para guardar y consultar todos tus envíos desde un solo lugar."
      icon={<CircleUserRound size={28} />}
      asideTitle="Tus paquetes, siempre a la vista."
      asideText="Recibe actualizaciones claras y consulta cada etapa de tus envíos sin complicaciones."
    >
      {submitted ? (
        <SuccessState
          title="¡Tu cuenta está lista!"
          text="Ya puedes comenzar a rastrear tus paquetes con SLS."
          link="/seguimiento"
          action="Ir a seguimiento"
        />
      ) : (
        <form
          className="portal-form"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
          }}
        >
          <div className="form-row">
            <div className="field">
              <label htmlFor="first-name">Nombre</label>
              <input id="first-name" placeholder="Tu nombre" required />
            </div>
            <div className="field">
              <label htmlFor="last-name">Apellido</label>
              <input id="last-name" placeholder="Tu apellido" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="user-email">Correo electrónico</label>
            <input id="user-email" type="email" placeholder="nombre@correo.com" required />
          </div>
          <div className="field">
            <label htmlFor="user-phone">Teléfono</label>
            <input id="user-phone" type="tel" placeholder="+34 600 000 000" required />
          </div>
          <PasswordField id="user-password" />
          <label className="check-field">
            <input type="checkbox" required />
            <span>Acepto los términos y la política de privacidad.</span>
          </label>
          <button className="form-submit" type="submit">
            Crear cuenta <ArrowRight size={18} />
          </button>
          <p className="form-switch">
            ¿Representas a una empresa? <Link to="/registro/empresa">Crear cuenta empresarial</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
