import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { RouteClosureForm } from "./RouteClosureForm"
import { RouteState, type RouteDetailResult } from "./routesApi"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const testRoute: RouteDetailResult = {
  id: "30000000-0000-4000-8000-000000000001",
  tenantId: "10000000-0000-4000-8000-000000000001",
  state: RouteState.IN_PROGRESS,
  vehicleId: "vehicle-1",
  courierId: "courier-1",
  depotId: "depot-default-id",
  stops: [],
}

describe("RouteClosureForm", () => {
  it("renders closure dialog with mode selection and receipt section", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteClosureForm
          route={testRoute}
          onSuccess={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain("Cierre operativo de ruta")
    expect(html).toContain("Regular (todas paradas atendidas)")
    expect(html).toContain("Forzado (contingencia / corte)")
    expect(html).toContain("Distancia real recorrida")
    expect(html).toContain("Confirmar cierre")
  })

  it("displays loading indicator for manifest on initial render", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteClosureForm
          route={testRoute}
          onSuccess={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    )

    expect(html).toContain("Consultando carga activa de la ruta...")
    expect(html).toContain('role="status"')
  })

  it("includes depotId from route as default input value", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteClosureForm
          route={testRoute}
          onSuccess={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    )

    expect(html).toContain("Reconciliación y custodia en depósito")
  })

  it("renders cancel button and accessible close button", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteClosureForm
          route={testRoute}
          onSuccess={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    )

    expect(html).toContain('aria-label="Cerrar formulario"')
    expect(html).toContain("Cancelar")
  })
})
