import { afterEach, describe, expect, it, vi } from "vitest"
import {
  correctPackageAddress,
  getPackageDetail,
  registerPackage,
  resolvePackageGeocoding,
  reviewPackageGeocoding,
  type PackageDetailResponse,
} from "./packagesApi"
import type { RegisterPackagePayload } from "../types"

vi.mock("../../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("packagesApi", () => {
  it("registerPackage sends exact DTO and credentials without manual tenant headers", async () => {
    const payload: RegisterPackagePayload = {
      trackingCode: "TRK-FRONT-01",
      address: {
        text: "Calle 80 # 53-67",
        municipalityCode: "08001",
      },
      shipmentTypeId: "st-1",
      weightKg: 2.5,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
    }

    const mockResponse = {
      id: "pkg-1",
      trackingCode: "TRK-FRONT-01",
      state: "REGISTERED",
      geocoding: {
        status: "MATCHED",
        eligibility: "ELIGIBLE",
        attemptId: "att-1",
        selectedCandidateId: "cand-1",
        attachmentId: "att-road-1",
        attachmentStatus: "AUTO_ACCEPTED",
        unsuitabilityReason: null,
        datasetId: "ds-1",
        profile: "MOTOR_VEHICLE",
        directedReachabilityVerified: false,
      },
    }

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const res = await registerPackage(payload)

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/packages",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(payload),
      }),
    )
    expect(res.id).toBe("pkg-1")
    expect(res.geocoding?.eligibility).toBe("ELIGIBLE")
  })

  it("getPackageDetail encodes URI component and returns geocoding diagnostic with candidates", async () => {
    const mockDetail: PackageDetailResponse = {
      id: "pkg-123/special",
      trackingCode: "TRK-123",
      state: "REGISTERED",
      priority: "NORMAL",
      weightKg: "2.00",
      volumeM3: "0.003",
      address: "Calle 80 # 53-67",
      addressId: "addr-1",
      municipalityCode: "08001",
      zone: "Norte",
      sector: "Alto Prado",
      shipmentType: "Standard",
      registeredAt: "2026-11-09T00:00:00.000Z",
      lengthCm: "20.00",
      widthCm: "15.00",
      heightCm: "10.00",
      deadline: null,
      geocodingAttemptId: "att-1",
      geocoding: {
        status: "MATCHED",
        eligibility: "ELIGIBLE",
        attemptId: "att-1",
        selectedCandidateId: "cand-1",
        attachmentId: "att-road-1",
        attachmentStatus: "AUTO_ACCEPTED",
        unsuitabilityReason: null,
        datasetId: "ds-1",
        profile: "MOTOR_VEHICLE",
        directedReachabilityVerified: false,
      },
      candidates: [
        {
          id: "cand-1",
          rank: 1,
          score: 0.95,
          latitude: 11.0132,
          longitude: -74.8271,
          precision: "ENTRANCE",
          source: "SYNTHETIC",
        },
      ],
      history: [
        {
          fromState: null,
          toState: "REGISTERED",
          reasonCode: null,
          changedBy: "reception@tenant.com",
          createdAt: "2026-11-09T00:00:00.000Z",
        },
      ],
    }

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const res = await getPackageDetail("pkg-123/special")

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/packages/pkg-123%2Fspecial",
      expect.objectContaining({
        credentials: "include",
      }),
    )
    expect(res.municipalityCode).toBe("08001")
    expect(res.candidates?.length).toBe(1)
    expect(res.candidates?.[0].score).toBe(0.95)
  })

  it("resolvePackageGeocoding posts expectedAttemptId, forceRetry and operationId", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "MATCHED",
          eligibility: "ELIGIBLE",
          attemptId: "att-2",
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchSpy)

    await resolvePackageGeocoding("pkg-1", {
      expectedAttemptId: "att-1",
      forceRetry: true,
      operationId: "op-uuid-1",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/packages/pkg-1/geocoding/resolve",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          expectedAttemptId: "att-1",
          forceRetry: true,
          operationId: "op-uuid-1",
        }),
      }),
    )
  })

  it("reviewPackageGeocoding sends expectedAddressId, candidateId, decision, reason and operationId", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "MATCHED",
          eligibility: "ELIGIBLE",
          selectedCandidateId: "cand-2",
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchSpy)

    await reviewPackageGeocoding("pkg-1", {
      expectedAddressId: "addr-1",
      expectedAttemptId: "att-1",
      candidateId: "cand-2",
      decision: "APPROVED",
      reason: "Ubicación verificada por foto de fachada",
      operationId: "op-uuid-2",
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/packages/pkg-1/geocoding/review",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          expectedAddressId: "addr-1",
          expectedAttemptId: "att-1",
          candidateId: "cand-2",
          decision: "APPROVED",
          reason: "Ubicación verificada por foto de fachada",
          operationId: "op-uuid-2",
        }),
      }),
    )
  })

  it("correctPackageAddress sends expectedAddressId, newOriginalText, newMunicipalityCode and reason without operationId", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          packageId: "pkg-1",
          previousAddressId: "addr-1",
          newAddressId: "addr-2",
          geocoding: {
            status: "MATCHED",
            eligibility: "ELIGIBLE",
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchSpy)

    const result = await correctPackageAddress("pkg-1", {
      expectedAddressId: "addr-1",
      newOriginalText: "Carrera 53 # 80-67",
      newMunicipalityCode: "08001",
      reason: "Corrección de calle a carrera según guía física",
      expectedAttemptId: "att-1",
    })

    expect(result.packageId).toBe("pkg-1")
    expect(result.newAddressId).toBe("addr-2")
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/packages/pkg-1/address-corrections",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          expectedAddressId: "addr-1",
          newOriginalText: "Carrera 53 # 80-67",
          newMunicipalityCode: "08001",
          reason: "Corrección de calle a carrera según guía física",
          expectedAttemptId: "att-1",
        }),
      }),
    )
  })
})
