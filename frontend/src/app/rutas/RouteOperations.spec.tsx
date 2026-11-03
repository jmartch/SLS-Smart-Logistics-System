import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { RouteOperations } from "./RouteOperations"
import type { RouteDetailResult, RouteState } from "./routesApi"

function renderActions(state: RouteState, permissions: readonly string[]) {
  const route: RouteDetailResult = {
    id: "route-1",
    tenantId: "tenant-1",
    vehicleId: "vehicle-1",
    courierId: "courier-1",
    state,
    stops: [],
  }
  return renderToStaticMarkup(
    <MemoryRouter>
      <RouteOperations
        route={route}
        permissions={permissions}
        actionBusy={null}
        actionFeedback={null}
        runAction={async () => {}}
      />
    </MemoryRouter>,
  )
}

describe("RouteOperations", () => {
  describe("courier permissions", () => {
    it("explains a planned route and hides preparation, replanning and cancellation", () => {
      const html = renderActions("PLANNED", ["OPERATE_DELIVERIES"])

      expect(html).toContain("El coordinador debe preparar esta ruta")
      expect(html).not.toContain("Preparar ruta (congelar manifiesto)")
      expect(html).not.toContain("Replanificar / asignar paquetes")
      expect(html).not.toContain("Cancelar ruta")
      expect(html).not.toContain("Iniciar ruta")
    })

    it("offers starting only when the route is ready", () => {
      const html = renderActions("READY", ["OPERATE_DELIVERIES"])

      expect(html).toContain("Iniciar ruta")
      expect(html).not.toContain("Cancelar ruta")
    })

    it("offers interruption for a route in progress", () => {
      const html = renderActions("IN_PROGRESS", ["OPERATE_DELIVERIES"])

      expect(html).toContain("Interrumpir ruta")
      expect(html).not.toContain("Preparar ruta")
    })
  })

  describe("coordination permissions", () => {
    it("offers preparation, replanning and cancellation to coordinators", () => {
      const html = renderActions("PLANNED", ["COORDINATE_ROUTES"])

      expect(html).toContain("Preparar ruta (congelar manifiesto)")
      expect(html).toContain("Replanificar / asignar paquetes")
      expect(html).toContain("Cancelar ruta")
    })

    it("does not grant coordination actions based only on an administration permission", () => {
      const html = renderActions("PLANNED", ["MANAGE_TENANT"])

      expect(html).not.toContain("Preparar ruta (congelar manifiesto)")
      expect(html).not.toContain("Cancelar ruta")
      expect(html).toContain("Tienes acceso de consulta")
    })
  })
})
