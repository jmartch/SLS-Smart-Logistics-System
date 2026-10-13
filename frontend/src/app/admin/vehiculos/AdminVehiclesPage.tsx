import { ShieldAlert } from "lucide-react"

function AdminStub({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="company-page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
      </div>
      <div className="dashboard-panel" style={{ display: "grid", placeItems: "center", minHeight: 280, textAlign: "center" }}>
        <div>
          <ShieldAlert size={36} color="var(--text-muted)" style={{ marginBottom: "1rem" }} />
          <h2 style={{ margin: "0 0 0.5rem", color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif", fontSize: "1.2rem" }}>Próximamente</h2>
          <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 360 }}>Esta sección está en desarrollo y estará disponible cuando el backend publique los controladores correspondientes.</p>
        </div>
      </div>
    </>
  )
}

export function AdminVehiclesPage() {
  return <AdminStub title="Vehículos" description="Capacidad, disponibilidad y estado de los vehículos." />
}
