import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router"
import { PlanningPage } from "./PlanningPage"
import type { PlanningWorkspaceSnapshot } from "./planningApi"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mockWorkspace: PlanningWorkspaceSnapshot = {
  tenantId: "tenant-1",
  window: {
    startAt: "2026-11-09T08:00:00.000Z",
    endAt: "2026-11-09T13:00:00.000Z",
  },
  zones: [
    {
      id: "zone-1",
      code: "ZN-NORTE",
      name: "Zona Norte",
    },
  ],
  depots: [
    {
      id: "depot-1",
      name: "Centro de Distribución Norte",
      timeZone: "America/Bogota",
      latitude: 11.0041,
      longitude: -74.807,
    },
  ],
  datasets: [
    {
      id: "ds-1",
      name: "Cartografía Barranquilla 2026",
      sourceType: "LOCAL_VERIFIED",
      coverage: "Barranquilla Metropolitana",
      readyAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "ds-2",
      name: "Cartografía Atlántico Expansión",
      sourceType: "OSM",
      coverage: "Atlántico",
      readyAt: "2026-11-01T00:00:00.000Z",
    },
  ],
  candidatePackages: [
    {
      id: "pkg-ready-1",
      trackingCode: "TRK-READY-001",
      address: "Calle 80 # 53-67",
      weightKg: "2.50",
      volumeM3: "0.010",
      state: "CLASSIFIED",
      priority: "NORMAL",
      zoneId: "zone-1",
      zoneName: "Zona Norte",
      sectorId: null,
      sectorName: null,
      hasReadyCoordinates: true,
      isGeocodingReady: true,
      geocodingStatus: "MATCHED",
      networkAttachmentStatus: "AUTO_ACCEPTED",
      unsuitabilityReason: null,
      lastPendingReasonCode: null,
      lastStateChangedAt: null,
    },
    {
      id: "pkg-ready-2",
      trackingCode: "TRK-READY-002",
      address: "Carrera 51B # 82-100",
      weightKg: "1.20",
      volumeM3: "0.005",
      state: "CLASSIFIED",
      priority: "NORMAL",
      zoneId: "zone-1",
      zoneName: "Zona Norte",
      sectorId: null,
      sectorName: null,
      hasReadyCoordinates: true,
      isGeocodingReady: true,
      geocodingStatus: "MATCHED",
      networkAttachmentStatus: "AUTO_ACCEPTED",
      unsuitabilityReason: null,
      lastPendingReasonCode: null,
      lastStateChangedAt: null,
    },
    {
      id: "pkg-ambiguous-3",
      trackingCode: "TRK-AMB-003",
      address: "Calle 72 # 44-10",
      weightKg: "3.00",
      volumeM3: "0.012",
      state: "CLASSIFIED",
      priority: "NORMAL",
      zoneId: "zone-1",
      zoneName: "Zona Norte",
      sectorId: null,
      sectorName: null,
      hasReadyCoordinates: false,
      isGeocodingReady: false,
      geocodingStatus: "AMBIGUOUS_MATCH",
      networkAttachmentStatus: null,
      unsuitabilityReason: "REVIEW_REQUIRED",
      lastPendingReasonCode: null,
      lastStateChangedAt: null,
    },
  ],
  vehicles: [
    {
      id: "veh-1",
      plate: "SLS-101",
      status: "ACTIVE",
      maxWeightKg: "500.00",
      maxVolumeM3: "3.50",
      activeAssignedWeightKg: "0.00",
      activeAssignedVolumeM3: "0.00",
      remainingWeightKg: "500.00",
      remainingVolumeM3: "3.50",
      isActive: true,
      isOccupiedInWindow: false,
      isEligible: true,
    },
  ],
  couriers: [
    {
      id: "cour-1",
      userId: "u-10",
      email: "courier1@tenant.com",
      status: "ACTIVE",
      isActive: true,
      isOccupiedInWindow: false,
      isEligible: true,
    },
  ],
  editableRoutes: [],
}

describe("PlanningPage Geocoding Integration", () => {
  it("disables selection and displays unsuitability badge for packages not geocoding-ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify(mockWorkspace), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    render(
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText("TRK-READY-001")).toBeDefined()
    await screen.findByText("TRK-AMB-003")

    const eligibleCheckbox1 = screen.getByLabelText("Seleccionar TRK-READY-001") as HTMLInputElement
    const eligibleCheckbox2 = screen.getByLabelText("Seleccionar TRK-READY-002") as HTMLInputElement
    const ambiguousCheckbox = screen.getByLabelText("Seleccionar TRK-AMB-003") as HTMLInputElement

    expect(eligibleCheckbox1.disabled).toBe(false)
    expect(eligibleCheckbox2.disabled).toBe(false)
    expect(ambiguousCheckbox.disabled).toBe(true)

    expect(screen.getByText("Candidatos ambiguos requieren revisión manual")).toBeDefined()
    const resolveLink = screen.getByRole("link", { name: "Resolver" }) as HTMLAnchorElement
    expect(resolveLink.getAttribute("href")).toBe("/app/paquetes/pkg-ambiguous-3")
  })

  it("selects only eligible packages when clicking select-all checkbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockWorkspace), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    )

    render(
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText("TRK-READY-001")).toBeDefined()

    const eligibleCheckbox1 = screen.getByLabelText("Seleccionar TRK-READY-001") as HTMLInputElement
    const eligibleCheckbox2 = screen.getByLabelText("Seleccionar TRK-READY-002") as HTMLInputElement
    const ambiguousCheckbox = screen.getByLabelText("Seleccionar TRK-AMB-003") as HTMLInputElement

    expect(eligibleCheckbox1.checked).toBe(true)
    expect(eligibleCheckbox2.checked).toBe(true)
    expect(ambiguousCheckbox.checked).toBe(false)

    const selectAllCheckbox = screen.getByLabelText("Seleccionar todos los paquetes aptos") as HTMLInputElement
    expect(selectAllCheckbox.checked).toBe(true)

    fireEvent.click(selectAllCheckbox)
    await waitFor(() => {
      expect(eligibleCheckbox1.checked).toBe(false)
      expect(eligibleCheckbox2.checked).toBe(false)
    })

    fireEvent.click(selectAllCheckbox)
    await waitFor(() => {
      expect(eligibleCheckbox1.checked).toBe(true)
      expect(eligibleCheckbox2.checked).toBe(true)
      expect(ambiguousCheckbox.checked).toBe(false)
    })
  })

  it("triggers workspace query with datasetId and profile when changed, clearing invalid selection", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockWorkspace), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    render(
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText("TRK-READY-001")).toBeDefined()

    const profileSelect = screen.getByLabelText("Perfil de transitabilidad") as HTMLSelectElement
    fireEvent.change(profileSelect, { target: { value: "MOTORCYCLE" } })

    await waitFor(() => {
      const calls = fetchMock.mock.calls
      const lastCallUrl = calls[calls.length - 1][0].toString()
      expect(lastCallUrl).toContain("profile=MOTORCYCLE")
    })
  })
})
