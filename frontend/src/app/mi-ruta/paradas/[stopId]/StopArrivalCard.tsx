import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react"

export interface StopArrivalCardProps {
  readonly isAttended: boolean
  readonly routeInProgress: boolean
  readonly canExecute: boolean
  readonly attending: boolean
  readonly attendError: string | null
  readonly onAttendStop: () => void
}

export function StopArrivalCard({
  isAttended,
  routeInProgress,
  canExecute,
  attending,
  attendError,
  onAttendStop,
}: StopArrivalCardProps) {
  const canClickAttend = routeInProgress && canExecute && !attending

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem",
              fontFamily: "Space Grotesk, sans-serif",
              color: "var(--navy)",
            }}
          >
            Control de llegada a la parada
          </h2>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.82rem",
              color: "var(--text-muted)",
            }}
          >
            {isAttended
              ? "La llegada fue registrada. Puedes gestionar los paquetes asignados a continuación."
              : "Registra la llegada al punto para habilitar las opciones de entrega de paquetes."}
          </p>
        </div>

        <div>
          {isAttended ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 1rem",
                background: "#f0faf5",
                border: "1px solid #b7eb8f",
                borderRadius: "var(--radius-sm)",
                color: "var(--success)",
                fontWeight: 700,
                fontSize: "0.85rem",
              }}
            >
              <CheckCircle2 size={18} /> Llegada confirmada
            </span>
          ) : (
            <button
              type="button"
              onClick={onAttendStop}
              disabled={!canClickAttend}
              style={{
                padding: "0.6rem 1.25rem",
                background: "var(--navy)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                cursor: canClickAttend ? "pointer" : "not-allowed",
                opacity: canClickAttend ? 1 : 0.6,
              }}
            >
              {attending ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <MapPin size={16} />
              )}
              {attending ? "Registrando..." : "Registrar llegada a la parada"}
            </button>
          )}
        </div>
      </div>

      {attendError && (
        <div
          role="alert"
          style={{
            marginTop: "0.85rem",
            padding: "0.65rem 0.85rem",
            background: "#fff3f3",
            color: "#c0392b",
            border: "1px solid #f5c2c7",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{attendError}</span>
          </div>
          <button
            type="button"
            onClick={onAttendStop}
            style={{
              background: "transparent",
              border: "none",
              color: "#c0392b",
              fontWeight: 700,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  )
}
