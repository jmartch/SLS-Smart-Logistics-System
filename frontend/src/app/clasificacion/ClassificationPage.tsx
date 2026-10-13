import { AlertCircle, Check, ClipboardList, Eye, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../shared/api/httpClient';
import { EmptyState } from '../../shared/ui/EmptyState';
import { fetchSectors, fetchZones } from '../paquetes/api/catalogApi';
import {
  classifyPackage,
  listPackages,
  type PackageListItemResponse,
} from '../paquetes/api/packagesApi';
import {
  PACKAGE_PRIORITY_LABELS,
  PACKAGE_STATE_COLORS,
  PACKAGE_STATE_LABELS,
  type CatalogOption,
  type PackagePriority,
  type PackageState,
  type SectorOption,
} from '../paquetes/types';

export function ClassificationPage() {
  const [queue, setQueue] = useState<PackageListItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState<PackageListItemResponse | null>(
    null,
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listPackages({ state: 'REGISTERED' });
      setQueue(items.filter((pkg) => pkg.state === 'REGISTERED'));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la bandeja de clasificación.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleClassified = (packageId: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== packageId));
  };

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Clasificación</h1>
          <p>
            Paquetes registrados pendientes de validar coordenadas y asignar
            zona.
          </p>
        </div>
        <span
          className="counter"
          style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
        >
          {queue.length} pendientes
        </span>
      </div>

      {loading && (
        <div
          className="dashboard-panel"
          style={{ textAlign: 'center', padding: '2rem' }}
        >
          Cargando paquetes pendientes de clasificación...
        </div>
      )}

      {error && (
        <div
          className="dashboard-panel"
          style={{
            color: 'var(--danger, #dc2626)',
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <span>Error al cargar bandeja: {error}</span>
          <button
            type="button"
            className="form-submit"
            style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', minHeight: 'auto' }}
            onClick={() => void loadQueue()}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && queue.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={32} />}
          title="Bandeja vacía"
          body="No hay paquetes pendientes de clasificación."
        />
      ) : null}

      {!loading && !error && queue.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {queue.map((pkg) => {
            const stateKey = pkg.state as PackageState;
            const priorityKey = pkg.priority as PackagePriority;

            return (
              <div
                key={pkg.id}
                className="dashboard-panel"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <strong
                      style={{
                        color: 'var(--navy)',
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}
                    >
                      {pkg.trackingCode}
                    </strong>
                    <span
                      className={`status ${PACKAGE_STATE_COLORS[stateKey] ?? 'status--pending'}`}
                    >
                      {PACKAGE_STATE_LABELS[stateKey] ?? pkg.state}
                    </span>
                    {pkg.priority !== 'NORMAL' && (
                      <span className="status status--pending">
                        {PACKAGE_PRIORITY_LABELS[priorityKey] ?? pkg.priority}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: '0.4rem 1.5rem',
                    }}
                  >
                    {[
                      ['Dirección', pkg.address],
                      ['Tipo de envío', pkg.shipmentType],
                      ['Zona actual', pkg.zone ?? 'Sin asignar'],
                      ['Sector actual', pkg.sector ?? 'Sin asignar'],
                      ['Peso', `${pkg.weightKg} kg`],
                      [
                        'Registrado',
                        pkg.registeredAt
                          ? new Date(pkg.registeredAt).toLocaleTimeString(
                              'es-CO',
                              { hour: '2-digit', minute: '2-digit' },
                            )
                          : '—',
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {k}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--navy)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className="form-submit"
                    style={{
                      padding: '0.65rem 1.1rem',
                      fontSize: '0.78rem',
                      minHeight: 'auto',
                    }}
                    onClick={() => setClassifying(pkg)}
                  >
                    <Check size={15} /> Clasificar
                  </button>
                  <Link
                    to={`/app/paquetes/${pkg.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      justifyContent: 'center',
                      padding: '0.6rem 1rem',
                      color: 'var(--navy)',
                      background: 'var(--blue-pale)',
                      border: '1px solid var(--border)',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <Eye size={15} /> Detalle
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {classifying && (
        <ClassifyModal
          pkg={classifying}
          onClassified={() => handleClassified(classifying.id)}
          onClose={() => setClassifying(null)}
        />
      )}
    </>
  );
}

function ClassifyModal({
  pkg,
  onClassified,
  onClose,
}: {
  pkg: PackageListItemResponse;
  onClassified: () => void;
  onClose: () => void;
}) {
  const [zones, setZones] = useState<CatalogOption[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [loadingZones, setLoadingZones] = useState(true);
  const [loadingSectors, setLoadingSectors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingZones(true);
    fetchZones()
      .then((list) => {
        if (!active) return;
        setZones(list);
        const matchingZone = pkg.zone
          ? list.find((z) => z.name === pkg.zone)
          : undefined;
        setZoneId(matchingZone?.id ?? list[0]?.id ?? '');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las zonas de la empresa.',
        );
      })
      .finally(() => {
        if (active) setLoadingZones(false);
      });
    return () => {
      active = false;
    };
  }, [pkg.zone]);

  useEffect(() => {
    if (!zoneId) {
      setSectors([]);
      setSectorId('');
      return;
    }
    let active = true;
    setLoadingSectors(true);
    fetchSectors(zoneId)
      .then((list) => {
        if (!active) return;
        setSectors(list);
        const matchingSector = pkg.sector
          ? list.find((s) => s.name === pkg.sector)
          : undefined;
        setSectorId(matchingSector?.id ?? '');
      })
      .catch(() => {
        if (!active) return;
        setSectors([]);
        setSectorId('');
      })
      .finally(() => {
        if (active) setLoadingSectors(false);
      });
    return () => {
      active = false;
    };
  }, [zoneId, pkg.sector]);

  const selectedZoneName =
    zones.find((z) => z.id === zoneId)?.name ?? 'Zona seleccionada';
  const selectedSectorName = sectors.find((s) => s.id === sectorId)?.name;

  const handleConfirm = async () => {
    if (!zoneId) {
      setError('Debes seleccionar una zona.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await classifyPackage(pkg.id, {
        zoneId,
        sectorId: sectorId || undefined,
      });
      setDone(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo clasificar el paquete.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseAfterDone = () => {
    onClassified();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(7,59,92,0.3)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={done ? handleCloseAfterDone : onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 'var(--radius-md)',
          padding: '2rem',
          width: 'min(480px, calc(100vw - 2rem))',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="success-state" style={{ padding: '1rem 0' }}>
            <span>
              <Check size={24} />
            </span>
            <h2 style={{ fontSize: '1.4rem' }}>Clasificado</h2>
            <p>
              {pkg.trackingCode} fue asignado a {selectedZoneName}
              {selectedSectorName ? ` · ${selectedSectorName}` : ''} y avanzó a
              Clasificado.
            </p>
            <button
              type="button"
              className="form-submit"
              onClick={handleCloseAfterDone}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <h2
              style={{
                margin: '0 0 0.4rem',
                fontFamily: 'Space Grotesk, sans-serif',
                color: 'var(--navy-dark)',
              }}
            >
              Clasificar paquete
            </h2>
            <p
              style={{
                margin: '0 0 1.5rem',
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
              }}
            >
              {pkg.trackingCode} · {pkg.address}
            </p>

            {error && (
              <div
                className="form-alert"
                role="alert"
                style={{ marginBottom: '1rem' }}
              >
                <AlertCircle size={16} />
                <div>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <div className="portal-form">
              <div className="field">
                <label htmlFor="classify-zone">Zona *</label>
                <select
                  id="classify-zone"
                  value={zoneId}
                  disabled={loadingZones || submitting}
                  onChange={(e) => setZoneId(e.target.value)}
                >
                  <option value="">
                    {loadingZones ? 'Cargando zonas...' : 'Selecciona una zona'}
                  </option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="classify-sector">Sector (opcional)</label>
                <select
                  id="classify-sector"
                  value={sectorId}
                  disabled={!zoneId || loadingSectors || submitting}
                  onChange={(e) => setSectorId(e.target.value)}
                >
                  <option value="">
                    {loadingSectors
                      ? 'Cargando sectores...'
                      : 'Sin sector específico'}
                  </option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end',
                  marginTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{
                    padding: '0.7rem 1.2rem',
                    background: 'var(--blue-pale)',
                    border: '1px solid var(--border)',
                    borderRadius: '999px',
                    fontWeight: 700,
                    color: 'var(--navy)',
                    fontSize: '0.82rem',
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="form-submit"
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={submitting || loadingZones || !zoneId}
                >
                  {submitting ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  Confirmar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
