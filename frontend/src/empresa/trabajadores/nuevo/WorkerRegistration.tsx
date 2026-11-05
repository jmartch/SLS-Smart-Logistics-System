import { ShieldCheck, UserPlus } from "lucide-react"
import { useState } from "react"
import {
  CompanyFormHeader,
  Field,
  FormActions,
  FormSection,
  SuccessState,
} from "../../../shared/ui/PortalShell"
import { submitForm } from "../../../shared/ui/submitForm"

export function WorkerRegistration() {
  const [submitted, setSubmitted] = useState(false)
  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Invitación enviada"
            text="El trabajador recibirá un correo para completar su acceso."
            link="/empresa/trabajadores"
            action="Volver a trabajadores"
          />
        </div>
      </main>
    )
  }
  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Equipo empresarial"
        title="Registrar trabajador"
        description="Invita a una persona y define su nivel de acceso al panel."
      />
      <form className="company-form-card portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
        <FormSection
          icon={<UserPlus size={20} />}
          title="Información del trabajador"
          text="Usaremos estos datos para crear su perfil."
        />
        <div className="form-row">
          <Field id="worker-name" label="Nombre" placeholder="Nombre" />
          <Field id="worker-lastname" label="Apellido" placeholder="Apellido" />
        </div>
        <Field id="worker-email" label="Correo corporativo" placeholder="nombre@empresa.com" type="email" />
        <div className="form-row">
          <div className="field">
            <label htmlFor="worker-role">Rol</label>
            <select id="worker-role" defaultValue="" required>
              <option value="" disabled>
                Seleccionar rol
              </option>
              <option>Administrador</option>
              <option>Gestor de envíos</option>
              <option>Operador</option>
              <option>Solo lectura</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="worker-area">Área</label>
            <select id="worker-area" defaultValue="" required>
              <option value="" disabled>
                Seleccionar área
              </option>
              <option>Operaciones</option>
              <option>Logística</option>
              <option>Atención al cliente</option>
            </select>
          </div>
        </div>
        <div className="permission-box">
          <ShieldCheck size={20} />
          <div>
            <strong>Acceso seguro</strong>
            <p>El trabajador definirá su contraseña al aceptar la invitación.</p>
          </div>
        </div>
        <FormActions label="Enviar invitación" icon={<UserPlus size={18} />} />
      </form>
    </main>
  )
}
