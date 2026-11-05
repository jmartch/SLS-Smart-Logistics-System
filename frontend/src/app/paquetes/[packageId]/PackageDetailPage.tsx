import { ArrowLeft, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import { EmptyState } from "../../../shared/ui/EmptyState"
import { getPackageDetail, type PackageDetailResponse } from "../api/packagesApi"
import {
  PACKAGE_PRIORITY_LABELS,
  PACKAGE_STATE_COLORS,
  PACKAGE_STATE_LABELS,
  type PackagePriority,
  type PackageState,
} from "../types"

export function PackageDetailPage() {
  const { packageId } = useParams()
  const [pkg, setPkg] = useState<PackageDetailResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(Boolean(packageId))
  const [detailError, setDetailError] = useState<string | null>(
    packageId ? null : "No se proporcionó un identificador de paquete válido.",
  )

  useEffect(() => {
    if (!packageId) return
    let active = true
    async function loadDetail(id: string) {
      setLoadingDetail(true)
      setDetailError(null)
      try {
        const detail = await getPackageDetail(id)
        if (!active) return
        setPkg(detail)
      } catch (error: unknown) {
        if (!active) return
        setDetailError(error instanceof Error ? error.message : "No fue posible consultar el paquete.")
        setPkg(null)
      } finally {
        if (active) setLoadingDetail(false)
      }
    }
    void loadDetail(packageId)
    return () => {
      active = false
    }
  }, [packageId])

  if (loadingDetail) {
    return <EmptyState icon={<Loader2 size={32} className="spin" />} title="Consultando paquete" body="Cargando la información persistida del tenant." />
  }

  if (!pkg) {
    return (
      <div className="not-found" style={{ minHeight: "60vh" }}>
        <span>404</span>
        <h1>Paquete no encontrado</h1>
        <p>{detailError ?? "El identificador no corresponde a ningún paquete registrado."}</p>
        <Link to="/app/paquetes" className="form-submit" style={{ textDecoration: "none" }}>
          <ArrowLeft size={17} /> Volver a paquetes
        </Link>
      </div>
    )
  }

  const stateKey = pkg.state as PackageState
  const priorityKey = pkg.priority as PackagePriority
  const volumeLiters = (Number(pkg.volumeM3) * 1000).toFixed(2)

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/app/paquetes" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", marginBottom: "0.6rem" }}>
            <ArrowLeft size={15} /> Paquetes
          </Link>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>{pkg.trackingCode}</h1>
          <p style={{ marginTop: "0.4rem" }}>{pkg.address}</p>
        </div>
        <span className={`status ${PACKAGE_STATE_COLORS[stateKey] ?? "status--muted"}`} style={{ fontSize: "0.78rem", padding: "0.5rem 1rem", flexShrink: 0, marginTop: "0.5rem" }}>
          {PACKAGE_STATE_LABELS[stateKey] ?? pkg.state}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "1rem", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Resumen</span>
                <h2>Información del envío</h2>
              </div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2rem" }}>
              {[
                ["Código de guía", pkg.trackingCode],
                ["Dirección de entrega", pkg.address],
                ["Zona y sector", `${pkg.zone ?? "Sin zona"} · ${pkg.sector ?? "Sin sector"}`],
                ["Tipo de envío", pkg.shipmentType],
                ["Prioridad", PACKAGE_PRIORITY_LABELS[priorityKey] ?? pkg.priority],
                ["Peso", `${pkg.weightKg} kg`],
                ["Dimensiones (L × A × H)", `${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm`],
                ["Volumen", `${volumeLiters} L (${pkg.volumeM3} m³)`],
                [
                  "Fecha de registro",
                  pkg.registeredAt
                    ? new Date(pkg.registeredAt).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Sin fecha",
                ],
                [
                  "Fecha límite",
                  pkg.deadline
                    ? new Date(pkg.deadline).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Sin fecha límite",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{k}</dt>
                  <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Historial</span>
              <h2>Línea de tiempo</h2>
            </div>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
            {[...pkg.history].reverse().map((h, i) => {
              const toStateKey = h.toState as PackageState
              return (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 0.9rem", paddingBottom: i < pkg.history.length - 1 ? "1.2rem" : 0, position: "relative" }}>
                  {i < pkg.history.length - 1 && (
                    <span style={{ position: "absolute", left: "10px", top: "24px", bottom: 0, width: "2px", background: "var(--border)" }} aria-hidden="true" />
                  )}
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "var(--blue)" : "var(--border)", display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1 }}>
                    {i === 0 && <span style={{ width: 8, height: 8, background: "white", borderRadius: "50%" }} />}
                  </span>
                  <div>
                    <strong style={{ display: "block", color: "var(--navy)", fontSize: "0.78rem" }}>
                      {PACKAGE_STATE_LABELS[toStateKey] ?? h.toState}
                    </strong>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.67rem" }}>
                      {new Date(h.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.changedBy ?? "Sistema SLS"}
                    </span>
                    {h.reasonCode && <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.67rem" }}>{h.reasonCode}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </>
  )
}
