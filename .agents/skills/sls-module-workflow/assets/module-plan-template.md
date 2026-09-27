# Plan de {{MODULE_ID}} — {{MODULE_TITLE}}

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `{{MODULE_ID}}` |
| Dominio | {{DOMAIN}} |
| Estado general | `TODO` |
| Rama observada | {{BRANCH}} |
| Última auditoría | {{AUDIT_DATE}} |
| Commit auditado | {{AUDITED_COMMIT}} |
| Informe | {{REPORT_PATH}} |

## Alcance

### Incluido

- {{IN_SCOPE}}

### Fuera de alcance

- {{OUT_OF_SCOPE}}

## Dependencias y fuentes

- `AGENTS.md`: {{AGENTS_REFERENCE}}
- Documentación o ADR: {{DOC_REFERENCES}}
- Dependencias previas: {{DEPENDENCIES}}

## Diagnóstico actual

{{CURRENT_DIAGNOSIS}}

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | {{PHASE}} | `USER` | `TODO` | {{OBJECTIVE}} | {{ACCEPTANCE}} | — |

## Paso actual

### Paso {{STEP_NUMBER}} — {{STEP_TITLE}}

**Por qué:** {{STEP_REASON}}

**Debe aplicar el usuario:**

1. {{USER_ACTION}}

**Archivos esperados:**

- `{{EXPECTED_PATH}}`

**Lote mecánico disponible para Codex:** {{MECHANICAL_BATCH_OR_NONE}}

**Verificación:**

```text
{{VERIFICATION_COMMANDS_OR_OBSERVATIONS}}
```

**Criterio de salida:** {{EXIT_CRITERIA}}

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| {{AUDIT_DATE}} | {{DECISION}} | {{RATIONALE}} | {{CONSEQUENCE}} |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| {{AUDIT_DATE}} | Auditoría inicial | {{INITIAL_OBSERVATION}} | {{INITIAL_EVIDENCE}} | {{AUDITED_COMMIT}} |

## Cierre

- [ ] Aceptación funcional satisfecha.
- [ ] Pruebas relevantes aprobadas.
- [ ] Aislamiento por tenant comprobado cuando aplica.
- [ ] Migración o infraestructura verificada cuando aplica.
- [ ] Informe actualizado por cada punto.
- [ ] Trabajo fuera de alcance documentado.
- [ ] Estado del plan contrastado con el repositorio.
