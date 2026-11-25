import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { StopPageView, type StopPageViewProps } from "./StopPage"
import { RouteState } from "../../../rutas/routesApi"

function renderView(props: Partial<StopPageViewProps>) {
  const defaultProps: StopPageViewProps = {
    pageState: null,
    loading: false,
    attending: false,
    attendError: null,
    selectedPackageId: null,
    attemptMode: "success",
    showIncidentForm: false,
    onReload: () => {},
    onAttendStop: () => {},
    onSelectPackage: () => {},
    onClosePackageAttempt: () => {},
    onToggleIncidentForm: () => {},
    ...props,
  }

  return renderToStaticMarkup(
    <MemoryRouter>
      <StopPageView {...defaultProps} />
    </MemoryRouter>,
  )
}

describe("StopPageView", () => {
  it("renders loading spinner when loading and no pageState", () => {
    const html = renderView({ loading: true, pageState: null })

    expect(html).toContain('role="status"')
    expect(html).toContain("Cargando información operativa de la parada")
  })

  it("renders invalid_params message and navigation links", () => {
    const html = renderView({
      pageState: {
        kind: "invalid_params",
        message: "Se requiere un identificador de ruta y de parada válidos.",
      },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain("Parámetros de parada inválidos")
    expect(html).toContain("Ir a Rutas")
    expect(html).toContain("Ir a Mi ruta")
  })

  it("renders not_found state with back link", () => {
    const html = renderView({
      pageState: {
        kind: "not_found",
        message: "La parada 222 no existe en la ruta.",
      },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain("Parada no encontrada")
    expect(html).toContain("La parada 222 no existe en la ruta.")
    expect(html).toContain("Volver a rutas")
  })

  it("renders error state with retry button", () => {
    const html = renderView({
      pageState: {
        kind: "error",
        status: 500,
        title: "Error al cargar la parada",
        message: "Fallo de conexión al cargar la parada.",
      },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain("Error al cargar la parada")
    expect(html).toContain("Reintentar")
  })

  it("renders loaded stop in unattended state with arrival button and disabled actions", () => {
    const html = renderView({
      pageState: {
        kind: "ready",
        isAttended: false,
        canExecute: true,
        routeInProgress: true,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "IN_PROGRESS",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.IN_PROGRESS,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "PENDING",
          latitude: 10.9876,
          longitude: -74.789,
          packageIds: ["pkg-1"],
          packages: [
            {
              assignmentId: "30000000-0000-4000-8000-000000000003",
              packageId: "40000000-0000-4000-8000-000000000004",
              trackingCode: "TRK-BAQ-001",
              state: "OUT_FOR_DELIVERY",
              assignmentState: "ACTIVE",
              outcome: null,
              receiptConfirmed: false,
            },
          ],
        },
      },
    })

    expect(html).toContain("Parada #1")
    expect(html).toContain("Registrar llegada a la parada")
    expect(html).toContain("Requiere registrar llegada a la parada")
    expect(html).not.toContain("Llegada confirmada")
  })

  it("renders loaded stop in attended state with action buttons for active OUT_FOR_DELIVERY packages", () => {
    const html = renderView({
      pageState: {
        kind: "ready",
        isAttended: true,
        canExecute: true,
        routeInProgress: true,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "IN_PROGRESS",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.IN_PROGRESS,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 2,
          state: "IN_PROGRESS",
          latitude: 10.9999,
          longitude: -74.8888,
          packageIds: ["pkg-1", "pkg-2", "pkg-3"],
          packages: [
            {
              assignmentId: "30000000-0000-4000-8000-000000000001",
              packageId: "40000000-0000-4000-8000-000000000001",
              trackingCode: "TRK-ACTIVE-01",
              state: "OUT_FOR_DELIVERY",
              assignmentState: "ACTIVE",
              outcome: null,
              receiptConfirmed: false,
            },
            {
              assignmentId: "30000000-0000-4000-8000-000000000002",
              packageId: "40000000-0000-4000-8000-000000000002",
              trackingCode: "TRK-DELIVERED-02",
              state: "DELIVERED",
              assignmentState: "ACTIVE",
              outcome: "DELIVERED",
              receiptConfirmed: true,
            },
            {
              assignmentId: "30000000-0000-4000-8000-000000000003",
              packageId: "40000000-0000-4000-8000-000000000003",
              trackingCode: "TRK-FAILED-03",
              state: "DELIVERY_FAILED",
              assignmentState: "ACTIVE",
              outcome: "RECIPIENT_ABSENT",
              receiptConfirmed: false,
            },
          ],
        },
      },
    })

    expect(html).toContain("Llegada confirmada")
    expect(html).toContain("Entregar")
    expect(html).toContain("Reportar fallo")
    expect(html).toContain("Entregado")
    expect(html).toContain("Fallido (RECIPIENT_ABSENT)")
  })

  it("does not render delivery action buttons for historical non-ACTIVE packages", () => {
    const html = renderView({
      pageState: {
        kind: "ready",
        isAttended: true,
        canExecute: true,
        routeInProgress: true,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "IN_PROGRESS",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.IN_PROGRESS,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "IN_PROGRESS",
          latitude: 10.9999,
          longitude: -74.8888,
          packageIds: ["pkg-1"],
          packages: [
            {
              assignmentId: "30000000-0000-4000-8000-000000000001",
              packageId: "40000000-0000-4000-8000-000000000001",
              trackingCode: "TRK-HISTORICAL",
              state: "OUT_FOR_DELIVERY",
              assignmentState: "ENDED",
              outcome: null,
              receiptConfirmed: false,
            },
          ],
        },
      },
    })

    expect(html).toContain("Asignación no activa (ENDED)")
    expect(html).not.toContain("Entregar</button>")
    expect(html).not.toContain("Reportar fallo</button>")
  })

  it("hides incident reporting section when route is COMPLETED or user is read-only", () => {
    const htmlCompleted = renderView({
      pageState: {
        kind: "ready",
        isAttended: true,
        canExecute: true,
        routeInProgress: false,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "COMPLETED",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.COMPLETED,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "COMPLETED",
          latitude: 10.9876,
          longitude: -74.789,
          packageIds: [],
          packages: [],
        },
      },
    })

    expect(htmlCompleted).not.toContain("Novedades operativas de la parada")

    const htmlReadOnly = renderView({
      pageState: {
        kind: "ready",
        isAttended: true,
        canExecute: false,
        routeInProgress: true,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "IN_PROGRESS",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.IN_PROGRESS,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "IN_PROGRESS",
          latitude: 10.9876,
          longitude: -74.789,
          packageIds: [],
          packages: [],
        },
      },
    })

    expect(htmlReadOnly).not.toContain("Novedades operativas de la parada")
  })

  it("renders read-only and state warning banners when route is not IN_PROGRESS", () => {
    const html = renderView({
      pageState: {
        kind: "ready",
        isAttended: false,
        canExecute: false,
        routeInProgress: false,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "COMPLETED",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.COMPLETED,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "COMPLETED",
          latitude: 10.9876,
          longitude: -74.789,
          packageIds: [],
          packages: [],
        },
      },
    })

    expect(html).toContain("Esta ruta se encuentra en estado")
    expect(html).toContain("COMPLETED")
    expect(html).toContain("Tienes permisos de solo lectura")
  })

  it("renders ENDED assignment badge as FAILED based on assignment outcome even when global package state is DELIVERED", () => {
    const html = renderView({
      pageState: {
        kind: "ready",
        isAttended: true,
        canExecute: true,
        routeInProgress: true,
        manifest: {
          routeId: "10000000-0000-4000-8000-000000000001",
          routeState: "IN_PROGRESS",
          view: "all",
          stops: [],
        },
        route: {
          id: "10000000-0000-4000-8000-000000000001",
          tenantId: "tenant-1",
          state: RouteState.IN_PROGRESS,
          vehicleId: "veh-1",
          courierId: "user-1",
          stops: [],
        },
        stop: {
          stopId: "20000000-0000-4000-8000-000000000002",
          stopNumber: 1,
          state: "IN_PROGRESS",
          latitude: 10.9876,
          longitude: -74.789,
          packageIds: ["pkg-ended-1"],
          packages: [
            {
              assignmentId: "assign-ended-1234",
              packageId: "pkg-ended-1",
              trackingCode: "TRK-ENDED-FAILED",
              state: "DELIVERED",
              assignmentState: "ENDED",
              outcome: "FAILED",
              receiptConfirmed: false,
            },
          ],
        },
      },
    })

    expect(html).toContain("Fallido (FAILED)")
    expect(html).not.toContain("Entregado")
    expect(html).toContain("Estado actual: DELIVERED")
    expect(html).toContain("ENDED · Resultado: FAILED")
    expect(html).not.toContain("Entregar paquete")
    expect(html).not.toContain("Registrar fallo")
  })
})
