import { AlertTriangle, CheckCircle, Info } from "lucide-react"
import {
  GEOCODING_STATUS_COLORS,
  GEOCODING_STATUS_LABELS,
  GEOCODING_STATUS_MESSAGES,
  NETWORK_ATTACHMENT_STATUS_LABELS,
  ROAD_PROFILE_LABELS,
  type PackageGeocodingDiagnostic,
} from "../types"

interface PackageGeocodingCardProps {
  readonly geocoding?: PackageGeocodingDiagnostic | null
}

export function PackageGeocodingCard({ geocoding }: PackageGeocodingCardProps) {
  if (!geocoding) {
    return (
      <div className="dashboard-panel" data-testid="geocoding-card">
        <div className="panel-heading">
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Diagnóstico</span>
            <h2>Diagnóstico geoespacial y anclaje vial</h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.82rem", padding: "0.5rem 0" }}>
          <Info size={16} />
          <span>Este paquete no cuenta con diagnóstico geoespacial registrado.</span>
        </div>
      </div>
    )
  }

  const isEligible = geocoding.eligibility === "ELIGIBLE"
  const statusLabel = GEOCODING_STATUS_LABELS[geocoding.status] ?? geocoding.status
  const statusMsg = GEOCODING_STATUS_MESSAGES[geocoding.status] ?? geocoding.status
  const profileLabel = geocoding.profile ? ROAD_PROFILE_LABELS[geocoding.profile] : "No asignado"
  const attachmentStatusLabel = geocoding.attachmentStatus
    ? NETWORK_ATTACHMENT_STATUS_LABELS[geocoding.attachmentStatus] ?? geocoding.attachmentStatus
    : "Sin anclaje"

  return (
    <div className="dashboard-panel" data-testid="geocoding-card">
      <div className="panel-heading">
        <div>
          <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Diagnóstico</span>
          <h2>Diagnóstico geoespacial y anclaje vial</h2>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className={`status ${GEOCODING_STATUS_COLORS[geocoding.status] ?? "status--muted"}`} data-testid="geocoding-status-badge">
            {statusLabel}
          </span>
          <span className={`status ${isEligible ? "status--ok" : "status--warn"}`} data-testid="geocoding-eligibility-badge">
            {isEligible ? "Apto para rutas (ELIGIBLE)" : "No apto para rutas (INELIGIBLE)"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.6rem",
          padding: "0.75rem 0.9rem",
          borderRadius: "var(--radius-sm, 6px)",
          background: isEligible ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
          border: `1px solid ${isEligible ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
          marginBottom: "1rem",
        }}
      >
        {isEligible ? (
          <CheckCircle size={18} style={{ color: "var(--success, #10b981)", flexShrink: 0, marginTop: "2px" }} />
        ) : (
          <AlertTriangle size={18} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
        )}
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "var(--navy)" }}>
            {statusMsg}
          </p>
          {geocoding.unsuitabilityReason && !isEligible && (
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#b45309" }}>
              Causa de no aptitud: <strong>{geocoding.unsuitabilityReason}</strong>
            </p>
          )}
        </div>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem 1.5rem", margin: 0 }}>
        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Perfil de red vial
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>
            {profileLabel}
          </dd>
        </div>

        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Estado del anclaje
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>
            {attachmentStatusLabel}
          </dd>
        </div>

        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            ID del intento
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600, wordBreak: "break-all" }}>
            {geocoding.attemptId ?? "Sin intento"}
          </dd>
        </div>

        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Conexión de red
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600, wordBreak: "break-all" }}>
            {geocoding.attachmentId ?? "Sin anclaje activo"}
          </dd>
        </div>

        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Candidato seleccionado
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600, wordBreak: "break-all" }}>
            {geocoding.selectedCandidateId ?? "Ninguno seleccionado"}
          </dd>
        </div>

        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Alcance dirigido
          </dt>
          <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>
            {geocoding.directedReachabilityVerified ? "Verificado" : "No verificado"}
          </dd>
        </div>
      </dl>
    </div>
  )
}
