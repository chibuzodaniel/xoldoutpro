// documentNumber (a real government/business ID number) and internalNotes
// (moderator-only reasoning) must never reach a non-admin response — this is
// the one place both are stripped, so every route calls this instead of
// returning a raw Prisma row.
type RawApplication = Record<string, unknown> & { documentNumber?: string | null; internalNotes?: string | null };

export function serializeApplication<T extends RawApplication>(app: T, opts: { forAdmin: boolean }) {
  if (opts.forAdmin) return app;
  const rest = { ...app };
  delete rest.documentNumber;
  delete rest.internalNotes;
  return rest;
}

export function serializeApplications<T extends RawApplication>(apps: T[], opts: { forAdmin: boolean }) {
  return apps.map((app) => serializeApplication(app, opts));
}
