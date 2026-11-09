import { AlertCircle } from "lucide-react"

export interface StopStateBannerProps {
  readonly routeState: string
  readonly routeInProgress: boolean
  readonly canExecute: boolean
}

export function StopStateBanner({
  routeState,
  routeInProgress,
  canExecute,
}: StopStateBannerProps) {
  return (
    <>
      {!routeInProgress && (
        <div
          role="note"
          style={{
            background: "#fffbe6",
            border: "1px solid #ffe58f",
            borderRadius: "var(--radius-md)",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "0.85rem",
            color: "#873800",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>
            Esta ruta se encuentra en estado <strong>{routeState}</strong>. Las
            acciones de registro de llegada e intentos de entrega solo están
            habilitadas cuando la ruta está <strong>IN_PROGRESS</strong>.
          </span>
        </div>
      )}

      {!canExecute && (
        <div
          role="note"
          style={{
            background: "#e6f7ff",
            border: "1px solid #91d5ff",
            borderRadius: "var(--radius-md)",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "0.85rem",
            color: "#0050b3",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>
            Tienes permisos de solo lectura. Se requiere el permiso{" "}
            <strong>OPERATE_DELIVERIES</strong> o{" "}
            <strong>COORDINATE_ROUTES</strong> para realizar acciones
            operativas.
          </span>
        </div>
      )}
    </>
  )
}
