import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileJson,
  FileText,
  Image,
  MapPin,
  QrCode,
  Upload,
} from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import {
  decodeQrFromImageFile,
  generateRandomDemoQrJson,
  parsePackageQrPayload,
} from "../../../shared/qr/qrPackageParser"
import {
  CompanyFormHeader,
  Field,
  FormActions,
  FormSection,
  SuccessState,
} from "../../../shared/ui/PortalShell"
import { submitForm } from "../../../shared/ui/submitForm"

export function CompanyPackageRegistration() {
  const [submitted, setSubmitted] = useState(false)
  const [importMessage, setImportMessage] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    reference: "",
    weight: "",
    content: "",
    recipient: "",
    phone: "",
    address: "",
    postalCode: "",
    city: "",
    service: "standard",
  })

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const applyParsedQrToCompanyForm = (rawText: string, sourceLabel: string) => {
    const parsed = parsePackageQrPayload(rawText)
    setForm((current) => ({
      ...current,
      reference: parsed.trackingCode || current.reference,
      weight: String(parsed.weightKg),
      content: parsed.notes || `${parsed.shipmentType} · ${parsed.zone}`,
      recipient: parsed.recipient || current.recipient,
      phone: parsed.recipientPhone || current.phone,
      address: parsed.recipientAddress || current.address,
      postalCode: parsed.municipalityCode || current.postalCode || "08001",
      city: "Barranquilla",
      service: parsed.shipmentType.toLowerCase() === "express" ? "express" : "standard",
    }))
    setImportMessage(
      parsed.isStructuredJson
        ? `${sourceLabel}: Guía ${parsed.trackingCode} (${parsed.recipient}) cargada automáticamente.`
        : `${sourceLabel}: Código ${parsed.trackingCode} leído correctamente.`,
    )
  }

  const handleDocumentImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.type === "application/json" || file.name.endsWith(".json")) {
      try {
        const rawText = await file.text()
        applyParsedQrToCompanyForm(rawText, `Archivo JSON (${file.name})`)
      } catch {
        setImportMessage("El archivo JSON no tiene un formato válido.")
      }
      return
    }

    if (file.type.startsWith("image/")) {
      try {
        const rawText = await decodeQrFromImageFile(file)
        applyParsedQrToCompanyForm(rawText, `Imagen QR (${file.name})`)
        return
      } catch {
        // continúa al fallback documental si la imagen no era un QR
      }
    }

    const randomJson = generateRandomDemoQrJson()
    applyParsedQrToCompanyForm(randomJson, `${file.name} procesado`)
  }

  const handleQrImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    try {
      const rawText = await decodeQrFromImageFile(file)
      applyParsedQrToCompanyForm(rawText, `Código QR (${file.name})`)
    } catch (err) {
      setImportMessage(
        err instanceof Error
          ? err.message
          : "No se encontró un código QR legible en la imagen seleccionada.",
      )
    }
  }

  const downloadTemplate = () => {
    const template = JSON.stringify(JSON.parse(generateRandomDemoQrJson()), null, 2)
    const url = URL.createObjectURL(new Blob([template], { type: "application/json" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "plantilla-paquete-sls.json"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Paquete registrado"
            text="El código de seguimiento SLS-2842 ya está disponible."
            link="/empresa"
            action="Volver al dashboard"
          />
        </div>
      </main>
    )
  }
  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Gestión de envíos"
        title="Registrar paquete"
        description="Añade la información del envío para generar su seguimiento."
      />
      <form className="company-form-card portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
        <section className="smart-capture">
          <div className="smart-capture__heading">
            <span><QrCode size={21} /></span>
            <div>
              <strong>Carga inteligente</strong>
              <p>Escanea un QR o importa un documento para completar el formulario.</p>
            </div>
          </div>
          <div className="smart-capture__actions">
            <button type="button" onClick={() => qrRef.current?.click()}>
              <QrCode size={18} /> Leer QR
            </button>
            <button type="button" onClick={() => importRef.current?.click()}>
              <Upload size={18} /> Importar archivo
            </button>
            <button type="button" onClick={downloadTemplate}>
              <FileJson size={18} /> Plantilla JSON
            </button>
          </div>
          <div className="accepted-files">
            <span><Image size={15} /> Imagen</span>
            <span><FileJson size={15} /> JSON</span>
            <span><FileText size={15} /> PDF</span>
          </div>
          <input ref={qrRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleQrImport} />
          <input ref={importRef} className="visually-hidden" type="file" accept="image/*,.json,application/json,.pdf,application/pdf" onChange={handleDocumentImport} />
          {importMessage && <div className="import-message"><CheckCircle2 size={17} /> {importMessage}</div>}
        </section>
        <FormSection icon={<Boxes size={20} />} title="Datos del paquete" text="Información para identificar el envío." />
        <div className="form-row">
          <Field id="package-reference" label="Referencia interna" placeholder="Ej. PED-2026-0042" value={form.reference} onChange={(value) => updateField("reference", value)} />
          <Field id="package-weight" label="Peso aproximado (kg)" placeholder="0,0" type="number" value={form.weight} onChange={(value) => updateField("weight", value)} />
        </div>
        <Field id="package-content" label="Contenido" placeholder="Descripción breve del contenido" value={form.content} onChange={(value) => updateField("content", value)} />
        <FormSection icon={<MapPin size={20} />} title="Datos de entrega" text="Destino y persona que lo recibirá." spaced />
        <div className="form-row">
          <Field id="recipient-name" label="Destinatario" placeholder="Nombre completo" value={form.recipient} onChange={(value) => updateField("recipient", value)} />
          <Field id="recipient-phone" label="Teléfono" placeholder="+34 600 000 000" type="tel" value={form.phone} onChange={(value) => updateField("phone", value)} />
        </div>
        <Field id="recipient-address" label="Dirección de entrega" placeholder="Calle, número, piso y puerta" value={form.address} onChange={(value) => updateField("address", value)} />
        <div className="form-row form-row--three">
          <Field id="postal-code" label="Código postal" placeholder="28001" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} />
          <Field id="city" label="Ciudad" placeholder="Madrid" value={form.city} onChange={(value) => updateField("city", value)} />
          <div className="field">
            <label htmlFor="service">Servicio</label>
            <select id="service" value={form.service} onChange={(event) => updateField("service", event.target.value)}>
              <option value="standard">Estándar</option>
              <option value="express">Express</option>
            </select>
          </div>
        </div>
        <FormActions label="Registrar paquete" icon={<ArrowRight size={18} />} />
      </form>
    </main>
  )
}
