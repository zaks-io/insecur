import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/** Prompts for explicit yes/no confirmation on an interactive TTY. */
export async function readConfirmPrompt(prompt: string): Promise<boolean> {
  if (!input.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
