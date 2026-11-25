import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

import { ApiError, apiFetch, onUnauthorizedResponse } from "./httpClient"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("apiFetch", () => {
  it("sends credentials include and sets json content type for json bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiFetch<{ success: boolean }>("/test-json", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
      headers: { "Idempotency-Key": "test-key-uuid" },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/test-json")
    expect(init.credentials).toBe("include")

    const headers = new Headers(init.headers)
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.get("Idempotency-Key")).toBe("test-key-uuid")
    expect(result).toEqual({ success: true })
  })

  it("removes content type when body is FormData even if explicitly provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ upload: "ok" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const formData = new FormData()
    formData.append("note", "hello")

    const result = await apiFetch<{ upload: string }>("/test-upload", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "upload-uuid",
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get("Content-Type")).toBeNull()
    expect(headers.get("Idempotency-Key")).toBe("upload-uuid")
    expect(result).toEqual({ upload: "ok" })
  })

  it("returns undefined for 204 no content responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiFetch<void>("/no-content")
    expect(result).toBeUndefined()
  })

  it("notifies unauthorized listeners on 401 responses for non-auth paths", async () => {
    const unauthorizedListener = vi.fn()
    const unsubscribe = onUnauthorizedResponse(unauthorizedListener)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Sesión expirada" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiFetch("/protected-resource")).rejects.toThrow(ApiError)
    expect(unauthorizedListener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it("does not notify unauthorized listeners for login or logout paths", async () => {
    const unauthorizedListener = vi.fn()
    const unsubscribe = onUnauthorizedResponse(unauthorizedListener)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Credenciales inválidas" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiFetch("/auth/login")).rejects.toThrow(ApiError)
    expect(unauthorizedListener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it("normalizes structured validation errors with field issues on 400 responses", async () => {
    const errorPayload = {
      error: {
        code: "VALIDATION_FAILED",
        message: "Datos de entrada incorrectos",
        fields: [
          { field: "reasonCode", reason: "Motivo requerido" },
          { field: "notes", reason: "Demasiado largo" },
        ],
      },
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorPayload), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    let caughtError: ApiError | null = null
    try {
      await apiFetch("/validate")
    } catch (err) {
      if (err instanceof ApiError) {
        caughtError = err
      }
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError?.status).toBe(400)
    expect(caughtError?.code).toBe("VALIDATION_FAILED")
    expect(caughtError?.message).toBe("Datos de entrada incorrectos")
    expect(caughtError?.fields.reasonCode).toBe("Motivo requerido")
    expect(caughtError?.fieldIssues).toHaveLength(2)
  })

  it("throws ApiError with NETWORK_ERROR code when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    )

    await expect(apiFetch("/offline")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      code: "NETWORK_ERROR",
      message: "No se pudo conectar con el servidor.",
    })
  })
})
