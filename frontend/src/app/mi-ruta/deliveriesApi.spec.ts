import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

import { ApiError } from "../../shared/api/httpClient"
import {
  attendRouteStop,
  getDeliveryManifest,
  recordFailedDelivery,
  recordSuccessfulDelivery,
  reportIncident,
} from "./deliveriesApi"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ROUTE_ID = "30000000-0000-4000-8000-000000000001"
const STOP_ID = "31000000-0000-4000-8000-000000000001"
const PACKAGE_ID = "20000000-0000-4000-8000-000000000001"
const IDEMPOTENCY_KEY = "90000000-0000-4000-8000-000000000001"

describe("deliveriesApi", () => {
  describe("getDeliveryManifest", () => {
    it("requests manifest with routeId and view parameter", async () => {
      const manifestPayload = {
        routeId: ROUTE_ID,
        routeState: "IN_PROGRESS",
        view: "all",
        stops: [
          {
            stopId: STOP_ID,
            stopNumber: 1,
            state: "PENDING",
            latitude: 10.99,
            longitude: -74.8,
            packageIds: [PACKAGE_ID],
            packages: [
              {
                assignmentId: "40000000-0000-4000-8000-000000000001",
                packageId: PACKAGE_ID,
                trackingCode: "TRK-001",
                state: "IN_TRANSIT",
                assignmentState: "ACTIVE",
                outcome: null,
                receiptConfirmed: false,
              },
            ],
          },
        ],
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(manifestPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await getDeliveryManifest(ROUTE_ID, "all")

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        `/api/v1/deliveries/routes/${ROUTE_ID}/manifest?view=all`,
      )
      expect(init.method).toBe("GET")
      expect(result.routeId).toBe(ROUTE_ID)
      expect(result.routeState).toBe("IN_PROGRESS")
      expect(result.stops[0]?.packages[0]?.assignmentId).toBe(
        "40000000-0000-4000-8000-000000000001",
      )
    })

    it("rejects non-uuid routeId", async () => {
      await expect(getDeliveryManifest("invalid-id")).rejects.toThrow(
        "El campo 'routeId' debe ser un UUID válido.",
      )
    })
  })

  describe("attendRouteStop", () => {
    it("posts to attend endpoint with Idempotency-Key header", async () => {
      const attendPayload = {
        stopId: STOP_ID,
        actualArrivalAt: "2026-11-08T19:30:00.000Z",
        affectedPackageIds: [PACKAGE_ID],
        replayed: false,
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(attendPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await attendRouteStop(ROUTE_ID, STOP_ID, IDEMPOTENCY_KEY)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        `/api/v1/deliveries/routes/${ROUTE_ID}/stops/${STOP_ID}/attend`,
      )
      expect(init.method).toBe("POST")

      const headers = new Headers(init.headers)
      expect(headers.get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY)
      expect(result.actualArrivalAt).toBe("2026-11-08T19:30:00.000Z")
    })

    it("preserves idempotency key across retries", async () => {
      const attendReplayPayload = {
        stopId: STOP_ID,
        actualArrivalAt: "2026-11-08T19:30:00.000Z",
        affectedPackageIds: [PACKAGE_ID],
        replayed: true,
      }

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(attendReplayPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      const firstResult = await attendRouteStop(
        ROUTE_ID,
        STOP_ID,
        IDEMPOTENCY_KEY,
      )
      const secondResult = await attendRouteStop(
        ROUTE_ID,
        STOP_ID,
        IDEMPOTENCY_KEY,
      )

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(new Headers(firstInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(new Headers(secondInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(firstResult.replayed).toBe(true)
      expect(secondResult.replayed).toBe(true)
    })

    it("propagates 403 Forbidden ApiError without swallowing", async () => {
      const errorPayload = {
        code: "DELIVERY_FORBIDDEN",
        message: "Actor is not assigned to this route",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        attendRouteStop(ROUTE_ID, STOP_ID, IDEMPOTENCY_KEY),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === "DELIVERY_FORBIDDEN"
        )
      })
    })

    it("propagates 409 Conflict ApiError without swallowing", async () => {
      const errorPayload = {
        code: "STOP_NOT_PENDING",
        message: "Stop is already completed",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        attendRouteStop(ROUTE_ID, STOP_ID, IDEMPOTENCY_KEY),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === "STOP_NOT_PENDING"
        )
      })
    })
  })

  describe("recordSuccessfulDelivery", () => {
    it("sends multipart form data with photo, signature, notes and Idempotency-Key", async () => {
      const successPayload = {
        attemptId: "50000000-0000-4000-8000-000000000001",
        attemptNumber: 1,
        outcome: "DELIVERED",
        packageId: PACKAGE_ID,
        stopResolution: "COMPLETED",
        evidenceIds: [
          "60000000-0000-4000-8000-000000000001",
          "60000000-0000-4000-8000-000000000002",
        ],
        replayed: false,
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(successPayload), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const fakePhoto = new File(["photo-data"], "evidence.jpg", {
        type: "image/jpeg",
      })
      const fakeSignature = new File(["signature-data"], "signature.png", {
        type: "image/png",
      })
      const result = await recordSuccessfulDelivery(
        {
          routeId: ROUTE_ID,
          stopId: STOP_ID,
          packageId: PACKAGE_ID,
          photo: fakePhoto,
          signature: fakeSignature,
          notes: "Entregado a recepcionista",
        },
        IDEMPOTENCY_KEY,
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        `/api/v1/deliveries/routes/${ROUTE_ID}/stops/${STOP_ID}/packages/${PACKAGE_ID}/successful-attempts`,
      )
      expect(init.method).toBe("POST")
      expect(init.body).toBeInstanceOf(FormData)

      const body = init.body as FormData
      expect(body.get("photo")).toBe(fakePhoto)
      expect(body.get("signature")).toBe(fakeSignature)
      expect(body.get("notes")).toBe("Entregado a recepcionista")

      const headers = new Headers(init.headers)
      expect(headers.get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY)
      expect(headers.get("Content-Type")).toBeNull()
      expect(result.outcome).toBe("DELIVERED")
    })

    it("preserves idempotency key and payload across retries", async () => {
      const replayPayload = {
        attemptId: "50000000-0000-4000-8000-000000000001",
        attemptNumber: 1,
        outcome: "DELIVERED",
        packageId: PACKAGE_ID,
        stopResolution: "COMPLETED",
        evidenceIds: ["60000000-0000-4000-8000-000000000001"],
        replayed: true,
      }

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(replayPayload), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      const fakePhoto = new Blob(["photo-data"], { type: "image/jpeg" })
      const params = {
        routeId: ROUTE_ID,
        stopId: STOP_ID,
        packageId: PACKAGE_ID,
        photo: fakePhoto as File,
        notes: "Entrega reintentada",
      }

      const firstResult = await recordSuccessfulDelivery(
        params,
        IDEMPOTENCY_KEY,
      )
      const secondResult = await recordSuccessfulDelivery(
        params,
        IDEMPOTENCY_KEY,
      )

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(new Headers(firstInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(new Headers(secondInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(firstResult.replayed).toBe(true)
      expect(secondResult.replayed).toBe(true)
    })

    it("rejects when neither photo nor signature is provided", async () => {
      await expect(
        recordSuccessfulDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            notes: "Sin foto",
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(
        "Se requiere al menos una evidencia (foto o firma) para registrar la entrega.",
      )
    })

    it("propagates 403 Forbidden ApiError without swallowing", async () => {
      const errorPayload = {
        code: "DELIVERY_FORBIDDEN",
        message: "Not authorized to record delivery",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const fakeFile = new Blob(["fake-bytes"], { type: "image/jpeg" })
      await expect(
        recordSuccessfulDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            photo: fakeFile as File,
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === "DELIVERY_FORBIDDEN"
        )
      })
    })

    it("propagates 409 Conflict ApiError without swallowing", async () => {
      const errorPayload = {
        code: "PACKAGE_NOT_OUT_FOR_DELIVERY",
        message: "Package is not out for delivery",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const fakeFile = new Blob(["fake-bytes"], { type: "image/jpeg" })
      await expect(
        recordSuccessfulDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            photo: fakeFile as File,
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === "PACKAGE_NOT_OUT_FOR_DELIVERY"
        )
      })
    })
  })

  describe("recordFailedDelivery", () => {
    it("sends failed attempt with catalog reason, notes, photo and signature", async () => {
      const failedPayload = {
        attemptId: "50000000-0000-4000-8000-000000000002",
        attemptNumber: 1,
        outcome: "FAILED",
        packageId: PACKAGE_ID,
        reasonCode: "RECIPIENT_ABSENT",
        stopResolution: "FAILED",
        replayed: false,
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(failedPayload), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const fakePhoto = new File(["photo-bytes"], "failed-attempt.jpg", {
        type: "image/jpeg",
      })
      const fakeSignature = new File(["signature-bytes"], "refusal.png", {
        type: "image/png",
      })

      const result = await recordFailedDelivery(
        {
          routeId: ROUTE_ID,
          stopId: STOP_ID,
          packageId: PACKAGE_ID,
          reasonCode: "RECIPIENT_ABSENT",
          notes: "No contestaron timbre",
          photo: fakePhoto,
          signature: fakeSignature,
        },
        IDEMPOTENCY_KEY,
      )

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        `/api/v1/deliveries/routes/${ROUTE_ID}/stops/${STOP_ID}/packages/${PACKAGE_ID}/failed-attempts`,
      )
      expect(init.body).toBeInstanceOf(FormData)
      const body = init.body as FormData
      expect(body.get("reasonCode")).toBe("RECIPIENT_ABSENT")
      expect(body.get("notes")).toBe("No contestaron timbre")
      expect(body.get("photo")).toBe(fakePhoto)
      expect(body.get("signature")).toBe(fakeSignature)
      expect(result.outcome).toBe("FAILED")
    })

    it("preserves idempotency key and payload across retries", async () => {
      const replayPayload = {
        attemptId: "50000000-0000-4000-8000-000000000002",
        attemptNumber: 1,
        outcome: "FAILED",
        packageId: PACKAGE_ID,
        reasonCode: "ADDRESS_NOT_FOUND",
        stopResolution: "FAILED",
        replayed: true,
      }

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(replayPayload), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      const params = {
        routeId: ROUTE_ID,
        stopId: STOP_ID,
        packageId: PACKAGE_ID,
        reasonCode: "ADDRESS_NOT_FOUND" as const,
        notes: "Nomenclatura no existe",
      }

      const firstResult = await recordFailedDelivery(params, IDEMPOTENCY_KEY)
      const secondResult = await recordFailedDelivery(params, IDEMPOTENCY_KEY)

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(new Headers(firstInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(new Headers(secondInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(firstResult.replayed).toBe(true)
      expect(secondResult.replayed).toBe(true)
    })

    it("requires explanatory notes when reasonCode is OTHER", async () => {
      await expect(
        recordFailedDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            reasonCode: "OTHER",
            notes: "",
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(
        "El motivo 'Otro' requiere observaciones explicativas obligatorias.",
      )
    })

    it("propagates 403 Forbidden ApiError without swallowing", async () => {
      const errorPayload = {
        code: "DELIVERY_FORBIDDEN",
        message: "Not authorized to record delivery attempt",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        recordFailedDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            reasonCode: "RECIPIENT_ABSENT",
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === "DELIVERY_FORBIDDEN"
        )
      })
    })

    it("propagates 409 Conflict ApiError without swallowing", async () => {
      const errorPayload = {
        code: "ATTEMPT_ALREADY_RESOLVED",
        message: "Package already reached terminal state",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        recordFailedDelivery(
          {
            routeId: ROUTE_ID,
            stopId: STOP_ID,
            packageId: PACKAGE_ID,
            reasonCode: "RECIPIENT_ABSENT",
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === "ATTEMPT_ALREADY_RESOLVED"
        )
      })
    })
  })

  describe("reportIncident", () => {
    it("sends incident payload with target, URL, headers and body", async () => {
      const incidentPayload = {
        incidentId: "70000000-0000-4000-8000-000000000001",
        status: "OPEN",
        type: "VEHICLE_BREAKDOWN",
        replayed: false,
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(incidentPayload), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await reportIncident(
        {
          type: "VEHICLE_BREAKDOWN",
          description: "Pinchazo en rueda trasera",
          routeId: ROUTE_ID,
          routeStopId: STOP_ID,
          packageId: PACKAGE_ID,
        },
        IDEMPOTENCY_KEY,
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe("/api/v1/deliveries/incidents")
      expect(init.method).toBe("POST")

      const headers = new Headers(init.headers)
      expect(headers.get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY)
      expect(headers.get("Content-Type")).toBe("application/json")

      expect(JSON.parse(init.body as string)).toEqual({
        type: "VEHICLE_BREAKDOWN",
        description: "Pinchazo en rueda trasera",
        routeId: ROUTE_ID,
        routeStopId: STOP_ID,
        packageId: PACKAGE_ID,
      })

      expect(result.incidentId).toBe("70000000-0000-4000-8000-000000000001")
      expect(result.status).toBe("OPEN")
    })

    it("preserves idempotency key and payload across retries", async () => {
      const replayPayload = {
        incidentId: "70000000-0000-4000-8000-000000000001",
        status: "OPEN",
        type: "TRAFFIC",
        replayed: true,
      }

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(replayPayload), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      const params = {
        type: "TRAFFIC",
        description: "Congestión por manifestación",
        routeId: ROUTE_ID,
      }

      const firstResult = await reportIncident(params, IDEMPOTENCY_KEY)
      const secondResult = await reportIncident(params, IDEMPOTENCY_KEY)

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(new Headers(firstInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(new Headers(secondInit.headers).get("Idempotency-Key")).toBe(
        IDEMPOTENCY_KEY,
      )
      expect(firstInit.body).toBe(secondInit.body)
      expect(firstResult.replayed).toBe(true)
      expect(secondResult.replayed).toBe(true)
    })

    it("rejects when no target entity is specified", async () => {
      await expect(
        reportIncident(
          {
            type: "TRAFFIC",
            description: "Trancón masivo",
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(
        "Debe asociar el incidente al menos a una ruta, parada o paquete.",
      )
    })

    it("propagates 403 Forbidden ApiError without swallowing", async () => {
      const errorPayload = {
        code: "DELIVERY_FORBIDDEN",
        message: "Not authorized to report incident on this route",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        reportIncident(
          {
            type: "ACCIDENT",
            description: "Colisión leve",
            routeId: ROUTE_ID,
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === "DELIVERY_FORBIDDEN"
        )
      })
    })

    it("propagates 409 Conflict ApiError without swallowing", async () => {
      const errorPayload = {
        code: "ROUTE_CLOSED",
        message: "Cannot report incident on a closed route",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        reportIncident(
          {
            type: "ACCIDENT",
            description: "Colisión leve",
            routeId: ROUTE_ID,
          },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === "ROUTE_CLOSED"
        )
      })
    })
  })
})
