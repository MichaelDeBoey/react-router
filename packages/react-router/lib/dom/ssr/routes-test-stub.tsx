import * as React from "react";
import type {
  ActionFunction,
  LoaderFunction,
  unstable_InitialContext,
} from "../../router/utils";
import type {
  DataRouteObject,
  IndexRouteObject,
  NonIndexRouteObject,
} from "../../context";
import type { LinksFunction, MetaFunction, RouteModules } from "./routeModules";
import type { InitialEntry } from "../../router/history";
import type { HydrationState } from "../../router/router";
import { convertRoutesToDataRoutes } from "../../router/utils";
import type {
  AssetsManifest,
  FutureConfig,
  FrameworkContextObject,
} from "./entry";
import { Outlet, RouterProvider, createMemoryRouter } from "../../components";
import type { EntryRoute } from "./routes";
import { FrameworkContext } from "./components";

interface StubIndexRouteObject
  extends Omit<
    IndexRouteObject,
    "loader" | "action" | "element" | "errorElement" | "children"
  > {
  loader?: LoaderFunction;
  action?: ActionFunction;
  children?: StubRouteObject[];
  meta?: MetaFunction;
  links?: LinksFunction;
}

interface StubNonIndexRouteObject
  extends Omit<
    NonIndexRouteObject,
    "loader" | "action" | "element" | "errorElement" | "children"
  > {
  loader?: LoaderFunction;
  action?: ActionFunction;
  children?: StubRouteObject[];
  meta?: MetaFunction;
  links?: LinksFunction;
}

type StubRouteObject = StubIndexRouteObject | StubNonIndexRouteObject;

export interface RoutesTestStubProps {
  /**
   *  The initial entries in the history stack. This allows you to start a test with
   *  multiple locations already in the history stack (for testing a back navigation, etc.)
   *  The test will default to the last entry in initialEntries if no initialIndex is provided.
   *  e.g. initialEntries={["/home", "/about", "/contact"]}
   */
  initialEntries?: InitialEntry[];

  /**
   * The initial index in the history stack to render. This allows you to start a test at a specific entry.
   * It defaults to the last entry in initialEntries.
   * e.g.
   *   initialEntries: ["/", "/events/123"]
   *   initialIndex: 1 // start at "/events/123"
   */
  initialIndex?: number;

  /**
   *  Used to set the route's initial loader and action data.
   *  e.g. hydrationData={{
   *   loaderData: { "/contact": { locale: "en-US" } },
   *   actionData: { "/login": { errors: { email: "invalid email" } }}
   *  }}
   */
  hydrationData?: HydrationState;

  /**
   * Future flags mimicking the settings in react-router.config.ts
   */
  future?: Partial<FutureConfig>;
}

/**
 * @category Utils
 */
export function createRoutesStub(
  routes: StubRouteObject[],
  unstable_getContext?: () => unstable_InitialContext
) {
  return function RoutesTestStub({
    initialEntries,
    initialIndex,
    hydrationData,
    future,
  }: RoutesTestStubProps) {
    let routerRef = React.useRef<ReturnType<typeof createMemoryRouter>>();
    let remixContextRef = React.useRef<FrameworkContextObject>();

    if (routerRef.current == null) {
      remixContextRef.current = {
        future: {
          unstable_subResourceIntegrity:
            future?.unstable_subResourceIntegrity === true,
          unstable_middleware: future?.unstable_middleware === true,
        },
        manifest: {
          routes: {},
          entry: { imports: [], module: "" },
          url: "",
          version: "",
        },
        routeModules: {},
        ssr: false,
        isSpaMode: false,
      };

      // Update the routes to include context in the loader/action and populate
      // the manifest and routeModules during the walk
      let patched = processRoutes(
        // @ts-expect-error `StubRouteObject` is stricter about `loader`/`action`
        // types compared to `AgnosticRouteObject`
        convertRoutesToDataRoutes(routes, (r) => r),
        remixContextRef.current.manifest,
        remixContextRef.current.routeModules
      );
      routerRef.current = createMemoryRouter(patched, {
        unstable_getContext,
        initialEntries,
        initialIndex,
        hydrationData,
      });
    }

    return (
      <FrameworkContext.Provider value={remixContextRef.current}>
        <RouterProvider router={routerRef.current} />
      </FrameworkContext.Provider>
    );
  };
}

function processRoutes(
  routes: StubRouteObject[],
  manifest: AssetsManifest,
  routeModules: RouteModules,
  parentId?: string
): DataRouteObject[] {
  return routes.map((route) => {
    if (!route.id) {
      throw new Error(
        "Expected a route.id in @remix-run/testing processRoutes() function"
      );
    }

    let newRoute: DataRouteObject = {
      id: route.id,
      path: route.path,
      index: route.index,
      Component: route.Component,
      HydrateFallback: route.HydrateFallback,
      ErrorBoundary: route.ErrorBoundary,
      action: route.action,
      loader: route.loader,
      handle: route.handle,
      shouldRevalidate: route.shouldRevalidate,
    };

    // Add the EntryRoute to the manifest
    let entryRoute: EntryRoute = {
      id: route.id,
      path: route.path,
      index: route.index,
      parentId,
      hasAction: route.action != null,
      hasLoader: route.loader != null,
      // When testing routes, you should be stubbing loader/action/middleware,
      // not trying to re-implement the full loader/clientLoader/SSR/hydration
      // flow. That is better tested via E2E tests.
      hasClientAction: false,
      hasClientLoader: false,
      hasClientMiddleware: false,
      hasErrorBoundary: route.ErrorBoundary != null,
      // any need for these?
      module: "build/stub-path-to-module.js",
      clientActionModule: undefined,
      clientLoaderModule: undefined,
      clientMiddlewareModule: undefined,
      hydrateFallbackModule: undefined,
    };
    manifest.routes[newRoute.id] = entryRoute;

    // Add the route to routeModules
    routeModules[route.id] = {
      default: route.Component || Outlet,
      ErrorBoundary: route.ErrorBoundary || undefined,
      handle: route.handle,
      links: route.links,
      meta: route.meta,
      shouldRevalidate: route.shouldRevalidate,
    };

    if (route.children) {
      newRoute.children = processRoutes(
        route.children,
        manifest,
        routeModules,
        newRoute.id
      );
    }

    return newRoute;
  });
}
