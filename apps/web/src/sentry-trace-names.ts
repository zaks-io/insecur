import { sentryRouterTraceNames } from "@insecur/observability";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const sentryTraceNames = sentryRouterTraceNames(
  createRouter({ routeTree, history: createMemoryHistory() }),
);
