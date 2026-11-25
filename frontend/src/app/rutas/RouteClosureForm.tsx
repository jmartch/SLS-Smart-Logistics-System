import { AlertCircle, Check, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  getDeliveryManifest,
  type DeliveryManifestPackageItem,
} from "../mi-ruta/deliveriesApi"
import {
  closeRoute,
  RouteClosureMode,
  type CloseRouteResult,
  type RouteDetailResult,
} from "./routesApi"
import {
  IdempotentActionTracker,
  RequestSequenceGuard,
  computeRouteClosureSignature,
} from "../../shared/idempotency/idempotentAction"
import {
  filterUnreceivedActivePackages,
  toggleAllAssignmentsSelection,
  toggleAssignmentSelection,
  validateClosureInput,
} from "./routeClosureState"

export interface RouteClosureFormProps {
  readonly route: RouteDetailResult
  readonly onSuccess: (result: CloseRouteResult) => void
  readonly onCancel: () => void
}

const FORCED_CLOSURE_REASONS = [
  {
    code: "WEATHER_EMERGENCY",
    label: "Emergencia climática o desastre natural",
  },
  { code: "VEHICLE_BREAKDOWN", label: "Avería mecánica o falla vehicular" },
  { code: "SECURITY_ISSUE", label: "Problemas de seguridad o orden público" },
  { code: "OPERATIONAL_REASON", label: "Corte de jornada / motivo operativo" },
  { code: "OTHER", label: "Otro motivo de contingencia" },
] as const

