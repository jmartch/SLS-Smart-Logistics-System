import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RouteSummaryPanel } from "./RouteSummaryPanel"
import {
  RouteClosureDisposition,
  RouteClosureMode,
  type RouteSummaryResult,
} from "./routesApi"

describe("RouteSummaryPanel", () => {
  const baseSummary: RouteSummaryResult = {
    schemaVersion: 1,
    closureId: "80000000-0000-4000-8000-000000000001",
    tenantId: "10000000-0000-4000-8000-000000000001",
    routeId: "30000000-0000-4000-8000-000000000001",
    mode: RouteClosureMode.REGULAR,
    actorUserId: "user-1",
    correlationId: "corr-1",
    startedAt: "2026-11-08T18:00:00.000Z",
    completedAt: "2026-11-08T20:00:00.000Z",
    actualDurationMs: 7200000,
    actualDurationS: 7200,
    totalAssigned: 5,
    deliveredCount: 4,
    failedCount: 1,
    rescheduledCount: 0,
    returnedCount: 0,
    pendingCount: 0,
    deliveryEffectivenessRatio: 0.8,
    plannedDistanceM: 10000,
    actualDistanceM: 10500,
    distanceDeltaM: 500,
    distanceRatio: 1.05,
    reasonCode: "NORMAL_COMPLETION",
    notes: "Ruta terminada con balance correcto",
    members: [
      {
        assignmentId: "40000000-0000-4000-8000-000000000001",
        packageId: "20000000-0000-4000-8000-000000000001",
        routeStopId: "31000000-0000-4000-8000-000000000001",
        outcome: "DELIVERED",
        failureReasonCode: null,
        receiptConfirmed: false,
        depotId: null,
      },
      {
        assignmentId: "40000000-0000-4000-8000-000000000002",
        packageId: "20000000-0000-4000-8000-000000000002",
        routeStopId: "31000000-0000-4000-8000-000000000002",
        outcome: "FAILED",
        failureReasonCode: "RECIPIENT_ABSENT",
        receiptConfirmed: true,
        depotId: "depot-1",
      },
    ],
    stops: [
      {
        routeStopId: "31000000-0000-4000-8000-000000000001",
        stopNumber: 1,
        stopState: "COMPLETED",
        disposition: RouteClosureDisposition.VISITED,
      },
    ],
    failureReasons: [
      {
        reasonCode: "RECIPIENT_ABSENT",
        count: 1,
      },
    ],
    incidents: [
      {
        incidentId: "70000000-0000-4000-8000-000000000001",
        type: "TRAFFIC",
        status: "RESOLVED",
        reportedAt: "2026-11-08T19:00:00.000Z",
        description: "Trancón leve",
      },
    ],
  }

  it("renders full coordinator snapshot with metrics, notes and tables", () => {
    const html = renderToStaticMarkup(
      <RouteSummaryPanel summary={baseSummary} />,
    )

    expect(html).toContain("Resumen oficial de cierre")
    expect(html).toContain("Modo: REGULAR")
    expect(html).toContain("Total asignados")
    expect(html).toContain("80%")
    expect(html).toContain("2h 0m 0s")
    expect(html).toContain("10.00 km / 10.50 km")
    expect(html).toContain("Ruta terminada con balance correcto")
    expect(html).toContain("Manifiesto reconciliado (2 paquetes)")
    expect(html).toContain("Recibido en depósito")
    expect(html).toContain("Parada #1: VISITED (COMPLETED)")
    expect(html).toContain("Incidentes reportados durante la ruta (1)")
    expect(html).toContain("Trancón leve")
  })

  it("renders courier projection indicating internal notes are reserved", () => {
    const courierSummary: RouteSummaryResult = {
      ...baseSummary,
      notes: undefined,
      reasonCode: undefined,
    }

    const html = renderToStaticMarkup(
      <RouteSummaryPanel summary={courierSummary} />,
    )

    expect(html).toContain("Proyección de mensajero activa")
    expect(html).not.toContain("Ruta terminada con balance correcto")
  })
})
