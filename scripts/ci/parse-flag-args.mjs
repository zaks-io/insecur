export function parseFlagArgs(argv, { flags, defaults = {}, required = [] }) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    const value = argv[index + 1];
    if (!key || !value) {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
    args[key] = value;
    index += 1;
  }
  for (const [flag, key] of Object.entries(flags)) {
    if (required.includes(key) && !args[key]) {
      throw new Error(`${flag} is required`);
    }
  }
  return args;
}
