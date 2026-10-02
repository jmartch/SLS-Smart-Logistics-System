import { createContext, useContext, useState, ReactNode } from "react"

export type Role = "reception" | "classification" | "coordinator" | "courier" | "admin" | "superadmin"

export interface User {
  id: string
  name: string
  email: string
  role: Role
  tenant: string
  tenantId: string
  avatar: string
}

const MOCK_USERS: Record<string, User> = {
  "recepcion@sls.com": {
    id: "u1", name: "Andrea Vega", email: "recepcion@sls.com",
    role: "reception", tenant: "Logística del Norte S.A.", tenantId: "t1", avatar: "AV",
  },
  "clasificacion@sls.com": {
    id: "u2", name: "Carlos Mora", email: "clasificacion@sls.com",
    role: "classification", tenant: "Logística del Norte S.A.", tenantId: "t1", avatar: "CM",
  },
  "coordinador@sls.com": {
    id: "u3", name: "Lucía Paredes", email: "coordinador@sls.com",
    role: "coordinator", tenant: "Logística del Norte S.A.", tenantId: "t1", avatar: "LP",
  },
  "mensajero@sls.com": {
    id: "u4", name: "Diego Ruiz", email: "mensajero@sls.com",
    role: "courier", tenant: "Logística del Norte S.A.", tenantId: "t1", avatar: "DR",
  },
  "admin@sls.com": {
    id: "u5", name: "Sofía Guzmán", email: "admin@sls.com",
    role: "admin", tenant: "Logística del Norte S.A.", tenantId: "t1", avatar: "SG",
  },
  "super@sls.com": {
    id: "u6", name: "Martín Lagos", email: "super@sls.com",
    role: "superadmin", tenant: "SLS Platform", tenantId: "root", avatar: "ML",
  },
}

interface AuthCtx {
  user: User | null
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = async (email: string, _password: string) => {
    await new Promise((r) => setTimeout(r, 700))
    const found = MOCK_USERS[email.toLowerCase().trim()]
    if (!found) return { ok: false, error: "Credenciales incorrectas. Intenta de nuevo." }
    setUser(found)
    return { ok: true }
  }

  const logout = () => setUser(null)

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>
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
