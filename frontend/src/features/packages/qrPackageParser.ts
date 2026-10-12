import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export interface ParsedPackageQrData {
  readonly trackingCode: string;
  readonly sender: string;
  readonly recipient: string;
  readonly recipientAddress: string;
  readonly recipientPhone: string;
  readonly municipalityCode: string;
  readonly zone: string;
  readonly zoneId: string;
  readonly sector: string;
  readonly sectorId: string;
  readonly shipmentType: string;
  readonly shipmentTypeId: string;
  readonly priority: 'normal' | 'urgent' | 'express';
  readonly backendPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly weightKg: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly volumeLiters: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly notes: string;
  readonly isStructuredJson: boolean;
}

const DEFAULT_DEMO_IDS = {
  zoneId: '08d92a06-4921-4989-92ff-f1917240779c',
  sectorId: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
  shipmentTypeId: 'b268c5c7-b2b5-411d-b734-07746ae7e6e6',
} as const;

function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback = '',
): string {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return fallback;
}

function pickPositiveNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: number,
): number {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      return val;
    }
    if (typeof val === 'string' && val.trim().length > 0) {
      const parsed = Number(val);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return fallback;
}

function pickCoordinate(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = record[key];
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeUiPriority(raw: string): 'normal' | 'urgent' | 'express' {
  const lower = raw.toLowerCase();
  if (lower === 'urgent' || lower === 'high' || lower === 'alta') {
    return 'urgent';
  }
  if (lower === 'express' || lower === 'urgente') {
    return 'express';
  }
  return 'normal';
}

function toBackendPriority(
  uiPriority: 'normal' | 'urgent' | 'express',
): 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' {
  if (uiPriority === 'urgent') return 'HIGH';
  if (uiPriority === 'express') return 'URGENT';
  return 'NORMAL';
}

