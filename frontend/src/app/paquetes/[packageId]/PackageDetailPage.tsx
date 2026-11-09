import { ArrowLeft, Loader2, Lock, RefreshCw, ShieldAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { useAuth } from "../../../auth"
import { ApiError } from "../../../shared/api/httpClient"
import { EmptyState } from "../../../shared/ui/EmptyState"
import {
  correctPackageAddress,
  getPackageDetail,
  resolvePackageGeocoding,
  reviewPackageGeocoding,
  type PackageDetailResponse,
} from "../api/packagesApi"
import { PackageCandidatesList } from "../components/PackageCandidatesList"
import { PackageGeocodingCard } from "../components/PackageGeocodingCard"
import { PackageRecoveryActions } from "../components/PackageRecoveryActions"
import {
  PACKAGE_PRIORITY_LABELS,
  PACKAGE_STATE_COLORS,
  PACKAGE_STATE_LABELS,
  type PackagePriority,
  type PackageState,
  type ReviewPackageGeocodingPayload,
} from "../types"

export function PackageDetailPage() {
  const { packageId } = useParams()
  const { hasPermission } = useAuth()
  const canManageGeocoding = hasPermission("CLASSIFY_PACKAGES") || hasPermission("MANAGE_TENANT")

  const [pkg, setPkg] = useState<PackageDetailResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(Boolean(packageId))
  const [detailError, setDetailError] = useState<string | null>(
    packageId ? null : "No se proporcionó un identificador de paquete válido.",
  )

  const [submittingAction, setSubmittingAction] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error" | "conflict"
    message: string
  } | null>(null)

  const activePackageIdRef = useRef<string | null>(packageId ?? null)
  const requestSeqRef = useRef<number>(0)
  const isMountedRef = useRef<boolean>(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchDetail = useCallback(
    async (id: string, preserveVisible = false, afterConflict = false) => {
      const seq = ++requestSeqRef.current
      if (!preserveVisible) {
        setLoadingDetail(true)
      }
      setDetailError(null)
      try {
        const detail = await getPackageDetail(id)
        if (!isMountedRef.current || seq !== requestSeqRef.current || activePackageIdRef.current !== id) {
          return
        }
        setPkg(detail)
      } catch (error: unknown) {
        if (!isMountedRef.current || seq !== requestSeqRef.current || activePackageIdRef.current !== id) {
          return
        }
        if (!preserveVisible) {
          setPkg(null)
          setDetailError(
            error instanceof Error ? error.message : "No fue posible consultar el paquete.",
          )
        } else {
          setActionFeedback({
            type: "error",
            message: afterConflict
              ? "Se detectó un conflicto de concurrencia, pero falló la recarga automática. Haz clic en recargar para obtener los datos más recientes."
              : "La operación se guardó en el servidor, pero falló la recarga automática del paquete. Haz clic en recargar.",
          })
        }
      } finally {
        if (isMountedRef.current && seq === requestSeqRef.current && activePackageIdRef.current === id) {
          setLoadingDetail(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    activePackageIdRef.current = packageId ?? null
    requestSeqRef.current++
    setPkg(null)
    setActionFeedback(null)
    setSubmittingAction(false)

    if (!packageId) {
      setLoadingDetail(false)
      setDetailError("No se proporcionó un identificador de paquete válido.")
      return
    }
    void fetchDetail(packageId)
  }, [packageId, fetchDetail])

  const handleResolve = async (payload: { forceRetry: boolean; operationId: string }): Promise<boolean> => {
    if (!pkg || activePackageIdRef.current !== pkg.id) return false
    const targetPkgId = pkg.id
    setSubmittingAction(true)
    setActionFeedback(null)
    try {
      await resolvePackageGeocoding(targetPkgId, {
        expectedAttemptId: pkg.geocodingAttemptId,
        forceRetry: payload.forceRetry,
        operationId: payload.operationId,
      })
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      setActionFeedback({
        type: "success",
        message: "Resolución de geocodificación ejecutada exitosamente.",
      })
      await fetchDetail(targetPkgId, true, false)
      return true
    } catch (err) {
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      if (err instanceof ApiError && err.status === 409) {
        setActionFeedback({
          type: "conflict",
          message:
            "Conflicto de concurrencia (409): El intento o estado del paquete cambió en el servidor. Se actualizaron los datos más recientes; revisa la información y reintenta.",
        })
        await fetchDetail(targetPkgId, true, true)
      } else if (err instanceof ApiError && err.status === 403) {
        setActionFeedback({
          type: "error",
          message: "No tienes permisos para reintentar la geocodificación de este paquete.",
        })
      } else {
        setActionFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Ocurrió un error al resolver la geocodificación.",
        })
      }
      return false
    } finally {
      if (isMountedRef.current && activePackageIdRef.current === targetPkgId) {
        setSubmittingAction(false)
      }
    }
  }

  const handleReview = async (payload: ReviewPackageGeocodingPayload): Promise<boolean> => {
    if (!pkg || activePackageIdRef.current !== pkg.id) return false
    const targetPkgId = pkg.id
    setSubmittingAction(true)
    setActionFeedback(null)
    try {
      await reviewPackageGeocoding(targetPkgId, payload)
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      setActionFeedback({
        type: "success",
        message: `Decisión de revisión guardada exitosamente (${payload.decision === "APPROVED" ? "Aprobado" : "Rechazado"}).`,
      })
      await fetchDetail(targetPkgId, true, false)
      return true
    } catch (err) {
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      if (err instanceof ApiError && err.status === 409) {
        setActionFeedback({
          type: "conflict",
          message:
            "Conflicto de concurrencia (409): La dirección o el intento del paquete cambiaron en el servidor. Se recargaron los datos actuales; confirma la selección e intenta nuevamente.",
        })
        await fetchDetail(targetPkgId, true, true)
      } else if (err instanceof ApiError && err.status === 403) {
        setActionFeedback({
          type: "error",
          message: "No tienes permisos para revisar candidatos de este paquete.",
        })
      } else {
        setActionFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Ocurrió un error al guardar la revisión.",
        })
      }
      return false
    } finally {
      if (isMountedRef.current && activePackageIdRef.current === targetPkgId) {
        setSubmittingAction(false)
      }
    }
  }

  const handleCorrectAddress = async (payload: {
    expectedAddressId: string
    newOriginalText: string
    newMunicipalityCode: string
    reason: string
    expectedAttemptId?: string | null
  }): Promise<boolean> => {
    if (!pkg || activePackageIdRef.current !== pkg.id) return false
    const targetPkgId = pkg.id
    setSubmittingAction(true)
    setActionFeedback(null)
    try {
      await correctPackageAddress(targetPkgId, payload)
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      setActionFeedback({
        type: "success",
        message: "Dirección corregida y re-geocodificación ejecutada exitosamente.",
      })
      await fetchDetail(targetPkgId, true, false)
      return true
    } catch (err) {
      if (!isMountedRef.current || activePackageIdRef.current !== targetPkgId) return false
      if (err instanceof ApiError && err.status === 409) {
        setActionFeedback({
          type: "conflict",
          message:
            "Conflicto de concurrencia (409): La dirección de entrega fue modificada por otro usuario o proceso. Se cargaron los datos más recientes; revisa y reenvía.",
        })
        await fetchDetail(targetPkgId, true, true)
      } else if (err instanceof ApiError && err.status === 403) {
        setActionFeedback({
          type: "error",
          message: "No tienes permisos para corregir la dirección de este paquete.",
        })
      } else {
        setActionFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Ocurrió un error al corregir la dirección.",
        })
      }
      return false
    } finally {
      if (isMountedRef.current && activePackageIdRef.current === targetPkgId) {
        setSubmittingAction(false)
      }
    }
  }

  if (loadingDetail) {
    return (
      <EmptyState
        icon={<Loader2 size={32} className="spin" />}
        title="Consultando paquete"
        body="Cargando la información persistida del tenant."
      />
    )
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

  const isStatePermittedForRecovery =
    pkg.state === "REGISTERED" ||
    pkg.state === "CLASSIFIED" ||
    pkg.state === "PENDING_ASSIGNMENT"

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link
            to="/app/paquetes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: 700,
              textDecoration: "none",
              marginBottom: "0.6rem",
            }}
          >
            <ArrowLeft size={15} /> Paquetes
          </Link>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>{pkg.trackingCode}</h1>
          <p style={{ marginTop: "0.4rem" }}>{pkg.address}</p>
        </div>
        <span
          className={`status ${PACKAGE_STATE_COLORS[stateKey] ?? "status--muted"}`}
          style={{ fontSize: "0.78rem", padding: "0.5rem 1rem", flexShrink: 0, marginTop: "0.5rem" }}
          data-testid="package-state-badge"
        >
          {PACKAGE_STATE_LABELS[stateKey] ?? pkg.state}
        </span>
        <button
          type="button"
          onClick={() => void fetchDetail(pkg.id, true)}
          disabled={loadingDetail}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.45rem 0.8rem",
            borderRadius: "var(--radius-sm, 6px)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--navy)",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
            marginTop: "0.5rem",
          }}
          data-testid="reload-package-button"
        >
          <RefreshCw size={14} className={loadingDetail ? "spin" : undefined} />
          Recargar
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "1rem", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <PackageGeocodingCard geocoding={pkg.geocoding} />

          {pkg.candidates && pkg.candidates.length > 0 && (
            <PackageCandidatesList
              candidates={pkg.candidates}
              selectedCandidateId={pkg.geocoding?.selectedCandidateId}
            />
          )}

          {canManageGeocoding && isStatePermittedForRecovery ? (
            <PackageRecoveryActions
              key={`${pkg.id}-${pkg.addressId}-${pkg.geocodingAttemptId ?? "none"}-${pkg.geocoding?.selectedCandidateId ?? "none"}`}
              packageId={pkg.id}
              addressId={pkg.addressId}
              geocodingAttemptId={pkg.geocodingAttemptId}
              currentAddress={pkg.address}
              currentMunicipalityCode={pkg.municipalityCode}
              candidates={pkg.candidates}
              selectedCandidateId={pkg.geocoding?.selectedCandidateId}
              onResolve={handleResolve}
              onReview={handleReview}
              onCorrectAddress={handleCorrectAddress}
              submitting={submittingAction}
              feedback={actionFeedback}
            />
          ) : !canManageGeocoding ? (
            <div
              className="dashboard-panel"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.9rem 1rem",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
              }}
              data-testid="permission-denied-notice"
            >
              <Lock size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span>
                Para revisar candidatos de geocodificación o corregir la dirección de entrega se requiere rol de Clasificación o Administrador.
              </span>
            </div>
          ) : (
            <div
              className="dashboard-panel"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.9rem 1rem",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
              }}
              data-testid="state-disallowed-notice"
            >
              <ShieldAlert size={18} style={{ color: "#b45309", flexShrink: 0 }} />
              <span>
                La revisión y corrección geográfica solo están habilitadas para envíos en estado <strong>Registrado</strong>, <strong>Clasificado</strong> o <strong>Pendiente de asignación</strong>. El paquete se encuentra en estado <strong>{PACKAGE_STATE_LABELS[stateKey] ?? pkg.state}</strong>.
              </span>
            </div>
          )}

          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Resumen</span>
                <h2>Información del envío</h2>
              </div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2rem", margin: 0 }}>
              {[
                ["Código de guía", pkg.trackingCode],
                ["Dirección de entrega", pkg.address],
                ["Municipio (DANE)", pkg.municipalityCode ?? "No especificado"],
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
                  <dt
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "0.2rem",
                    }}
                  >
                    {k}
                  </dt>
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
                <li
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "0 0.9rem",
                    paddingBottom: i < pkg.history.length - 1 ? "1.2rem" : 0,
                    position: "relative",
                  }}
                >
                  {i < pkg.history.length - 1 && (
                    <span
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "24px",
                        bottom: 0,
                        width: "2px",
                        background: "var(--border)",
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: i === 0 ? "var(--blue)" : "var(--border)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      zIndex: 1,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        className={`status ${PACKAGE_STATE_COLORS[toStateKey] ?? "status--muted"}`}
                        style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
                      >
                        {PACKAGE_STATE_LABELS[toStateKey] ?? h.toState}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                        {new Date(h.createdAt).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {h.reasonCode && (
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Motivo: {h.reasonCode}
                      </p>
                    )}
                    {h.changedBy && (
                      <p style={{ margin: "0.1rem 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Por: {h.changedBy}
                      </p>
                    )}
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
