import { AlertCircle, CheckCircle, Edit3, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react"
import { useState } from "react"
import type { GeocodingCandidateItem, ReviewPackageGeocodingPayload } from "../types"

interface PackageRecoveryActionsProps {
  readonly packageId: string
  readonly addressId: string
  readonly geocodingAttemptId?: string | null
  readonly currentAddress: string
  readonly currentMunicipalityCode?: string | null
  readonly candidates?: readonly GeocodingCandidateItem[]
  readonly selectedCandidateId?: string | null
  readonly onResolve: (payload: { forceRetry: boolean; operationId: string }) => Promise<boolean | void>
  readonly onReview: (payload: ReviewPackageGeocodingPayload) => Promise<boolean | void>
  readonly onCorrectAddress: (payload: {
    expectedAddressId: string
    newOriginalText: string
    newMunicipalityCode: string
    reason: string
    expectedAttemptId?: string | null
  }) => Promise<boolean | void>
  readonly submitting: boolean
  readonly feedback: { type: "success" | "error" | "conflict"; message: string } | null
}

function generateStableOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "op-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36)
}

export function PackageRecoveryActions({
  addressId,
  geocodingAttemptId,
  currentAddress,
  currentMunicipalityCode,
  candidates = [],
  selectedCandidateId,
  onResolve,
  onReview,
  onCorrectAddress,
  submitting,
  feedback,
}: PackageRecoveryActionsProps) {
  const [activeTab, setActiveTab] = useState<"resolve" | "review" | "correct">("resolve")
  const [resolveOpId, setResolveOpId] = useState<string>(generateStableOperationId())
  const [reviewOpId, setReviewOpId] = useState<string>(generateStableOperationId())

  const [reviewCandidateId, setReviewCandidateId] = useState<string>(
    selectedCandidateId || (candidates[0]?.id ?? "")
  )
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED")
  const [reviewReason, setReviewReason] = useState<string>("")
  const [reviewFieldError, setReviewFieldError] = useState<string | null>(null)

  const [correctText, setCorrectText] = useState<string>(currentAddress)
  const [correctMunicipality, setCorrectMunicipality] = useState<string>(
    currentMunicipalityCode || ""
  )
  const [correctReason, setCorrectReason] = useState<string>("")
  const [correctFieldError, setCorrectFieldError] = useState<{
    text?: string
    municipality?: string
    reason?: string
  }>({})

  const switchTab = (tab: "resolve" | "review" | "correct") => {
    setActiveTab(tab)
    setReviewFieldError(null)
    setCorrectFieldError({})
  }

  const handleResolveSubmit = async () => {
    const success = await onResolve({
      forceRetry: true,
      operationId: resolveOpId,
    })
    if (success !== false) {
      setResolveOpId(generateStableOperationId())
    }
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setReviewFieldError(null)

    if (!reviewCandidateId) {
      setReviewFieldError("Debes seleccionar un candidato para revisar.")
      return
    }
    if (!reviewReason.trim()) {
      setReviewFieldError("El motivo de la decisión es obligatorio.")
      return
    }
    if (!geocodingAttemptId) {
      setReviewFieldError("El paquete no tiene un intento de geocodificación activo para revisar.")
      return
    }

    const success = await onReview({
      expectedAddressId: addressId,
      expectedAttemptId: geocodingAttemptId,
      candidateId: reviewCandidateId,
      decision: reviewDecision,
      reason: reviewReason.trim(),
      operationId: reviewOpId,
    })
    if (success !== false) {
      setReviewOpId(generateStableOperationId())
      setReviewReason("")
    }
  }

  const handleCorrectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: { text?: string; municipality?: string; reason?: string } = {}

    if (!correctText.trim()) {
      errors.text = "La nueva dirección es obligatoria."
    }
    if (!correctMunicipality.trim()) {
      errors.municipality = "El código de municipio es obligatorio."
    }
    if (!correctReason.trim()) {
      errors.reason = "El motivo de la corrección es obligatorio."
    }

    setCorrectFieldError(errors)
    if (Object.keys(errors).length > 0) return

    await onCorrectAddress({
      expectedAddressId: addressId,
      newOriginalText: correctText.trim(),
      newMunicipalityCode: correctMunicipality.trim().toUpperCase(),
      reason: correctReason.trim(),
      expectedAttemptId: geocodingAttemptId,
    })
  }

  return (
    <div className="dashboard-panel" data-testid="recovery-actions-panel">
      <div className="panel-heading">
        <div>
          <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Operaciones</span>
          <h2>Acciones de recuperación geográfica</h2>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => switchTab("resolve")}
          style={{
            padding: "0.5rem 0.8rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "resolve" ? "2px solid var(--blue)" : "2px solid transparent",
            background: "transparent",
            color: activeTab === "resolve" ? "var(--blue)" : "var(--text-muted)",
            cursor: "pointer",
          }}
          data-testid="tab-resolve"
        >
          Reintentar resolución
        </button>
        <button
          type="button"
          onClick={() => switchTab("review")}
          disabled={candidates.length === 0}
          style={{
            padding: "0.5rem 0.8rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "review" ? "2px solid var(--blue)" : "2px solid transparent",
            background: "transparent",
            color: activeTab === "review" ? "var(--blue)" : "var(--text-muted)",
            cursor: candidates.length === 0 ? "not-allowed" : "pointer",
            opacity: candidates.length === 0 ? 0.5 : 1,
          }}
          data-testid="tab-review"
        >
          Revisar candidato ({candidates.length})
        </button>
        <button
          type="button"
          onClick={() => switchTab("correct")}
          style={{
            padding: "0.5rem 0.8rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "correct" ? "2px solid var(--blue)" : "2px solid transparent",
            background: "transparent",
            color: activeTab === "correct" ? "var(--blue)" : "var(--text-muted)",
            cursor: "pointer",
          }}
          data-testid="tab-correct"
        >
          Corregir dirección
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === "error" || feedback.type === "conflict" ? "alert" : "status"}
          style={{
            padding: "0.75rem 0.9rem",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: "0.8rem",
            fontWeight: 600,
            marginBottom: "1rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            background:
              feedback.type === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : feedback.type === "conflict"
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${
              feedback.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : feedback.type === "conflict"
                  ? "rgba(245, 158, 11, 0.3)"
                  : "rgba(239, 68, 68, 0.3)"
            }`,
            color:
              feedback.type === "success"
                ? "var(--success, #059669)"
                : feedback.type === "conflict"
                  ? "#b45309"
                  : "#dc2626",
          }}
          data-testid="action-feedback-banner"
        >
          {feedback.type === "success" ? (
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          ) : (
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {activeTab === "resolve" && (
        <div style={{ display: "grid", gap: "0.8rem" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Re-ejecuta la búsqueda geográfica sobre el catálogo y valida la transitabilidad en la red vial del municipio configurado.
          </p>
          <div>
            <button
              type="button"
              className="form-submit"
              onClick={() => void handleResolveSubmit()}
              disabled={submitting}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              data-testid="submit-resolve-button"
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              {submitting ? "Procesando resolución…" : "Reintentar resolución automática"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "review" && (
        <form onSubmit={(e) => void handleReviewSubmit(e)} style={{ display: "grid", gap: "0.9rem" }}>
          <div className="field">
            <label htmlFor="review-candidate-select" style={{ fontWeight: 600, fontSize: "0.8rem" }}>
              Candidato a revisar <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              id="review-candidate-select"
              value={reviewCandidateId}
              onChange={(e) => {
                setReviewCandidateId(e.target.value)
                setReviewOpId(generateStableOperationId())
              }}
              disabled={submitting}
              data-testid="review-candidate-select"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  Posición #{c.rank} — Puntuación {c.score.toFixed(2)} ({c.precision}) [{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}]
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={{ fontWeight: 600, fontSize: "0.8rem" }}>Decisión</label>
            <div style={{ display: "flex", gap: "1rem", marginTop: "0.2rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="radio"
                  name="reviewDecision"
                  value="APPROVED"
                  checked={reviewDecision === "APPROVED"}
                  onChange={() => {
                    setReviewDecision("APPROVED")
                    setReviewOpId(generateStableOperationId())
                  }}
                  disabled={submitting}
                  data-testid="decision-approve"
                />
                <ThumbsUp size={14} style={{ color: "var(--success)" }} /> Aprobar candidato
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="radio"
                  name="reviewDecision"
                  value="REJECTED"
                  checked={reviewDecision === "REJECTED"}
                  onChange={() => {
                    setReviewDecision("REJECTED")
                    setReviewOpId(generateStableOperationId())
                  }}
                  disabled={submitting}
                  data-testid="decision-reject"
                />
                <ThumbsDown size={14} style={{ color: "#dc2626" }} /> Rechazar candidato
              </label>
            </div>
          </div>

          <div className="field">
            <label htmlFor="review-reason-text" style={{ fontWeight: 600, fontSize: "0.8rem" }}>
              Motivo de la decisión <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              id="review-reason-text"
              rows={3}
              value={reviewReason}
              onChange={(e) => {
                setReviewReason(e.target.value)
                setReviewOpId(generateStableOperationId())
              }}
              placeholder="Explica la justificación operativa o de campo para aprobar o rechazar este candidato…"
              disabled={submitting}
              data-testid="review-reason-input"
            />
            {reviewFieldError && (
              <span className="field-error" data-testid="review-field-error">
                {reviewFieldError}
              </span>
            )}
          </div>

          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", background: "var(--surface-subtle)", padding: "0.5rem", borderRadius: "4px" }}>
            Nota: Aprobar el candidato fija las coordenadas oficiales del paquete. La aptitud vial se evalúa de forma automática contra el dataset activo.
          </div>

          <div>
            <button
              type="submit"
              className="form-submit"
              disabled={submitting}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              data-testid="submit-review-button"
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
              {submitting ? "Guardando revisión…" : "Guardar decisión de revisión"}
            </button>
          </div>
        </form>
      )}

      {activeTab === "correct" && (
        <form onSubmit={(e) => void handleCorrectSubmit(e)} style={{ display: "grid", gap: "0.9rem" }}>
          <div className="field">
            <label htmlFor="correct-address-text" style={{ fontWeight: 600, fontSize: "0.8rem" }}>
              Texto de la dirección corregida <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="correct-address-text"
              type="text"
              value={correctText}
              onChange={(e) => {
                setCorrectText(e.target.value)
              }}
              placeholder="Ej. Calle 80 # 53-67"
              disabled={submitting}
              data-testid="correct-address-input"
            />
            {correctFieldError.text && (
              <span className="field-error">{correctFieldError.text}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="correct-municipality-code" style={{ fontWeight: 600, fontSize: "0.8rem" }}>
              Código DANE de municipio <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="correct-municipality-code"
              type="text"
              maxLength={10}
              value={correctMunicipality}
              onChange={(e) => {
                setCorrectMunicipality(e.target.value)
              }}
              placeholder="Ej. 08001"
              disabled={submitting}
              data-testid="correct-municipality-input"
            />
            {correctFieldError.municipality && (
              <span className="field-error">{correctFieldError.municipality}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="correct-reason-text" style={{ fontWeight: 600, fontSize: "0.8rem" }}>
              Motivo de la corrección <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              id="correct-reason-text"
              rows={3}
              value={correctReason}
              onChange={(e) => {
                setCorrectReason(e.target.value)
              }}
              placeholder="Explica qué error se corrigió en la dirección…"
              disabled={submitting}
              data-testid="correct-reason-input"
            />
            {correctFieldError.reason && (
              <span className="field-error">{correctFieldError.reason}</span>
            )}
          </div>

          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", background: "var(--surface-subtle)", padding: "0.5rem", borderRadius: "4px" }}>
            Al guardar, se creará un nuevo registro de dirección y se re-ejecutará la geocodificación sobre el catálogo activo.
          </div>

          <div>
            <button
              type="submit"
              className="form-submit"
              disabled={submitting}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              data-testid="submit-correct-button"
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <Edit3 size={16} />}
              {submitting ? "Guardando corrección…" : "Guardar corrección y re-geocodificar"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
