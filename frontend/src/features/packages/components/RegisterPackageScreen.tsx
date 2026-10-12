import { lazy, Suspense, useEffect, useState } from 'react';
import type { CameraErrorReason } from './BarcodeScanner';
import PackageForm from './PackageForm';
import { validateRegisterPackageForm } from '../validation';
import { registerPackage } from '../api/packagesApi';
import { fetchSectors, fetchShipmentTypes, fetchZones } from '../api/catalogApi';
import { parsePackageQrPayload } from '../qrPackageParser';
import { ApiError } from '../../../shared/api/httpClient';
import { USE_MOCK_DATA } from '../../../shared/config/environment';
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

const BarcodeScanner = lazy(() => import('./BarcodeScanner'));
const ImageQrScanner = lazy(() => import('./ImageQrScanner'));

export default function RegisterPackageScreen({ onBack }: { onBack: () => void }) {
  const [values, setValues] = useState<RegisterPackageFormValues>(EMPTY_REGISTER_PACKAGE_FORM);
  const [errors, setErrors] = useState<RegisterPackageFormErrors>({});
  const [scanning, setScanning] = useState(false);
  const [imageScanning, setImageScanning] = useState(false);
  const [scannerNotice, setScannerNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RegisterPackageResult | null>(null);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  const [zones, setZones] = useState<CatalogOption[]>([]);
  const [shipmentTypes, setShipmentTypes] = useState<CatalogOption[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [sectorsLoading, setSectorsLoading] = useState(false);
  const [sectorsError, setSectorsError] = useState<string | null>(null);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  // Carga los catálogos al entrar y después de cada reintento solicitado.
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
  }, [catalogReloadKey]);

  // Los sectores dependen de la zona elegida; se recargan al cambiarla.
  useEffect(() => {
    if (!values.zoneId) {
      return;
    }
    let cancelled = false;
    fetchSectors(values.zoneId)
      .then((result) => {
        if (!cancelled) setSectors(result);
      })
      .catch(() => {
        if (!cancelled) {
          setSectorsError('No se pudieron cargar los sectores. Puedes continuar sin seleccionar uno.');
        }
      })
      .finally(() => {
        if (!cancelled) setSectorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [values.zoneId]);

  function applyRawQrToValues(rawText: string) {
    try {
      const parsed = parsePackageQrPayload(rawText);
      if (parsed.isStructuredJson) {
        setValues((v) => ({
          ...v,
          trackingCode: parsed.trackingCode || v.trackingCode,
          zoneId: parsed.zoneId || v.zoneId,
          sectorId: parsed.sectorId || v.sectorId,
          shipmentTypeId: parsed.shipmentTypeId || v.shipmentTypeId,
          weightKg: String(parsed.weightKg),
          lengthCm: String(parsed.lengthCm),
          widthCm: String(parsed.widthCm),
          heightCm: String(parsed.heightCm),
          priority: parsed.backendPriority,
          latitude: parsed.latitude !== undefined ? String(parsed.latitude) : v.latitude,
          longitude: parsed.longitude !== undefined ? String(parsed.longitude) : v.longitude,
        }));
        setErrors({});
        return;
      }
    } catch {
      // Fallback a texto plano
    }
    setValues((v) => ({ ...v, trackingCode: rawText.trim() }));
    setErrors((e) => ({ ...e, trackingCode: undefined }));
  }

  function handleDetected(rawText: string) {
    applyRawQrToValues(rawText);
    setScanning(false);
  }

  function handleFormChange(nextValues: RegisterPackageFormValues) {
    if (nextValues.zoneId !== values.zoneId) {
      setSectors([]);
      setSectorsError(null);
      setSectorsLoading(!!nextValues.zoneId);
    }
    setValues(nextValues);
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

  function handleImageDetected(rawText: string) {
    applyRawQrToValues(rawText);
    setImageScanning(false);
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
    handleFormChange(EMPTY_REGISTER_PACKAGE_FORM);
    setErrors({});
    setStatus('idle');
    setApiErrorMessage(null);
    setLastResult(null);
  }

  function handleLoadMockData() {
    handleFormChange({
      trackingCode: 'SLS-MOCK-2026-001',
      zoneId: 'zone-centro',
      sectorId: 'center-a',
      shipmentTypeId: 'express',
      weightKg: '2.5',
      lengthCm: '30',
      widthCm: '20',
      heightCm: '15',
      priority: 'HIGH',
      deadline: '',
      latitude: '10.968540',
      longitude: '-74.781320',
    });
    setErrors({});
    setApiErrorMessage(null);
  }

  if (status === 'success' && lastResult) {
    return <SuccessScreen result={lastResult} onRegisterAnother={handleReset} />;
  }

  return (
    <div className="register-package-screen">
      <header className="register-header">
        <button type="button" className="back-button" onClick={onBack}>← Inicio</button>
        <div>
          <p className="eyebrow">NUEVO INGRESO</p>
          <h1>Registrar paquete</h1>
        </div>
      </header>

      {scannerNotice && <p className="notice notice-warning">{scannerNotice}</p>}
      {apiErrorMessage && <p className="notice notice-error">{apiErrorMessage}</p>}

      <PackageForm
        values={values}
        errors={errors}
        zones={zones}
        sectors={values.zoneId ? sectors : []}
        sectorsLoading={sectorsLoading}
        sectorsError={sectorsError}
        shipmentTypes={shipmentTypes}
        catalogsLoading={catalogsLoading}
        catalogsError={catalogsError}
        onChange={handleFormChange}
        onSubmit={() => void handleSubmit()}
        onOpenScanner={() => {
          setScannerNotice(null);
          setScanning(true);
        }}
        onOpenImageScanner={() => {
          setScannerNotice(null);
          setImageScanning(true);
        }}
        onLoadMockData={handleLoadMockData}
        showMockDataAction={USE_MOCK_DATA}
        disabled={status === 'saving'}
        onRetryCatalogs={() => {
          setCatalogReloadKey((current) => current + 1);
        }}
      />

      {(scanning || imageScanning) && (
        <Suspense fallback={<div className="scanner-overlay scanner-loading" role="status">Cargando lector...</div>}>
          {scanning && (
            <BarcodeScanner onDetected={handleDetected} onError={handleScannerError} onClose={() => setScanning(false)} />
          )}
          {imageScanning && <ImageQrScanner onDetected={handleImageDetected} onClose={() => setImageScanning(false)} />}
        </Suspense>
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
