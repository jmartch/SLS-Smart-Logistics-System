import { CheckCircle2, Package as PackageIcon, XCircle } from "lucide-react"
import type { DeliveryManifestPackageItem } from "../../deliveriesApi"
import { DeliveryAttemptForm } from "./DeliveryAttemptForm"

export interface StopPackageListProps {
  readonly routeId: string
  readonly stopId: string
  readonly packages: readonly DeliveryManifestPackageItem[]
  readonly isAttended: boolean
  readonly routeInProgress: boolean
  readonly canExecute: boolean
  readonly selectedPackageId: string | null
  readonly attemptMode: "success" | "failed"
  readonly onSelectPackage: (
    packageId: string,
    mode: "success" | "failed",
  ) => void
  readonly onClosePackageAttempt: () => void
  readonly onReload: () => void | Promise<void>
}

export function StopPackageList({
  routeId,
  stopId,
  packages,
  isAttended,
  routeInProgress,
  canExecute,
  selectedPackageId,
  attemptMode,
  onSelectPackage,
  onClosePackageAttempt,
  onReload,
}: StopPackageListProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        marginBottom: "1.5rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ marginBottom: "1rem" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontFamily: "Space Grotesk, sans-serif",
            color: "var(--navy)",
          }}
        >
          Paquetes en esta parada ({packages.length})
        </h2>
        <p
          style={{
            margin: "0.2rem 0 0",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
          }}
        >
          Cada paquete debe resolverse de forma independiente con sus
          evidencias o motivo de fallo.
        </p>
      </div>

      {packages.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          No hay paquetes asociados a esta parada.
        </p>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}
        >
          {packages.map((pkg: DeliveryManifestPackageItem) => {
            const isEnded = pkg.assignmentState === "ENDED"
            const isDelivered = isEnded
              ? pkg.outcome === "DELIVERED"
              : pkg.state === "DELIVERED"
            const isFailed = isEnded
              ? pkg.outcome === "FAILED" || pkg.outcome === "DELIVERY_FAILED"
              : pkg.state === "DELIVERY_FAILED"
            const isResolved = isDelivered || isFailed
            const isManaging = selectedPackageId === pkg.packageId
            const isEligibleAssignment =
              pkg.assignmentState === "ACTIVE" &&
              pkg.state === "OUT_FOR_DELIVERY"
            const canAttemptAction =
              isEligibleAssignment &&
              isAttended &&
              routeInProgress &&
              canExecute

            return (
              <div
                key={pkg.assignmentId}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1rem",
                  background: isResolved ? "var(--surface)" : "white",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                    }}
                  >
                    <PackageIcon size={18} color="var(--blue-dark)" />
                    <div>
                      <strong
                        style={{
                          fontSize: "0.92rem",
                          color: "var(--navy)",
                          fontFamily: "Space Grotesk, sans-serif",
                        }}
                      >
                        {pkg.trackingCode}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Asignación: {pkg.assignmentId.slice(0, 8)} · Estado actual:{" "}
                        {pkg.state}
                        {pkg.assignmentState !== "ACTIVE"
                          ? ` (${pkg.assignmentState}${pkg.outcome ? ` · Resultado: ${pkg.outcome}` : ""})`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div>
                    {isDelivered && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "999px",
                          background: "#f0faf5",
                          color: "var(--success)",
                          border: "1px solid #b7eb8f",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <CheckCircle2 size={14} /> Entregado
                      </span>
                    )}

                    {isFailed && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "999px",
                          background: "#fff3f3",
                          color: "#c0392b",
                          border: "1px solid #f5c2c7",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <XCircle size={14} /> Fallido{" "}
                        {pkg.outcome ? `(${pkg.outcome})` : ""}
                      </span>
                    )}

                    {!isResolved && canAttemptAction && (
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() =>
                            onSelectPackage(pkg.packageId, "success")
                          }
                          style={{
                            padding: "0.45rem 0.85rem",
                            background: "var(--navy)",
                            color: "white",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <CheckCircle2 size={14} /> Entregar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSelectPackage(pkg.packageId, "failed")
                          }
                          style={{
                            padding: "0.45rem 0.85rem",
                            background: "white",
                            color: "#c0392b",
                            border: "1px solid #f5c2c7",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <XCircle size={14} /> Reportar fallo
                        </button>
                      </div>
                    )}

                    {!isResolved && !canAttemptAction && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontStyle: "italic",
                        }}
                      >
                        {pkg.assignmentState !== "ACTIVE"
                          ? `Asignación no activa (${pkg.assignmentState})`
                          : !isAttended
                            ? "Requiere registrar llegada a la parada"
                            : !routeInProgress
                              ? "Ruta no iniciada"
                              : "Solo lectura"}
                      </span>
                    )}
                  </div>
                </div>

                {isManaging && (
                  <div
                    style={{
                      marginTop: "1rem",
                      paddingTop: "1rem",
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <DeliveryAttemptForm
                      routeId={routeId}
                      stopId={stopId}
                      packageId={pkg.packageId}
                      trackingCode={pkg.trackingCode}
                      initialMode={attemptMode}
                      onSuccess={async () => {
                        onClosePackageAttempt()
                        await onReload()
                      }}
                      onCancel={onClosePackageAttempt}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
