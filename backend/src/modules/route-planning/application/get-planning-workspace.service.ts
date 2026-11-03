import {
    PlanningWorkspaceQueryPort,
    type PlanningWorkspaceQuery,
    type PlanningWorkspaceSnapshot,
} from './ports/planning-workspace-query.port';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GetPlanningWorkspaceService {
    constructor(private readonly workspaceQuery: PlanningWorkspaceQueryPort) {}

    async execute(
        query: PlanningWorkspaceQuery,
    ): Promise<PlanningWorkspaceSnapshot> {
        if (!query.tenantId || !UUID_PATTERN.test(query.tenantId.trim())) {
            throw new Error('TENANT_MISMATCH');
        }

        if (query.zoneId !== undefined) {
            if (!UUID_PATTERN.test(query.zoneId.trim())) {
                throw new Error('Invalid zoneId: must be a valid UUID');
            }
        }

        if (query.window !== undefined) {
            const start = new Date(query.window.startAt).getTime();
            const end = new Date(query.window.endAt).getTime();
            if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
                throw new Error(
                    'Invalid operating window: startAt must be before endAt',
                );
            }
        }

        return this.workspaceQuery.getWorkspace({
            tenantId: query.tenantId.trim(),
            zoneId: query.zoneId?.trim(),
            window: query.window
                ? {
                      startAt: new Date(query.window.startAt).toISOString(),
                      endAt: new Date(query.window.endAt).toISOString(),
                  }
                : undefined,
        });
    }
}
