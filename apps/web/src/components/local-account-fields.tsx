import { Button } from "@insecur/ui";
import type { LocalAccount } from "../auth/local-login.js";

export function LocalAccountFields({ accounts }: { readonly accounts: readonly LocalAccount[] }) {
  return (
    <>
      <label htmlFor="local-account" className="text-sm font-medium">
        Test account
      </label>
      <select
        id="local-account"
        name="local-account"
        className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        required
        disabled={accounts.length === 0}
      >
        {accounts.map((account) => (
          <option key={account.subject} value={account.subject}>
            {account.displayName}
          </option>
        ))}
      </select>
      <p className="text-sm text-muted-foreground">Local development sign-in.</p>
      {accounts.length === 0 ? <p role="status">No test accounts are available.</p> : null}
      <Button type="submit" disabled={accounts.length === 0}>
        Continue to sign in
      </Button>
    </>
  );
}
