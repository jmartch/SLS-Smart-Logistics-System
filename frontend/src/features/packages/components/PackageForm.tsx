import { PACKAGE_PRIORITIES } from '../types';
import type { ChangeEvent, ReactNode } from 'react';
import type { CatalogOption, RegisterPackageFormErrors, RegisterPackageFormValues, SectorOption } from '../types';

const PRIORITY_LABELS: Record<(typeof PACKAGE_PRIORITIES)[number], string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

interface PackageFormProps {
  values: RegisterPackageFormValues;
  errors: RegisterPackageFormErrors;
  zones: CatalogOption[];
  sectors: SectorOption[];
  sectorsLoading: boolean;
  sectorsError: string | null;
  shipmentTypes: CatalogOption[];
  catalogsLoading: boolean;
  catalogsError: string | null;
  onChange: (values: RegisterPackageFormValues) => void;
  onSubmit: () => void;
  onOpenScanner: () => void;
  onOpenImageScanner: () => void;
  onLoadMockData: () => void;
  showMockDataAction: boolean;
  disabled: boolean;
  onRetryCatalogs: () => void;
}

export default function PackageForm({
  values,
  errors,
  zones,
  sectors,
  sectorsLoading,
  sectorsError,
  shipmentTypes,
  catalogsLoading,
  catalogsError,
  onChange,
  onSubmit,
  onOpenScanner,
  onOpenImageScanner,
  onLoadMockData,
  showMockDataAction,
  disabled,
  onRetryCatalogs,
}: PackageFormProps) {
  function field<K extends keyof RegisterPackageFormValues>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...values, [key]: e.target.value, ...(key === 'zoneId' ? { sectorId: '' } : {}) });
  }

  const formDisabled = disabled || catalogsLoading || !!catalogsError;

  return (
    <form
      className="package-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {catalogsLoading && <p className="notice">Cargando zonas y tipos de envío...</p>}
      {catalogsError && (
        <div className="notice notice-error catalog-error">
          <span>{catalogsError}</span>
          <button
            type="button"
            className="retry-button"
            onClick={onRetryCatalogs}
            disabled={disabled || catalogsLoading}
          >
            Reintentar
          </button>
        </div>
      )}
      {showMockDataAction && (
        <button type="button" className="mock-button" onClick={onLoadMockData} disabled={formDisabled}>
          Cargar datos de prueba
        </button>
      )}

      <div className="field">
        <label htmlFor="trackingCode">
          Número de guía <span className="required-mark">*</span>
        </label>
        <div className="tracking-row">
          <input
            id="trackingCode"
            name="trackingCode"
            required
            aria-invalid={!!errors.trackingCode}
            aria-describedby={errors.trackingCode ? 'trackingCode-error' : undefined}
            className={inputClass(errors.trackingCode)}
            value={values.trackingCode}
            onChange={field('trackingCode')}
            placeholder="Escanea o escribe la guía"
            disabled={formDisabled}
          />
          <div className="scan-actions">
            <button type="button" onClick={onOpenImageScanner} disabled={formDisabled} className="scan-button">Leer QR de imagen</button>
            <button type="button" onClick={onOpenScanner} disabled={formDisabled} className="scan-button scan-button-secondary">Usar cámara</button>
          </div>
        </div>
        {errors.trackingCode && <span id="trackingCode-error" className="field-error">{errors.trackingCode}</span>}
      </div>

      <Section title="Clasificación">
        <Field label="Zona" error={errors.zoneId} required>
          <select className={inputClass(errors.zoneId)} value={values.zoneId} onChange={field('zoneId')} disabled={formDisabled}>
            <option value="">Selecciona una zona</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sector (opcional)">
          <select
            className={inputClass()}
            value={values.sectorId}
            onChange={field('sectorId')}
            disabled={formDisabled || !values.zoneId || sectorsLoading || !!sectorsError}
          >
            <option value="">Sin sector específico</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {sectorsLoading && <span className="field-hint" role="status">Cargando sectores...</span>}
          {sectorsError && <span className="field-error">{sectorsError}</span>}
        </Field>
        <Field label="Tipo de envío" error={errors.shipmentTypeId} required>
          <select
            className={inputClass(errors.shipmentTypeId)}
            value={values.shipmentTypeId}
            onChange={field('shipmentTypeId')}
            disabled={formDisabled}
          >
            <option value="">Selecciona un tipo</option>
            {shipmentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Medidas">
        <Field label="Peso (kg)" error={errors.weightKg} required>
          <input type="number" step="0.01" min="0" className={inputClass(errors.weightKg)} value={values.weightKg} onChange={field('weightKg')} disabled={formDisabled} />
        </Field>
        <div className="dimensions-row">
          <Field label="Largo (cm)" error={errors.lengthCm} required>
            <input type="number" step="0.1" min="0" className={inputClass(errors.lengthCm)} value={values.lengthCm} onChange={field('lengthCm')} disabled={formDisabled} />
          </Field>
          <Field label="Ancho (cm)" error={errors.widthCm} required>
            <input type="number" step="0.1" min="0" className={inputClass(errors.widthCm)} value={values.widthCm} onChange={field('widthCm')} disabled={formDisabled} />
          </Field>
          <Field label="Alto (cm)" error={errors.heightCm} required>
            <input type="number" step="0.1" min="0" className={inputClass(errors.heightCm)} value={values.heightCm} onChange={field('heightCm')} disabled={formDisabled} />
          </Field>
        </div>
      </Section>

      <Section title="Prioridad y plazo">
        <Field label="Prioridad" error={errors.priority} required>
          <select className={inputClass(errors.priority)} value={values.priority} onChange={field('priority')} disabled={formDisabled}>
            <option value="">Selecciona una prioridad</option>
            {PACKAGE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha/hora límite (opcional)" error={errors.deadline}>
          <input type="datetime-local" className={inputClass(errors.deadline)} value={values.deadline} onChange={field('deadline')} disabled={formDisabled} />
        </Field>
      </Section>

      <Section title="Coordenadas">
        <div className="dimensions-row">
          <Field label="Latitud" error={errors.latitude} required>
            <input type="number" step="0.000001" className={inputClass(errors.latitude)} value={values.latitude} onChange={field('latitude')} disabled={formDisabled} />
          </Field>
          <Field label="Longitud" error={errors.longitude} required>
            <input type="number" step="0.000001" className={inputClass(errors.longitude)} value={values.longitude} onChange={field('longitude')} disabled={formDisabled} />
          </Field>
        </div>
      </Section>

      <button type="submit" disabled={formDisabled} className="submit-button">
        {disabled ? 'Guardando...' : 'Registrar paquete'}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label} {required && <span className="required-mark">*</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function inputClass(error?: string): string {
  return error ? 'input input-error' : 'input';
}
