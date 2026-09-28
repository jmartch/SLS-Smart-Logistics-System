BEGIN;

-- Un resultado pendiente debe poder explicarse al coordinador.
ALTER TABLE "PlanningPackageResult"
  ADD CONSTRAINT "PlanningPackageResult_pending_reason_check"
  CHECK ("outcome" <> 'PENDING' OR
    ("reasonCode" IS NOT NULL AND btrim("reasonCode") <> ''));

-- La ventana seleccionada cubre el servicio completo, no solo la llegada.
CREATE FUNCTION gdb04_check_stop_window() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  selected_window "DeliveryWindow"%ROWTYPE;
BEGIN
  IF NEW."deliveryWindowId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."serviceStartAt" IS NULL OR NEW."serviceEndAt" IS NULL THEN
    RAISE EXCEPTION 'La parada con ventana elegida requiere inicio y fin de servicio'
      USING ERRCODE = '23514';
  END IF;

  -- El lock sincroniza inserciones de paradas con cambios de la ventana.
  SELECT * INTO selected_window FROM "DeliveryWindow"
    WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."deliveryWindowId"
    FOR SHARE;
  IF FOUND AND (NEW."serviceStartAt" < selected_window."startAt"
      OR NEW."serviceEndAt" > selected_window."endAt") THEN
    RAISE EXCEPTION 'El servicio completo debe quedar dentro de la ventana elegida'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "RouteStop_selected_window_guard"
  BEFORE INSERT OR UPDATE ON "RouteStop"
  FOR EACH ROW EXECUTE FUNCTION gdb04_check_stop_window();

-- Una edición posterior de la ventana tampoco puede invalidar paradas existentes.
CREATE FUNCTION gdb04_check_window_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RouteStop" s
    WHERE s."tenantId" = OLD."tenantId"
      AND s."deliveryWindowId" = OLD."id"
      AND (NEW."tenantId" <> OLD."tenantId"
        OR NEW."packageId" <> OLD."packageId"
        OR s."serviceStartAt" < NEW."startAt"
        OR s."serviceEndAt" > NEW."endAt")
  ) THEN
    RAISE EXCEPTION 'La actualización de ventana invalidaría una parada planificada'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "DeliveryWindow_planned_stops_guard"
  BEFORE UPDATE ON "DeliveryWindow"
  FOR EACH ROW EXECUTE FUNCTION gdb04_check_window_update();

COMMIT;
