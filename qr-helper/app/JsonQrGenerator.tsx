"use client";

import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Copy,
  Code,
  Shuffle,
  Package as PackageIcon,
} from 'lucide-react';

export interface SlsPackageQrPayload {
  trackingCode: string;
  sender: string;
  recipient: string;
  recipientAddress: string;
  recipientPhone: string;
  zone: 'Zona Norte' | 'Zona Sur' | 'Zona Centro' | 'Zona Oriente';
  sector: 'Sector A' | 'Sector B' | 'Sector C' | 'Sector D';
  shipmentType: 'Estándar' | 'Express' | 'Carga' | 'Frágil';
  priority: 'normal' | 'urgent' | 'express';
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volume: number;
  latitude: number;
  longitude: number;
  notes: string;
}

const SENDERS = [
  'Almacenes del Caribe S.A.S.',
  'Farmacéutica del Norte Ltda.',
  'Distribuidora Vía 40 S.A.',
  'Tecnología y Suministros BAQ',
  'Editorial Atlántico S.A.S.',
  'Comercializadora Puerta de Oro',
  'Suministros del Magdalena',
  'Importadora BAQ Express',
] as const;

const RECIPIENTS = [
  'Carmen Jiménez',
  'Roberto Espinoza',
  'Valentina Torres',
  'Jorge Castillo',
  'Claudia Neira',
  'Pablo Muñoz',
  'Andrés Salcedo',
  'Natalia Vergara',
  'Mauricio Arteta',
  'Diana Char',
] as const;

const BARRANQUILLA_DESTINATIONS: ReadonlyArray<{
  address: string;
  zone: SlsPackageQrPayload['zone'];
  sector: SlsPackageQrPayload['sector'];
  latitude: number;
  longitude: number;
}> = [
  {
    address: 'Cra 54 # 72-80, El Prado, Barranquilla',
    zone: 'Zona Norte',
    sector: 'Sector A',
    latitude: 10.9961,
    longitude: -74.806,
  },
  {
    address: 'Cra 51B # 80-58, Alto Prado, Barranquilla',
    zone: 'Zona Norte',
    sector: 'Sector A',
    latitude: 11.0041,
    longitude: -74.8152,
  },
  {
    address: 'Calle 98 # 52B-10, Riomar, Barranquilla',
    zone: 'Zona Norte',
    sector: 'Sector B',
    latitude: 11.0112,
    longitude: -74.8265,
  },
  {
    address: 'Cra 46 # 85-22, Granadillo, Barranquilla',
    zone: 'Zona Norte',
    sector: 'Sector B',
    latitude: 11.0018,
    longitude: -74.8214,
  },
  {
    address: 'Calle 45 # 44-12, Barrio Abajo, Barranquilla',
    zone: 'Zona Centro',
    sector: 'Sector C',
    latitude: 10.9865,
    longitude: -74.7892,
  },
  {
    address: 'Paseo Bolívar # 38-15, Centro, Barranquilla',
    zone: 'Zona Centro',
    sector: 'Sector D',
    latitude: 10.9812,
    longitude: -74.7798,
  },
  {
    address: 'Av. Murillo # 21-40, Ciudadela 20 de Julio, Barranquilla',
    zone: 'Zona Sur',
    sector: 'Sector C',
    latitude: 10.9384,
    longitude: -74.8015,
  },
  {
    address: 'Calle 30 # 14-85, Simón Bolívar, Barranquilla',
    zone: 'Zona Oriente',
    sector: 'Sector B',
    latitude: 10.9462,
    longitude: -74.7721,
  },
];

const SHIPMENT_TYPES: ReadonlyArray<{
  shipmentType: SlsPackageQrPayload['shipmentType'];
  priority: SlsPackageQrPayload['priority'];
  notes: string;
}> = [
  {
    shipmentType: 'Estándar',
    priority: 'normal',
    notes: 'Entregar en recepción principal.',
  },
  {
    shipmentType: 'Express',
    priority: 'urgent',
    notes: 'Entrega prioritaria antes del mediodía.',
  },
  {
    shipmentType: 'Frágil',
    priority: 'express',
    notes: 'Frágil. Mantener horizontal y no apilar.',
  },
  {
    shipmentType: 'Carga',
    priority: 'normal',
    notes: 'Caja sellada. Requiere firma.',
  },
];

