import { afterEach, describe, expect, it, vi } from "vitest"
import {
  changeCourierStatus,
  createCourier,
  eligibleUsers,
  getCourier,
  listCouriers,
  courierError,
} from "./couriersApi"
import { ApiError } from "../../../shared/api/httpClient"
const courier = {
  id: "courier",
  tenantId: "tenant-a",
  userId: "user",
  email: "courier@example.test",
  status: "ACTIVE",
  userStatus: "ACTIVE",
  activeAssignmentCount: 2,
  activeRouteIds: ["route"],
  isCommitted: true,
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
describe("couriersApi", () => {
  it("lists with encoded filters and session credentials, without tenant headers", async () => {
    const result = { items: [courier], total: 1, page: 1, pageSize: 20 }
    const fetchMock = respond(result)
    await expect(
      listCouriers({
        page: 1,
        pageSize: 20,
        search: " a&b ",
        status: "ACTIVE",
      }),
    ).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/couriers?page=1&pageSize=20&search=a%26b&status=ACTIVE",
      expect.objectContaining({ credentials: "include" }),
    )
    expect(
      new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).has(
        "x-tenant-id",
      ),
    ).toBe(false)
  })
  it("loads paginated eligible users from the scoped directory", async () => {
    const result = {
      items: [{ id: "user", email: "user@example.test", status: "ACTIVE" }],
      total: 1,
      page: 2,
      pageSize: 10,
    }
    const fetchMock = respond(result)
    await expect(eligibleUsers({ page: 2, pageSize: 10 })).resolves.toEqual(
      result,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/couriers/eligible-users?page=2&pageSize=10",
      expect.anything(),
    )
  })
  it("loads detail and updates status through dedicated endpoints", async () => {
    let fetchMock = respond(courier)
    await expect(getCourier("courier")).resolves.toEqual(courier)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/couriers/courier",
      expect.anything(),
    )
    fetchMock = respond({ ...courier, status: "INACTIVE" })
    await changeCourierStatus("courier", "INACTIVE")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/couriers/courier/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "INACTIVE" }),
        credentials: "include",
      }),
    )
  })
  it("registers only the chosen user id, not roles or tenant", async () => {
    const fetchMock = respond(courier, 201)
    await expect(createCourier("user")).resolves.toEqual({ id: "courier" })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/couriers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "user" }),
      }),
    )
  })
  it.each([
    null,
    { ...courier, activeAssignmentCount: -1 },
    { ...courier, userStatus: "UNKNOWN" },
    { ...courier, activeRouteIds: null },
  ])("rejects malformed detail: %j", async (body) => {
    respond(body)
    await expect(getCourier("courier")).rejects.toThrow("no es válida")
  })
  it("rejects a malformed page and preserves empty pages with total", async () => {
    respond({ items: [courier], total: 1, page: 2, pageSize: 20 })
    await expect(listCouriers({ page: 1, pageSize: 20 })).rejects.toThrow(
      "no es válida",
    )
    const page = { items: [], total: 2, page: 3, pageSize: 1 }
    respond(page)
    await expect(listCouriers({ page: 3, pageSize: 1 })).resolves.toEqual(page)
  })
  it("preserves conflict code and status field for meaningful Spanish messages", async () => {
    respond(
      {
        code: "COURIER_COMMITTED",
        message: "Courier committed",
        field: "status",
      },
      409,
    )
    await expect(
      changeCourierStatus("courier", "INACTIVE"),
    ).rejects.toMatchObject({
      code: "COURIER_COMMITTED",
      fields: { status: "Courier committed" },
    })
    expect(
      courierError(new ApiError(409, "COURIER_COMMITTED", "Courier committed")),
    ).toContain("rutas sin cerrar")
  })
  it("surfaces permission denial without substituting fixtures", async () => {
    respond({ code: "FORBIDDEN", message: "Access denied" }, 403)
    await expect(
      listCouriers({ page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
