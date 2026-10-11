import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  ApiError,
  apiFetch,
  onUnauthorizedResponse,
} from "./shared/api/httpClient"

export type Role =
  | "reception"
  | "classification"
  | "coordinator"
  | "courier"
  | "admin"
  | "superadmin"

export type PermissionCode =
  | "MANAGE_TENANT"
  | "MANAGE_EMPLOYEES"
  | "REGISTER_PACKAGES"
  | "CLASSIFY_PACKAGES"
  | "COORDINATE_ROUTES"
  | "OPERATE_DELIVERIES"

export interface UserRoleInfo {
  readonly id: string
  readonly name: string
}

export interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: Role
  readonly roles: readonly UserRoleInfo[]
  readonly permissions: readonly string[]
  readonly kind: "TENANT_USER" | "PLATFORM_ADMIN"
  readonly tenant: string
  readonly tenantId: string
  readonly avatar: string
}

export interface TenantMeResponse {
  readonly userId: string
  readonly tenantId: string
  readonly email: string
  readonly roles: readonly UserRoleInfo[]
  readonly permissions: readonly string[]
}

export interface PlatformMeResponse {
  readonly platformAdminId: string
  readonly email: string
}

export type MeResponse = TenantMeResponse | PlatformMeResponse

export interface LoginInput {
  readonly slug?: string
  readonly email: string
  readonly password: string
  readonly mode?: "tenant" | "platform"
}

export interface LoginResult {
  readonly ok: boolean
  readonly code?: string
  readonly error?: string
  readonly fields?: Record<string, string>
}

interface AuthCtx {
  readonly user: User | null
  readonly initializing: boolean
  readonly login: (input: LoginInput) => Promise<LoginResult>
  readonly logout: () => Promise<void>
  readonly refreshIdentity: () => Promise<User | null>
  readonly hasPermission: (permission: PermissionCode | string) => boolean
}

const Ctx = createContext<AuthCtx | null>(null)

function deriveDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? email
  const tokens = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (tokens.length === 0) {
    return email
  }
  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}

function deriveAvatarInitials(name: string, email: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
  }
  const clean = (parts[0] ?? email).replace(/[^a-zA-Z0-9]/g, "")
  return clean.slice(0, 2).toUpperCase() || "US"
}

export function derivePrimaryRole(
  permissions: readonly string[],
  roles: readonly UserRoleInfo[],
): Role {
  const permissionSet = new Set(permissions)
  if (
    permissionSet.has("MANAGE_TENANT") ||
    permissionSet.has("MANAGE_EMPLOYEES")
  ) {
    return "admin"
  }
  if (permissionSet.has("COORDINATE_ROUTES")) {
    return "coordinator"
  }
  if (permissionSet.has("CLASSIFY_PACKAGES")) {
    return "classification"
  }
  if (permissionSet.has("REGISTER_PACKAGES")) {
    return "reception"
  }
  if (permissionSet.has("OPERATE_DELIVERIES")) {
    return "courier"
  }

  const normalizedRoleNames = roles.map((r) => r.name.toLowerCase())
  if (normalizedRoleNames.some((n) => n.includes("admin"))) return "admin"
  if (normalizedRoleNames.some((n) => n.includes("coordin")))
    return "coordinator"
  if (normalizedRoleNames.some((n) => n.includes("clasif")))
    return "classification"
  if (normalizedRoleNames.some((n) => n.includes("mensaj"))) return "courier"
  return "reception"
}

export function mapMeResponseToUser(
  payload: MeResponse,
  tenantHint?: string,
): User {
  if ("platformAdminId" in payload) {
    const name = deriveDisplayName(payload.email)
    return {
      id: payload.platformAdminId,
      name,
      email: payload.email,
      role: "superadmin",
      roles: [{ id: "platform-admin", name: "Superadministrador" }],
      permissions: [],
      kind: "PLATFORM_ADMIN",
      tenant: "SLS Platform",
      tenantId: "platform",
      avatar: deriveAvatarInitials(name, payload.email),
    }
  }

  const name = deriveDisplayName(payload.email)
  const role = derivePrimaryRole(payload.permissions, payload.roles)
  const tenantLabel =
    tenantHint && tenantHint.trim().length > 0
      ? tenantHint.trim()
      : `Empresa (${payload.tenantId.slice(0, 8)})`

  return {
    id: payload.userId,
    name,
    email: payload.email,
    role,
    roles: payload.roles,
    permissions: payload.permissions,
    kind: "TENANT_USER",
    tenant: tenantLabel,
    tenantId: payload.tenantId,
    avatar: deriveAvatarInitials(name, payload.email),
  }
}

