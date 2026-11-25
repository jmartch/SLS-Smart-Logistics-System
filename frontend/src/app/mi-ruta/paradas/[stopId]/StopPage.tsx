import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  MapPin,
  RefreshCw,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { useAuth } from "../../../../auth"
import { attendRouteStop } from "../../deliveriesApi"
import {
  computeAttendStopSignature,
  IdempotentActionTracker,
  RequestSequenceGuard,
} from "../../../../shared/idempotency/idempotentAction"
import { loadStopPageState, type StopPageState } from "./stopPageState"
import { StopArrivalCard } from "./StopArrivalCard"
import { StopIncidentSection } from "./StopIncidentSection"
import { StopPackageList } from "./StopPackageList"
import { StopStateBanner } from "./StopStateBanner"

export interface StopPageViewProps {
  readonly pageState: StopPageState | null
  readonly loading: boolean
  readonly attending: boolean
  readonly attendError: string | null
  readonly selectedPackageId: string | null
  readonly attemptMode: "success" | "failed"
  readonly showIncidentForm: boolean
  readonly onReload: () => Promise<void> | void
  readonly onAttendStop: () => void
  readonly onSelectPackage: (
    packageId: string,
    mode: "success" | "failed",
  ) => void
  readonly onClosePackageAttempt: () => void
  readonly onToggleIncidentForm: () => void
}

