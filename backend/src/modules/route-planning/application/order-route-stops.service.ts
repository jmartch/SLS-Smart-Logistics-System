import { InvalidStopOrderingInputError } from '../domain/models/invalid-stop-ordering-input.error';
import type { CapacityClusterProposal } from '../domain/models/clustering.types';
import type {
  OrderedRouteSequence,
  StopCandidateInput,
  StopOrderingOptions,
} from '../domain/models/stop-ordering.types';
import type { StopOrderingAlgorithm } from '../domain/algorithms/stop-ordering-algorithm';

export class OrderRouteStopsService {
  public constructor(
    private readonly algorithm: StopOrderingAlgorithm,
  ) {}

  public execute(
    options: StopOrderingOptions,
    source: Readonly<{
      tenantId: string;
      proposal: CapacityClusterProposal;
    }>,
    candidates: readonly StopCandidateInput[],
  ): OrderedRouteSequence {
    // 1. Validar aislamiento y consistencia de tenant
    if (
      !options ||
      typeof options.tenantId !== 'string' ||
      !source ||
      typeof source.tenantId !== 'string' ||
      source.tenantId !== options.tenantId
    ) {
      throw new InvalidStopOrderingInputError('TENANT_MISMATCH');
    }

    if (Array.isArray(candidates)) {
      for (const c of candidates) {
        if (c && c.tenantId !== options.tenantId) {
          throw new InvalidStopOrderingInputError('TENANT_MISMATCH');
        }
      }
    }

    // 2. Validar estructura de la propuesta
    if (
      !source.proposal ||
      typeof source.proposal !== 'object' ||
      typeof source.proposal.proposalId !== 'string' ||
      source.proposal.proposalId.trim() !== source.proposal.proposalId ||
      source.proposal.proposalId.length === 0 ||
      !Array.isArray(source.proposal.packageIds) ||
      source.proposal.packageIds.length === 0
    ) {
      throw new InvalidStopOrderingInputError('INVALID_PROPOSAL');
    }

    const proposalPkgSet = new Set<string>();
    for (const pkgId of source.proposal.packageIds) {
      if (
        typeof pkgId !== 'string' ||
        pkgId.trim() !== pkgId ||
        pkgId.length === 0 ||
        proposalPkgSet.has(pkgId)
      ) {
        throw new InvalidStopOrderingInputError('INVALID_PROPOSAL');
      }
      proposalPkgSet.add(pkgId);
    }

    // 3. Validar correspondencia exacta entre candidatos y propuesta
    if (!Array.isArray(candidates) || candidates.length !== proposalPkgSet.size) {
      throw new InvalidStopOrderingInputError('PROPOSAL_PACKAGE_MISMATCH');
    }

    for (const c of candidates) {
      if (!c || !proposalPkgSet.has(c.packageId)) {
        throw new InvalidStopOrderingInputError('PROPOSAL_PACKAGE_MISMATCH');
      }
    }

    // 4. Delegar cálculo a la estrategia inyectada
    return this.algorithm.order(candidates, options);
  }
}
