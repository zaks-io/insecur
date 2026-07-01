import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

function readCspNonceFromRequestContext(): string | undefined {
  try {
    const context = getGlobalStartContext();
    const nonce = context?.nonce;
    return typeof nonce === "string" && nonce.length > 0 ? nonce : undefined;
  } catch {
    return undefined;
  }
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  const nonce = readCspNonceFromRequestContext();
  if (nonce) {
    router.update({ ssr: { nonce } });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
