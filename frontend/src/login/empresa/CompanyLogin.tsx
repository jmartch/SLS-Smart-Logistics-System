import { AlertCircle, ArrowRight, Building2, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { COMPANY_ACCOUNT } from "../../mockData"
import { AuthShell } from "../../shared/ui/PortalShell"

export function CompanyLogin() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  return (
    <AuthShell
      eyebrow="SLS Business"
      title="Acceso de empresa"
      description="Ingresa al centro de control de tu operación logística."
      icon={<Building2 size={28} />}
      asideTitle="Todo tu movimiento, en un solo lugar."
      asideText="Controla recursos, paquetes y entregas desde una vista clara, rápida y segura."
    >
      <form
        className="portal-form company-login-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (
            email.toLowerCase().trim() !== COMPANY_ACCOUNT.email ||
            password !== COMPANY_ACCOUNT.password
          ) {
            setError("El correo o la contraseña no coinciden con la cuenta demo.")
            return
          }
          navigate("/empresa")
        }}
      >
        <div className="field">
          <label htmlFor="company-email">Correo corporativo</label>
          <input
            id="company-email"
            type="email"
            placeholder="operaciones@empresa.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="company-password">Contraseña</label>
          <div className="input-with-action">
            <input
              id="company-password"
              type={visible ? "text" : "password"}
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="field-action"
              type="button"
              onClick={() => setVisible(!visible)}
              aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="login-options">
          <label className="check-field">
            <input type="checkbox" />
            <span>Recordar sesión</span>
          </label>
          <button type="button">¿Olvidaste tu contraseña?</button>
        </div>
        {error && <div className="form-error"><AlertCircle size={17} /> {error}</div>}
        <button className="form-submit" type="submit">
          Entrar al panel <ArrowRight size={18} />
        </button>
        <button
          className="demo-access"
          type="button"
          onClick={() => {
            setEmail(COMPANY_ACCOUNT.email)
            setPassword(COMPANY_ACCOUNT.password)
            setError("")
          }}
        >
          Usar acceso demo: <strong>{COMPANY_ACCOUNT.email}</strong>
        </button>
        <p className="form-switch">
          ¿Tu empresa aún no usa SLS? <Link to="/registro/empresa">Registrar empresa</Link>
        </p>
      </form>
    </AuthShell>
  )
}
