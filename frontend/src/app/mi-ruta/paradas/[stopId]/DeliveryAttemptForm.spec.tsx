import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  DeliveryAttemptForm,
  type DeliveryAttemptFormProps,
} from "./DeliveryAttemptForm"

describe("DeliveryAttemptForm", () => {
  const defaultProps: DeliveryAttemptFormProps = {
    routeId: "11111111-1111-4111-8111-111111111111",
    stopId: "22222222-2222-4222-8222-222222222222",
    packageId: "33333333-3333-4333-8333-333333333333",
    trackingCode: "TRK-001",
    onSuccess: () => {},
    onCancel: () => {},
  }

  it("renders in success mode by default with photo and signature file fields", () => {
    const html = renderToStaticMarkup(
      <DeliveryAttemptForm {...defaultProps} initialMode="success" />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain("Registrar gestión para TRK-001")
    expect(html).toContain("Entrega exitosa")
    expect(html).toContain("Intento fallido")
    expect(html).toContain("Fotografía")
    expect(html).toContain("Firma digital")
    expect(html).toContain("Observaciones (opcionales)")
    expect(html).toContain("Confirmar entrega exitosa")
    expect(html).toContain("Se requiere adjuntar al menos una evidencia")
  })

  it("renders in failed mode with reason code options and failed submit button", () => {
    const html = renderToStaticMarkup(
      <DeliveryAttemptForm {...defaultProps} initialMode="failed" />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain("Motivo del fallo *")
    expect(html).toContain("Destinatario ausente")
    expect(html).toContain("Dirección no encontrada")
    expect(html).toContain("Rechazado por el destinatario")
    expect(html).toContain("Acceso restringido o zona inaccesible")
    expect(html).toContain("Paquete con avería o dañado")
    expect(html).toContain("Otro motivo")
    expect(html).toContain("Confirmar fallo de entrega")
  })
})
