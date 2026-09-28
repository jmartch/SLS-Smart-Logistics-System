import {
    AssignmentRejectionCode,
    AssignmentValidationContext,
    AssignmentValidationResult,
} from './validation.types';

export interface AssignmentValidationHandler {
    setNext(handler: AssignmentValidationHandler): AssignmentValidationHandler;

    handle(context: AssignmentValidationContext): AssignmentValidationResult;
}

export abstract class BaseAssignmentValidationHandler implements AssignmentValidationHandler {
    private nextHandler?: AssignmentValidationHandler;

    setNext(handler: AssignmentValidationHandler): AssignmentValidationHandler {
        this.nextHandler = handler;
        return handler;
    }

    handle(context: AssignmentValidationContext): AssignmentValidationResult {
        if (this.nextHandler) {
            return this.nextHandler.handle(context);
        }

        return { ok: true };
    }

    protected reject(
        code: AssignmentRejectionCode,
        message: string,
    ): AssignmentValidationResult {
        return {
            ok: false,
            code,
            message,
            handler: this.constructor.name,
        };
    }
}