export function RouteClosureForm({
  route,
  onSuccess,
  onCancel,
}: RouteClosureFormProps) {
  const [mode, setMode] = useState<RouteClosureMode>(RouteClosureMode.REGULAR)
  const [reasonCode, setReasonCode] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [actualDistanceKm, setActualDistanceKm] = useState<string>("")
  const [depotId, setDepotId] = useState<string>(route.depotId ?? "")
  const [physicalReceiptConfirmed, setPhysicalReceiptConfirmed] =
    useState<boolean>(false)
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  )

  const [loadingManifest, setLoadingManifest] = useState<boolean>(true)
  const [manifestPackages, setManifestPackages] =
    useState<readonly DeliveryManifestPackageItem[]>([])
  const [manifestError, setManifestError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const tracker = useMemo(() => new IdempotentActionTracker(), [])
  const manifestSequenceGuard = useMemo(() => new RequestSequenceGuard(), [])
  const isSubmittingRef = useRef<boolean>(false)

  const fetchManifest = useCallback((targetRouteId: string) => {
    const seq = manifestSequenceGuard.nextSequence()
    setLoadingManifest(true)
    setManifestError(null)
    getDeliveryManifest(targetRouteId, "all")
      .then((manifest) => {
        if (manifestSequenceGuard.isCurrent(seq)) {
          setManifestPackages(filterUnreceivedActivePackages(manifest))
        }
      })
      .catch((err: unknown) => {
        if (manifestSequenceGuard.isCurrent(seq)) {
          setManifestError(
            err instanceof Error
              ? err.message
              : "No fue posible consultar el manifiesto de la ruta.",
          )
        }
      })
      .finally(() => {
        if (manifestSequenceGuard.isCurrent(seq)) {
          setLoadingManifest(false)
        }
      })
  }, [manifestSequenceGuard])

  useEffect(() => {
    setMode(RouteClosureMode.REGULAR)
    setReasonCode("")
    setNotes("")
    setActualDistanceKm("")
    setDepotId(route.depotId ?? "")
    setPhysicalReceiptConfirmed(false)
    setSelectedAssignmentIds([])
    setError(null)
    tracker.reset()
    fetchManifest(route.id)
    return () => {
      manifestSequenceGuard.invalidate()
    }
  }, [route.id, route.depotId, fetchManifest, tracker, manifestSequenceGuard])

  const handleToggleAssignment = (assignmentId: string) => {
    setSelectedAssignmentIds((current) =>
      toggleAssignmentSelection(current, assignmentId),
    )
  }

  const handleSelectAllAssignments = () => {
    setSelectedAssignmentIds((current) =>
      toggleAllAssignmentsSelection(current, manifestPackages),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      isSubmittingRef.current ||
      submitting ||
      loadingManifest ||
      manifestError
    ) {
      return
    }
    isSubmittingRef.current = true
    setError(null)

    const validation = validateClosureInput({
      mode,
      reasonCode,
      notes,
      actualDistanceKm,
      depotId,
      physicalReceiptConfirmed,
      selectedAssignmentIds,
    })

    if (!validation.success) {
      isSubmittingRef.current = false
      setError(validation.error)
      return
    }

    const commandInput = validation.command

    const signature = computeRouteClosureSignature({
      routeId: route.id,
      mode,
      reasonCode: commandInput.reasonCode,
      notes: commandInput.notes,
      actualDistanceM: commandInput.actualDistanceM,
      depotReceipt: commandInput.depotReceipt,
    })

    const idempotencyKey = tracker.getKey(signature)

    setSubmitting(true)
    try {
      const result = await closeRoute(route.id, commandInput, idempotencyKey)
      tracker.reset()
      onSuccess(result)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al cerrar la ruta.",
      )
    } finally {
      isSubmittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="closure-title"
      style={{
        marginTop: "1rem",
        padding: "1.2rem",
        background: "white",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 id="closure-title" style={{ margin: 0, fontSize: "1.05rem" }}>
          Cierre operativo de ruta
        </h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Cerrar formulario"
          style={{
            background: "none",
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "var(--radius-sm)",
            background: "#fff1f0",
            border: "1px solid #ffccc7",
            color: "#cf1322",
            fontSize: "0.8rem",
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <div className="field">
          <label style={{ fontWeight: 700, fontSize: "0.8rem" }}>
            Modo de cierre
          </label>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.3rem" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <input
                type="radio"
                name="closureMode"
                value={RouteClosureMode.REGULAR}
                checked={mode === RouteClosureMode.REGULAR}
                onChange={() => setMode(RouteClosureMode.REGULAR)}
                disabled={submitting}
              />
              <span style={{ fontSize: "0.82rem" }}>
                Regular (todas paradas atendidas)
              </span>
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <input
                type="radio"
                name="closureMode"
                value={RouteClosureMode.FORCED}
                checked={mode === RouteClosureMode.FORCED}
                onChange={() => setMode(RouteClosureMode.FORCED)}
                disabled={submitting}
              />
              <span style={{ fontSize: "0.82rem" }}>
                Forzado (contingencia / corte)
              </span>
            </label>
          </div>
        </div>

        {mode === RouteClosureMode.FORCED && (
          <>
            <div className="field">
              <label
                htmlFor="reason-code-select"
                style={{ fontWeight: 700, fontSize: "0.8rem" }}
              >
                Motivo de cierre forzado *
              </label>
              <select
                id="reason-code-select"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                }}
              >
                <option value="">
                  Seleccione el motivo de contingencia...
                </option>
                {FORCED_CLOSURE_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label
                htmlFor="notes-textarea"
                style={{ fontWeight: 700, fontSize: "0.8rem" }}
              >
                Observaciones explicativas *
              </label>
              <textarea
                id="notes-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                disabled={submitting}
                placeholder="Detalle el motivo del cierre anticipado..."
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                }}
              />
            </div>
          </>
        )}

        <div className="field">
          <label
            htmlFor="distance-input"
            style={{ fontWeight: 700, fontSize: "0.8rem" }}
          >
            Distancia real recorrida (km, opcional)
          </label>
          <input
            id="distance-input"
            type="number"
            step="0.1"
            min="0"
            value={actualDistanceKm}
            onChange={(e) => setActualDistanceKm(e.target.value)}
            disabled={submitting}
            placeholder="Ej. 14.8"
            style={{
              width: "100%",
              padding: "0.6rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "0.82rem",
            }}
          />
        </div>

        <div
          style={{
            padding: "0.8rem",
            background: "var(--surface-muted)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: "0.8rem",
                color: "var(--navy)",
              }}
            >
              Reconciliación y custodia en depósito ({manifestPackages.length}{" "}
              pendientes)
            </span>
            {manifestPackages.length > 0 && !loadingManifest && !manifestError && (
              <button
                type="button"
                onClick={handleSelectAllAssignments}
                disabled={submitting}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--blue-dark)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {selectedAssignmentIds.length === manifestPackages.length
                  ? "Deseleccionar todos"
                  : "Seleccionar todos"}
              </button>
            )}
          </div>

          {loadingManifest && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              <Loader2 size={14} className="spin" />
              <span>Consultando carga activa de la ruta...</span>
            </div>
          )}

          {manifestError && !loadingManifest && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "4px",
                background: "#fff1f0",
                border: "1px solid #ffccc7",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#cf1322" }}>
                {manifestError}
              </span>
              <button
                type="button"
                onClick={() => fetchManifest(route.id)}
                disabled={submitting}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cf1322",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  cursor: submitting ? "not-allowed" : "pointer",
                  textDecoration: "underline",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {!loadingManifest && !manifestError && manifestPackages.length === 0 && (
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              No hay paquetes con custodia activa pendiente de retorno.
            </p>
          )}

          {!loadingManifest && !manifestError && manifestPackages.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: "0.4rem",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            >
              {manifestPackages.map((pkg) => (
                <label
                  key={pkg.assignmentId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem",
                    background: "white",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    fontSize: "0.75rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedAssignmentIds.includes(pkg.assignmentId)}
                    onChange={() => handleToggleAssignment(pkg.assignmentId)}
                    disabled={submitting}
                  />
                  <span>
                    <strong>Guía: {pkg.trackingCode}</strong> · Estado:{" "}
                    {pkg.state}
                  </span>
                </label>
              ))}
            </div>
          )}

          {selectedAssignmentIds.length > 0 && (
            <div
              style={{ marginTop: "0.75rem", display: "grid", gap: "0.6rem" }}
            >
              <div>
                <label
                  htmlFor="depot-id-input"
                  style={{ fontSize: "0.75rem", fontWeight: 700 }}
                >
                  ID de Depósito para recepción
                </label>
                <input
                  id="depot-id-input"
                  type="text"
                  value={depotId}
                  onChange={(e) => setDepotId(e.target.value)}
                  disabled={submitting}
                  placeholder="UUID del depósito de custodia..."
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.75rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    marginTop: "0.2rem",
                  }}
                />
              </div>

              <label
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={physicalReceiptConfirmed}
                  onChange={(e) =>
                    setPhysicalReceiptConfirmed(e.target.checked)
                  }
                  disabled={submitting}
                />
                <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                  Confirmar recepción física de los paquetes en depósito
                </span>
              </label>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
            marginTop: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "white",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="form-submit"
            disabled={submitting || loadingManifest || Boolean(manifestError)}
            style={{ minWidth: "140px" }}
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="spin" /> Cerrando ruta...
              </>
            ) : (
              <>
                <Check size={15} /> Confirmar cierre
              </>
            )}
          </button>
        </div>
      </form>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
