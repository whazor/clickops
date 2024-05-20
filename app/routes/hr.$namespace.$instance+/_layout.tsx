import {
  ActionFunctionArgs,
  SerializeFrom,
  defer,
  redirect,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Await, Link, Outlet, useLoaderData } from "@remix-run/react";

import { RotateCcw, MoreVertical } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "~/components/ui/dropdown-menu";
import { K8sClient, catchErrorResponse } from "~/lib/k8s/client";
import { $path } from "remix-routes";
import { Suspense } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";

export const handle = {
  breadcrumb: ({ params }: SerializeFrom<typeof loader>) => (
    <Link
      to={$path("/hr/:namespace/:instance", {
        namespace: params.namespace,
        instance: params.instance,
      })}
      className="text-primary"
    >
      {params.instance}
    </Link>
  ),
};

const group = "helm.toolkit.fluxcd.io";
const version = "v2beta2";

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params || !params.namespace || !params.instance) {
    throw new Error("Invalid parameters, no helm release found");
  }

  const { instance, namespace } = params;
  const k8sClient = new K8sClient();
  try {
    const helmRelease = await k8sClient.getHR(namespace, instance);
    if (!helmRelease) {
      throw new Error("Helm release not found");
    }

    const pods = await k8sClient.listHRPods(namespace, instance);

    const allResources = k8sClient.listHRResources(namespace, instance);

    return defer({
      params: {
        namespace,
        instance,
      },
      pods,
      group,
      version,
      helmRelease,
      allResources,
    });
  } catch (e) {
    throw catchErrorResponse(e);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.formData();
  // const todo = await fakeCreateTodo({
  //   title: body.get("title"),
  // });
  // return redirect(`/todos/${todo.id}`);
  // add annotation reconcile.fluxcd.io/requestedAt with RFC3339Nano time
  const instance = body.get("instance") as string;
  const namespace = body.get("namespace") as string;
  if (!instance || !namespace) {
    throw new Error("Invalid parameters, no helm release found");
  }

  const client = new K8sClient();
  await client.reconcileHR(namespace, instance);

  return redirect(`/hr/${namespace}/${instance}`);
}

export default function HRView() {
  const { helmRelease, params, allResources } = useLoaderData<typeof loader>();
  return (
    <div>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start bg-muted/50">
          <div className="grid gap-0.5">
            <CardTitle className="group flex items-center gap-2 text-lg">
              {/* <svg
                aria-labelledby="status-phase"
                className={clsx(
                  "ml-1 inline-block h-2 w-2 fill-current",
                  pod?.status?.phase == "Running"
                    ? "text-success"
                    : pod?.status?.phase == "Pending"
                    ? "text-neutral-400"
                    : pod?.status?.phase == "Succeeded"
                    ? "text-neutral-400"
                    : "text-destructive"
                )}
                viewBox="0 0 8 8"
              >
                <circle cx="4" cy="4" r="3" />
              </svg> */}
              <Link
                to={$path("/hr/:namespace/:instance", {
                  namespace: helmRelease.metadata!.namespace!,
                  instance: helmRelease.metadata!.name!,
                })}
              >
                {helmRelease.metadata?.name}
              </Link>
              {/* <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Copy className="h-3 w-3" />
                      <span className="sr-only">Copy Order ID</span>
                    </Button> */}
            </CardTitle>
            <CardDescription>
              {helmRelease.metadata?.namespace} ·{" "}
              {/* <span id="status-phase">{pod.status?.phase}</span> */}
            </CardDescription>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <form
              method="post"
              action={$path("/hr/:namespace/:instance", {
                namespace: params.namespace,
                instance: params.instance,
              })}
              className="flex items-center"
            >
              <input type="hidden" name="instance" value={params.instance} />
              <input type="hidden" name="namespace" value={params.namespace} />
              <Button size="sm" className="h-8 gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="lg:sr-only xl:not-sr-only xl:whitespace-nowrap">
                  Reconcile
                </span>
              </Button>
            </form>
            {/* <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8">
                  <MoreVertical className="h-3.5 w-3.5" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Suspend</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Uninstall</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> */}
          </div>
        </CardHeader>
        <CardContent className="p-6 text-sm">
          <div className="mb-2">
            <Suspense fallback={<div>Loading...</div>}>
              <Await resolve={allResources}>
                {(allResources) => {
                  return (
                    // <div>
                    //   <h3>Data:</h3>
                    //   {/* {data.map((resource) => (
                    //     <div key={resource.metadata!.name}>
                    //       <pre>{JSON.stringify(resource, null, 2)}</pre>
                    //     </div>
                    //   ))} */}
                    //   <pre>{JSON.stringify(allResources, null, 2)}</pre>
                    // </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">Resources</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {/* <ScrollArea className="max-h-96 overflow-y-auto"> */}
                        {allResources.map((resource) => (
                          <DropdownMenuSub
                            key={resource.apiVersion + resource.kind}
                          >
                            <DropdownMenuSubTrigger>
                              {resource.kind}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                {resource.items.map((item) => (
                                  <DropdownMenuItem
                                    key={item.metadata!.name}
                                    asChild
                                  >
                                    <Link
                                      to={`/hr/${params.namespace}/${params.instance}/resources/${resource.apiVersion}/${resource.kind}/${item.metadata!.name}`}
                                      className="flex items-center gap-1"
                                    >
                                      {item.metadata!.name}
                                    </Link>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        ))}
                        {/* </ScrollArea> */}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }}
              </Await>
            </Suspense>
          </div>
          <Outlet />
        </CardContent>
        <CardFooter className="flex flex-row items-center border-t bg-muted/50 px-6 py-3">
          {/* <div className="text-xs text-muted-foreground">
                  Updated <time dateTime="2023-11-23">November 23, 2023</time>
                </div> */}
        </CardFooter>
      </Card>
    </div>
  );
}
