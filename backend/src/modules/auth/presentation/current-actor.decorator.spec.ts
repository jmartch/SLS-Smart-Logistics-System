import { UnauthorizedException } from '@nestjs/common';
import { getCurrentActor } from './current-actor.decorator';
import type { ActorContext } from '../../../shared/application/actor-context';

describe('getCurrentActor', () => {
  it('returns the actor attached to the request by the guard', () => {
    const actor: ActorContext = {
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-1',
    };

    expect(getCurrentActor({ actor })).toBe(actor);
  });

  it('fails loudly when no actor is attached (route is missing AuthGuard)', () => {
    expect(() => getCurrentActor({})).toThrow(UnauthorizedException);
  });
});
