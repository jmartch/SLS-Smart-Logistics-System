import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { MyRouteContent } from "./MyRoutePage"
import { loadMyRoutes } from "./myRouteState"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))
afterEach(() => vi.unstubAllGlobals())

describe("MyRoutePage", () => {
  describe("load states", () => {
    it.each([
      [401, "Sesión no válida"],
      [403, "Acceso denegado"],
      [500, "No se pudieron cargar tus rutas"],
    ] as const)(
      "shows HTTP %s as an error instead of an empty route",
      async (status, title) => {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              new Response(JSON.stringify({ message: "Request failed" }), {
                status,
              }),
            ),
        )

        const state = await loadMyRoutes(1)
        const html = renderToStaticMarkup(
          <MemoryRouter>
            <MyRouteContent state={state} onRetry={() => {}} />
          </MemoryRouter>,
        )

        expect(state.kind).toBe("error")
        expect(html).toContain('role="alert"')
        expect(html).toContain(title)
        expect(html).not.toContain("Sin rutas asignadas")
      },
    )

    it("shows an empty state only after a successful empty API response", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }),
            { status: 200 },
          ),
        )
      vi.stubGlobal("fetch", fetchMock)

      const state = await loadMyRoutes(1)
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <MyRouteContent state={state} onRetry={() => {}} />
        </MemoryRouter>,
      )

      expect(state.kind).toBe("success")
      expect(html).toContain("Sin rutas asignadas")
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/v1/routes?page=1&pageSize=20",
      )
      expect(fetchMock.mock.calls[0][1].credentials).toBe("include")
    })

    it("shows assigned planned routes without requiring a route in progress", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "route-1",
                  tenantId: "tenant-1",
                  state: "PLANNED",
                  vehicleId: "vehicle-1",
                  courierId: "courier-1",
                  stopCount: 3,
                },
              ],
              page: 1,
              pageSize: 20,
              total: 1,
            }),
            { status: 200 },
          ),
        ))

      const state = await loadMyRoutes(1)
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <MyRouteContent state={state} onRetry={() => {}} />
        </MemoryRouter>,
      )

      expect(html).toContain("Planificada")
      expect(html).toContain('href="/app/rutas/route-1"')
      expect(html).not.toContain("Sin rutas asignadas")
    })
  })
})
