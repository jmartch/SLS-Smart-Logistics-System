const fileInstanceTokens = new WeakMap<Blob | File, string>()
let fileInstanceCounter = 0

export function getFileFingerprint(
  file: File | Blob | null | undefined,
): string {
  if (!file) return "none"
  let token = fileInstanceTokens.get(file)
  if (!token) {
    fileInstanceCounter += 1
    token = `ref-${fileInstanceCounter}`
    fileInstanceTokens.set(file, token)
  }
  if (typeof File !== "undefined" && file instanceof File) {
    return `${file.name}:${file.size}:${file.type}:${file.lastModified}:${token}`
  }
  return `blob:${file.size}:${file.type}:${token}`
}

export function computeDeliveryAttemptSignature(params: {
  readonly routeId: string
  readonly stopId: string
  readonly packageId: string
  readonly photo?: File | Blob | null
  readonly signature?: File | Blob | null
  readonly notes?: string
}): string {
  return JSON.stringify({
    action: "delivery",
    routeId: params.routeId.trim(),
    stopId: params.stopId.trim(),
    packageId: params.packageId.trim(),
    photo: getFileFingerprint(params.photo),
    signature: getFileFingerprint(params.signature),
    notes: params.notes?.trim() ?? "",
  })
}

export function computeFailedAttemptSignature(params: {
  readonly routeId: string
  readonly stopId: string
  readonly packageId: string
  readonly reasonCode: string
  readonly notes?: string
  readonly photo?: File | Blob | null
  readonly signature?: File | Blob | null
}): string {
  return JSON.stringify({
    action: "failed",
    routeId: params.routeId.trim(),
    stopId: params.stopId.trim(),
    packageId: params.packageId.trim(),
    reasonCode: params.reasonCode.trim(),
    notes: params.notes?.trim() ?? "",
    photo: getFileFingerprint(params.photo),
    signature: getFileFingerprint(params.signature),
  })
}

export function computeIncidentSignature(params: {
  readonly type: string
  readonly description: string
  readonly routeId?: string
  readonly routeStopId?: string
  readonly packageId?: string
}): string {
  return JSON.stringify({
    action: "incident",
    type: params.type.trim(),
    description: params.description.trim(),
    routeId: params.routeId?.trim() ?? "",
    routeStopId: params.routeStopId?.trim() ?? "",
    packageId: params.packageId?.trim() ?? "",
  })
}

export function computeRouteClosureSignature(params: {
  readonly routeId: string
  readonly mode: string
  readonly reasonCode?: string
  readonly notes?: string
  readonly actualDistanceM?: number
  readonly depotReceipt?: {
    readonly depotId: string
    readonly physicalReceiptConfirmed: boolean
    readonly assignmentIds: readonly string[]
  }
}): string {
  return JSON.stringify({
    action: "close",
    routeId: params.routeId.trim(),
    mode: params.mode.trim(),
    reasonCode: params.reasonCode?.trim() ?? "",
    notes: params.notes?.trim() ?? "",
    actualDistanceM: params.actualDistanceM ?? null,
    depotReceipt: params.depotReceipt
      ? {
          depotId: params.depotReceipt.depotId.trim(),
          physicalReceiptConfirmed: params.depotReceipt.physicalReceiptConfirmed,
          assignmentIds: [...params.depotReceipt.assignmentIds].sort(),
        }
      : null,
  })
}

export function computeAttendStopSignature(params: {
  readonly routeId: string
  readonly stopId: string
}): string {
  return JSON.stringify({
    action: "attend",
    routeId: params.routeId.trim(),
    stopId: params.stopId.trim(),
  })
}

export class IdempotentActionTracker {
  private currentKey: string = ""
  private currentSignature: string = ""

  getKey(signature: string): string {
    if (!this.currentKey || this.currentSignature !== signature) {
      this.currentKey = crypto.randomUUID()
      this.currentSignature = signature
    }
    return this.currentKey
  }

  reset(): void {
    this.currentKey = ""
    this.currentSignature = ""
  }

  getCurrentKey(): string {
    return this.currentKey
  }

  getCurrentSignature(): string {
    return this.currentSignature
  }
}

export class RequestSequenceGuard {
  private currentSequence = 0

  nextSequence(): number {
    this.currentSequence += 1
    return this.currentSequence
  }

  isCurrent(sequence: number): boolean {
    return sequence === this.currentSequence
  }

  invalidate(): void {
    this.currentSequence += 1
  }

  getCurrentSequence(): number {
    return this.currentSequence
  }
}
