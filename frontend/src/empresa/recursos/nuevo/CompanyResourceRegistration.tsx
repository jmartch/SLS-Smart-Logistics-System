import { Plus, Truck } from "lucide-react"
import { type FormEvent, useState } from "react"
import type { FleetResource } from "../../../mockData"
import {
  CompanyFormHeader,
  Field,
  FormActions,
  FormSection,
  SuccessState,
} from "../../../shared/ui/PortalShell"

export function CompanyResourceRegistration() {
  const [submitted, setSubmitted] = useState(false)

  const saveResource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const kind = String(data.get("resource-type")) as FleetResource["kind"]
    const status = String(data.get("resource-status"))
    const labels: Record<FleetResource["kind"], string> = {
      truck: "Camiones",
      car: "Carros",
      motorcycle: "Motos",
      bike: "Bicicletas",
    }
    const resource: FleetResource = {
      id: `fleet-${Date.now()}`,
      kind,
      label: labels[kind],
      total: 1,
      available: status === "available" ? 1 : 0,
      active: status === "active" ? 1 : 0,
      maintenance: status === "maintenance" ? 1 : 0,
    }
    const current = JSON.parse(localStorage.getItem("sls-company-resources") ?? "[]") as FleetResource[]
    localStorage.setItem("sls-company-resources", JSON.stringify([...current, resource]))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Recurso añadido"
            text="El nuevo vehículo ya forma parte del inventario de la empresa."
            link="/empresa/recursos"
            action="Volver a recursos"
          />
        </div>
      </main>
    )
  }

  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Flota y movilidad"
        title="Añadir recurso"
        description="Registra un vehículo y define su disponibilidad inicial."
      />
      <form className="company-form-card portal-form" onSubmit={saveResource}>
        <FormSection icon={<Truck size={20} />} title="Información del recurso" text="Datos para identificarlo dentro de la flota." />
        <div className="form-row">
          <div className="field">
            <label htmlFor="resource-type">Tipo de recurso</label>
            <select id="resource-type" name="resource-type" defaultValue="" required>
              <option value="" disabled>Seleccionar</option>
              <option value="truck">Camión</option>
              <option value="car">Carro</option>
              <option value="motorcycle">Moto</option>
              <option value="bike">Bicicleta</option>
            </select>
          </div>
          <Field id="resource-code" label="Código interno" placeholder="Ej. CAM-014" />
        </div>
        <div className="form-row">
          <Field id="resource-brand" label="Marca" placeholder="Ej. Ford" />
          <Field id="resource-model" label="Modelo" placeholder="Ej. Transit" />
        </div>
        <div className="form-row">
          <Field id="resource-plate" label="Matrícula o placa" placeholder="A123456" />
          <Field id="resource-capacity" label="Capacidad (kg)" placeholder="1200" type="number" />
        </div>
        <div className="field">
          <label htmlFor="resource-status">Estado inicial</label>
          <select id="resource-status" name="resource-status" defaultValue="available">
            <option value="available">Disponible</option>
            <option value="active">En ruta</option>
            <option value="maintenance">En mantenimiento</option>
          </select>
        </div>
        <FormActions label="Guardar recurso" icon={<Plus size={18} />} cancelTo="/empresa/recursos" />
      </form>
    </main>
  )
}