export function StopPageView({
  pageState,
  loading,
  attending,
  attendError,
  selectedPackageId,
  attemptMode,
  showIncidentForm,
  onReload,
  onAttendStop,
  onSelectPackage,
  onClosePackageAttempt,
  onToggleIncidentForm,
}: StopPageViewProps) {
  if (loading || !pageState || pageState.kind === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "50vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
        }}
      >
        <Loader2 size={32} className="spin" color="var(--blue-dark)" />
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Cargando información operativa de la parada...
        </p>
      </div>
    )
  }

  if (pageState.kind === "invalid_params") {
    return (
      <div
        role="alert"
        style={{
          maxWidth: 600,
          margin: "2rem auto",
          padding: "2rem",
          background: "white",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <AlertCircle
          size={40}
          color="#c0392b"
          style={{ margin: "0 auto 1rem" }}
        />
        <h2
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            color: "var(--navy)",
          }}
        >
          Parámetros de parada inválidos
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
          }}
        >
          {pageState.message}
        </p>
        <div
          style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}
        >
          <Link
            to="/app/rutas"
            style={{
              padding: "0.6rem 1.25rem",
              background: "var(--navy)",
              color: "white",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Ir a Rutas
          </Link>
          <Link
            to="/app/mi-ruta"
            style={{
              padding: "0.6rem 1.25rem",
              background: "white",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Ir a Mi ruta
          </Link>
        </div>
      </div>
    )
  }

  if (pageState.kind === "not_found") {
    return (
      <div
        role="alert"
        style={{
          maxWidth: 600,
          margin: "2rem auto",
          padding: "2rem",
          background: "white",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <MapPin
          size={40}
          color="var(--text-muted)"
          style={{ margin: "0 auto 1rem" }}
        />
        <h2
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            color: "var(--navy)",
          }}
        >
          Parada no encontrada
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
          }}
        >
          {pageState.message}
        </p>
        <Link
          to={
            pageState.routeId ? `/app/rutas/${pageState.routeId}` : "/app/rutas"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.6rem 1.25rem",
            background: "var(--navy)",
            color: "white",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} /> Volver a rutas
        </Link>
      </div>
    )
  }

  if (pageState.kind === "error") {
    return (
      <div
        role="alert"
        style={{
          maxWidth: 600,
          margin: "2rem auto",
          padding: "2rem",
          background: "white",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <AlertCircle
          size={40}
          color="#c0392b"
          style={{ margin: "0 auto 1rem" }}
        />
        <h2
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            color: "var(--navy)",
          }}
        >
          {pageState.title}
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
          }}
        >
          {pageState.message}
        </p>
        <div
          style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}
        >
          <button
            type="button"
            onClick={onReload}
            style={{
              padding: "0.6rem 1.25rem",
              background: "var(--navy)",
              color: "white",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={15} /> Reintentar
          </button>
          <Link
            to="/app/rutas"
            style={{
              padding: "0.6rem 1.25rem",
              background: "white",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Volver a Rutas
          </Link>
        </div>
      </div>
    )
  }

  const { route, stop, stopDetail, isAttended, canExecute, routeInProgress } =
    pageState

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", paddingBottom: "3rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          to={`/app/rutas/${route.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "var(--text-muted)",
            fontSize: "0.82rem",
            fontWeight: 700,
            textDecoration: "none",
            marginBottom: "0.75rem",
          }}
        >
          <ArrowLeft size={16} /> Volver a la ruta ({route.id.slice(0, 8)})
        </Link>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(1.5rem, 2.8vw, 2.2rem)",
                  fontFamily: "Space Grotesk, sans-serif",
                  color: "var(--navy)",
                }}
              >
                Parada #{stop.stopNumber}
              </h1>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.55rem",
                  borderRadius: "999px",
                  background:
                    stop.state === "COMPLETED"
                      ? "#f0faf5"
                      : stop.state === "FAILED"
                        ? "#fff3f3"
                        : "#eef2ff",
                  color:
                    stop.state === "COMPLETED"
                      ? "var(--success)"
                      : stop.state === "FAILED"
                        ? "#c0392b"
                        : "var(--blue-dark)",
                  border: `1px solid ${
                    stop.state === "COMPLETED"
                      ? "#b7eb8f"
                      : stop.state === "FAILED"
                        ? "#f5c2c7"
                        : "#c7d2fe"
                  }`,
                }}
              >
                {stop.state}
              </span>
            </div>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: "var(--text-muted)",
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <MapPin size={15} />
              Lat: {stop.latitude.toFixed(5)}, Lon: {stop.longitude.toFixed(5)}
              {stopDetail?.address ? ` · ${stopDetail.address}` : ""}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                fontSize: "0.8rem",
                padding: "0.3rem 0.7rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--navy)",
                fontWeight: 600,
              }}
            >
              Ruta: {route.state}
            </span>
            <button
              type="button"
              onClick={onReload}
              disabled={loading}
              aria-label="Actualizar parada"
              style={{
                padding: "0.4rem 0.65rem",
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <StopStateBanner
        routeState={route.state}
        routeInProgress={routeInProgress}
        canExecute={canExecute}
      />

      <StopArrivalCard
        isAttended={isAttended}
        routeInProgress={routeInProgress}
        canExecute={canExecute}
        attending={attending}
        attendError={attendError}
        onAttendStop={onAttendStop}
      />

      <StopPackageList
        routeId={route.id}
        stopId={stop.stopId}
        packages={stop.packages}
        isAttended={isAttended}
        routeInProgress={routeInProgress}
        canExecute={canExecute}
        selectedPackageId={selectedPackageId}
        attemptMode={attemptMode}
        onSelectPackage={onSelectPackage}
        onClosePackageAttempt={onClosePackageAttempt}
        onReload={onReload}
      />

      <StopIncidentSection
        routeId={route.id}
        stopId={stop.stopId}
        routeState={route.state}
        canExecute={canExecute}
        showIncidentForm={showIncidentForm}
        onToggleIncidentForm={onToggleIncidentForm}
      />
    </div>
  )
}

export interface StopPageControllerProps {
  readonly routeId: string | null
  readonly stopId: string | undefined
  readonly contextKey: string
}

export function StopPageController({
  routeId,
  stopId,
  contextKey,
}: StopPageControllerProps) {
  const { user } = useAuth()
  const [pageState, setPageState] = useState<StopPageState | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const [attending, setAttending] = useState<boolean>(false)
  const [attendError, setAttendError] = useState<string | null>(null)

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  )
  const [attemptMode, setAttemptMode] = useState<"success" | "failed">(
    "success",
  )

  const [showIncidentForm, setShowIncidentForm] = useState<boolean>(false)

  const isMountedRef = useRef<boolean>(true)
  const currentContextKeyRef = useRef<string>(contextKey)

  useEffect(() => {
    currentContextKeyRef.current = contextKey
  }, [contextKey])

  const sequenceGuard = useMemo(() => new RequestSequenceGuard(), [])
  const tracker = useMemo(() => new IdempotentActionTracker(), [])

  const permissions = useMemo(
    () => user?.permissions ?? [],
    [user?.permissions],
  )

  const reload = useCallback(async (): Promise<void> => {
    const seq = sequenceGuard.nextSequence()
    try {
      const state = await loadStopPageState(routeId, stopId, permissions)
      if (isMountedRef.current && sequenceGuard.isCurrent(seq)) {
        setPageState(state)
        setLoading(false)
      }
    } catch (err: unknown) {
      if (isMountedRef.current && sequenceGuard.isCurrent(seq)) {
        setPageState({
          kind: "error",
          status: 500,
          title: "Error inesperado",
          message:
            err instanceof Error
              ? err.message
              : "Error al cargar la información de la parada.",
        })
        setLoading(false)
      }
    }
  }, [routeId, stopId, permissions, sequenceGuard])

  useEffect(() => {
    isMountedRef.current = true
    setSelectedPackageId(null)
    setShowIncidentForm(false)
    setAttendError(null)
    setLoading(true)
    void reload()
    return () => {
      isMountedRef.current = false
      sequenceGuard.invalidate()
    }
  }, [reload, sequenceGuard])

  const handleManualReload = async (): Promise<void> => {
    setLoading(true)
    await reload()
  }

  const handleAttendStop = async (): Promise<void> => {
    if (
      !isMountedRef.current ||
      !pageState ||
      pageState.kind !== "ready" ||
      attending
    ) {
      return
    }

    setAttending(true)
    setAttendError(null)

    try {
      const signature = computeAttendStopSignature({
        routeId: pageState.route.id,
        stopId: pageState.stop.stopId,
      })
      const key = tracker.getKey(signature)
      await attendRouteStop(pageState.route.id, pageState.stop.stopId, key)
      if (!isMountedRef.current || currentContextKeyRef.current !== contextKey) {
        return
      }
      await reload()
    } catch (err: unknown) {
      if (!isMountedRef.current || currentContextKeyRef.current !== contextKey) {
        return
      }
      setAttendError(
        err instanceof Error
          ? err.message
          : "Error inesperado al registrar la llegada a la parada.",
      )
    } finally {
      if (isMountedRef.current && currentContextKeyRef.current === contextKey) {
        setAttending(false)
      }
    }
  }

  return (
    <StopPageView
      pageState={pageState}
      loading={loading}
      attending={attending}
      attendError={attendError}
      selectedPackageId={selectedPackageId}
      attemptMode={attemptMode}
      showIncidentForm={showIncidentForm}
      onReload={handleManualReload}
      onAttendStop={handleAttendStop}
      onSelectPackage={(pkgId, mode) => {
        setSelectedPackageId(pkgId)
        setAttemptMode(mode)
      }}
      onClosePackageAttempt={() => setSelectedPackageId(null)}
      onToggleIncidentForm={() => setShowIncidentForm((prev) => !prev)}
    />
  )
}

export function StopPage() {
  const { stopId } = useParams<{ stopId: string }>()
  const [searchParams] = useSearchParams()
  const routeId = searchParams.get("routeId")

  const contextKey = `${routeId ?? ""}:${stopId ?? ""}`

  return (
    <StopPageController
      key={contextKey}
      contextKey={contextKey}
      routeId={routeId}
      stopId={stopId}
    />
  )
}
