/** D1 allows at most 100 bound parameters per query; batch below that with headroom. */
export const ID_BATCH_SIZE = 90;

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

export async function collectInBatches<T>(
  ids: string[],
  run: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const results: T[] = [];

  for (const batch of chunk(ids, ID_BATCH_SIZE)) {
    results.push(...(await run(batch)));
  }

  return results;
}
