import { SerializeFrom, defer, type LoaderFunctionArgs } from "@remix-run/node";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense, useEffect, useState } from "react";
import { Conditions } from "~/components/k8s/conditions";
import { Link } from "@remix-run/react";
import { $path } from "remix-routes";

import { K8sClient, catchErrorResponse } from "~/lib/k8s/client";
import { buttonVariants } from "~/components/ui/button";
import clsx from "clsx";
import { podStatusToColor } from "~/lib/k8s/utils";

async function didReconcile() {
  // wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return "ok";
}

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEventSource } from "remix-utils/sse/react";
import { V1Pod } from "@kubernetes/client-node";
dayjs.extend(relativeTime);

export async function loader({ params }: LoaderFunctionArgs) {
  const client = new K8sClient();
  if (!params || !params.namespace || !params.instance) {
    throw new Error("Invalid parameters, no helm release found");
  }
  const { instance, namespace } = params;
  try {
    const helmRelease = await client.getHR(namespace, instance);
    if (!helmRelease) {
      throw new Error("Helm release not found");
    }

    // if reconcile.fluxcd.io/requestedAt annotation is found, we are in the process of reconciling
    const isReconciling =
      !!helmRelease?.metadata?.annotations?.["reconcile.fluxcd.io/requestedAt"];

    const status = isReconciling ? didReconcile() : "ok";

    // const pods = await client.listHRPods(
    //   namespace,
    //   instance
    // );

    return defer({
      params: {
        namespace: namespace,
        instance: instance,
      },
      helmRelease,

      status,
      // pods
    });
  } catch (e) {
    throw catchErrorResponse(e);
  }
}

export default function HRView() {
  const { helmRelease, params, status } = useLoaderData<typeof loader>();

  const [pods, setPods] = useState<SerializeFrom<V1Pod>[]>([]);
  const podJSON = useEventSource(
    $path("/hr/:namespace/:instance/pods", params),
    {
      event: "pod",
    },
  );
  useEffect(() => {
    if (podJSON) {
      const { name, pod } = JSON.parse(podJSON) as {
        name: string;
        pod?: SerializeFrom<V1Pod>;
      };
      if (!pod) {
        setPods((prev) => prev.filter((p) => p.metadata!.name !== name));
      } else {
        setPods((prev) =>
          Object.values({
            ...Object.fromEntries(prev.map((p) => [p.metadata!.name!, p])),
            [name]: pod,
          }),
        );
      }
    }
  }, [podJSON]);

  return (
    <div>
      <h3>Pods</h3>
      {/* <Suspense fallback={<div>Loading...</div>}>
        <Await resolve={status}>
          {(status) => <div>{status}</div>}
        </Await>
      </Suspense> */}

      <ul>
        {pods.map((pod) => (
          <li key={params.namespace + pod.metadata!.name!}>
            <svg
              className={clsx(
                "ml-1 inline-block h-2 w-2 fill-current",
                podStatusToColor(pod),
              )}
              viewBox="0 0 8 8"
            >
              <circle cx="4" cy="4" r="3" />
            </svg>
            <Link
              className={buttonVariants({ variant: "link", size: "link" })}
              to={$path("/hr/:namespace/:instance/pod/:name", {
                ...params,
                name: pod.metadata!.name!,
              })}
            >
              {pod.metadata?.name}
            </Link>
            <span>{dayjs(pod.metadata?.creationTimestamp).fromNow()}</span>
          </li>
        ))}
      </ul>

      <Conditions
        namespace={params.namespace!}
        instance={params.instance!}
        conditions={helmRelease?.status?.conditions}
      />

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
    </div>
  );
}
