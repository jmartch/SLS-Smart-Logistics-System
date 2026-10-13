import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import {
  PACKAGES,
  STATUS_COLOR,
  STATUS_LABELS,
  type Package as Pkg,
  type PkgStatus,
} from "../../../mockData"
import { EmptyState } from "../../../shared/ui/EmptyState"
import { getPackageDetail } from "../api/packagesApi"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function PackageDetailPage() {
  const { packageId } = useParams()
  const fixturePackage = PACKAGES.find((p) => p.id === packageId) ?? null
  const [pkg, setPkg] = useState<Pkg | null>(fixturePackage)
  const [loadingDetail, setLoadingDetail] = useState(Boolean(packageId && isUuid(packageId)))
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!packageId || !isUuid(packageId)) return
    let active = true
    setLoadingDetail(true)
    setDetailError(null)
    void getPackageDetail(packageId)
      .then((detail) => {
        if (!active) return
        setPkg({
          id: detail.id,
          trackingCode: detail.trackingCode,
          sender: "No registrado en el MVP",
          recipient: "No registrado en el MVP",
          recipientAddress: detail.address,
          recipientPhone: "No registrado en el MVP",
          zone: detail.zone ?? "Sin zona",
          sector: detail.sector ?? "Sin sector",
          weight: Number(detail.weightKg),
          volume: Number(detail.volumeM3),
          priority:
            detail.priority === "URGENT"
              ? "express"
              : detail.priority === "HIGH"
                ? "urgent"
                : "normal",
          shipmentType: detail.shipmentType,
          status: detail.state as PkgStatus,
          createdAt: detail.registeredAt ?? new Date(0).toISOString(),
          estimatedDelivery: detail.deadline ?? detail.registeredAt ?? new Date(0).toISOString(),
          history: detail.history.map((item) => ({
            status: item.toState as PkgStatus,
            at: item.createdAt,
            by: item.changedBy ?? "Sistema SLS",
            note: item.reasonCode ?? undefined,
          })),
        })
      })
      .catch((error: unknown) => {
        if (!active) return
        setDetailError(error instanceof Error ? error.message : "No fue posible consultar el paquete.")
        setPkg(null)
      })
      .finally(() => {
        if (active) setLoadingDetail(false)
      })
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

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/app/paquetes" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", marginBottom: "0.6rem" }}>
            <ArrowLeft size={15} /> Paquetes
          </Link>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>{pkg.trackingCode}</h1>
          <p style={{ marginTop: "0.4rem" }}>{pkg.sender} → {pkg.recipient}</p>
        </div>
        <span className={`status ${STATUS_COLOR[pkg.status]}`} style={{ fontSize: "0.78rem", padding: "0.5rem 1rem", flexShrink: 0, marginTop: "0.5rem" }}>
          {STATUS_LABELS[pkg.status] ?? pkg.status}
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
                ["Remitente", pkg.sender],
                ["Destinatario", pkg.recipient],
                ["Dirección", pkg.recipientAddress],
                ["Teléfono", pkg.recipientPhone],
                ["Zona", `${pkg.zone} · ${pkg.sector}`],
                ["Tipo de envío", pkg.shipmentType],
                ["Peso", `${pkg.weight} kg`],
                ["Volumen", `${(pkg.volume * 1000).toFixed(0)} L`],
                ["Prioridad", pkg.priority === "urgent" ? "Urgente" : pkg.priority === "express" ? "Express" : "Normal"],
                ["Entrega estimada", new Date(pkg.estimatedDelivery).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{k}</dt>
                  <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>{v}</dd>
                </div>
              ))}
            </dl>
            {pkg.notes && (
              <div className="delivery-note" style={{ marginTop: "1.2rem" }}>
                <AlertCircle size={18} />
                <div>
                  <strong>Observación</strong>
                  <span>{pkg.notes}</span>
                </div>
              </div>
            )}
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
            {[...pkg.history].reverse().map((h, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 0.9rem", paddingBottom: i < pkg.history.length - 1 ? "1.2rem" : 0, position: "relative" }}>
                {i < pkg.history.length - 1 && (
                  <span style={{ position: "absolute", left: "10px", top: "24px", bottom: 0, width: "2px", background: "var(--border)" }} aria-hidden="true" />
                )}
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "var(--blue)" : "var(--border)", display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1 }}>
                  {i === 0 && <span style={{ width: 8, height: 8, background: "white", borderRadius: "50%" }} />}
                </span>
                <div>
                  <strong style={{ display: "block", color: "var(--navy)", fontSize: "0.78rem" }}>{STATUS_LABELS[h.status] ?? h.status}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.67rem" }}>
                    {new Date(h.at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.by}
                  </span>
                  {h.note && <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.67rem" }}>{h.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}
