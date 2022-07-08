import type { RouteMatch } from "./routeMatching";
import type { ServerRoute } from "./routes";
import { json, isResponse, isRedirectResponse } from "./responses";

/**
 * An object of arbitrary for route loaders and actions provided by the
 * server's `getLoadContext()` function.
 */
export type AppLoadContext = any;

/**
 * Data for a route that was returned from a `loader()`.
 */
export type AppData = any;

export async function callRouteAction({
  loadContext,
  route,
  params,
  request,
}: {
  loadContext: unknown;
  route: Omit<ServerRoute, "children">;
  params: RouteMatch<ServerRoute>["params"];
  request: Request;
}) {
  let action = route.module.action;

  if (!action) {
    let response = new Response(null, { status: 405 });
    response.headers.set("X-Remix-Catch", "yes");
    return response;
  }

  let result;
  try {
    result = await action({
      request: stripDataParam(stripIndexParam(request)),
      context: loadContext,
      params,
    });
  } catch (error: unknown) {
    if (!isResponse(error)) {
      throw error;
    }

    if (!isRedirectResponse(error)) {
      error.headers.set("X-Remix-Catch", "yes");
      throw error;
    }

    result = error;
  }

  if (result === undefined) {
    throw new Error(
      `You defined an action for route "${route.id}" but didn't return ` +
        `anything from your \`action\` function. Please return a value or \`null\`.`
    );
  }

  return isResponse(result) ? result : json(result);
}

export async function callRouteLoader({
  loadContext,
  route,
  params,
  request,
}: {
  request: Request;
  route: Omit<ServerRoute, "children">;
  params: RouteMatch<ServerRoute>["params"];
  loadContext: unknown;
}) {
  let loader = route.module.loader;

  if (!loader) {
    throw new Error(
      `You made a ${request.method} request to ${request.url} but did not provide ` +
        `a default component or \`loader\` for route "${route.id}", ` +
        `so there is no way to handle the request.`
    );
  }

  let result;

  // TODO: Do we even need to wrap this anymore?
  try {
    result = await loader({
      request: stripDataParam(stripIndexParam(request)),
      context: loadContext,
      params,
    });
  } catch (error: unknown) {
    if (!isResponse(error)) {
      throw error;
    }

    if (!isRedirectResponse(error)) {
      error.headers.set("X-Remix-Catch", "yes");
      throw error;
    }

    result = error;
  }

  if (result === undefined) {
    throw new Error(
      `You defined a loader for route "${route.id}" but didn't return ` +
        `anything from your \`loader\` function. Please return a value or \`null\`.`
    );
  }

  return isResponse(result) ? result : json(result);
}

function stripIndexParam(request: Request) {
  let url = new URL(request.url);
  let indexValues = url.searchParams.getAll("index");
  url.searchParams.delete("index");
  let indexValuesToKeep = [];
  for (let indexValue of indexValues) {
    if (indexValue) {
      indexValuesToKeep.push(indexValue);
    }
  }
  for (let toKeep of indexValuesToKeep) {
    url.searchParams.append("index", toKeep);
  }

  return new Request(url.href, request);
}

function stripDataParam(request: Request) {
  let url = new URL(request.url);
  url.searchParams.delete("_data");
  return new Request(url.href, request);
}

export function extractData(response: Response): Promise<unknown> {
  let contentType = response.headers.get("Content-Type");

  if (contentType && /\bapplication\/json\b/.test(contentType)) {
    return response.json();
  }

  // What other data types do we need to handle here? What other kinds of
  // responses are people going to be returning from their loaders?
  // - application/x-www-form-urlencoded ?
  // - multipart/form-data ?
  // - binary (audio/video) ?

  return response.text();
}
