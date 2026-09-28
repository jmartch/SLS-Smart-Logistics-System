import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class NetworkAttachmentValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const attachment = context.networkAttachment;
        if (
            !attachment ||
            !context.geocoding?.selectedCandidateId ||
            attachment.geocodingCandidateId !==
                context.geocoding.selectedCandidateId ||
            attachment.datasetId !== context.planning.datasetId ||
            attachment.profile !== context.planning.profile ||
            !['AUTO_ACCEPTED', 'APPROVED'].includes(attachment.status) ||
            Boolean(attachment.roadNodeId?.trim()) ===
                Boolean(attachment.roadEdgeId?.trim())
        ) {
            return this.reject(
                'NETWORK_ATTACHMENT_NOT_READY',
                'An accepted attachment to exactly one road node or edge is required for the selected candidate, dataset and profile',
            );
        }
        return super.handle(context);
    }
}
