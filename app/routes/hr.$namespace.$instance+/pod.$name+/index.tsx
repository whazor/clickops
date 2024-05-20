import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  SerializeFrom,
  redirect,
} from "@remix-run/node";
import { K8sClient, catchErrorResponse, loadk8s } from "~/lib/k8s/client";

import { CircleX, CreditCard, MoreVertical } from "lucide-react";

import { Button, buttonVariants } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Separator } from "~/components/ui/separator";
import { Link, useLoaderData } from "@remix-run/react";
import { CoreV1Event, V1Pod, V1PodList } from "@kubernetes/client-node";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import clsx from "clsx";
import { $path } from "remix-routes";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEventSource } from "remix-utils/sse/react";
import { useEffect, useState } from "react";
import { PodLogs } from "~/components/k8s/pod-logs";
dayjs.extend(relativeTime);

export const handle = {
  breadcrumb: ({ params }: SerializeFrom<typeof loader>) =>
    !!params ? (
      <Link
        to={$path("/hr/:namespace/:instance/pod/:name", {
          namespace: params.namespace!,
          name: params.name!,
          instance: params.instance!,
        })}
        className="text-primary"
      >
        Pod {params.name}
      </Link>
    ) : null,
};

export async function loader({ params }: LoaderFunctionArgs) {
  const client = new K8sClient();
  if (!params || !params.namespace || !params.name || !params.instance) {
    throw new Response("Invalid parameters", { status: 400 });
  }
  const { instance, namespace, name } = params;
  let pod = undefined;
  try {
    pod = await client.getPod(namespace, name);
  } catch (e) {
    // if a pod is not found, we don't want to throw an error
    console.error(e);
  }
  try {
    const otherPods = (await client.listHRPods(namespace, instance))
      .filter((p) => !!p?.metadata?.name)
      .map((p) => p!.metadata!.name!);

    return {
      instance,
      namespace,
      name,
      pod,
      otherPods,
    };
  } catch (e) {
    throw catchErrorResponse(e);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.formData();

  const namespace = body.get("namespace") as string;
  const instance = body.get("instance") as string;
  const name = body.get("name") as string;
  if (!name || !namespace || !instance) {
    throw new Error("Invalid parameters, no helm release or pod found");
  }

  const client = new K8sClient();
  await client.deletePod(namespace, name);

  return redirect(
    $path("/hr/:namespace/:instance", {
      namespace,
      instance,
    }),
  );
}

export default function Pod() {
  const { namespace, instance, name, pod, otherPods } =
    useLoaderData<typeof loader>();

  const OtherPods = (
    <div>
      {otherPods?.map((podName) => (
        <div key={podName}>
          <Link
            to={$path("/hr/:namespace/:instance/pod/:name", {
              namespace,
              instance,
              name: podName,
            })}
            className={buttonVariants({ variant: "link" })}
          >
            {pod?.metadata?.name}
          </Link>
        </div>
      ))}
    </div>
  );
  if (!pod || !pod?.metadata?.name) {
    return (
      <div>
        Pod not found. Check out other pods:
        {OtherPods}
      </div>
    );
  }
  return <PodView pod={pod} namespace={namespace} instance={instance} name={name} />;
}

function PodView({
  pod,
  namespace,
  instance,
  name
}: {
  pod: SerializeFrom<V1Pod>;
  namespace: string;
    instance: string;
    name: string;
}) {
  const [events, setEvents] = useState<Array<SerializeFrom<CoreV1Event>>>([]);
  const eventJSON = useEventSource(
    $path("/hr/:namespace/:instance/pod/:name/events", {
      namespace,
      instance,
      name,
    }),
    {
      event: "event",
    },
  );

  const status = useEventSource(
    $path("/hr/:namespace/:instance/pod/:name/state", {
      namespace,
      instance,
      name,
    }),
    {
      event: "status",
    },
  );
  useEffect(() => {
    if (eventJSON) {
      const event = JSON.parse(eventJSON) as SerializeFrom<CoreV1Event>;
      setEvents((prev) => {
        const allEvents = Object.fromEntries(prev.map((e) => [e.message, e]));
        if (event.message) {
          allEvents[event.message] = event;
        }
        return Object.values(allEvents);
      });
    }
  }, [eventJSON]);

  return (
    <div>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start bg-muted/50">
          <div className="grid gap-0.5">
            <CardTitle className="group flex items-center gap-2 text-lg">
              <svg
                aria-labelledby="status-phase"
                className={clsx(
                  "ml-1 inline-block h-2 w-2 fill-current",
                  pod?.status?.phase == "Running"
                    ? "text-success"
                    : pod?.status?.phase == "Pending"
                      ? "text-neutral-400"
                      : pod?.status?.phase == "Succeeded"
                        ? "text-neutral-400"
                        : "text-destructive",
                )}
                viewBox="0 0 8 8"
              >
                <circle cx="4" cy="4" r="3" />
              </svg>
              {pod.metadata?.name}
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
              {pod.metadata?.namespace} ·{" "}
              <span id="status-phase">{status || pod.status?.phase}</span>
            </CardDescription>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <form
              method="post"
              action={$path("/hr/:namespace/:instance/pod/:name", {
                namespace: namespace,
                instance: instance,
                name,
              })}
              className="flex items-center"
            >
              <input type="hidden" name="instance" value={instance} />
              <input type="hidden" name="namespace" value={namespace} />
              <input type="hidden" name="name" value={name} />

              <Button size="sm" variant="destructive" className="h-8 gap-1">
                <CircleX className="h-3.5 w-3.5" />
                <span className="lg:sr-only xl:not-sr-only xl:whitespace-nowrap">
                  Delete pod
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
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Export</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Trash</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> */}
          </div>
        </CardHeader>
        <CardContent className="p-6 text-sm">
          <h3 className="-mt-2 font-semibold tracking-tight group flex items-center gap-2 text-lg">
            Logs
          </h3>
          <PodLogs
            namespace={namespace}
            instance={instance}
            name={name}
          />
          <h3 className="mt-2 font-semibold tracking-tight group flex items-center gap-2 text-lg">
            Events
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events
                ?.map((event) => ({
                  ...event,
                  time: Math.max(
                    ...[
                      event.eventTime,
                      event.metadata.creationTimestamp,
                      event.series?.lastObservedTime,
                    ]
                      .filter(Boolean)
                      .map((t) => new Date(t as string).getTime()),
                  ),
                }))
                .sort((a, b) => {
                  return b.time - a.time;
                })
                .map((event) => (
                  <TableRow key={event.message || "" + event.eventTime || ""}>
                    <TableCell title={dayjs(event.time).format()}>
                      {event.time ? dayjs(event.time).fromNow() : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {event.type}
                      </div>
                      <div className="font-medium">{event.message}</div>
                    </TableCell>
                    <TableCell className="text-right"></TableCell>
                  </TableRow>
                ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>No events found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/*<div className="grid grid-cols-2 gap-4">
            <div className="grid gap-3">
              <div className="font-semibold">Shipping Information</div>
              <address className="grid gap-0.5 not-italic text-muted-foreground">
                <span>Liam Johnson</span>
                <span>1234 Main St.</span>
                <span>Anytown, CA 12345</span>
              </address>
            </div>
            <div className="grid auto-rows-max gap-3">
              <div className="font-semibold">Billing Information</div>
              <div className="text-muted-foreground">
                Same as shipping address
              </div>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid gap-3">
            <div className="font-semibold">Customer Information</div>
            <dl className="grid gap-3">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Customer</dt>
                <dd>Liam Johnson</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  <a href="mailto:">liam@acme.com</a>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  <a href="tel:">+1 234 567 890</a>
                </dd>
              </div>
            </dl>
          </div>
          <Separator className="my-4" />
          <div className="grid gap-3">
            <div className="font-semibold">Payment Information</div>
            <dl className="grid gap-3">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                  Visa
                </dt>
                <dd>**** **** **** 4532</dd>
              </div>
            </dl>
          </div>*/}
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
