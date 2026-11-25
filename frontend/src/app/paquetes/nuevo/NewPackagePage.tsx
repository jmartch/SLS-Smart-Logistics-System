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
  RefreshCw,
  Upload,
  User,
} from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ApiError } from "../../../shared/api/httpClient"
import {
  decodeQrFromImageFile,
  parsePackageQrPayload,
} from "../../../shared/qr/qrPackageParser"
import { fetchSectors, fetchShipmentTypes, fetchZones } from "../api/catalogApi"
import { registerPackage } from "../api/packagesApi"
import BarcodeScanner from "../components/BarcodeScanner"
import "../components/packages.css"
import {
  EMPTY_REGISTER_PACKAGE_FORM,
  GEOCODING_STATUS_COLORS,
  GEOCODING_STATUS_LABELS,
  GEOCODING_STATUS_MESSAGES,
  PACKAGE_PRIORITIES,
  PACKAGE_PRIORITY_LABELS,
  ROAD_PROFILE_LABELS,
  type CatalogOption,
  type PackageGeocodingDiagnostic,
  type PackagePriority,
  type RegisterPackageFormErrors,
  type RegisterPackageFormValues,
  type SectorOption,
  type ShipmentTypeOption,
} from "../types"
import { validateRegisterPackageForm } from "../validation"

function matchCatalogOption<T extends CatalogOption>(
  options: readonly T[],
  candidateId: string,
  candidateLabel: string,
): T | undefined {
  const trimmedId = candidateId.trim().toLowerCase()
  if (trimmedId) {
    const byId = options.find((opt) => opt.id.toLowerCase() === trimmedId)
    if (byId) return byId
  }
  const normalizedLabel = candidateLabel.trim().toLowerCase()
  if (!normalizedLabel) return undefined
  return options.find(
    (opt) =>
      opt.code.toLowerCase() === normalizedLabel ||
      opt.name.toLowerCase() === normalizedLabel ||
      opt.name.toLowerCase().includes(normalizedLabel) ||
      normalizedLabel.includes(opt.name.toLowerCase()),
  )
}

