export interface AvailableModel { id: string; available?: boolean; availability?: "advertised" | "verified" | "unknown"; is_default?: boolean }

/** Preserve a user's explicit ID when a provider cannot enumerate or still advertises it. */
export function chooseModel(models: AvailableModel[], previous: string): string {
  if (!models.length) return previous;
  const selectable = (model: AvailableModel) => model.available === true || model.availability === "advertised" || model.availability === "verified" || model.availability === "unknown";
  if (previous && models.some((model) => selectable(model) && model.id === previous)) return previous;
  return models.find((model) => model.is_default && selectable(model))?.id ?? models.find(selectable)?.id ?? "";
}
