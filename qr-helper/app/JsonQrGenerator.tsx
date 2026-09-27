"use client";

import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Download, RefreshCw, CheckCircle, AlertCircle, Copy, Code } from 'lucide-react';

const SAMPLE_JSONS = {
    simple: {
        nombre: "Juan Pérez",
        email: "juan.perez@example.com",
        activo: true
    },
    logistics: {
        id_paquete: "PKG-2026-8942",
        remitente: "Almacén Central",
        destino: "Sucursal Norte",
        items: [
            { sku: "ITEM-A1", cant: 2 },
            { sku: "ITEM-B5", cant: 1 }
        ],
        urgente: true
    },
    device: {
        dispositivo: "Sensor_Temperatura_01",
        mac: "00:1B:44:11:3A:B7",
        firmware: "v2.4.1",
        ip: "192.168.1.105"
    }
};

export default function JsonQrGenerator() {
    const [jsonText, setJsonText] = useState(JSON.stringify(SAMPLE_JSONS.simple, null, 2));
    const [isValidJson, setIsValidJson] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [copied, setCopied] = useState(false);
    const [fgColor, setFgColor] = useState('#0f172a');
    const [bgColor, setBgColor] = useState('#ffffff');
    const [level, setLevel] = useState('M'); // Error correction level: L, M, Q, H

    // Validar JSON en tiempo real cada vez que el usuario escribe
    useEffect(() => {
        if (!jsonText.trim()) {
            setIsValidJson(false);
            setErrorMessage('El texto no puede estar vacío');
            return;
        }

        try {
            JSON.parse(jsonText);
            setIsValidJson(true);
            setErrorMessage('');
        } catch (err) {
            setIsValidJson(false);
            setErrorMessage(err.message);
        }
    }, [jsonText]);

    // Formatear/embellecer el JSON
    const handleFormat = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
        } catch (e) {
            // No hace nada si el JSON no es válido
        }
    };

    // Cargar un ejemplo prefijado
    const loadPreset = (key) => {
        setJsonText(JSON.stringify(SAMPLE_JSONS[key], null, 2));
    };

    // Descargar el QR en formato PNG
    const downloadQR = () => {
        const svg = document.getElementById("qr-code-svg");
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        // Crear Blob SVG para renderizar en el Canvas en alta resolución
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            canvas.width = 1000;
            canvas.height = 1000;
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const pngUrl = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.href = pngUrl;
            downloadLink.download = `qr-code-${Date.now()}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
        };

        img.src = url;
    };

    // Copiar el JSON al portapapeles
    const handleCopyJson = () => {
        navigator.clipboard.writeText(jsonText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col items-center">
            {/* Header */}
            <header className="max-w-5xl w-full mb-8 text-center md:text-left">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center justify-center md:justify-start gap-2">
                    <Code className="text-blue-400" /> Generador de QR desde JSON
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    Escribe o pega un formato JSON válido para visualizar y descargar su código QR en tiempo real.
                </p>
            </header>

            <main className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Panel Izquierdo: Editor JSON */}
                <section className="flex flex-col bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-xl">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            Editor JSON
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
                                title="Copiar texto"
                            >
                                <Copy size={12} /> {copied ? '¡Copiado!' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {/* Plantillas de ejemplo */}
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-xs text-slate-400">
                        <span>Ejemplos:</span>
                        <button onClick={() => loadPreset('simple')} className="bg-slate-700/60 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600/50">
                            Perfil Básico
                        </button>
                        <button onClick={() => loadPreset('logistics')} className="bg-slate-700/60 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600/50">
                            Logística
                        </button>
                        <button onClick={() => loadPreset('device')} className="bg-slate-700/60 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600/50">
                            Dispositivo IoT
                        </button>
                    </div>

                    {/* Textarea */}
                    <div className="relative flex-1 min-h-[300px]">
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            placeholder="Pega o escribe tu JSON aquí..."
                            className={`w-full h-full min-h-[300px] p-4 font-mono text-sm bg-slate-900 rounded-lg border focus:outline-none focus:ring-2 resize-y transition ${isValidJson
                                    ? 'border-slate-700 focus:ring-blue-500 focus:border-blue-500 text-slate-200'
                                    : 'border-rose-500/50 focus:ring-rose-500 text-rose-200'
                                }`}
                            spellCheck={false}
                        />
                    </div>

                    {/* Mensaje de error de sintaxis */}
                    {!isValidJson && (
                        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg font-mono flex items-start gap-2">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}
                </section>

                {/* Panel Derecho: Vista previa del QR y Ajustes */}
                <section className="flex flex-col bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-xl items-center justify-between">
                    <div className="w-full flex flex-col items-center">
                        <h2 className="text-sm font-semibold text-slate-300 mb-4 self-start">Vista Previa QR</h2>

                        {/* Contenedor del QR */}
                        <div
                            className="p-6 rounded-2xl shadow-inner border border-slate-700/50 flex items-center justify-center transition-all duration-300 min-h-[260px] min-w-[260px]"
                            style={{ backgroundColor: bgColor }}
                        >
                            {isValidJson ? (
                                <QRCode
                                    id="qr-code-svg"
                                    value={jsonText}
                                    size={200}
                                    fgColor={fgColor}
                                    bgColor={bgColor}
                                    level={level}
                                />
                            ) : (
                                <div className="text-center text-slate-400 max-w-[180px] text-xs">
                                    Corrige los errores en el JSON para generar el código QR.
                                </div>
                            )}
                        </div>

                        {/* Opciones de personalización */}
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
                                <label className="block mb-1 text-slate-400">Nivel Corrección</label>
                                <select
                                    value={level}
                                    onChange={(e) => setLevel(e.target.value)}
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

                    {/* Botón de descarga */}
                    <button
                        onClick={downloadQR}
                        disabled={!isValidJson}
                        className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg transition flex items-center justify-center gap-2"
                    >
                        <Download size={18} /> Descargar QR (PNG)
                    </button>
                </section>

            </main>
        </div>
    );
}