export function NewPackagePage() {
  const navigate = useNavigate()
  const qrFileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingSectorMatchRef = useRef<{ sectorId: string; sectorName: string } | null>(null)

  const [submitted, setSubmitted] = useState(false)
  const [registeredId, setRegisteredId] = useState("")
  const [registeredTrackingCode, setRegisteredTrackingCode] = useState("")
  const [registeredGeocoding, setRegisteredGeocoding] = useState<PackageGeocodingDiagnostic | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanningCamera, setScanningCamera] = useState(false)
  const [qrNotice, setQrNotice] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RegisterPackageFormErrors>({})
  const [form, setForm] = useState<RegisterPackageFormValues>(EMPTY_REGISTER_PACKAGE_FORM)

  const [zones, setZones] = useState<CatalogOption[]>([])
  const [shipmentTypes, setShipmentTypes] = useState<ShipmentTypeOption[]>([])
  const [sectors, setSectors] = useState<SectorOption[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(true)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)
  const [catalogReloadKey, setCatalogReloadKey] = useState(0)
  const [sectorsLoading, setSectorsLoading] = useState(false)
  const [sectorsError, setSectorsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadCatalogs() {
      setCatalogsLoading(true)
      setCatalogsError(null)
      try {
        const [loadedZones, loadedShipmentTypes] = await Promise.all([
          fetchZones(),
          fetchShipmentTypes(),
        ])
        if (!active) return
        const activeTypes = loadedShipmentTypes.filter((item) => item.active !== false)
        setZones(loadedZones)
        setShipmentTypes(activeTypes)
        setForm((prev) => ({
          ...prev,
          shipmentTypeId: prev.shipmentTypeId || activeTypes[0]?.id || "",
        }))
      } catch (err: unknown) {
        if (!active) return
        setCatalogsError(
          err instanceof Error
            ? err.message
            : "No fue posible cargar los catálogos de zonas y tipos de envío del tenant.",
        )
      } finally {
        if (active) setCatalogsLoading(false)
      }
    }
    void loadCatalogs()
    return () => {
      active = false
    }
  }, [catalogReloadKey])

  useEffect(() => {
    const selectedZoneId = form.zoneId
    if (!selectedZoneId) {
      pendingSectorMatchRef.current = null
      return
    }

    let active = true
    async function loadZoneSectors(zoneId: string) {
      setSectorsLoading(true)
      setSectorsError(null)
      try {
        const loadedSectors = await fetchSectors(zoneId)
        if (!active) return
        setSectors(loadedSectors)
        const pendingSector = pendingSectorMatchRef.current
        if (pendingSector) {
          pendingSectorMatchRef.current = null
          const matchedSector = matchCatalogOption(
            loadedSectors,
            pendingSector.sectorId,
            pendingSector.sectorName,
          )
          if (matchedSector) {
            setForm((prev) =>
              prev.zoneId === zoneId
                ? { ...prev, sectorId: matchedSector.id }
                : prev,
            )
          }
        }
      } catch (err: unknown) {
        if (!active) return
        setSectors([])
        setSectorsError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los sectores de la zona seleccionada.",
        )
      } finally {
        if (active) setSectorsLoading(false)
      }
    }
    void loadZoneSectors(selectedZoneId)
    return () => {
      active = false
    }
  }, [form.zoneId])

  const setField =
    <K extends keyof RegisterPackageFormValues>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const nextValue = e.target.value
      if (key === "zoneId") {
        setSectors([])
        setSectorsError(null)
        setSectorsLoading(Boolean(nextValue))
      }
      setFieldErrors((prev) => ({
        ...prev,
        [key]: undefined,
        ...(key === "zoneId" ? { sectorId: undefined } : {}),
      }))
      setForm((prev) => ({
        ...prev,
        [key]: nextValue,
        ...(key === "zoneId" ? { sectorId: "" } : {}),
      }))
    }

  const applyDecodedQrText = (rawText: string, sourceLabel: string) => {
    setQrError(null)
    setSubmitError(null)
    setFieldErrors({})
    try {
      const parsed = parsePackageQrPayload(rawText)
      const matchedZone = matchCatalogOption(zones, parsed.zoneId, parsed.zone)
      const matchedShipmentType = matchCatalogOption(
        shipmentTypes,
        parsed.shipmentTypeId,
        parsed.shipmentType,
      )

      if (matchedZone && (parsed.sectorId || parsed.sector)) {
        pendingSectorMatchRef.current = {
          sectorId: parsed.sectorId,
          sectorName: parsed.sector,
        }
      } else {
        pendingSectorMatchRef.current = null
      }

      setForm((prev) => ({
        ...prev,
        trackingCode: parsed.trackingCode || prev.trackingCode,
        sender: parsed.sender || prev.sender,
        recipient: parsed.recipient || prev.recipient,
        recipientAddress: parsed.recipientAddress || prev.recipientAddress,
        recipientPhone: parsed.recipientPhone || prev.recipientPhone,
        municipalityCode: parsed.municipalityCode || prev.municipalityCode || "08001",
        zoneId: matchedZone ? matchedZone.id : prev.zoneId,
        sectorId: matchedZone && matchedZone.id !== prev.zoneId ? "" : prev.sectorId,
        shipmentTypeId: matchedShipmentType ? matchedShipmentType.id : prev.shipmentTypeId,
        priority: parsed.backendPriority || prev.priority,
        weightKg: String(parsed.weightKg),
        lengthCm: String(parsed.lengthCm),
        widthCm: String(parsed.widthCm),
        heightCm: String(parsed.heightCm),
        notes: parsed.notes || prev.notes,
      }))

      setQrNotice(
        parsed.isStructuredJson
          ? `${sourceLabel}: Se cargaron los datos de la guía ${parsed.trackingCode}${parsed.recipient ? ` (${parsed.recipient})` : ""}.`
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const validationErrors = validateRegisterPackageForm(form)
    setFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      setSubmitError("Revisa los campos obligatorios marcados antes de registrar el paquete.")
      return
    }

    setLoading(true)
    const finalCode = form.trackingCode.trim().toUpperCase()

    try {
      const res = await registerPackage({
        trackingCode: finalCode,
        address: {
          text: form.recipientAddress.trim(),
          municipalityCode: form.municipalityCode.trim().toUpperCase(),
        },
        shipmentTypeId: form.shipmentTypeId,
        zoneId: form.zoneId || undefined,
        sectorId: form.zoneId && form.sectorId ? form.sectorId : undefined,
        priority: form.priority,
        weightKg: Number(form.weightKg),
        lengthCm: Number(form.lengthCm),
        widthCm: Number(form.widthCm),
        heightCm: Number(form.heightCm),
        deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
      })

      if (!res?.id) {
        throw new Error("La API no devolvió el identificador del paquete registrado.")
      }
      setRegisteredId(res.id)
      setRegisteredTrackingCode(res.trackingCode || finalCode)
      setRegisteredGeocoding(res.geocoding ?? null)
      setSubmitted(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const conflictMsg = `El código de guía ${finalCode} ya existe en el sistema (${err.code ?? "PACKAGE_TRACKING_CODE_CONFLICT"}).`
        setFieldErrors((prev) => ({ ...prev, trackingCode: conflictMsg }))
        setSubmitError(conflictMsg)
      } else if (err instanceof ApiError && err.status === 400 && err.fields) {
        setFieldErrors((prev) => ({ ...prev, ...err.fields }))
        setSubmitError(err.message)
      } else {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "No fue posible registrar el paquete en el backend.",
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const resetForNextPackage = () => {
    setSubmitted(false)
    setRegisteredId("")
    setRegisteredTrackingCode("")
    setRegisteredGeocoding(null)
    setQrNotice(null)
    setQrError(null)
    setSubmitError(null)
    setFieldErrors({})
    setForm({
      ...EMPTY_REGISTER_PACKAGE_FORM,
      shipmentTypeId: shipmentTypes[0]?.id ?? "",
    })
  }

  const estimatedVolumeLiters = (() => {
    const l = Number(form.lengthCm)
    const w = Number(form.widthCm)
    const h = Number(form.heightCm)
    if (Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(h) && l > 0 && w > 0 && h > 0) {
      return ((l * w * h) / 1000).toFixed(2)
    }
    return ""
  })()

  if (submitted) {
    const isEligible = registeredGeocoding?.eligibility === "ELIGIBLE"
    const status = registeredGeocoding?.status
    const statusLabel = status ? GEOCODING_STATUS_LABELS[status] : "Pendiente de diagnóstico"
    const statusMsg = status ? GEOCODING_STATUS_MESSAGES[status] : "Diagnóstico geoespacial no disponible."
    const profileLabel = registeredGeocoding?.profile ? ROAD_PROFILE_LABELS[registeredGeocoding.profile] : null

    return (
      <div className="success-state" style={{ paddingTop: "2rem", maxWidth: "680px", margin: "0 auto" }}>
        <span><Check size={32} /></span>
        <h2>Paquete recibido en bodega</h2>
        <p>
          Se registró la recepción física de la guía <strong>{registeredTrackingCode}</strong> en estado <strong>REGISTERED</strong>.
        </p>

        <div
          style={{
            margin: "1.5rem 0",
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-sm, 8px)",
            textAlign: "left",
            background: isEligible ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
            border: `1px solid ${isEligible ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Diagnóstico de geocodificación y anclaje vial
            </span>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <span className={`status ${status ? GEOCODING_STATUS_COLORS[status] : "status--muted"}`}>
                {statusLabel}
              </span>
              <span className={`status ${isEligible ? "status--ok" : "status--warn"}`}>
                {isEligible ? "Apto para rutas (ELIGIBLE)" : "No apto para rutas (INELIGIBLE)"}
              </span>
            </div>
          </div>

          <p style={{ margin: "0.3rem 0 0.5rem", fontSize: "0.85rem", color: "var(--navy)" }}>
            {statusMsg}
          </p>

          {isEligible ? (
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
              El paquete cuenta con coordenadas validadas y anclaje a red vial ({profileLabel ?? "vehicular"}). Quedará disponible para planificar una vez clasificado en zona.
            </p>
          ) : (
            <div style={{ margin: 0, fontSize: "0.78rem", color: "#b45309", background: "rgba(245, 158, 11, 0.12)", padding: "0.5rem 0.75rem", borderRadius: "4px" }}>
              <strong>Importante:</strong> La recepción fue exitosa, pero este envío <em>no se podrá incluir en rutas automáticas de reparto</em> hasta resolver su ubicación geográfica o corregir su dirección.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "1rem" }}>
          <button className="form-submit" onClick={resetForNextPackage} style={{ minWidth: 180 }}>
            <PackagePlus size={17} /> Registrar otro
          </button>
          {registeredId && (
            <button
              type="button"
              className="form-submit"
              onClick={() => navigate(`/app/paquetes/${registeredId}`)}
              style={{ background: isEligible ? "var(--navy)" : "#d97706", minWidth: 200 }}
            >
              <ArrowRight size={17} /> {isEligible ? "Ver detalle del paquete" : "Resolver ubicación del paquete"}
            </button>
          )}
          <Link to="/app/paquetes" className="form-submit" style={{ textDecoration: "none", background: "#334155", minWidth: 160 }}>
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
          <p>Escanea o sube una etiqueta QR o completa los datos vinculados a los catálogos activos del tenant.</p>
        </div>
      </div>

      <div className="company-content--form">
        <div className="company-form-card">
          {catalogsLoading && (
            <div
              role="status"
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 0.95rem",
                borderRadius: 8,
                background: "rgba(37, 99, 235, 0.08)",
                border: "1px solid rgba(37, 99, 235, 0.25)",
                color: "var(--navy)",
                fontSize: "0.84rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Loader2 size={16} className="spin" />
              <span>Cargando catálogos de zonas y tipos de envío…</span>
            </div>
          )}

          {catalogsError && (
            <div
              role="alert"
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
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                <AlertCircle size={16} />
                {catalogsError}
              </span>
              <button
                type="button"
                onClick={() => setCatalogReloadKey((k) => k + 1)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.4rem 0.75rem",
                  borderRadius: 6,
                  border: "1px solid #b91c1c",
                  background: "#fff",
                  color: "#b91c1c",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          )}

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
                    Captura inteligente por Código QR / Código de barras
                  </h2>
                  <p style={{ fontSize: "0.82rem", margin: "0.15rem 0 0", color: "var(--text-muted)" }}>
                    Sube un PNG/JPG o usa la cámara para autocompletar la guía y sus dimensiones.
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

          <form className="portal-form" onSubmit={handleSubmit} noValidate>
            {submitError && (
              <div
                role="alert"
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
                <h2>Guía y dirección de entrega</h2>
                <p>Identificación del paquete y ubicación destino</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="pkg-trackingCode">Código de guía (Tracking Code) *</label>
                <input
                  id="pkg-trackingCode"
                  type="text"
                  required
                  placeholder="Ej. SLS-2026-00101"
                  value={form.trackingCode}
                  onChange={setField("trackingCode")}
                />
                {fieldErrors.trackingCode && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.trackingCode}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="pkg-municipalityCode">Código Municipio (DANE) *</label>
                <input
                  id="pkg-municipalityCode"
                  type="text"
                  required
                  placeholder="08001"
                  value={form.municipalityCode}
                  onChange={setField("municipalityCode")}
                />
                {fieldErrors.municipalityCode && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.municipalityCode}
                  </span>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="pkg-recipientAddress">Dirección de entrega *</label>
              <input
                id="pkg-recipientAddress"
                type="text"
                required
                placeholder="Cra 53 # 82-45, Riomar, Barranquilla"
                value={form.recipientAddress}
                onChange={setField("recipientAddress")}
              />
              {fieldErrors.recipientAddress && (
                <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                  {fieldErrors.recipientAddress}
                </span>
              )}
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="pkg-recipient">Destinatario (referencia opcional)</label>
                <input
                  id="pkg-recipient"
                  type="text"
                  placeholder="Nombre o razón social"
                  value={form.recipient}
                  onChange={setField("recipient")}
                />
              </div>
              <div className="field">
                <label htmlFor="pkg-recipientPhone">Teléfono de contacto (opcional)</label>
                <input
                  id="pkg-recipientPhone"
                  type="tel"
                  placeholder="+57 300 412 8890"
                  value={form.recipientPhone}
                  onChange={setField("recipientPhone")}
                />
              </div>
            </div>

            <div className="form-section-heading form-section-heading--spaced">
              <span><Package size={20} /></span>
              <div>
                <h2>Características y catálogos del envío</h2>
                <p>Tipo de servicio, dimensiones, peso, prioridad y clasificación inicial</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="pkg-shipmentTypeId">Tipo de envío *</label>
                <select
                  id="pkg-shipmentTypeId"
                  required
                  value={form.shipmentTypeId}
                  onChange={setField("shipmentTypeId")}
                  disabled={catalogsLoading || shipmentTypes.length === 0}
                >
                  <option value="">
                    {catalogsLoading ? "Cargando tipos de envío…" : "Selecciona un tipo de envío"}
                  </option>
                  {shipmentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.code})
                    </option>
                  ))}
                </select>
                {fieldErrors.shipmentTypeId && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.shipmentTypeId}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="pkg-priority">Prioridad *</label>
                <select
                  id="pkg-priority"
                  value={form.priority}
                  onChange={(e) => {
                    const nextPriority = e.target.value as PackagePriority
                    setForm((prev) => ({ ...prev, priority: nextPriority }))
                  }}
                >
                  {PACKAGE_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PACKAGE_PRIORITY_LABELS[priority]} ({priority})
                    </option>
                  ))}
                </select>
                {fieldErrors.priority && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.priority}
                  </span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="pkg-weightKg">Peso (kg) *</label>
                <input
                  id="pkg-weightKg"
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="2.5"
                  value={form.weightKg}
                  onChange={setField("weightKg")}
                />
                {fieldErrors.weightKg && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.weightKg}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="pkg-volumePreview">Volumen calculado (L)</label>
                <input
                  id="pkg-volumePreview"
                  type="text"
                  readOnly
                  value={estimatedVolumeLiters ? `${estimatedVolumeLiters} L` : "Completa dimensiones"}
                  style={{ background: "rgba(241, 245, 249, 0.9)", color: "var(--text-muted)" }}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Dimensiones L × A × H (cm) *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    placeholder="Largo"
                    aria-label="Largo (cm)"
                    value={form.lengthCm}
                    onChange={setField("lengthCm")}
                  />
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    placeholder="Ancho"
                    aria-label="Ancho (cm)"
                    value={form.widthCm}
                    onChange={setField("widthCm")}
                  />
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    placeholder="Alto"
                    aria-label="Alto (cm)"
                    value={form.heightCm}
                    onChange={setField("heightCm")}
                  />
                </div>
                {(fieldErrors.lengthCm || fieldErrors.widthCm || fieldErrors.heightCm) && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.lengthCm ?? fieldErrors.widthCm ?? fieldErrors.heightCm}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="pkg-deadline">Fecha y hora límite (opcional)</label>
                <input
                  id="pkg-deadline"
                  type="datetime-local"
                  value={form.deadline}
                  onChange={setField("deadline")}
                />
                {fieldErrors.deadline && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.deadline}
                  </span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="pkg-zoneId">Zona (opcional)</label>
                <select
                  id="pkg-zoneId"
                  value={form.zoneId}
                  onChange={setField("zoneId")}
                  disabled={catalogsLoading}
                >
                  <option value="">Sin asignar (clasificación asignará)</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} ({zone.code})
                    </option>
                  ))}
                </select>
                {fieldErrors.zoneId && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.zoneId}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="pkg-sectorId">Sector (opcional)</label>
                <select
                  id="pkg-sectorId"
                  value={form.sectorId}
                  onChange={setField("sectorId")}
                  disabled={catalogsLoading || !form.zoneId || sectorsLoading}
                >
                  <option value="">
                    {!form.zoneId
                      ? "Selecciona primero una zona"
                      : sectorsLoading
                        ? "Cargando sectores…"
                        : "Sin sector específico"}
                  </option>
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name} ({sector.code})
                    </option>
                  ))}
                </select>
                {sectorsError && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {sectorsError}
                  </span>
                )}
                {fieldErrors.sectorId && (
                  <span className="field-error" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
                    {fieldErrors.sectorId}
                  </span>
                )}
              </div>
            </div>

            <div className="company-form-actions">
              <Link to="/app/paquetes" style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none" }}>
                Cancelar
              </Link>
              <button
                className="form-submit"
                type="submit"
                disabled={loading || catalogsLoading || Boolean(catalogsError)}
              >
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
