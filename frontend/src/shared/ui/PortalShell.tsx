import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  MapPin,
  Route,
  TrendingUp,
  Truck,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Link } from "react-router"

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} to="/" aria-label="SLS, inicio">
      <span className="brand-mark" aria-hidden="true">
        <Route size={compact ? 18 : 22} strokeWidth={2.4} />
      </span>
      <span className="brand-name">SLS</span>
    </Link>
  )
}

export function AuthShell({
  title,
  description,
  eyebrow,
  icon,
  children,
  asideTitle,
  asideText,
}: {
  title: string
  description: string
  eyebrow: string
  icon: ReactNode
  children: ReactNode
  asideTitle: string
  asideText: string
}) {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Brand />
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          Volver al inicio
        </Link>
      </header>
      <section className="auth-layout">
        <aside className="auth-aside">
          <div className="auth-aside__content">
            <span className="auth-aside__icon">{icon}</span>
            <p className="auth-aside__eyebrow">SLS Connect</p>
            <h2>{asideTitle}</h2>
            <p>{asideText}</p>
            <div className="auth-benefits">
              <span>
                <CheckCircle2 size={17} /> Información protegida
              </span>
              <span>
                <CheckCircle2 size={17} /> Configuración en minutos
              </span>
              <span>
                <CheckCircle2 size={17} /> Soporte cuando lo necesites
              </span>
            </div>
          </div>
          <div className="auth-route" aria-hidden="true">
            <span />
            <Truck size={24} />
            <span />
            <MapPin size={24} />
          </div>
        </aside>
        <div className="auth-form-panel">
          <div className="auth-form-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}

export function PasswordField({ id }: { id: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>Contraseña</label>
      <div className="input-with-action">
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder="Mínimo 8 caracteres"
          minLength={8}
          required
        />
        <button
          className="field-action"
          type="button"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export function SuccessState({
  title,
  text,
  link,
  action,
}: {
  title: string
  text: string
  link: string
  action: string
}) {
  return (
    <div className="success-state">
      <span>
        <Check size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="form-submit" to={link}>
        {action}
        <ArrowRight size={18} />
      </Link>
    </div>
  )
}

export function Metric({
  icon,
  tone,
  label,
  value,
  note,
  trend,
}: {
  icon: ReactNode
  tone: string
  label: string
  value: string
  note: string
  trend?: boolean
}) {
  return (
    <article>
      <span className={`dashboard-metric-icon dashboard-metric-icon--${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>
          {trend && <TrendingUp size={13} />} {note}
        </em>
      </div>
    </article>
  )
}

export function PanelHeading({
  kicker,
  title,
  icon,
}: {
  kicker: string
  title: string
  icon?: ReactNode
}) {
  return (
    <div className="panel-heading">
      <div>
        <span>{kicker}</span>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  )
}

export function CompanyFormHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="company-page-heading company-page-heading--form">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  )
}

export function Field({
  id,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  type?: string
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required
      />
    </div>
  )
}

export function FormSection({
  icon,
  title,
  text,
  spaced,
}: {
  icon: ReactNode
  title: string
  text: string
  spaced?: boolean
}) {
  return (
    <div
      className={
        spaced ? "form-section-heading form-section-heading--spaced" : "form-section-heading"
      }
    >
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  )
}

export function FormActions({
  label,
  icon,
  cancelTo = "/empresa",
}: {
  label: string
  icon: ReactNode
  cancelTo?: string
}) {
  return (
    <div className="company-form-actions">
      <Link to={cancelTo}>Cancelar</Link>
      <button className="form-submit" type="submit">
        {label} {icon}
      </button>
    </div>
  )
}
