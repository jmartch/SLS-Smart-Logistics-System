import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  PackagePlus,
  QrCode,
  Upload,
  User,
} from "lucide-react"
import { type FormEvent, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ApiError, apiFetch } from "../../../shared/api/httpClient"
import BarcodeScanner from "../components/BarcodeScanner"
import "../components/packages.css"
import {
  decodeQrFromImageFile,
  generateRandomDemoQrJson,
  parsePackageQrPayload,
} from "../../../shared/qr/qrPackageParser"

export function NewPackagePage() {
  const navigate = useNavigate()
  const qrFileInputRef = useRef<HTMLInputElement | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [registeredTrackingCode, setRegisteredTrackingCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [scanningCamera, setScanningCamera] = useState(false)
  const [qrNotice, setQrNotice] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [form, setForm] = useState({
    trackingCode: "",
    sender: "",
    recipient: "",
    recipientAddress: "",
    recipientPhone: "",
    municipalityCode: "08001",
    zone: "",
    zoneId: "08d92a06-4921-4989-92ff-f1917240779c",
    sector: "",
    sectorId: "2ef99933-082e-4d24-b1a1-b5c574ca6aa5",
    weight: "",
    lengthCm: "30",
    widthCm: "20",
    heightCm: "15",
    volume: "",
    priority: "normal",
    shipmentType: "Estándar",
    shipmentTypeId: "b268c5c7-b2b5-411d-b734-07746ae7e6e6",
    notes: "",
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const applyDecodedQrText = (rawText: string, sourceLabel: string) => {
    setQrError(null)
    setSubmitError(null)
    try {
      const parsed = parsePackageQrPayload(rawText)
      setForm((prev) => ({
        ...prev,
        trackingCode: parsed.trackingCode || prev.trackingCode,
        sender: parsed.sender || prev.sender || "Almacenes del Caribe S.A.S.",
        recipient: parsed.recipient || prev.recipient,
        recipientAddress: parsed.recipientAddress || prev.recipientAddress,
        recipientPhone: parsed.recipientPhone || prev.recipientPhone,
        municipalityCode: parsed.municipalityCode || prev.municipalityCode,
        zone: parsed.zone || prev.zone,
        zoneId: parsed.zoneId || prev.zoneId,
        sector: parsed.sector || prev.sector,
        sectorId: parsed.sectorId || prev.sectorId,
        weight: String(parsed.weightKg),
        lengthCm: String(parsed.lengthCm),
        widthCm: String(parsed.widthCm),
        heightCm: String(parsed.heightCm),
        volume: String(parsed.volumeLiters),
        priority: parsed.priority,
        shipmentType: parsed.shipmentType || prev.shipmentType,
        shipmentTypeId: parsed.shipmentTypeId || prev.shipmentTypeId,
        notes: parsed.notes || prev.notes,
      }))
      setQrNotice(
        parsed.isStructuredJson
          ? `${sourceLabel}: Se cargaron automáticamente los datos del paquete ${parsed.trackingCode} (${parsed.recipient} · ${parsed.zone}).`
          : `${sourceLabel}: Se detectó el código de guía ${parsed.trackingCode}. Completa los datos restantes.`,
      )
    } catch (err) {
      setQrError(
        err instanceof Error ? err.message : "No fue posible interpretar el contenido del código QR.",
      )
    }
  }

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setQrError(null)
    setQrNotice(null)
    try {
      const rawText = await decodeQrFromImageFile(file)
      applyDecodedQrText(rawText, `Imagen QR (${file.name})`)
    } catch (err) {
      setQrError(
        err instanceof Error
          ? err.message
          : "No se detectó un código QR válido en la imagen seleccionada.",
      )
    }
  }

  const handleSimulateRandomQr = () => {
    const rawJson = generateRandomDemoQrJson()
    applyDecodedQrText(rawJson, "QR aleatorio de prueba (Barranquilla)")
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSubmitError(null)

    const finalCode =
      form.trackingCode.trim() ||
      `SLS-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`
    const weightKg = Number(form.weight) || 2.5
    const lengthCm = Number(form.lengthCm) || 30
    const widthCm = Number(form.widthCm) || 20
    const heightCm = Number(form.heightCm) || 15
    try {
      const res = await apiFetch<{ id?: string; trackingCode?: string }>("/packages", {
        method: "POST",
        body: JSON.stringify({
          trackingCode: finalCode,
          recipient: form.recipient.trim(),
          address: {
            text: form.recipientAddress.trim(),
            municipalityCode: form.municipalityCode || "08001",
          },
          zoneId: form.zoneId || "08d92a06-4921-4989-92ff-f1917240779c",
          sectorId: form.sectorId || "2ef99933-082e-4d24-b1a1-b5c574ca6aa5",
          shipmentTypeId: form.shipmentTypeId || "b268c5c7-b2b5-411d-b734-07746ae7e6e6",
          priority:
            form.priority === "express"
              ? "URGENT"
              : form.priority === "urgent"
                ? "HIGH"
                : "NORMAL",
          weightKg,
          lengthCm,
          widthCm,
          heightCm,
        }),
      })
      if (!res?.id) {
        throw new Error("La API no devolvió el identificador del paquete registrado.")
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(
          `El código de guía ${finalCode} ya existe en el sistema (${err.code ?? "PACKAGE_TRACKING_CODE_CONFLICT"}). Genera o escanea otro QR.`,
        )
        setLoading(false)
        return
      }
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No fue posible registrar el paquete en el backend.",
      )
      setLoading(false)
      return
    }

    setRegisteredTrackingCode(finalCode)
    setLoading(false)
    setSubmitted(true)
  }

  const resetForNextPackage = () => {
    setSubmitted(false)
    setQrNotice(null)
    setQrError(null)
    setSubmitError(null)
    setForm((prev) => ({
      ...prev,
      trackingCode: "",
      recipient: "",
      recipientAddress: "",
      recipientPhone: "",
      weight: "",
      volume: "",
      notes: "",
    }))
  }

  if (submitted) {
    return (
      <div className="success-state" style={{ paddingTop: "3rem" }}>
        <span><Check size={32} /></span>
        <h2>Paquete registrado</h2>
        <p>
          Se registró la guía <strong>{registeredTrackingCode}</strong> para{" "}
          <strong>{form.recipient}</strong>. El paquete quedó en estado{" "}
          <strong>REGISTERED</strong>
          {" (persistido en PostgreSQL + evento Outbox PackageRegistered)"}{" "}
          y está listo para clasificación.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem" }}>
          <button className="form-submit" onClick={resetForNextPackage} style={{ minWidth: 180 }}>
            <PackagePlus size={17} /> Registrar otro
          </button>
          <button
            type="button"
            className="form-submit"
            onClick={() => navigate("/app/paquetes")}
            style={{ background: "var(--navy)", minWidth: 180 }}
          >
            <ArrowRight size={17} /> Ver paquete en el listado
          </button>
          <Link to="/app/paquetes" className="form-submit" style={{ textDecoration: "none", background: "#334155", minWidth: 180 }}>
            <Package size={17} /> Ver listado
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="company-page-heading company-page-heading--form">
        <div>
          <h1>Registrar paquete</h1>
          <p>Escanea o sube una etiqueta QR generada en QR Helper o completa los datos manualmente.</p>
        </div>
      </div>

      <div className="company-content--form">
        <div className="company-form-card">
          <div
            style={{
              background: "linear-gradient(135deg, rgba(255,155,81,0.12), rgba(37,52,63,0.06))",
              border: "1px solid rgba(255,155,81,0.35)",
              borderRadius: "var(--radius-sm)",
              padding: "1.1rem 1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--navy)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <QrCode size={20} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.98rem", margin: 0, fontWeight: 800 }}>
                    Captura inteligente por Código QR
                  </h2>
                  <p style={{ fontSize: "0.82rem", margin: "0.15rem 0 0", color: "var(--text-muted)" }}>
                    Sube un PNG/JPG descargado desde el Generador QR o usa la cámara para autocompletar toda la guía.
                  </p>
                </div>
              </div>

              <a
                href="http://localhost:3002"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--navy)",
                  textDecoration: "none",
                  padding: "0.4rem 0.7rem",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid var(--border)",
                }}
              >
                <ExternalLink size={14} /> Abrir Generador QR (:3002)
              </a>
            </div>

            <input
              ref={qrFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleQrFileChange}
              style={{ display: "none" }}
            />

            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "0.95rem" }}>
              <button
                type="button"
                onClick={() => qrFileInputRef.current?.click()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.6rem 0.95rem",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--orange)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  cursor: "pointer",
                }}
              >
                <Upload size={16} /> Leer imagen QR (PNG/JPG)
              </button>

              <button
                type="button"
                onClick={() => setScanningCamera(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.6rem 0.95rem",
                  borderRadius: 8,
                  border: "1px solid var(--navy)",
                  background: "var(--navy)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  cursor: "pointer",
                }}
              >
                <Camera size={16} /> Escanear QR con cámara
              </button>

              <button
                type="button"
                onClick={handleSimulateRandomQr}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.6rem 0.95rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fff",
                  color: "var(--text)",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  cursor: "pointer",
                }}
              >
                <QrCode size={16} /> Simular lectura QR aleatorio
              </button>
            </div>

            {qrNotice && (
              <div
                style={{
                  marginTop: "0.85rem",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  background: "rgba(22, 163, 74, 0.12)",
                  border: "1px solid rgba(22, 163, 74, 0.35)",
                  color: "#15803d",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <CheckCircle2 size={16} />
                <span>{qrNotice}</span>
              </div>
            )}

            {qrError && (
              <div
                style={{
                  marginTop: "0.85rem",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  background: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "#b91c1c",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <AlertCircle size={16} />
                <span>{qrError}</span>
              </div>
            )}
          </div>

          <form className="portal-form" onSubmit={handleSubmit}>
            {submitError && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem 0.95rem",
                  borderRadius: 8,
                  background: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "#b91c1c",
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            <div className="form-section-heading">
              <span><User size={20} /></span>
              <div>
                <h2>Guía, remitente y destinatario</h2>
                <p>Datos de origen y entrega del paquete</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Código de guía (Tracking Code)</label>
                <input
                  type="text"
                  placeholder="SLS-2026-00101 (se genera si se deja vacío)"
                  value={form.trackingCode}
                  onChange={set("trackingCode")}
                />
              </div>
              <div className="field">
                <label>Teléfono del destinatario</label>
                <input type="tel" placeholder="+57 300 412 8890" value={form.recipientPhone} onChange={set("recipientPhone")} />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Remitente *</label>
                <input type="text" required placeholder="Empresa o persona" value={form.sender} onChange={set("sender")} />
              </div>
              <div className="field">
                <label>Destinatario *</label>
                <input type="text" required placeholder="Nombre completo" value={form.recipient} onChange={set("recipient")} />
              </div>
            </div>
            <div className="field">
              <label>Dirección de entrega *</label>
              <input type="text" required placeholder="Cra 53 # 82-45, Riomar, Barranquilla" value={form.recipientAddress} onChange={set("recipientAddress")} />
            </div>

            <div className="form-section-heading form-section-heading--spaced">
              <span><Package size={20} /></span>
              <div>
                <h2>Características del envío</h2>
                <p>Dimensiones, peso, zona y prioridad</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Tipo de envío *</label>
                <select value={form.shipmentType} onChange={set("shipmentType")}>
                  <option>Estándar</option>
                  <option>Express</option>
                  <option>Carga</option>
                  <option>Frágil</option>
                </select>
              </div>
              <div className="field">
                <label>Prioridad</label>
                <select value={form.priority} onChange={set("priority")}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgente</option>
                  <option value="express">Express</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Peso (kg) *</label>
                <input type="number" required min="0.1" step="0.1" placeholder="2.5" value={form.weight} onChange={set("weight")} />
              </div>
              <div className="field">
                <label>Volumen estimado (L)</label>
                <input type="number" min="0" step="0.1" placeholder="9.0" value={form.volume} onChange={set("volume")} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Dimensiones L × A × H (cm)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <input type="number" min="1" step="1" placeholder="Largo" value={form.lengthCm} onChange={set("lengthCm")} />
                  <input type="number" min="1" step="1" placeholder="Ancho" value={form.widthCm} onChange={set("widthCm")} />
                  <input type="number" min="1" step="1" placeholder="Alto" value={form.heightCm} onChange={set("heightCm")} />
                </div>
              </div>
              <div className="field">
                <label>Código Municipio (DANE)</label>
                <input type="text" placeholder="08001" value={form.municipalityCode} onChange={set("municipalityCode")} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Zona</label>
                <select value={form.zone} onChange={set("zone")}>
                  <option value="">Seleccionar (clasificación asignará)</option>
                  <option>Zona Norte</option>
                  <option>Zona Sur</option>
                  <option>Zona Centro</option>
                  <option>Zona Oriente</option>
                </select>
              </div>
              <div className="field">
                <label>Sector</label>
                <select value={form.sector} onChange={set("sector")}>
                  <option value="">Sector (clasificación asignará)</option>
                  <option>Sector A</option>
                  <option>Sector B</option>
                  <option>Sector C</option>
                  <option>Sector D</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Observaciones</label>
              <textarea
                placeholder="Instrucciones especiales, fragilidad, etc."
                rows={3}
                value={form.notes} onChange={set("notes")}
                style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.9)", resize: "vertical", fontFamily: "inherit", fontSize: "inherit", color: "var(--text)", outline: "none" }}
              />
            </div>

            <div className="company-form-actions">
              <Link to="/app/paquetes" style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none" }}>Cancelar</Link>
              <button className="form-submit" type="submit" disabled={loading}>
                {loading ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
                {loading ? "Registrando…" : "Registrar paquete"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {scanningCamera && (
        <BarcodeScanner
          onDetected={(code: string) => {
            setScanningCamera(false)
            applyDecodedQrText(code, "Cámara QR")
          }}
          onError={(reason) => {
            setScanningCamera(false)
            setQrError(
              reason === "PERMISSION_DENIED"
                ? "No se concedió permiso de cámara. Usa la opción 'Leer imagen QR (PNG/JPG)'."
                : "No se encontró una cámara disponible. Usa la opción 'Leer imagen QR (PNG/JPG)'.",
            )
          }}
          onClose={() => setScanningCamera(false)}
        />
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
