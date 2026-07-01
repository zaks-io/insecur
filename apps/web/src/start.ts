import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({}));

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        nonce?: string;
      };
    };
  }
}
