import { prisma } from '../config/db.js';
import { AuthEventAction, ActorType } from '../types/auth-events.js';

export interface CreateAuthEventInput {
  actorType: ActorType;
  action: AuthEventAction;
  targetType?: string;
  targetId?: string | null;
  actorIp?: string;
  actorUserAgent?: string;
  details?: string;
}

export async function createAuthEvent(
  input: CreateAuthEventInput,
): Promise<void> {
  const {
    actorType,
    action,
    targetType,
    targetId,
    actorIp,
    actorUserAgent,
    details,
  } = input;

  await prisma.authEvent.create({
    data: {
      actorType,
      action,
      // Prisma's exactOptionalPropertyTypes rejects explicit `undefined`,
      // so only forward fields that are actually present.
      ...(targetType != null ? { targetType } : {}),
      ...(targetId != null ? { targetId } : {}),
      ...(actorIp != null ? { actorIp } : {}),
      ...(actorUserAgent != null ? { actorUserAgent } : {}),
      ...(details != null ? { details } : {}),
    },
  });
}