function pickRandom<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomPackagePayload(
  presetZone?: SlsPackageQrPayload['zone'],
): SlsPackageQrPayload {
  const matchingDestinations = presetZone
    ? BARRANQUILLA_DESTINATIONS.filter((d) => d.zone === presetZone)
    : BARRANQUILLA_DESTINATIONS;
  const destination = pickRandom(
    matchingDestinations.length > 0
      ? matchingDestinations
      : BARRANQUILLA_DESTINATIONS,
  );
  const service = pickRandom(SHIPMENT_TYPES);

  const lengthCm = randomInt(18, 55);
  const widthCm = randomInt(15, 40);
  const heightCm = randomInt(10, 35);
  const volumeLiters = Number(((lengthCm * widthCm * heightCm) / 1000).toFixed(1));
  const weightKg = Number((randomInt(5, 120) / 10).toFixed(1));
  const sequence = String(randomInt(1000, 99999)).padStart(5, '0');
  const phoneSuffix = `${randomInt(300, 320)} ${randomInt(200, 999)} ${randomInt(1000, 9999)}`;

  return {
    trackingCode: `SLS-2026-${sequence}`,
    sender: pickRandom(SENDERS),
    recipient: pickRandom(RECIPIENTS),
    recipientAddress: destination.address,
    recipientPhone: `+57 ${phoneSuffix}`,
    zone: destination.zone,
    sector: destination.sector,
    shipmentType: service.shipmentType,
    priority: service.priority,
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
    volume: volumeLiters,
    latitude: destination.latitude,
    longitude: destination.longitude,
    notes: service.notes,
  };
}

const INITIAL_PACKAGE: SlsPackageQrPayload = {
  trackingCode: 'SLS-2026-04821',
  sender: 'Almacenes del Caribe S.A.S.',
  recipient: 'Carmen Jiménez',
  recipientAddress: 'Cra 54 # 72-80, El Prado, Barranquilla',
  recipientPhone: '+57 300 412 8890',
  zone: 'Zona Norte',
  sector: 'Sector A',
  shipmentType: 'Estándar',
  priority: 'normal',
  weightKg: 2.5,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 15,
  volume: 9.0,
  latitude: 10.9961,
  longitude: -74.806,
  notes: 'Entregar en recepción principal.',
};

function validateJsonText(value: string): {
  isValidJson: boolean;
  errorMessage: string;
  parsedTrackingCode?: string;
  compactQrValue: string;
} {
  if (!value.trim()) {
    return {
      isValidJson: false,
      errorMessage: 'El texto no puede estar vacío',
      compactQrValue: '',
    };
  }

  try {
    const parsed = JSON.parse(value) as { trackingCode?: unknown };
    return {
      isValidJson: true,
      errorMessage: '',
      parsedTrackingCode:
        typeof parsed?.trackingCode === 'string'
          ? parsed.trackingCode
          : undefined,
      // Minifica el JSON al codificar el QR para que tenga la mitad de densidad y módulos el doble de grandes
      compactQrValue: JSON.stringify(parsed),
    };
  } catch (error: unknown) {
    return {
      isValidJson: false,
      errorMessage: error instanceof Error ? error.message : 'JSON inválido',
      compactQrValue: '',
    };
  }
}

