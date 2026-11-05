import { AlertCircle, ChevronRight, Loader2, Package, PackagePlus, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useAuth } from "../../auth"
import { EmptyState } from "../../shared/ui/EmptyState"
import { listPackages, type PackageListItemResponse } from "./api/packagesApi"
import {
  PACKAGE_STATES,
  PACKAGE_STATE_COLORS,
  PACKAGE_STATE_LABELS,
  type PackageState,
} from "./types"

const STATUS_FILTER_OPTIONS: { value: PackageState | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  ...PACKAGE_STATES.map((state) => ({
    value: state,
    label: PACKAGE_STATE_LABELS[state],
  })),
]

export function PackagesListPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<PackageState | "">("")
  const [packages, setPackages] = useState<PackageListItemResponse[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [packagesError, setPackagesError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoadingPackages(true)
    setPackagesError(null)
    void listPackages()
      .then((items) => {
        if (active) setPackages(items)
      })
      .catch((error: unknown) => {
        if (!active) return
        setPackagesError(
          error instanceof Error ? error.message : "No fue posible consultar los paquetes.",
        )
      })
      .finally(() => {
        if (active) setLoadingPackages(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = packages.filter((p) => {
    const matchQuery =
      !query ||
      p.trackingCode.toLowerCase().includes(query.toLowerCase()) ||
      p.address.toLowerCase().includes(query.toLowerCase())
    const matchStatus = !statusFilter || p.state === statusFilter
    return matchQuery && matchStatus
  })

  const canCreate = user?.role === "reception" || user?.role === "admin"

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Paquetes</h1>
          <p>Busca y gestiona todos los paquetes del sistema.</p>
        </div>
        {canCreate && (
          <Link to="/app/paquetes/nuevo" className="form-submit company-primary-action" style={{ textDecoration: "none" }}>
            <PackagePlus size={17} /> Nuevo paquete
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.2rem", flexWrap: "wrap" }}>
        <div className="tracking-search" style={{ flex: 1, minWidth: 220, borderRadius: "var(--radius-sm)" }}>
          <Search size={17} style={{ marginLeft: "0.7rem", color: "var(--blue-dark)" }} />
          <input
            type="search"
            placeholder="Guía o dirección…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minHeight: 42, paddingInline: "0.5rem", background: "transparent", border: 0, outline: "none", width: "100%", fontWeight: 600 }}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PackageState | "")}
            style={{ minHeight: 44, paddingInline: "0.9rem", background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="dashboard-panel recent-panel">
        {packagesError && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} /> {packagesError}
          </div>
        )}
        <div className="company-table">
          <div className="company-table__head" style={{ gridTemplateColumns: "1.3fr 1.6fr 1fr 0.8fr 0.4fr" }}>
            <span>Guía / tipo</span>
            <span>Dirección</span>
            <span>Zona</span>
            <span>Estado</span>
            <span></span>
          </div>
          {loadingPackages ? (
            <EmptyState icon={<Loader2 size={32} className="spin" />} title="Consultando paquetes" body="Cargando la información persistida del tenant." />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Package size={32} />} title="Sin resultados" body="Ajusta los filtros o registra un nuevo paquete." />
          ) : (
            filtered.map((pkg) => {
              const stateKey = pkg.state as PackageState
              return (
                <div key={pkg.id} className="company-table__row" style={{ gridTemplateColumns: "1.3fr 1.6fr 1fr 0.8fr 0.4fr" }}>
                  <strong style={{ display: "grid", gap: "0.15rem" }}>
                    <span style={{ fontSize: "0.82rem" }}>{pkg.trackingCode}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 400 }}>{pkg.shipmentType}</span>
                  </strong>
                  <span>{pkg.address}</span>
                  <span>{pkg.zone ?? "Sin zona"} · {pkg.sector ?? "Sin sector"}</span>
                  <span>
                    <span className={`status ${PACKAGE_STATE_COLORS[stateKey] ?? "status--muted"}`}>
                      {PACKAGE_STATE_LABELS[stateKey] ?? pkg.state}
                    </span>
                  </span>
                  <span>
                    <Link to={`/app/paquetes/${pkg.id}`} style={{ display: "grid", width: 32, height: 32, placeItems: "center", color: "var(--blue-dark)", borderRadius: 8 }} aria-label={`Ver detalle ${pkg.trackingCode}`}>
                      <ChevronRight size={17} />
                    </Link>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
