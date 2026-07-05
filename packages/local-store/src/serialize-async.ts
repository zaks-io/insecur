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
