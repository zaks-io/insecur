const DEADLOCK_DETECTED = "40P01";

export async function retryPostgresDeadlock(
  operation,
  { attempts = 6, delayMs = 250, sleep = defaultSleep } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error?.code !== DEADLOCK_DETECTED || attempt === attempts) {
        throw error;
      }
      console.warn(`Postgres deadlock detected; retrying migration step (${attempt}/${attempts})`);
      await sleep(delayMs * attempt);
    }
  }
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
