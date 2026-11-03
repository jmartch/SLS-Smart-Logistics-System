import { ArrowRight, Building2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import {
  AuthShell,
  Field,
  PasswordField,
  SuccessState,
} from "../../shared/ui/PortalShell"
import { submitForm } from "../../shared/ui/submitForm"

export function CompanyRegistration() {
  const [submitted, setSubmitted] = useState(false)

  return (
    <AuthShell
      eyebrow="Nueva cuenta"
      title="Registra tu empresa"
      description="Crea el espacio de trabajo desde el que organizarás toda tu operación."
      icon={<Building2 size={28} />}
      asideTitle="Tu operación empieza aquí."
      asideText="Configura la empresa, registra al equipo y comienza a controlar cada envío."
    >
      {submitted ? (
        <SuccessState
          title="Empresa registrada"
          text="Tu espacio de trabajo está listo para comenzar a configurar la operación."
          link="/empresa"
          action="Abrir panel empresarial"
        />
      ) : (
        <form className="portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
          <div className="field">
            <label htmlFor="company-name">Nombre de la empresa</label>
            <input id="company-name" placeholder="Nombre comercial" required />
          </div>
          <div className="form-row">
            <Field id="company-tax-id" label="Identificación fiscal" placeholder="RNC / NIF / CIF" />
            <div className="field">
              <label htmlFor="company-sector">Sector</label>
              <select id="company-sector" defaultValue="" required>
                <option value="" disabled>Seleccionar</option>
                <option>Comercio electrónico</option>
                <option>Distribución</option>
                <option>Retail</option>
                <option>Servicios</option>
              </select>
            </div>
          </div>
          <Field id="company-admin-name" label="Nombre del administrador" placeholder="Nombre completo" />
          <Field id="company-register-email" label="Correo corporativo" placeholder="admin@empresa.com" type="email" />
          <PasswordField id="company-register-password" />
          <label className="check-field">
            <input type="checkbox" required />
            <span>Acepto los términos del servicio y la política de privacidad.</span>
          </label>
          <button className="form-submit" type="submit">
            Crear espacio empresarial <ArrowRight size={18} />
          </button>
          <p className="form-switch">
            ¿Ya tienes una cuenta? <Link to="/login/empresa">Iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
