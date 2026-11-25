import { CheckCircle2, MapPin } from "lucide-react"
import type { GeocodingCandidateItem } from "../types"

interface PackageCandidatesListProps {
  readonly candidates?: readonly GeocodingCandidateItem[]
  readonly selectedCandidateId?: string | null
  readonly selectedForReviewId?: string | null
  readonly onSelectForReview?: (candidateId: string) => void
  readonly selectable?: boolean
}

export function PackageCandidatesList({
  candidates = [],
  selectedCandidateId = null,
  selectedForReviewId = null,
  onSelectForReview,
  selectable = false,
}: PackageCandidatesListProps) {
  if (!candidates || candidates.length === 0) {
    return (
      <div className="dashboard-panel" data-testid="candidates-panel">
        <div className="panel-heading">
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Georreferenciación</span>
            <h2>Candidatos encontrados</h2>
          </div>
          <span className="counter">0</span>
        </div>
        <p style={{ margin: "0.5rem 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
          No hay candidatos de dirección disponibles para este paquete.
        </p>
      </div>
    )
  }

  const sortedCandidates = [...candidates].sort((a, b) => a.rank - b.rank)

  return (
    <div className="dashboard-panel" data-testid="candidates-panel">
      <div className="panel-heading">
        <div>
          <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Georreferenciación</span>
          <h2>Candidatos de ubicación encontrados</h2>
        </div>
        <span className="counter">{sortedCandidates.length}</span>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {sortedCandidates.map((cand) => {
          const isSelectedInServer = cand.id === selectedCandidateId
          const isChosenForAction = cand.id === selectedForReviewId

          return (
            <div
              key={cand.id}
              data-testid={`candidate-item-${cand.id}`}
              style={{
                display: "grid",
                gap: "0.4rem",
                padding: "0.75rem 0.9rem",
                borderRadius: "var(--radius-sm, 6px)",
                background: isChosenForAction
                  ? "rgba(37, 99, 235, 0.08)"
                  : isSelectedInServer
                    ? "rgba(16, 185, 129, 0.05)"
                    : "var(--surface-subtle, #f8fafc)",
                border: `1px solid ${
                  isChosenForAction
                    ? "var(--blue, #2563eb)"
                    : isSelectedInServer
                      ? "rgba(16, 185, 129, 0.3)"
                      : "var(--border, #e2e8f0)"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {selectable && onSelectForReview && (
                    <input
                      type="radio"
                      id={`cand-radio-${cand.id}`}
                      name="selectedCandidateForReview"
                      checked={isChosenForAction}
                      onChange={() => onSelectForReview(cand.id)}
                      aria-label={`Seleccionar candidato posición ${cand.rank}`}
                    />
                  )}
                  <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--navy)" }}>
                    Posición #{cand.rank}
                  </span>
                  {isSelectedInServer && (
                    <span
                      className="status status--ok"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                      data-testid={`candidate-selected-badge-${cand.id}`}
                    >
                      <CheckCircle2 size={12} /> Seleccionado actualmente
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.6rem", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                  <span>Puntuación: <strong>{cand.score.toFixed(2)}</strong></span>
                  <span>Precisión: <strong>{cand.precision}</strong></span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--navy)" }}>
                <MapPin size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span>
                  Coordenadas: <code>{cand.latitude.toFixed(6)}, {cand.longitude.toFixed(6)}</code>
                </span>
                <span style={{ color: "var(--text-muted)", marginLeft: "auto", fontSize: "0.72rem" }}>
                  Fuente: {cand.source}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
