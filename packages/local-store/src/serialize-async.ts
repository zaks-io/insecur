const tailsBySlot = new Map<string, Promise<unknown>>();

export function serializeAsync<T>(operation: () => Promise<T>): () => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return () => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export function serializeAsyncBySlot<T>(
  slot: string,
  operation: () => Promise<T>,
): () => Promise<T> {
  return () => {
    const previous = tailsBySlot.get(slot) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tailsBySlot.set(slot, tail);
    return result;
  };
}
