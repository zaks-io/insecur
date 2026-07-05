const flightsBySlot = new Map<string, Promise<unknown>>();

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

export function singleFlightBySlot<T>(slot: string, operation: () => Promise<T>): () => Promise<T> {
  return () => {
    const inFlight = flightsBySlot.get(slot);
    if (inFlight !== undefined) {
      return inFlight as Promise<T>;
    }

    const pending = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        if (flightsBySlot.get(slot) === pending) {
          flightsBySlot.delete(slot);
        }
        throw error;
      });

    flightsBySlot.set(slot, pending);
    return pending;
  };
}
