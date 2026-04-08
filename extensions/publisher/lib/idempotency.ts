import type { PublishedPost } from './types.js';

export function assertCanPublish(
  existingPublication: PublishedPost | null,
  nextDryRun: boolean,
): void {
  if (!existingPublication) {
    return;
  }

  if (existingPublication.status === 'published') {
    throw new Error(
      `This run has already been published to ${existingPublication.platform}. Existing publication ID: ${existingPublication.id}`,
    );
  }

  if (existingPublication.status === 'dry_run' && nextDryRun) {
    throw new Error(
      `This run already has a dry-run publication for ${existingPublication.platform}. Reuse the existing record or publish for real.`,
    );
  }
}
