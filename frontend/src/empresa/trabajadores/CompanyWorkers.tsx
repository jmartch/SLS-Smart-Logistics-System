import { CheckCircle2, Clock3, UserPlus, Users } from "lucide-react"
import { Link } from "react-router"
import { WORKERS } from "../../mockData"
import { Metric } from "../../shared/ui/PortalShell"

export function CompanyWorkers() {
  return (
    <main className="company-content">
      <div className="company-page-heading">
        <div>
          <p className="eyebrow">Equipo empresarial</p>
          <h1>Trabajadores</h1>
          <p>Administra las personas que tienen acceso a la operación.</p>
        </div>
        <Link className="form-submit company-primary-action" to="/empresa/trabajadores/nuevo">
          <UserPlus size={18} /> Registrar trabajador
        </Link>
      </div>
      <div className="dashboard-metrics dashboard-metrics--three">
        <Metric icon={<Users size={21} />} tone="blue" label="Total del equipo" value={String(WORKERS.length)} note="Usuarios registrados" />
        <Metric icon={<CheckCircle2 size={21} />} tone="green" label="Activos" value={String(WORKERS.filter((worker) => worker.status === "Activo").length)} note="Con acceso habilitado" />
        <Metric icon={<Clock3 size={21} />} tone="soft" label="Invitaciones" value={String(WORKERS.filter((worker) => worker.status === "Invitado").length)} note="Pendientes de aceptar" />
      </div>
      <article className="dashboard-panel recent-panel">
        <div className="company-table worker-table">
          <div className="company-table__head">
            <span>Trabajador</span><span>Área</span><span>Rol</span><span>Estado</span>
          </div>
          {WORKERS.map((worker) => (
            <div className="company-table__row" key={worker.id}>
              <strong className="worker-identity">
                <i>{worker.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i>
                <span>{worker.name}<small>{worker.email}</small></span>
              </strong>
              <span>{worker.area}</span>
              <span>{worker.role}</span>
              <span><i className={`status ${worker.status === "Activo" ? "status--success" : "status--pending"}`}>{worker.status}</i></span>
            </div>
          ))}
        </div>
      </article>
    </main>
  )
}
