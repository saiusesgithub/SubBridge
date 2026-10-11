export interface AvailableModel { id: string; available: boolean }

/** Preserve a user's explicit ID when a provider cannot enumerate or still advertises it. */
export function chooseModel(models: AvailableModel[], previous: string): string {
  if (!models.length) return previous;
  if (previous && models.some((model) => model.available && model.id === previous)) return previous;
  return models.find((model) => model.available)?.id ?? "";
}
