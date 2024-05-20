import { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  UIMatch,
  isRouteErrorResponse,
  useLoaderData,
  useMatches,
  useRouteError,
} from "@remix-run/react";
import stylesheet from "~/tailwind.css?url";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb";
import { themeSessionResolver } from "./sessions.server";
import {
  PreventFlashOnWrongTheme,
  Theme,
  ThemeProvider,
  useTheme,
} from "remix-themes";
import clsx from "clsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Button } from "./components/ui/button";
import { AlertCircle, Moon, Sun } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "~/components/ui/navigation-menu";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Fragment } from "react/jsx-runtime";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { getTheme } = await themeSessionResolver(request);
  return {
    theme: getTheme(),
  };
}

export default function AppWithProviders() {
  const data = useLoaderData<typeof loader>();
  return (
    <ThemeProvider specifiedTheme={data.theme} themeAction="/action/set-theme">
      <Layout>
        <Outlet />
      </Layout>
    </ThemeProvider>
  );
}

type BreadCrumbItem = {
  breadcrumb: (data: any) => React.ReactNode;
};

function Navigation(props: { setTheme?: (theme: Theme) => void }) {
  return (
    <>
      {!!props.setTheme && (
        <div className="float-right -mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => props.setTheme(Theme.LIGHT)}>
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.setTheme(Theme.DARK)}>
                Dark
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <NavigationMenu className="m-3">
        <NavigationMenuList className="flex w-full">
          <NavigationMenuItem>ClickOps</NavigationMenuItem>

          <li className="grow" />

          <NavigationMenuItem className="float-right"></NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorView>
        <div>
          <h1>
            {error.status} {error.statusText}
          </h1>
          <p>
            <pre>{error.data}</pre>
          </p>
        </div>
      </ErrorView>
    );
  } else if (error instanceof Error) {
    return (
      <ErrorView>
        <div>
          <h1>Error</h1>
          <p>{error.message}</p>
          <p>The stack trace is:</p>
          <pre>{error.stack}</pre>
        </div>
      </ErrorView>
    );
  } else {
    return (
      <ErrorView>
        <h1>Unknown Error</h1>
      </ErrorView>
    );
  }
}

function hasBreadcrumb(
  m: UIMatch<unknown, unknown>,
): m is UIMatch<unknown, BreadCrumbItem> {
  return (
    !!m.handle &&
    typeof m.handle === "object" &&
    "breadcrumb" in m.handle &&
    !!m.handle.breadcrumb
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const matches = useMatches() as any[];

  const data = useLoaderData<typeof loader>();
  const [theme, setTheme] = useTheme();

  const breadcrumb = matches.filter(hasBreadcrumb);

  return (
    <html lang="en" className={clsx(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} />

        <Links />
      </head>
      <body>
        <div className="m-3">
          <Navigation setTheme={setTheme} />

          {breadcrumb.length > 0 && (
            <Breadcrumb className="m-3">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumb.map((m, i) => (
                  <Fragment key={m.pathname + i}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        {m.handle.breadcrumb(m.data)}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}

          {children}
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorView(props: {
  children: React.ReactNode;
  title?: string;
}) {
  const theme = "dark";

  return (
    <html lang="en" className={clsx(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {props.title ? <title>{props.title}</title> : null}
        <Meta />
        <Links />
      </head>
      <body>
        <div className="m-3">
          <Navigation />
          <Breadcrumb className="m-3">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <span>Error</span>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{props.children}</AlertDescription>
          </Alert>

          <Scripts />
        </div>
      </body>
    </html>
  );
}

/*
export default function App() {
  return <Outlet />;
}*/
