import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  RefreshCw,
  Route,
  Truck,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import { EmptyState } from "../../shared/ui/EmptyState"
import { formatShortEntityId } from "../rutas/constants"
import {
  PLANNING_PACKAGE_STATE_COLOR,
  PLANNING_PACKAGE_STATE_LABELS,
  formatPendingReasonLabel,
  formatUnsuitabilityReason,
  getPlanningWorkspace,
  isPlanningPackageEligible,
  planAndAssignRoutes,
  replanEditableRoute,
  type PackagePlanningOutcome,
  type PlanningWorkspaceSnapshot,
} from "./planningApi"

function buildShiftWindow(dateStr: string, shift: "morning" | "afternoon") {
  const safeDate = dateStr || new Date().toISOString().slice(0, 10)
  if (shift === "morning") {
    return {
      startAt: `${safeDate}T08:00:00.000Z`,
      endAt: `${safeDate}T13:00:00.000Z`,
    }
  }
  return {
    startAt: `${safeDate}T13:00:00.000Z`,
    endAt: `${safeDate}T19:00:00.000Z`,
  }
}

function generateRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function PlanningPage() {
  const [date, setDate] = useState("2026-10-12")
  const [shift, setShift] = useState<"morning" | "afternoon">("morning")
  const [mode, setMode] = useState<"new-routes" | "editable-route">(
    "new-routes",
  )

  const [workspace, setWorkspace] = useState<PlanningWorkspaceSnapshot | null>(
    null,
  )
  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  const [selectedZoneId, setSelectedZoneId] = useState<string>("")
  const [selectedDepotId, setSelectedDepotId] = useState<string>("")
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("")
  const [selectedProfile, setSelectedProfile] = useState<
    "MOTOR_VEHICLE" | "MOTORCYCLE" | "BICYCLE" | "FOOT"
  >("MOTOR_VEHICLE")
  const [selectedEditableRouteId, setSelectedEditableRouteId] =
    useState<string>("")
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([])
  const [radiusMeters, setRadiusMeters] = useState<number>(2500)
  const [ordering, setOrdering] =
    useState<"nearest-neighbor" | "nearest-neighbor-two-opt">(
      "nearest-neighbor",
    )

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [executionSummary, setExecutionSummary] = useState<{
    readonly title: string
    readonly routeIds: readonly string[]
    readonly outcomes: readonly PackagePlanningOutcome[]
  } | null>(null)

  const requestSeqRef = useRef(0)

  const windowRange = useMemo(
    () => buildShiftWindow(date, shift),
    [date, shift],
  )

  const filteredPackages = useMemo(() => {
    if (!workspace) return []
    if (!selectedZoneId) return workspace.candidatePackages
    return workspace.candidatePackages.filter(
      (pkg) => pkg.zoneId === selectedZoneId,
    )
  }, [workspace, selectedZoneId])

  const eligiblePackages = useMemo(() => {
    return filteredPackages.filter(isPlanningPackageEligible)
  }, [filteredPackages])

  const initialSelectionDoneRef = useRef(false)

  const loadWorkspace = useCallback(
    async (
      zoneFilter?: string,
      datasetFilter?: string,
      profileFilter?: "MOTOR_VEHICLE" | "MOTORCYCLE" | "BICYCLE" | "FOOT",
    ) => {
      const seq = ++requestSeqRef.current
      setLoadingWorkspace(true)
      setWorkspaceError(null)
      try {
        const snap = await getPlanningWorkspace({
          zoneId: zoneFilter || undefined,
          startAt: windowRange.startAt,
          endAt: windowRange.endAt,
          datasetId: datasetFilter || undefined,
          profile: profileFilter || "MOTOR_VEHICLE",
        })
        if (seq !== requestSeqRef.current) return
        setWorkspace(snap)

        const defaultZone =
          zoneFilter && snap.zones.some((z) => z.id === zoneFilter)
            ? zoneFilter
            : (snap.zones[0]?.id ?? "")
        setSelectedZoneId(defaultZone)

        setSelectedDepotId((prev) =>
          prev && snap.depots.some((d) => d.id === prev)
            ? prev
            : (snap.depots[0]?.id ?? ""),
        )
        setSelectedDatasetId((prev) =>
          datasetFilter && snap.datasets.some((d) => d.id === datasetFilter)
            ? datasetFilter
            : prev && snap.datasets.some((d) => d.id === prev)
              ? prev
              : (snap.datasets[0]?.id ?? ""),
        )
        setSelectedEditableRouteId((prev) =>
          prev && snap.editableRoutes.some((r) => r.id === prev)
            ? prev
            : (snap.editableRoutes[0]?.id ?? ""),
        )

        setSelectedPackageIds((prev) => {
          const eligibleIds = new Set(
            snap.candidatePackages
              .filter((p) => (!defaultZone || p.zoneId === defaultZone) && isPlanningPackageEligible(p))
              .map((p) => p.id),
          )
          if (!initialSelectionDoneRef.current) {
            initialSelectionDoneRef.current = true
            return Array.from(eligibleIds)
          }
          return prev.filter((id) => eligibleIds.has(id))
        })
      } catch (err: unknown) {
        if (seq !== requestSeqRef.current) return
        setWorkspaceError(
          err instanceof Error
            ? err.message
            : "No fue posible cargar el espacio de planificación.",
        )
      } finally {
        if (seq === requestSeqRef.current) {
          setLoadingWorkspace(false)
        }
      }
    },
    [windowRange.endAt, windowRange.startAt],
  )

  useEffect(() => {
    void loadWorkspace(selectedZoneId || undefined, selectedDatasetId || undefined, selectedProfile)
  }, [loadWorkspace, selectedDatasetId, selectedProfile, selectedZoneId])

  const handleZoneChange = (newZoneId: string) => {
    setSelectedPackageIds([])
    setSelectedZoneId(newZoneId)
  }

  const handleDatasetChange = (newDatasetId: string) => {
    setSelectedPackageIds([])
    setSelectedDatasetId(newDatasetId)
  }

  const handleProfileChange = (
    newProfile: "MOTOR_VEHICLE" | "MOTORCYCLE" | "BICYCLE" | "FOOT",
  ) => {
    setSelectedPackageIds([])
    setSelectedProfile(newProfile)
  }

  const togglePackage = (pkgId: string) => {
    setSelectedPackageIds((prev) =>
      prev.includes(pkgId)
        ? prev.filter((id) => id !== pkgId)
        : [...prev, pkgId],
    )
  }

  const toggleSelectAll = () => {
    const allSelected =
      eligiblePackages.length > 0 &&
      eligiblePackages.every((p) => selectedPackageIds.includes(p.id))

    if (allSelected) {
      setSelectedPackageIds([])
    } else {
      setSelectedPackageIds(eligiblePackages.map((p) => p.id))
    }
  }

  const handlePlan = async () => {
    if (!workspace) return
    setSubmitting(true)
    setSubmitError(null)
    setExecutionSummary(null)

    try {
      if (mode === "editable-route") {
        if (!selectedEditableRouteId) {
          throw new Error(
            "Selecciona una ruta en estado Planificada (PLANNED) para replanificar.",
          )
        }
        const validPackageIds = selectedPackageIds.filter((id) =>
          eligiblePackages.some((p) => p.id === id),
        )
        const res = await replanEditableRoute(selectedEditableRouteId, {
          packageIds: validPackageIds,
          ordering,
        })
        setExecutionSummary({
          title: `Ruta ${formatShortEntityId(res.routeId)} replanificada (${res.stops.length} paradas ordenadas)`,
          routeIds: [res.routeId],
          outcomes: res.outcomes,
        })
      } else {
        if (!selectedZoneId) {
          throw new Error("Selecciona una zona operativa.")
        }
        if (!selectedDepotId) {
          throw new Error("Selecciona un depósito de salida.")
        }
        if (!selectedDatasetId) {
          throw new Error("No hay un dataset vial READY disponible.")
        }
        const validPackageIds = selectedPackageIds.filter((id) =>
          eligiblePackages.some((p) => p.id === id),
        )
        if (validPackageIds.length === 0) {
          throw new Error(
            "Selecciona al menos un paquete candidato apto para planificar.",
          )
        }
        const res = await planAndAssignRoutes({
          requestId: generateRequestId(),
          zoneId: selectedZoneId,
          packageIds: validPackageIds,
          resourceSelection: "AUTOMATIC",
          depotId: selectedDepotId,
          datasetId: selectedDatasetId,
          profile: selectedProfile,
          window: windowRange,
          radiusMeters,
          ordering,
        })

        setExecutionSummary({
          title:
            res.routes.length > 0
              ? `Se generaron ${res.routes.length} ruta(s) en estado PLANNED`
              : "Ejecución completada sin nuevas rutas (revisa motivos de pendiente)",
          routeIds: res.routes.map((r) => r.routeId),
          outcomes: res.outcomes,
        })
      }

      await loadWorkspace(selectedZoneId || undefined, selectedDatasetId, selectedProfile)
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No fue posible ejecutar la planificación.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Planificar rutas</h1>
          <p>
            Agrupa destinos por zona, valida capacidad de peso y volumen y
            ordena paradas desde el depósito.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkspace(selectedZoneId || undefined)}
          disabled={loadingWorkspace || submitting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.6rem 1rem",
            borderRadius: "999px",
            border: "1px solid var(--border)",
            background: "white",
            color: "var(--navy)",
            fontSize: "0.78rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} className={loadingWorkspace ? "spin" : ""} />
          Actualizar recursos
        </button>
      </div>

      {workspaceError && (
        <div
          className="dashboard-panel"
          role="alert"
          style={{
            marginBottom: "1rem",
            borderColor: "#e74c3c",
            color: "#c0392b",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <AlertCircle size={18} />
          <span>{workspaceError}</span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.65rem",
                  fontWeight: 600,
                }}
              >
                Configuración · GET /api/v1/routes/planning/workspace
              </span>
              <h2>Parámetros</h2>
            </div>
          </div>

          <div className="portal-form">
            <div className="field">
              <label htmlFor="planning-mode">Modo de operación</label>
              <select
                id="planning-mode"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "new-routes" | "editable-route")
                }
              >
                <option value="new-routes">
                  Crear nuevas rutas por clúster y capacidad
                </option>
                <option value="editable-route">
                  Asignar / recalcular ruta PLANNED existente
                </option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="planning-date">Fecha de operación</label>
              <input
                id="planning-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="planning-shift">Ventana horaria</label>
              <select
                id="planning-shift"
                value={shift}
                onChange={(e) =>
                  setShift(e.target.value as "morning" | "afternoon")
                }
              >
                <option value="morning">Mañana (08:00 – 13:00 UTC)</option>
                <option value="afternoon">Tarde (13:00 – 19:00 UTC)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="planning-zone">Zona operativa</label>
              <select
                id="planning-zone"
                value={selectedZoneId}
                onChange={(e) => handleZoneChange(e.target.value)}
              >
                {workspace?.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code} · {z.name}
                  </option>
                ))}
              </select>
            </div>

            {mode === "editable-route" ? (
              <div className="field">
                <label htmlFor="planning-editable-route">
                  Ruta editable (solo estado PLANNED)
                </label>
                <select
                  id="planning-editable-route"
                  value={selectedEditableRouteId}
                  onChange={(e) => setSelectedEditableRouteId(e.target.value)}
                >
                  {workspace?.editableRoutes.length === 0 && (
                    <option value="">
                      Sin rutas en estado PLANNED disponibles
                    </option>
                  )}
                  {workspace?.editableRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      Ruta {formatShortEntityId(r.id)} · {r.vehiclePlate} (
                      {r.stopCount} paradas · disp. {r.remainingWeightKg} kg)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="planning-depot">Depósito de origen</label>
                  <select
                    id="planning-depot"
                    value={selectedDepotId}
                    onChange={(e) => setSelectedDepotId(e.target.value)}
                  >
                    {workspace?.depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="planning-dataset">Dataset vial (READY)</label>
                  <select
                    id="planning-dataset"
                    value={selectedDatasetId}
                    onChange={(e) => handleDatasetChange(e.target.value)}
                  >
                    {workspace?.datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.sourceType})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="planning-profile">Perfil de transitabilidad</label>
                  <select
                    id="planning-profile"
                    value={selectedProfile}
                    onChange={(e) =>
                      handleProfileChange(
                        e.target.value as
                          | "MOTOR_VEHICLE"
                          | "MOTORCYCLE"
                          | "BICYCLE"
                          | "FOOT",
                      )
                    }
                  >
                    <option value="MOTOR_VEHICLE">Vehículo a motor</option>
                    <option value="MOTORCYCLE">Motocicleta</option>
                    <option value="BICYCLE">Bicicleta</option>
                    <option value="FOOT">A pie</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="planning-radius">
                    Radio de agrupación Haversine (m)
                  </label>
                  <input
                    id="planning-radius"
                    type="number"
                    min={100}
                    max={25000}
                    step={100}
                    value={radiusMeters}
                    onChange={(e) =>
                      setRadiusMeters(Math.max(100, Number(e.target.value)))
                    }
                  />
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="planning-ordering">
                Algoritmo de ordenamiento de paradas
              </label>
              <select
                id="planning-ordering"
                value={ordering}
                onChange={(e) =>
                  setOrdering(
                    e.target
                      .value as "nearest-neighbor" | "nearest-neighbor-two-opt",
                  )
                }
              >
                <option value="nearest-neighbor">
                  Vecino más cercano (Nearest Neighbor)
                </option>
                <option value="nearest-neighbor-two-opt">
                  Vecino más cercano + mejora 2-opt
                </option>
              </select>
            </div>

            {mode === "new-routes" && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Los vehículos y mensajeros se asignan automáticamente según su
                disponibilidad y capacidad. Si faltan recursos, los paquetes
                quedarán pendientes con el motivo correspondiente.
              </p>
            )}

            <div className="permission-box">
              <AlertCircle size={18} />
              <div>
                <strong>Paquetes seleccionados</strong>
                <p>
                  {selectedPackageIds.length} seleccionados de {eligiblePackages.length} aptos ({filteredPackages.length} en zona).
                </p>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                style={{
                  color: "#c0392b",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                }}
              >
                {submitError}
              </div>
            )}

            <button
              className="form-submit"
              type="button"
              onClick={() => void handlePlan()}
              disabled={submitting || loadingWorkspace}
              style={{ width: "100%" }}
            >
              {submitting ? (
                <Loader2 size={17} className="spin" />
              ) : mode === "editable-route" ? (
                <Truck size={17} />
              ) : (
                <Route size={17} />
              )}
              {submitting
                ? "Procesando planificación…"
                : mode === "editable-route"
                  ? "Replanificar ruta PLANNED"
                  : "Planificar y asignar rutas"}
            </button>

            {executionSummary && (
              <div
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  background: "var(--blue-pale)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.76rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    color: "var(--success)",
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{executionSummary.title}</span>
                </div>
                {executionSummary.routeIds.length > 0 && (
                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    {executionSummary.routeIds.map((rId) => (
                      <Link
                        key={rId}
                        to={`/app/rutas/${rId}`}
                        style={{
                          color: "var(--navy)",
                          fontWeight: 700,
                          textDecoration: "underline",
                        }}
                      >
                        Ver ruta {formatShortEntityId(rId)}
                      </Link>
                    ))}
                  </div>
                )}
                {executionSummary.outcomes.some(
                  (o) => o.kind === "PENDING_ASSIGNMENT",
                ) && (
                  <div style={{ color: "#b45309" }}>
                    Algunos paquetes quedaron en{" "}
                    <Link
                      to="/app/pendientes"
                      style={{ fontWeight: 700, color: "#b45309" }}
                    >
                      Pendientes de asignación
                    </Link>{" "}
                    para revisión manual.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  Paquetes candidatos (CLASSIFIED / PENDING_ASSIGNMENT)
                </span>
                <h2>Listos para asignar</h2>
              </div>
              <span className="counter">{filteredPackages.length}</span>
            </div>

            {loadingWorkspace ? (
              <EmptyState
                icon={<Loader2 size={28} className="spin" />}
                title="Cargando paquetes candidatos"
                body="Consultando paquetes clasificados y flota disponible del tenant."
              />
            ) : filteredPackages.length === 0 ? (
              <EmptyState
                icon={<Package size={28} />}
                title="Sin paquetes candidatos"
                body="No hay paquetes en estado Clasificado o Pendiente de asignación para la zona seleccionada."
              />
            ) : (
              <div className="company-table">
                <div
                  className="company-table__head"
                  style={{
                    gridTemplateColumns: "0.35fr 1.1fr 1.4fr 0.9fr 0.8fr 1.3fr",
                  }}
                >
                  <span>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los paquetes aptos"
                      checked={
                        eligiblePackages.length > 0 &&
                        eligiblePackages.every((p) =>
                          selectedPackageIds.includes(p.id),
                        )
                      }
                      onChange={toggleSelectAll}
                      disabled={eligiblePackages.length === 0}
                    />
                  </span>
                  <span>Guía</span>
                  <span>Dirección</span>
                  <span>Zona / Sector</span>
                  <span>Peso / Vol.</span>
                  <span>Estado y Aptitud</span>
                </div>
                {filteredPackages.map((p) => {
                  const isEligible = isPlanningPackageEligible(p)
                  return (
                    <div
                      key={p.id}
                      className="company-table__row"
                      style={{
                        gridTemplateColumns:
                          "0.35fr 1.1fr 1.4fr 0.9fr 0.8fr 1.3fr",
                        opacity: isEligible ? 1 : 0.75,
                      }}
                    >
                      <span>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${p.trackingCode}`}
                          checked={selectedPackageIds.includes(p.id)}
                          onChange={() => togglePackage(p.id)}
                          disabled={!isEligible}
                          title={
                            !isEligible
                              ? formatUnsuitabilityReason(p.unsuitabilityReason)
                              : undefined
                          }
                        />
                      </span>
                      <strong>{p.trackingCode}</strong>
                      <span>{p.address}</span>
                      <span>
                        {p.zoneName ?? "Sin zona"}
                        {p.sectorName ? ` · ${p.sectorName}` : ""}
                      </span>
                      <span>
                        {p.weightKg} kg · {p.volumeM3} m³
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className={`status ${PLANNING_PACKAGE_STATE_COLOR[p.state]}`}
                          title={
                            p.lastPendingReasonCode
                              ? formatPendingReasonLabel(p.lastPendingReasonCode)
                              : undefined
                          }
                        >
                          {PLANNING_PACKAGE_STATE_LABELS[p.state]}
                        </span>
                        {!isEligible && (
                          <span
                            className="status status--warn"
                            title={p.unsuitabilityReason ?? undefined}
                            style={{ fontSize: "0.68rem" }}
                          >
                            {formatUnsuitabilityReason(p.unsuitabilityReason)}
                          </span>
                        )}
                        {!isEligible && (
                          <Link
                            to={`/app/paquetes/${p.id}`}
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--blue)",
                              fontWeight: 700,
                              textDecoration: "underline",
                            }}
                            title="Resolver geocodificación y anclaje vial"
                          >
                            Resolver
                          </Link>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {workspace && workspace.editableRoutes.length > 0 && (
            <div className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.65rem",
                      fontWeight: 600,
                    }}
                  >
                    Rutas en estado PLANNED (manifiesto editable antes de READY)
                  </span>
                  <h2>Rutas editables de la ventana</h2>
                </div>
                <span className="counter">
                  {workspace.editableRoutes.length}
                </span>
              </div>
              <div className="company-table">
                <div
                  className="company-table__head"
                  style={{
                    gridTemplateColumns: "1fr 0.9fr 1.2fr 0.8fr 1fr 0.8fr",
                  }}
                >
                  <span>Ruta</span>
                  <span>Vehículo</span>
                  <span>Mensajero</span>
                  <span>Paradas</span>
                  <span>Capacidad disp.</span>
                  <span>Acción</span>
                </div>
                {workspace.editableRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="company-table__row"
                    style={{
                      gridTemplateColumns: "1fr 0.9fr 1.2fr 0.8fr 1fr 0.8fr",
                    }}
                  >
                    <strong>{formatShortEntityId(route.id)}</strong>
                    <span>{route.vehiclePlate}</span>
                    <span>{route.courierEmail}</span>
                    <span>{route.stopCount} paradas</span>
                    <span>
                      {route.remainingWeightKg} kg · {route.remainingVolumeM3}{" "}
                      m³
                    </span>
                    <span>
                      <Link
                        to={`/app/rutas/${route.id}`}
                        style={{
                          color: "var(--navy)",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                        }}
                      >
                        Ver ruta
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
