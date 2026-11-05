import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../../../shared/api/httpClient"
import {
  createVehicle,
  listVehicles,
  getVehicle,
  updateVehicle,
  changeVehicleStatus,
} from "./vehiclesApi"

const vehicle = {
  id: "20000000-0000-4000-8000-000000000001",
  plate: "ABC123",
  status: "ACTIVE",
  maxWeightKg: "10.001",
  maxVolumeM3: "1.000001",
  assignedWeightKg: "0.002",
  assignedVolumeM3: "0.000002",
  remainingWeightKg: "9.999",
  remainingVolumeM3: "0.999999",
}

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe("vehiclesApi", () => {
  it("loads operational detail with session credentials", async () => {
    const detail = { ...vehicle, isCommitted: true }
    const fetchMock = respond(detail)
    await expect(getVehicle(vehicle.id)).resolves.toEqual(detail)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/vehicles/${vehicle.id}`,
      expect.objectContaining({ credentials: "include" }),
    )
  })
  it("sends only the requested edit fields", async () => {
    const fetchMock = respond({
      ...vehicle,
      plate: "ABC321",
      isCommitted: false,
    })
    await updateVehicle(vehicle.id, { plate: "ABC321" })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/vehicles/${vehicle.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ plate: "ABC321" }),
        credentials: "include",
      }),
    )
  })
  it("changes status through its dedicated endpoint", async () => {
    const fetchMock = respond({
      ...vehicle,
      status: "MAINTENANCE",
      isCommitted: false,
    })
    await changeVehicleStatus(vehicle.id, "MAINTENANCE")
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/vehicles/${vehicle.id}/status`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "MAINTENANCE" }),
        credentials: "include",
      }),
    )
  })
  it("rejects malformed detail responses", async () => {
    respond(vehicle)
    await expect(getVehicle(vehicle.id)).rejects.toThrow(
      "detalle de vehículo no es válida",
    )
  })
  it("preserves capacity conflict code and field for editing", async () => {
    respond(
      {
        error: {
          code: "VEHICLE_CAPACITY_BELOW_LOAD",
          message: "Capacity below load",
          field: "maxWeightKg",
        },
      },
      409,
    )
    await expect(
      updateVehicle(vehicle.id, { maxWeightKg: "0.001" }),
    ).rejects.toMatchObject({
      status: 409,
      code: "VEHICLE_CAPACITY_BELOW_LOAD",
      fields: { maxWeightKg: "Capacity below load" },
    })
  })
  it("sends pagination and encoded filters with session credentials and preserves exact capacity strings", async () => {
    const page = { items: [vehicle], total: 1, page: 2, pageSize: 10 }
    const fetchMock = respond(page)
    await expect(
      listVehicles({
        page: 2,
        pageSize: 10,
        search: " ABC&1 ",
        status: "ACTIVE",
      }),
    ).resolves.toEqual(page)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/vehicles?page=2&pageSize=10&search=ABC%261&status=ACTIVE",
      expect.objectContaining({ credentials: "include" }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has("x-tenant-id")).toBe(false)
  })

  it("accepts an empty page while preserving total", async () => {
    const page = { items: [], total: 10, page: 2, pageSize: 20 }
    respond(page)
    await expect(listVehicles({ page: 2, pageSize: 20 })).resolves.toEqual(page)
  })

  it.each([
    null,
    { items: null, total: 0, page: 1, pageSize: 20 },
    {
      items: [{ ...vehicle, remainingWeightKg: "NaN" }],
      total: 1,
      page: 1,
      pageSize: 20,
    },
    {
      items: [{ ...vehicle, status: "UNKNOWN" }],
      total: 1,
      page: 1,
      pageSize: 20,
    },
    { items: [vehicle], total: -1, page: 1, pageSize: 20 },
    { items: [vehicle], total: 1, page: 2, pageSize: 20 },
  ])("rejects malformed list responses: %j", async (body) => {
    respond(body)
    await expect(listVehicles({ page: 1, pageSize: 20 })).rejects.toThrow(
      "no es válida",
    )
  })

  it("registers decimal strings without adding identity fields", async () => {
    const fetchMock = respond(vehicle, 201)
    const payload = {
      plate: "abc123",
      maxWeightKg: "10.001",
      maxVolumeM3: "1.000001",
    }
    await expect(createVehicle(payload)).resolves.toEqual(vehicle)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/vehicles",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(payload),
      }),
    )
  })

  it("preserves duplicate-plate field details for the form", async () => {
    respond(
      {
        code: "VEHICLE_PLATE_CONFLICT",
        message: "Placa duplicada.",
        fields: { plate: "Utiliza otra placa." },
      },
      409,
    )
    await expect(
      createVehicle({ plate: "ABC123", maxWeightKg: "10", maxVolumeM3: "1" }),
    ).rejects.toMatchObject({
      status: 409,
      code: "VEHICLE_PLATE_CONFLICT",
      fields: { plate: "Utiliza otra placa." },
    })
  })

  it("surfaces permission denial instead of substituting fixtures", async () => {
    respond({ code: "PERMISSION_DENIED", message: "Access denied" }, 403)
    await expect(
      listVehicles({ page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
