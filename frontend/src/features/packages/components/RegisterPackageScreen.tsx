import { useEffect, useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import type { CameraErrorReason } from './BarcodeScanner';
import PackageForm from './PackageForm';
import { validateRegisterPackageForm } from '../validation';
import { registerPackage } from '../api/packagesApi';
import { fetchSectors, fetchShipmentTypes, fetchZones } from '../api/catalogApi';
import { ApiError } from '../../../shared/api/httpClient';
import { EMPTY_REGISTER_PACKAGE_FORM } from '../types';
import type {
  CatalogOption,
  RegisterPackageFormErrors,
  RegisterPackageFormValues,
  RegisterPackageResult,
  SectorOption,
} from '../types';
import './packages.css';

type SubmitStatus = 'idle' | 'saving' | 'success';

export default function RegisterPackageScreen() {
  const [values, setValues] = useState<RegisterPackageFormValues>(EMPTY_REGISTER_PACKAGE_FORM);
  const [errors, setErrors] = useState<RegisterPackageFormErrors>({});
  const [scanning, setScanning] = useState(false);
  const [scannerNotice, setScannerNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RegisterPackageResult | null>(null);

  const [zones, setZones] = useState<CatalogOption[]>([]);
  const [shipmentTypes, setShipmentTypes] = useState<CatalogOption[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  // Zonas y tipos de envío se cargan una sola vez al entrar a la pantalla.
  useEffect(() => {
    let cancelled = false;
    async function loadCatalogs() {
      setCatalogsLoading(true);
      setCatalogsError(null);
      try {
        const [zonesResult, shipmentTypesResult] = await Promise.all([fetchZones(), fetchShipmentTypes()]);
        if (cancelled) return;
        setZones(zonesResult);
        setShipmentTypes(shipmentTypesResult);
      } catch {
        if (cancelled) return;
        setCatalogsError('No se pudieron cargar las zonas y tipos de envío. Intenta de nuevo.');
      } finally {
        if (!cancelled) setCatalogsLoading(false);
      }
    }
    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Los sectores dependen de la zona elegida; se recargan al cambiarla.
  useEffect(() => {
    if (!values.zoneId) {
      return; // sin zona seleccionada: no hay nada que sincronizar todavía
    }
    let cancelled = false;
    fetchSectors(values.zoneId)
      .then((result) => {
        if (!cancelled) setSectors(result);
      })
      .catch(() => {
        if (!cancelled) setSectors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [values.zoneId]);

  function handleDetected(rawText: string) {
    // El código solo identifica la guía: se trata como texto plano, nunca
    // como enlace a abrir.
    setValues((v) => ({ ...v, trackingCode: rawText.trim() }));
    setErrors((e) => ({ ...e, trackingCode: undefined }));
    setScanning(false);
  }

  function handleScannerError(reason: CameraErrorReason) {
    setScanning(false);
    if (reason === 'PERMISSION_DENIED') {
      setScannerNotice('No se concedió permiso de cámara. Escribe la guía manualmente.');
    } else if (reason === 'NO_CAMERA') {
      setScannerNotice('No se encontró una cámara disponible. Escribe la guía manualmente.');
    } else {
      setScannerNotice('No se pudo iniciar el escáner. Escribe la guía manualmente.');
    }
  }

  async function handleSubmit() {
    const validationErrors = validateRegisterPackageForm(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setStatus('saving');
    setApiErrorMessage(null);

    try {
      const result = await registerPackage(buildPayload(values));
      setLastResult(result);
      setStatus('success');
    } catch (err) {
      setStatus('idle');
      handleApiError(err);
    }
  }

  function handleApiError(err: unknown) {
    if (!(err instanceof ApiError)) {
      setApiErrorMessage('Ocurrió un error inesperado.');
      return;
    }
    if (err.status === 409) {
      // Guía duplicada: error puntual en el campo; se conservan los demás datos.
      setErrors((e) => ({ ...e, trackingCode: 'Esta guía ya está registrada. Revisa el paquete existente.' }));
      return;
    }
    if (err.status === 400) {
      setErrors((e) => ({ ...e, ...err.fields }));
      setApiErrorMessage(err.message);
      return;
    }
    // 401 / 403 / red / desconocidos -> aviso general.
    setApiErrorMessage(err.message);
  }

  function handleReset() {
    setValues(EMPTY_REGISTER_PACKAGE_FORM);
    setErrors({});
    setStatus('idle');
    setApiErrorMessage(null);
    setLastResult(null);
  }

  if (status === 'success' && lastResult) {
    return <SuccessScreen result={lastResult} onRegisterAnother={handleReset} />;
  }

  return (
    <div className="register-package-screen">
      <h1>Registrar paquete</h1>

      {scannerNotice && <p className="notice notice-warning">{scannerNotice}</p>}
      {apiErrorMessage && <p className="notice notice-error">{apiErrorMessage}</p>}

      <PackageForm
        values={values}
        errors={errors}
        zones={zones}
        sectors={values.zoneId ? sectors : []}
        shipmentTypes={shipmentTypes}
        catalogsLoading={catalogsLoading}
        catalogsError={catalogsError}
        onChange={setValues}
        onSubmit={() => void handleSubmit()}
        onOpenScanner={() => {
          setScannerNotice(null);
          setScanning(true);
        }}
        disabled={status === 'saving'}
      />

      {scanning && (
        <BarcodeScanner onDetected={handleDetected} onError={handleScannerError} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}

function buildPayload(values: RegisterPackageFormValues) {
  return {
    trackingCode: values.trackingCode.trim(),
    zoneId: values.zoneId,
    sectorId: values.sectorId || undefined,
    shipmentTypeId: values.shipmentTypeId,
    weightKg: Number(values.weightKg),
    lengthCm: Number(values.lengthCm),
    widthCm: Number(values.widthCm),
    heightCm: Number(values.heightCm),
    priority: values.priority as Exclude<RegisterPackageFormValues['priority'], ''>,
    deadline: values.deadline ? new Date(values.deadline).toISOString() : undefined,
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
  };
}

function SuccessScreen({
  result,
  onRegisterAnother,
}: {
  result: RegisterPackageResult;
  onRegisterAnother: () => void;
}) {
  return (
    <div className="success-screen">
      <div className="success-icon">✓</div>
      <h1>Paquete registrado</h1>
      <p>
        Guía <span className="mono">{result.trackingCode}</span> · Estado: {result.state}
      </p>
      <button type="button" onClick={onRegisterAnother}>
        Registrar otro paquete
      </button>
    </div>
  );
}