export default function JsonQrGenerator() {
  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
  const [jsonText, setJsonText] = useState(
    JSON.stringify(INITIAL_PACKAGE, null, 2),
  );
  const [copied, setCopied] = useState(false);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [level, setLevel] = useState<ErrorCorrectionLevel>('L');

  const { isValidJson, errorMessage, parsedTrackingCode, compactQrValue } =
    validateJsonText(jsonText);

  const handleGenerateRandom = (presetZone?: SlsPackageQrPayload['zone']) => {
    const nextPkg = generateRandomPackagePayload(presetZone);
    setJsonText(JSON.stringify(nextPkg, null, 2));
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // El botón permanece deshabilitado mientras el JSON sea inválido.
    }
  };

  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Incluye un margen blanco (quiet zone) alrededor del QR para que los lectores de imagen lo detecten al 100%
      canvas.width = 1000;
      canvas.height = 1000;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 80, 80, 840, 840);

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      const safeCode = parsedTrackingCode
        ? parsedTrackingCode.replace(/[^a-zA-Z0-9_-]/g, '-')
        : String(Date.now());
      downloadLink.download = `qr-${safeCode}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col items-center">
      <header className="max-w-5xl w-full mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
            <PackageIcon className="text-blue-400" /> Generador QR de Paquetes SLS
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Genera paquetes aleatorios con la estructura exacta de SLS (Barranquilla) para escanear o importar en recepción.
          </p>
        </div>

        <button
          onClick={() => handleGenerateRandom()}
          className="py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-lg shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Shuffle size={18} /> Generar Paquete Aleatorio
        </button>
      </header>

      <main className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel Izquierdo: Editor JSON */}
        <section className="flex flex-col bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Code size={16} className="text-blue-400" /> Payload del Paquete (JSON)
              {isValidJson ? (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-500/20">
                  <CheckCircle size={12} /> Válido
                </span>
              ) : (
                <span className="text-xs bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full flex items-center gap-1 border border-rose-500/20">
                  <AlertCircle size={12} /> Inválido
                </span>
              )}
            </span>

            <div className="flex gap-2">
              <button
                onClick={handleFormat}
                disabled={!isValidJson}
                className="text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 px-2.5 py-1.5 rounded-md transition flex items-center gap-1"
                title="Formatear JSON"
              >
                <RefreshCw size={12} /> Formatear
              </button>
              <button
                onClick={handleCopyJson}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded-md transition flex items-center gap-1"
                title="Copiar JSON"
              >
                <Copy size={12} /> {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Botones de generación rápida por zona */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-xs text-slate-400">
            <span>Zonas Barranquilla:</span>
            <button
              onClick={() => handleGenerateRandom('Zona Norte')}
              className="bg-slate-700/60 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-600/50 cursor-pointer"
            >
              Zona Norte
            </button>
            <button
              onClick={() => handleGenerateRandom('Zona Centro')}
              className="bg-slate-700/60 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-600/50 cursor-pointer"
            >
              Zona Centro
            </button>
            <button
              onClick={() => handleGenerateRandom('Zona Sur')}
              className="bg-slate-700/60 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-600/50 cursor-pointer"
            >
              Zona Sur
            </button>
            <button
              onClick={() => handleGenerateRandom('Zona Oriente')}
              className="bg-slate-700/60 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded border border-slate-600/50 cursor-pointer"
            >
              Zona Oriente
            </button>
          </div>

          <div className="relative flex-1 min-h-[340px]">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="Pega o escribe el JSON del paquete aquí..."
              className={`w-full h-full min-h-[340px] p-4 font-mono text-xs bg-slate-900 rounded-lg border focus:outline-none focus:ring-2 resize-y transition ${
                isValidJson
                  ? 'border-slate-700 focus:ring-blue-500 focus:border-blue-500 text-slate-200'
                  : 'border-rose-500/50 focus:ring-rose-500 text-rose-200'
              }`}
              spellCheck={false}
            />
          </div>

          {!isValidJson && (
            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg font-mono flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </section>

        {/* Panel Derecho: Vista previa del QR y Descarga */}
        <section className="flex flex-col bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-xl items-center justify-between">
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-300">
                Vista Previa QR
              </h2>
              {parsedTrackingCode && (
                <span className="text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-full">
                  Guía: {parsedTrackingCode}
                </span>
              )}
            </div>

            <div className="w-full bg-slate-200 p-6 rounded-2xl flex items-center justify-center">
              <div
                className="p-7 rounded-2xl shadow-md border border-slate-300 flex items-center justify-center transition-all duration-300 min-h-[320px] min-w-[320px]"
                style={{ backgroundColor: bgColor }}
              >
                {isValidJson ? (
                  <QRCode
                    id="qr-code-svg"
                    value={compactQrValue}
                    size={272}
                    fgColor={fgColor}
                    bgColor={bgColor}
                    level={level}
                  />
                ) : (
                  <div className="text-center text-slate-500 max-w-[180px] text-xs">
                    Corrige los errores en el JSON para generar el código QR.
                  </div>
                )}
              </div>
            </div>

            <div className="w-full grid grid-cols-3 gap-3 mt-6 text-xs text-slate-300">
              <div>
                <label className="block mb-1 text-slate-400">Color QR</label>
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-full h-8 bg-slate-900 border border-slate-700 rounded cursor-pointer p-0.5"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Color Fondo</label>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-full h-8 bg-slate-900 border border-slate-700 rounded cursor-pointer p-0.5"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">
                  Nivel Corrección
                </label>
                <select
                  value={level}
                  onChange={(e) =>
                    setLevel(e.target.value as ErrorCorrectionLevel)
                  }
                  className="w-full h-8 bg-slate-900 border border-slate-700 rounded text-slate-200 px-1 focus:outline-none"
                >
                  <option value="L">L (7%)</option>
                  <option value="M">M (15%)</option>
                  <option value="Q">Q (25%)</option>
                  <option value="H">H (30%)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col gap-2.5 mt-6">
            <button
              onClick={downloadQR}
              disabled={!isValidJson}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={18} /> Descargar QR (PNG)
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}