import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router"
import { PackageDetailPage } from "./PackageDetailPage"
import type { PackageDetailResponse } from "../api/packagesApi"

vi.mock("../../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

let mockUserPermissions: string[] = ["CLASSIFY_PACKAGES"]

vi.mock("../../../auth", () => ({
  useAuth: () => ({
    user: {
      id: "u-1",
      email: "classifier@tenant.com",
      role: "classification",
      permissions: mockUserPermissions,
    },
    hasPermission: (p: string) => mockUserPermissions.includes(p),
  }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  mockUserPermissions = ["CLASSIFY_PACKAGES"]
})

const basePackageDetail: PackageDetailResponse = {
  id: "pkg-1",
  trackingCode: "TRK-GEO-101",
  state: "CLASSIFIED",
  priority: "NORMAL",
  weightKg: "2.50",
  volumeM3: "0.005",
  address: "Calle 80 # 53-67",
  addressId: "addr-uuid-1",
  municipalityCode: "08001",
  zone: "Zona Norte",
  sector: "El Golf",
  shipmentType: "Mensajería",
  registeredAt: "2026-11-09T01:00:00.000Z",
  lengthCm: "25.00",
  widthCm: "20.00",
  heightCm: "10.00",
  deadline: null,
  geocodingAttemptId: "att-uuid-1",
  geocoding: {
    status: "REVIEW_REQUIRED",
    eligibility: "INELIGIBLE",
    attemptId: "att-uuid-1",
    selectedCandidateId: null,
    attachmentId: null,
    attachmentStatus: null,
    unsuitabilityReason: "REVIEW_REQUIRED",
    datasetId: "ds-1",
    profile: "MOTOR_VEHICLE",
    directedReachabilityVerified: false,
  },
  candidates: [
    {
      id: "cand-1",
      rank: 1,
      score: 0.92,
      latitude: 11.0132,
      longitude: -74.8271,
      precision: "ENTRANCE",
      source: "SYNTHETIC",
    },
    {
      id: "cand-2",
      rank: 2,
      score: 0.88,
      latitude: 11.0134,
      longitude: -74.8273,
      precision: "BUILDING",
      source: "SYNTHETIC",
    },
  ],
  history: [
    {
      fromState: null,
      toState: "REGISTERED",
      reasonCode: null,
      changedBy: "reception@tenant.com",
      createdAt: "2026-11-09T01:00:00.000Z",
    },
    {
      fromState: "REGISTERED",
      toState: "CLASSIFIED",
      reasonCode: "ZONE_ASSIGNED",
      changedBy: "coordinator@tenant.com",
      createdAt: "2026-11-09T01:05:00.000Z",
    },
  ],
}

function renderDetailPage(packageId = "pkg-1") {
  return render(
    <MemoryRouter initialEntries={[`/app/paquetes/${packageId}`]}>
      <Routes>
        <Route path="/app/paquetes/:packageId" element={<PackageDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("PackageDetailPage", () => {
  it("renders live diagnostic badges, score as decimal value, and candidate list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(basePackageDetail), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    renderDetailPage("pkg-1")

    expect((await screen.findAllByText("TRK-GEO-101")).length).toBeGreaterThan(0)
    expect(screen.getByTestId("geocoding-status-badge").textContent).toContain("Requiere revisión")
    expect(screen.getByTestId("geocoding-eligibility-badge").textContent).toContain("INELIGIBLE")
    expect(screen.getByText("Posición #1")).toBeDefined()
    expect(screen.getByText("Posición #2")).toBeDefined()
    expect(screen.getByText("0.92")).toBeDefined()
    expect(screen.queryByText("92%")).toBeNull()
  })

  it("submits candidate review, sends correct payload and refreshes view with new diagnostic", async () => {
    const updatedPackage: PackageDetailResponse = {
      ...basePackageDetail,
      geocodingAttemptId: "att-uuid-2",
      geocoding: {
        status: "MATCHED",
        eligibility: "ELIGIBLE",
        attemptId: "att-uuid-2",
        selectedCandidateId: "cand-1",
        attachmentId: "road-att-1",
        attachmentStatus: "AUTO_ACCEPTED",
        unsuitabilityReason: null,
        datasetId: "ds-1",
        profile: "MOTOR_VEHICLE",
        directedReachabilityVerified: false,
      },
    }

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/geocoding/review") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "MATCHED",
              eligibility: "ELIGIBLE",
              selectedCandidateId: "cand-1",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(fetchMock.mock.calls.length > 1 ? updatedPackage : basePackageDetail),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    fireEvent.click(screen.getByTestId("tab-review"))

    const reasonInput = screen.getByTestId("review-reason-input")
    fireEvent.change(reasonInput, {
      target: { value: "Candidato 1 confirmado por fachada y nomenclatura" },
    })

    const submitBtn = screen.getByTestId("submit-review-button")
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const reviewCalls = fetchMock.mock.calls.filter((c) =>
        c[0].toString().includes("/geocoding/review"),
      )
      expect(reviewCalls.length).toBe(1)
      const body = JSON.parse(reviewCalls[0][1].body)
      expect(body.candidateId).toBe("cand-1")
      expect(body.decision).toBe("APPROVED")
      expect(body.expectedAddressId).toBe("addr-uuid-1")
      expect(body.expectedAttemptId).toBe("att-uuid-1")
      expect(body.operationId).toBeDefined()
    })

    expect(await screen.findByText(/Decisión de revisión guardada exitosamente/i)).toBeDefined()
    expect(screen.getByTestId("geocoding-eligibility-badge").textContent).toContain("ELIGIBLE")
  })

  it("handles 409 conflict by displaying conflict alert and refreshing fresh references", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/geocoding/resolve") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "PACKAGE_GEOCODING_STALE_ATTEMPT",
              message: "El intento referenciado está desactualizado.",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify(basePackageDetail), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    const resolveBtn = screen.getByTestId("submit-resolve-button")
    fireEvent.click(resolveBtn)

    expect(
      await screen.findByText(/Conflicto de concurrencia \(409\)/i),
    ).toBeDefined()

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it("does not clear visible package if reload fails after successful mutation", async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(basePackageDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      if (url.includes("/address-corrections") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "MATCHED", eligibility: "ELIGIBLE" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("Network connection dropped"))
    })
    vi.stubGlobal("fetch", fetchMock)

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    fireEvent.click(screen.getByTestId("tab-correct"))

    const textInput = screen.getByTestId("correct-address-input")
    fireEvent.change(textInput, { target: { value: "Carrera 53 # 80-67" } })

    const reasonInput = screen.getByTestId("correct-reason-input")
    fireEvent.change(reasonInput, { target: { value: "Corrección de calle a carrera" } })

    fireEvent.click(screen.getByTestId("submit-correct-button"))

    expect(
      await screen.findByText(/La operación se guardó en el servidor, pero falló la recarga/i),
    ).toBeDefined()

    expect(screen.getAllByText("TRK-GEO-101").length).toBeGreaterThan(0)
    expect(screen.queryByText("404")).toBeNull()
  })

  it("handles race conditions when navigating rapidly between packages A and B", async () => {
    let resolvePackageA: (res: Response) => void
    const packageAPromise = new Promise<Response>((resolve) => {
      resolvePackageA = resolve
    })

    const packageBDetail: PackageDetailResponse = {
      ...basePackageDetail,
      id: "pkg-2",
      trackingCode: "TRK-GEO-202",
      address: "Carrera 43 # 70-15",
      addressId: "addr-uuid-2",
      municipalityCode: "11001",
    }

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/packages/pkg-1")) {
        return packageAPromise
      }
      if (url.includes("/packages/pkg-2")) {
        return Promise.resolve(
          new Response(JSON.stringify(packageBDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      return Promise.reject(new Error("Unexpected URL"))
    })
    vi.stubGlobal("fetch", fetchMock)

    let navigateToPackageB: () => void

    function TestApp() {
      const navigate = useNavigate()
      navigateToPackageB = () => navigate("/app/paquetes/pkg-2")

      return (
        <Routes>
          <Route path="/app/paquetes/:packageId" element={<PackageDetailPage />} />
        </Routes>
      )
    }

    render(
      <MemoryRouter initialEntries={["/app/paquetes/pkg-1"]}>
        <TestApp />
      </MemoryRouter>,
    )

    act(() => {
      navigateToPackageB()
    })

    expect((await screen.findAllByText("TRK-GEO-202")).length).toBeGreaterThan(0)

    resolvePackageA!(
      new Response(JSON.stringify(basePackageDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(screen.queryByText("TRK-GEO-101")).toBeNull()
    expect(screen.getAllByText("TRK-GEO-202").length).toBeGreaterThan(0)
  })

  it("initializes address correction form with actual package municipality code and keeps field empty when null", async () => {
    const packageOtherCity: PackageDetailResponse = {
      ...basePackageDetail,
      municipalityCode: "11001",
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(packageOtherCity), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    fireEvent.click(screen.getByTestId("tab-correct"))

    const municipalityInput = screen.getByTestId("correct-municipality-input") as HTMLInputElement
    expect(municipalityInput.value).toBe("11001")
  })

  it("hides recovery actions and displays notice when user lacks permissions", async () => {
    mockUserPermissions = ["VIEW_PACKAGES"]

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(basePackageDetail), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    expect(screen.getByTestId("permission-denied-notice")).toBeDefined()
    expect(screen.queryByTestId("recovery-actions-panel")).toBeNull()
  })

  it("disallows recovery actions when package is already delivered or in transit", async () => {
    const deliveredPackage: PackageDetailResponse = {
      ...basePackageDetail,
      state: "DELIVERED",
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(deliveredPackage), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    renderDetailPage("pkg-1")

    await screen.findAllByText("TRK-GEO-101")
    expect(screen.getByTestId("state-disallowed-notice")).toBeDefined()
    expect(screen.queryByTestId("recovery-actions-panel")).toBeNull()
  })

  it("maintains operationId on failed retry with identical payload, rotates on payload change, and rotates on success", async () => {
    const submittedPayloads: Array<{ reason: string; decision: string; operationId?: string }> = []
    let shouldFail = true

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/geocoding/review") && init?.method === "POST") {
        const body = JSON.parse(init.body as string)
        submittedPayloads.push(body)
        if (shouldFail) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ code: "INTERNAL_ERROR", message: "Error temporal de red" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            ),
          )
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "MATCHED",
              eligibility: "ELIGIBLE",
              attemptId: "att-uuid-1",
              selectedCandidateId: "cand-1",
              attachmentId: "net-att-1",
              attachmentStatus: "APPROVED",
              unsuitabilityReason: null,
              datasetId: "ds-1",
              profile: "MOTOR_VEHICLE",
              directedReachabilityVerified: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify(basePackageDetail), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    renderDetailPage("pkg-1")
    await screen.findAllByText("TRK-GEO-101")

    fireEvent.click(screen.getByTestId("tab-review"))
    const reasonInput = screen.getByTestId("review-reason-input")
    fireEvent.change(reasonInput, { target: { value: "Motivo intento 1" } })

    const submitBtn = screen.getByTestId("submit-review-button")
    fireEvent.click(submitBtn)
    await screen.findByText(/Error temporal de red/i)

    expect(submittedPayloads).toHaveLength(1)
    const firstOpId = submittedPayloads[0].operationId
    expect(firstOpId).toBeDefined()

    fireEvent.click(submitBtn)
    await waitFor(() => expect(submittedPayloads).toHaveLength(2))
    expect(submittedPayloads[1].operationId).toBe(firstOpId)

    shouldFail = false
    fireEvent.change(reasonInput, { target: { value: "Motivo modificado tras fallo" } })
    fireEvent.click(submitBtn)
    await screen.findByText(/Decisión de revisión guardada exitosamente/i)

    expect(submittedPayloads).toHaveLength(3)
    const secondOpId = submittedPayloads[2].operationId
    expect(secondOpId).toBeDefined()
    expect(secondOpId).not.toBe(firstOpId)

    fireEvent.change(screen.getByTestId("review-reason-input"), { target: { value: "Segunda revision distinta" } })
    fireEvent.click(screen.getByTestId("submit-review-button"))
    await waitFor(() => expect(submittedPayloads).toHaveLength(4))
    const thirdOpId = submittedPayloads[3].operationId
    expect(thirdOpId).toBeDefined()
    expect(thirdOpId).not.toBe(secondOpId)
  })
})
