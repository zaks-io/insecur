export function formatCliError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runCliMain(main) {
  try {
    await main();
  } catch (error) {
    console.error(formatCliError(error));
    process.exit(1);
  }
}