export function defaultHomeForUser(user: User): string {
  if (user.kind === "PLATFORM_ADMIN" || user.role === "superadmin") {
    return "/app/admin/empresas"
  }
  const perms = new Set(user.permissions)
  if (perms.has("MANAGE_EMPLOYEES")) {
    return "/app/admin/usuarios"
  }
  if (perms.has("COORDINATE_ROUTES")) {
    return "/app/planificacion"
  }
  if (perms.has("CLASSIFY_PACKAGES")) {
    return "/app/clasificacion"
  }
  if (perms.has("REGISTER_PACKAGES")) {
    return "/app/paquetes/nuevo"
  }
  if (perms.has("OPERATE_DELIVERIES")) {
    return "/app/mi-ruta"
  }
  return "/app/paquetes"
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  const fetchCurrentUser = useCallback(
    async (tenantHint?: string): Promise<User | null> => {
      try {
        const me = await apiFetch<MeResponse>("/auth/me", { method: "GET" })
        const mapped = mapMeResponseToUser(me, tenantHint)
        setUser(mapped)
        return mapped
      } catch {
        setUser(null)
        return null
      }
    },
    [],
  )

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const me = await apiFetch<MeResponse>("/auth/me", { method: "GET" })
        if (active) {
          setUser(mapMeResponseToUser(me))
        }
      } catch {
        if (active) {
          setUser(null)
        }
      } finally {
        if (active) {
          setInitializing(false)
        }
      }
    })()

    const unsubscribe = onUnauthorizedResponse(() => {
      if (active) {
        setUser(null)
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      const mode = input.mode ?? "tenant"
      const endpoint = mode === "platform" ? "/platform/login" : "/auth/login"
      const payload =
        mode === "platform"
          ? { email: input.email.trim(), password: input.password }
          : {
              slug: (input.slug ?? "").trim(),
              email: input.email.trim(),
              password: input.password,
            }

      try {
        await apiFetch<{ ok: boolean }>(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        const hydrated = await fetchCurrentUser(
          mode === "tenant" ? input.slug : undefined,
        )
        if (!hydrated) {
          return {
            ok: false,
            code: "SESSION_EXPIRED",
            error: "No se pudo establecer la sesión.",
          }
        }
        return { ok: true }
      } catch (err) {
        if (err instanceof ApiError) {
          return {
            ok: false,
            code: err.code,
            error: err.message,
            fields: err.fields,
          }
        }
        return {
          ok: false,
          code: "UNKNOWN_ERROR",
          error: "Ocurrió un error inesperado.",
        }
      }
    },
    [fetchCurrentUser],
  )

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" })
    } catch {
      // Incluso si la red o la sesión ya expiró, limpiamos el estado local.
    } finally {
      setUser(null)
    }
  }, [])

  const hasPermission = useCallback(
    (permission: PermissionCode | string): boolean => {
      if (!user) return false
      if (user.kind === "PLATFORM_ADMIN") return true
      return user.permissions.includes(permission)
    },
    [user],
  )

  return (
    <Ctx.Provider
      value={{
        user,
        initializing,
        login,
        logout,
        refreshIdentity: () => fetchCurrentUser(),
        hasPermission,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be inside AuthProvider")
  return ctx
}

export const ROLE_LABELS: Record<Role, string> = {
  reception: "Recepción",
  classification: "Clasificación",
  coordinator: "Coordinador de rutas",
  courier: "Mensajero",
  admin: "Administrador",
  superadmin: "Superadministrador",
}
