import {
  AlertCircle,
  Camera,
  Check,
  FileText,
  Loader2,
  PenTool,
  X,
  XCircle,
} from "lucide-react"
import {
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import {
  DELIVERY_FAILURE_REASON_LABELS,
  DELIVERY_FAILURE_REASONS,
  type DeliveryFailureReason,
  recordFailedDelivery,
  recordSuccessfulDelivery,
} from "../../deliveriesApi"
import {
  computeDeliveryAttemptSignature,
  computeFailedAttemptSignature,
  IdempotentActionTracker,
} from "../../../../shared/idempotency/idempotentAction"

export interface DeliveryAttemptFormProps {
  readonly routeId: string
  readonly stopId: string
  readonly packageId: string
  readonly trackingCode: string
  readonly initialMode?: "success" | "failed"
  readonly onSuccess: () => Promise<void> | void
  readonly onCancel: () => void
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export function DeliveryAttemptForm({
  routeId,
  stopId,
  packageId,
  trackingCode,
  initialMode = "success",
  onSuccess,
  onCancel,
}: DeliveryAttemptFormProps) {
  const [mode, setMode] = useState<"success" | "failed">(initialMode)
  const [notes, setNotes] = useState<string>("")
  const [reasonCode, setReasonCode] =
    useState<DeliveryFailureReason>("RECIPIENT_ABSENT")

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const tracker = useMemo(() => new IdempotentActionTracker(), [])

  const photoInputId = useId()
  const signatureInputId = useId()

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
  ) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setter(null)
      return
    }
    if (
      !ALLOWED_MIME_TYPES.includes(
        file.type as typeof ALLOWED_MIME_TYPES[number],
      )
    ) {
      setErrorMessage(
        "Formato no permitido. Solo se aceptan imágenes JPEG, PNG o WebP.",
      )
      event.target.value = ""
      setter(null)
      return
    }
    setErrorMessage(null)
    setter(file)
  }

  const isSuccessValid = Boolean(photoFile || signatureFile)
  const isFailedValid =
    reasonCode !== "OTHER" || (Boolean(notes) && notes.trim().length > 0)

  const isFormValid = mode === "success" ? isSuccessValid : isFailedValid

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isFormValid || submitting) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (mode === "success") {
        const signature = computeDeliveryAttemptSignature({
          routeId,
          stopId,
          packageId,
          photo: photoFile,
          signature: signatureFile,
          notes,
        })
        const idempotencyKey = tracker.getKey(signature)

        await recordSuccessfulDelivery(
          {
            routeId,
            stopId,
            packageId,
            photo: photoFile,
            signature: signatureFile,
            notes: notes.trim() ? notes.trim() : undefined,
          },
          idempotencyKey,
        )
      } else {
        const signature = computeFailedAttemptSignature({
          routeId,
          stopId,
          packageId,
          reasonCode,
          notes,
          photo: photoFile,
          signature: signatureFile,
        })
        const idempotencyKey = tracker.getKey(signature)

        await recordFailedDelivery(
          {
            routeId,
            stopId,
            packageId,
            reasonCode,
            notes: notes.trim() ? notes.trim() : undefined,
            photo: photoFile,
            signature: signatureFile,
          },
          idempotencyKey,
        )
      }

      await onSuccess()
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al registrar el intento.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="attempt-form-title"
      style={{
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        marginTop: "1rem",
        boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3
            id="attempt-form-title"
            style={{
              margin: 0,
              fontSize: "1.05rem",
              fontFamily: "Space Grotesk, sans-serif",
              color: "var(--navy)",
            }}
          >
            Registrar gestión para {trackingCode}
          </h3>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.82rem",
              color: "var(--text-muted)",
            }}
          >
            Selecciona el tipo de resultado y completa las evidencias
            correspondientes.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Cerrar formulario de intento"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "0.25rem",
            display: "grid",
            placeItems: "center",
          }}
        >
          <X size={18} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode("success")
            setErrorMessage(null)
          }}
          style={{
            padding: "0.75rem",
            borderRadius: "var(--radius-sm)",
            border: `2px solid ${
              mode === "success" ? "var(--success)" : "var(--border)"
            }`,
            background: mode === "success" ? "#f0faf5" : "white",
            color: mode === "success" ? "var(--success)" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.45rem",
            cursor: "pointer",
          }}
        >
          <Check size={16} />
          Entrega exitosa
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("failed")
            setErrorMessage(null)
          }}
          style={{
            padding: "0.75rem",
            borderRadius: "var(--radius-sm)",
            border: `2px solid ${
              mode === "failed" ? "#e74c3c" : "var(--border)"
            }`,
            background: mode === "failed" ? "#fff3f3" : "white",
            color: mode === "failed" ? "#c0392b" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.45rem",
            cursor: "pointer",
          }}
        >
          <XCircle size={16} />
          Intento fallido
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            background: "#fff3f3",
            color: "#c0392b",
            border: "1px solid #f5c2c7",
            borderRadius: "var(--radius-sm)",
            padding: "0.75rem 0.9rem",
            fontSize: "0.85rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
      >
        {mode === "failed" && (
          <div>
            <label
              htmlFor="reason-code-select"
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--navy)",
                marginBottom: "0.35rem",
              }}
            >
              Motivo del fallo *
            </label>
            <select
              id="reason-code-select"
              value={reasonCode}
              onChange={(e) =>
                setReasonCode(e.target.value as DeliveryFailureReason)
              }
              style={{
                width: "100%",
                padding: "0.65rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                fontSize: "0.85rem",
                color: "var(--text)",
                background: "white",
              }}
            >
              {DELIVERY_FAILURE_REASONS.map((code) => (
                <option key={code} value={code}>
                  {DELIVERY_FAILURE_REASON_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor="attempt-notes"
            style={{
              display: "block",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--navy)",
              marginBottom: "0.35rem",
            }}
          >
            Observaciones{" "}
            {mode === "failed" && reasonCode === "OTHER"
              ? "(obligatorias)"
              : "(opcionales)"}
          </label>
          <textarea
            id="attempt-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              mode === "success"
                ? "Nombre o parentesco de quien recibe, detalles del punto..."
                : "Detalles del motivo del fallo..."
            }
            required={mode === "failed" && reasonCode === "OTHER"}
            style={{
              width: "100%",
              padding: "0.65rem 0.8rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "0.85rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            padding: "0.85rem",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px dashed var(--border)",
          }}
        >
          <div>
            <label
              htmlFor={photoInputId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--navy)",
                marginBottom: "0.35rem",
                cursor: "pointer",
              }}
            >
              <Camera size={15} />
              Fotografía {mode === "success" && !signatureFile ? "*" : ""}
            </label>
            <input
              id={photoInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(e, setPhotoFile)}
              style={{ fontSize: "0.78rem", width: "100%" }}
            />
            {photoFile && (
              <span
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  marginTop: "0.2rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {photoFile.name} ({(photoFile.size / 1024).toFixed(0)} KB)
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor={signatureInputId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--navy)",
                marginBottom: "0.35rem",
                cursor: "pointer",
              }}
            >
              <PenTool size={15} />
              Firma digital {mode === "success" && !photoFile ? "*" : ""}
            </label>
            <input
              id={signatureInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(e, setSignatureFile)}
              style={{ fontSize: "0.78rem", width: "100%" }}
            />
            {signatureFile && (
              <span
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  marginTop: "0.2rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {signatureFile.name} ({(signatureFile.size / 1024).toFixed(0)}{" "}
                KB)
              </span>
            )}
          </div>
        </div>

        {mode === "success" && !isSuccessValid && (
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            <FileText size={13} />
            Se requiere adjuntar al menos una evidencia (fotografía o firma).
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--text)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            style={{
              padding: "0.6rem 1.25rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: mode === "success" ? "var(--success)" : "#c0392b",
              color: "white",
              fontSize: "0.85rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: isFormValid && !submitting ? "pointer" : "not-allowed",
              opacity: isFormValid && !submitting ? 1 : 0.6,
            }}
          >
            {submitting ? (
              <Loader2 size={15} className="spin" />
            ) : mode === "success" ? (
              <Check size={15} />
            ) : (
              <XCircle size={15} />
            )}
            {submitting
              ? "Registrando..."
              : mode === "success"
                ? "Confirmar entrega exitosa"
                : "Confirmar fallo de entrega"}
          </button>
        </div>
      </form>
    </div>
  )
}