export function parsePackageQrPayload(rawText: string): ParsedPackageQrData {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('El código QR está vacío.');
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>;
      const nestedAddress =
        typeof rec.address === 'object' && rec.address !== null
          ? (rec.address as Record<string, unknown>)
          : {};

      const trackingCode = pickString(
        rec,
        ['trackingCode', 'id_paquete', 'reference', 'code', 'guia'],
        `SLS-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      );
      const sender = pickString(
        rec,
        ['sender', 'remitente', 'origin'],
        'Almacenes del Caribe S.A.S.',
      );
      const recipient = pickString(
        rec,
        ['recipient', 'destinatario', 'destino'],
        'Cliente Barranquilla',
      );
      const recipientAddress =
        pickString(nestedAddress, ['text', 'street']) ||
        pickString(
          rec,
          ['recipientAddress', 'address', 'direccion'],
          'Cra 54 # 72-80, El Prado, Barranquilla',
        );
      const municipalityCode =
        pickString(nestedAddress, ['municipalityCode']) ||
        pickString(rec, ['municipalityCode'], '08001');
      const recipientPhone = pickString(
        rec,
        ['recipientPhone', 'phone', 'telefono'],
        '+57 300 412 8890',
      );

      const zone = pickString(rec, ['zone', 'zona'], 'Zona Norte');
      const zoneId = pickString(rec, ['zoneId'], DEFAULT_DEMO_IDS.zoneId);
      const sector = pickString(rec, ['sector'], 'Sector A');
      const sectorId = pickString(rec, ['sectorId'], DEFAULT_DEMO_IDS.sectorId);
      const shipmentType = pickString(
        rec,
        ['shipmentType', 'service', 'tipoEnvio'],
        'Estándar',
      );
      const shipmentTypeId = pickString(
        rec,
        ['shipmentTypeId'],
        DEFAULT_DEMO_IDS.shipmentTypeId,
      );

      const rawPriority =
        rec.urgente === true
          ? 'urgent'
          : pickString(rec, ['priority', 'prioridad'], 'normal');
      const priority = normalizeUiPriority(rawPriority);

      const weightKg = pickPositiveNumber(rec, ['weightKg', 'weight', 'peso'], 2.5);
      const lengthCm = pickPositiveNumber(rec, ['lengthCm', 'length', 'largo'], 30);
      const widthCm = pickPositiveNumber(rec, ['widthCm', 'width', 'ancho'], 20);
      const heightCm = pickPositiveNumber(rec, ['heightCm', 'height', 'alto'], 15);
      const computedVolumeLiters = Number(
        ((lengthCm * widthCm * heightCm) / 1000).toFixed(1),
      );
      const volumeLiters = pickPositiveNumber(
        rec,
        ['volume', 'volumeLiters'],
        computedVolumeLiters,
      );

      const latitude = pickCoordinate(rec, 'latitude');
      const longitude = pickCoordinate(rec, 'longitude');
      const notes = pickString(
        rec,
        ['notes', 'content', 'observaciones'],
        '',
      );

      return {
        trackingCode,
        sender,
        recipient,
        recipientAddress,
        recipientPhone,
        municipalityCode,
        zone,
        zoneId,
        sector,
        sectorId,
        shipmentType,
        shipmentTypeId,
        priority,
        backendPriority: toBackendPriority(priority),
        weightKg,
        lengthCm,
        widthCm,
        heightCm,
        volumeLiters,
        latitude,
        longitude,
        notes,
        isStructuredJson: true,
      };
    }
  } catch {
    // No es JSON: se interpreta como código de guía en texto plano
  }

  return {
    trackingCode: trimmed,
    sender: '',
    recipient: '',
    recipientAddress: '',
    recipientPhone: '',
    municipalityCode: '08001',
    zone: 'Zona Norte',
    zoneId: DEFAULT_DEMO_IDS.zoneId,
    sector: 'Sector A',
    sectorId: DEFAULT_DEMO_IDS.sectorId,
    shipmentType: 'Estándar',
    shipmentTypeId: DEFAULT_DEMO_IDS.shipmentTypeId,
    priority: 'normal',
    backendPriority: 'NORMAL',
    weightKg: 2.5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    volumeLiters: 9.0,
    notes: '',
    isStructuredJson: false,
  };
}

export async function decodeQrFromImageFile(file: File): Promise<string> {
  const tempContainerId = 'sls-hidden-qr-file-reader';
  let container = document.getElementById(tempContainerId);
  if (!container) {
    container = document.createElement('div');
    container.id = tempContainerId;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);
  }

  const scanner = new Html5Qrcode(tempContainerId, {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
    verbose: false,
  });

  try {
    const decoded = await scanner.scanFile(file, false);
    return decoded;
  } catch {
    // Fallback con BarcodeDetector nativo del navegador si está disponible
    const detectorClass = (
      window as typeof window & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (detectorClass) {
      const detector = new detectorClass({ formats: ['qr_code', 'code_128'] });
      const results = await detector.detect(await createImageBitmap(file));
      if (results[0]?.rawValue) {
        return results[0].rawValue;
      }
    }
    throw new Error('No se encontró un código QR legible en la imagen seleccionada.');
  } finally {
    try {
      scanner.clear();
    } catch {
      // Ignorar limpieza si no estaba activo
    }
  }
}

export function generateRandomDemoQrJson(): string {
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const samples = [
    {
      sender: 'Almacenes del Caribe S.A.S.',
      recipient: 'Droguería La Economía Norte',
      recipientAddress: 'Cra 53 # 82-45, Riomar, Barranquilla',
      recipientPhone: '+57 300 412 8890',
      zone: 'Zona Norte',
      sector: 'Sector A',
      shipmentType: 'Express',
      priority: 'urgent',
      weightKg: 3.4,
      lengthCm: 35,
      widthCm: 25,
      heightCm: 20,
      latitude: 11.0085,
      longitude: -74.8152,
      notes: 'Entregar en recepción principal antes de las 4:00 p. m.',
    },
    {
      sender: 'Distribuidora El Prado Ltda.',
      recipient: 'Ferretería San Nicolás',
      recipientAddress: 'Calle 45 # 44-12, Rosario, Barranquilla',
      recipientPhone: '+57 301 558 2140',
      zone: 'Zona Centro',
      sector: 'Sector B',
      shipmentType: 'Estándar',
      priority: 'normal',
      weightKg: 6.2,
      lengthCm: 45,
      widthCm: 30,
      heightCm: 25,
      latitude: 10.9878,
      longitude: -74.7889,
      notes: 'Verificar sello de seguridad al entregar.',
    },
    {
      sender: 'Tecnología del Atlántico S.A.',
      recipient: 'Clínica Reina Catalina',
      recipientAddress: 'Calle 76 # 48-21, Alto Prado, Barranquilla',
      recipientPhone: '+57 315 724 1903',
      zone: 'Zona Norte',
      sector: 'Sector A',
      shipmentType: 'Frágil',
      priority: 'express',
      weightKg: 1.8,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 15,
      latitude: 10.9965,
      longitude: -74.8058,
      notes: 'Cuidado: insumos médicos sensibles a golpes.',
    },
  ];
  const chosen = samples[Math.floor(Math.random() * samples.length)];
  const volume = Number(
    ((chosen.lengthCm * chosen.widthCm * chosen.heightCm) / 1000).toFixed(1),
  );

  return JSON.stringify({
    trackingCode: `SLS-2026-${randomSuffix}`,
    ...chosen,
    volume,
    municipalityCode: '08001',
    zoneId: DEFAULT_DEMO_IDS.zoneId,
    sectorId: DEFAULT_DEMO_IDS.sectorId,
    shipmentTypeId: DEFAULT_DEMO_IDS.shipmentTypeId,
  });
}
