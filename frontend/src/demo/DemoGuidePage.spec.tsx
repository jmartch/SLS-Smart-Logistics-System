import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router"

import type { User } from "../auth"
import {
  listPackages,
  type PackageListItemResponse,
} from "../app/paquetes/api/packagesApi"
import {
  listRoutes,
  type PaginatedRoutesResult,
} from "../app/rutas/routesApi"
import { ApiError } from "../shared/api/httpClient"
import { DemoGuidePage } from "./DemoGuidePage"

const mocks = vi.hoisted(() => ({
  listPackages: vi.fn(),
  listRoutes: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock("../auth", () => ({
  useAuth: mocks.useAuth,
}))

vi.mock("../app/paquetes/api/packagesApi", () => ({
  listPackages: mocks.listPackages,
}))

vi.mock("../app/rutas/routesApi", () => ({
  listRoutes: mocks.listRoutes,
}))

const coordinator: User = {
  id: "user-1",
  name: "Coordinador",
  email: "coordinator@example.test",
  role: "coordinator",
  roles: [{ id: "role-1", name: "Coordinador" }],
  permissions: [
    "COORDINATE_ROUTES",
    "CLASSIFY_PACKAGES",
    "OPERATE_DELIVERIES",
  ],
  kind: "TENANT_USER",
  tenant: "Empresa de prueba",
  tenantId: "tenant-1",
  avatar: "CO",
}

const packages: PackageListItemResponse[] = [
  {
    id: "package-1",
    trackingCode: "SLS-001",
    state: "REGISTERED",
    priority: "NORMAL",
    weightKg: "1",
    volumeM3: "0.1",
    address: "Calle 1",
    zone: null,
    sector: null,
    shipmentType: "STANDARD",
    registeredAt: null,
  },
  {
    id: "package-2",
    trackingCode: "SLS-002",
    state: "PENDING_ASSIGNMENT",
    priority: "NORMAL",
    weightKg: "1",
    volumeM3: "0.1",
    address: "Calle 2",
    zone: null,
    sector: null,
    shipmentType: "STANDARD",
    registeredAt: null,
  },
]

const routes: PaginatedRoutesResult = {
  items: [
    {
      id: "route-1",
      tenantId: "tenant-1",
      state: "PLANNED",
      vehicleId: "vehicle-1",
      courierId: "courier-1",
      stopCount: 2,
    },
  ],
  page: 1,
  pageSize: 100,
  total: 1,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DemoGuidePage />
    </MemoryRouter>,
  )
}

describe("DemoGuidePage", () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({
      user: coordinator,
      initializing: false,
      hasPermission: (permission: string) =>
        coordinator.permissions.includes(permission),
    })
    mocks.listPackages.mockResolvedValue(packages)
    mocks.listRoutes.mockResolvedValue(routes)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("shows live counts from the authenticated tenant's API data", async () => {
    const { container } = renderPage()

    expect(await screen.findByText("Backend conectado")).toBeTruthy()
    expect(mocks.listPackages).toHaveBeenCalledOnce()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(screen.getByText("Empresa de prueba")).toBeTruthy()

    const metricValues = Array.from(
      container.querySelectorAll(".demo-guide__metrics dd"),
      (item) => item.textContent,
    )
    expect(metricValues).toEqual(["1", "1", "1", "1"])
    expect(
      screen.getByRole("link", { name: "Ir a planificación" }).getAttribute("href"),
    ).toBe("/app/planificacion")
    expect(
      screen.getByRole("link", { name: "Abrir mi ruta" }).getAttribute("href"),
    ).toBe("/app/mi-ruta")
  })

  it("explains when a local demo session is not authenticated by the backend", async () => {
    mocks.listPackages.mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "Unauthorized"),
    )

    renderPage()

    expect(
      await screen.findByText(/el backend no reconoce esta sesión/i),
    ).toBeTruthy()
    expect(
      screen.getByRole("link", { name: /cuenta real/i }),
    ).toBeTruthy()
  })

  it("does not query tenant data before a user signs in", () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      initializing: false,
      hasPermission: () => false,
    })

    renderPage()

    expect(
      screen.getByText(/usa una sesión autenticada del tenant/i),
    ).toBeTruthy()
    expect(listPackages).not.toHaveBeenCalled()
    expect(listRoutes).not.toHaveBeenCalled()
  })
})
