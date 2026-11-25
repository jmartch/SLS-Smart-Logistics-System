import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  IncidentReportForm,
  type IncidentReportFormProps,
} from "./IncidentReportForm"

describe("IncidentReportForm", () => {
  const defaultProps: IncidentReportFormProps = {
    routeId: "11111111-1111-4111-8111-111111111111",
    routeStopId: "22222222-2222-4222-8222-222222222222",
    onSuccess: () => {},
    onCancel: () => {},
  }

  it("renders incident form with types and fields", () => {
    const html = renderToStaticMarkup(<IncidentReportForm {...defaultProps} />)

    expect(html).toContain('role="region"')
    expect(html).toContain("Reportar novedad en ruta")
    expect(html).toContain("Tipo de incidente *")
    expect(html).toContain("Avería o falla vehicular")
    expect(html).toContain("Tráfico o congestión vial severa")
    expect(html).toContain("Accidente de tránsito")
    expect(html).toContain("Condición climática adversa")
    expect(html).toContain("Alerta de seguridad o orden público")
    expect(html).toContain("Zona o dirección físicamente inaccesible")
    expect(html).toContain("Otro incidente operativo")
    expect(html).toContain("Descripción detallada *")
    expect(html).toContain("Reportar novedad")
  })
})
