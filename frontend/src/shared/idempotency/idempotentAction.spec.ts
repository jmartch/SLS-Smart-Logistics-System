import { describe, expect, it } from "vitest"
import {
  IdempotentActionTracker,
  RequestSequenceGuard,
  computeAttendStopSignature,
  computeDeliveryAttemptSignature,
  computeFailedAttemptSignature,
  computeIncidentSignature,
  computeRouteClosureSignature,
  getFileFingerprint,
} from "./idempotentAction"

describe("idempotentAction", () => {
  describe("getFileFingerprint", () => {
    it("returns 'none' for null or undefined", () => {
      expect(getFileFingerprint(null)).toBe("none")
      expect(getFileFingerprint(undefined)).toBe("none")
    })

    it("returns the exact same fingerprint when called repeatedly for the same File instance", () => {
      const file = new File(["sample content"], "photo.jpg", {
        type: "image/jpeg",
        lastModified: 1700000000000,
      })
      const fp1 = getFileFingerprint(file)
      const fp2 = getFileFingerprint(file)
      expect(fp1).toBe(fp2)
      expect(fp1).toContain("photo.jpg:14:image/jpeg:1700000000000")
    })

    it("distinguishes two distinct File instances even when all metadata properties are identical", () => {
      const file1 = new File(["identical byte len"], "doc.pdf", {
        type: "application/pdf",
        lastModified: 1700000000000,
      })
      const file2 = new File(["identical byte len"], "doc.pdf", {
        type: "application/pdf",
        lastModified: 1700000000000,
      })

      const fp1 = getFileFingerprint(file1)
      const fp2 = getFileFingerprint(file2)

      expect(fp1).not.toBe(fp2)
    })

    it("distinguishes two distinct Blob instances with identical size and type", () => {
      const blob1 = new Blob(["data payload"], { type: "image/png" })
      const blob2 = new Blob(["data payload"], { type: "image/png" })

      expect(getFileFingerprint(blob1)).not.toBe(getFileFingerprint(blob2))
      expect(getFileFingerprint(blob1)).toBe(getFileFingerprint(blob1))
    })
  })

  describe("IdempotentActionTracker", () => {
    it("generates a new UUID on first call", () => {
      const tracker = new IdempotentActionTracker()
      const key1 = tracker.getKey("sig-1")

      expect(typeof key1).toBe("string")
      expect(key1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(tracker.getCurrentSignature()).toBe("sig-1")
    })

    it("reuses the exact same UUID when signature is identical", () => {
      const tracker = new IdempotentActionTracker()
      const key1 = tracker.getKey("sig-identical")
      const key2 = tracker.getKey("sig-identical")

      expect(key1).toBe(key2)
    })

    it("generates a new UUID when signature changes", () => {
      const tracker = new IdempotentActionTracker()
      const key1 = tracker.getKey("sig-initial")
      const key2 = tracker.getKey("sig-modified")

      expect(key1).not.toBe(key2)
      expect(tracker.getCurrentSignature()).toBe("sig-modified")
    })

    it("resets tracker state", () => {
      const tracker = new IdempotentActionTracker()
      tracker.getKey("sig-1")
      tracker.reset()

      expect(tracker.getCurrentKey()).toBe("")
      expect(tracker.getCurrentSignature()).toBe("")
    })
  })

  describe("signature computation helpers", () => {
    it("differentiates delivery attempts when file or notes change", () => {
      const file1 = new File(["photo 1"], "photo1.jpg", {
        type: "image/jpeg",
        lastModified: 100,
      })
      const file2 = new File(["photo 2 changed"], "photo2.jpg", {
        type: "image/jpeg",
        lastModified: 200,
      })

      const sig1 = computeDeliveryAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        photo: file1,
        notes: "Entregado a recepcionista",
      })

      const sigRetry = computeDeliveryAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        photo: file1,
        notes: "Entregado a recepcionista",
      })

      const sigChangedFile = computeDeliveryAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        photo: file2,
        notes: "Entregado a recepcionista",
      })

      const sigChangedNotes = computeDeliveryAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        photo: file1,
        notes: "Entregado a vecino",
      })

      expect(sig1).toBe(sigRetry)
      expect(sig1).not.toBe(sigChangedFile)
      expect(sig1).not.toBe(sigChangedNotes)
    })

    it("uses structured JSON avoiding delimiter injection collisions", () => {
      const sigWithPipeInNotes = computeDeliveryAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        notes: "part1|part2|part3",
      })

      const parsed = JSON.parse(sigWithPipeInNotes)
      expect(parsed.notes).toBe("part1|part2|part3")
      expect(parsed.action).toBe("delivery")
    })

    it("differentiates failed attempts when reason or notes change", () => {
      const sig1 = computeFailedAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        reasonCode: "RECIPIENT_ABSENT",
        notes: "No atienden",
      })

      const sig2 = computeFailedAttemptSignature({
        routeId: "route-1",
        stopId: "stop-1",
        packageId: "pkg-1",
        reasonCode: "ADDRESS_NOT_FOUND",
        notes: "No atienden",
      })

      expect(sig1).not.toBe(sig2)
    })

    it("computes incident signature with all targets", () => {
      const sig1 = computeIncidentSignature({
        type: "VEHICLE_BREAKDOWN",
        description: "Pinchazo",
        routeId: "route-1",
        routeStopId: "stop-1",
        packageId: "pkg-1",
      })

      const sig2 = computeIncidentSignature({
        type: "VEHICLE_BREAKDOWN",
        description: "Pinchazo",
        routeId: "route-1",
      })

      expect(sig1).not.toBe(sig2)
    })

    it("computes route closure signature with sorted assignment IDs", () => {
      const sig1 = computeRouteClosureSignature({
        routeId: "route-1",
        mode: "REGULAR",
        depotReceipt: {
          depotId: "depot-1",
          physicalReceiptConfirmed: true,
          assignmentIds: ["assign-b", "assign-a"],
        },
      })

      const sig2 = computeRouteClosureSignature({
        routeId: "route-1",
        mode: "REGULAR",
        depotReceipt: {
          depotId: "depot-1",
          physicalReceiptConfirmed: true,
          assignmentIds: ["assign-a", "assign-b"],
        },
      })

      expect(sig1).toBe(sig2)
    })

    it("computes attend stop signature", () => {
      const sig = computeAttendStopSignature({
        routeId: "route-100",
        stopId: "stop-200",
      })
      const parsed = JSON.parse(sig)
      expect(parsed.action).toBe("attend")
      expect(parsed.routeId).toBe("route-100")
      expect(parsed.stopId).toBe("stop-200")
    })
  })

  describe("RequestSequenceGuard", () => {
    it("increments sequence on each call to nextSequence", () => {
      const guard = new RequestSequenceGuard()
      expect(guard.getCurrentSequence()).toBe(0)
      expect(guard.nextSequence()).toBe(1)
      expect(guard.nextSequence()).toBe(2)
      expect(guard.isCurrent(2)).toBe(true)
      expect(guard.isCurrent(1)).toBe(false)
    })

    it("invalidates in-flight requests and ignores out-of-order completions", async () => {
      const guard = new RequestSequenceGuard()
      const completed: string[] = []

      const runRequest = async (id: string, delayMs: number) => {
        const seq = guard.nextSequence()
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (guard.isCurrent(seq)) {
          completed.push(id)
        }
      }

      const slowFirst = runRequest("req-1-slow", 30)
      const fastSecond = runRequest("req-2-fast", 5)

      await Promise.all([slowFirst, fastSecond])

      expect(completed).toEqual(["req-2-fast"])
    })

    it("invalidates all pending requests when explicitly invalidated", () => {
      const guard = new RequestSequenceGuard()
      const seq = guard.nextSequence()
      expect(guard.isCurrent(seq)).toBe(true)
      guard.invalidate()
      expect(guard.isCurrent(seq)).toBe(false)
    })
  })
})
