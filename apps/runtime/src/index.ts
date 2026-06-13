export { RuntimeService } from "./runtime-service.js";

/**
 * The Runtime Worker has no public product routes (ADR-0077). It is reached only over the private
 * Service Binding via the `RuntimeService` RPC entrypoint; any direct fetch is a misroute.
 */
export default {
  fetch(): Response {
    return new Response("not found", { status: 404 });
  },
};
