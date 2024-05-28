import { SerializeFrom, defer, type LoaderFunctionArgs } from "@remix-run/node";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense, useEffect, useState } from "react";
import { Conditions } from "~/components/k8s/conditions";
import { Link } from "@remix-run/react";
import { $path } from "remix-routes";

import { K8sClient, catchErrorResponse } from "~/lib/k8s/client";
import { buttonVariants } from "~/components/ui/button";
import clsx from "clsx";
import { lastStatus, podStatusToColor } from "~/lib/k8s/utils";

async function didReconcile() {
  // wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return "ok";
}

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEventSource } from "remix-utils/sse/react";
import { V1Pod } from "@kubernetes/client-node";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
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


    const kustNamespace = helmRelease.metadata?.labels?.["kustomize.toolkit.fluxcd.io/namespace"];
    const kustName = helmRelease.metadata?.labels?.["kustomize.toolkit.fluxcd.io/name"];

    const kustomization = kustNamespace && kustName ? client.getKustomization(kustNamespace, kustName) : undefined;
    const gitRepo = kustomization?.then(async kust => {
      const sourceRef = kust?.spec?.sourceRef;
      if (!sourceRef || sourceRef.kind !== "GitRepository") return undefined;
      const namespace = sourceRef.namespace || kust?.metadata?.namespace || kustNamespace;
      if (!namespace) return undefined;

      return await client.getGitRepo(namespace, sourceRef.name)
    })
    const pods = client.listHRPods(
      namespace,
      instance
    );
    return defer({
      params: {
        namespace: namespace,
        instance: instance,
      },
      helmRelease,
      kustomization,
      status,
      gitRepo,
      pods
    });
  } catch (e) {
    throw catchErrorResponse(e);
  }
}
function Loading() {
  return <Badge className="text-xs ml-2" variant="outline">
    <div className="animate-pulse h-2 bg-slate-200 rounded w-6 my-1"></div>
  </Badge>;
}
export default function HRView() {
  const { helmRelease, kustomization, gitRepo, params, pods: initPods, status } = useLoaderData<typeof loader>();

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
      <Accordion type="multiple" collapsible>
        <AccordionItem value="item-hr">
          <AccordionTrigger>
            <span>Helm release            {lastStatus(helmRelease)?.status == "False" ? (
              <Badge className="text-xs" variant="destructive">
                False
              </Badge>
            ) : (
              <Badge className="text-xs" variant="success">
                <span>True</span>
              </Badge>
            )}</span>

          </AccordionTrigger>
          <AccordionContent>
            <h3>Conditions</h3>
            <Conditions
              namespace={params.namespace!}
              instance={params.instance!}
              conditions={helmRelease?.status?.conditions}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-pods">
          <AccordionTrigger className="group">
            <span>
              Pods
              <span className="group-data-[state=open]:hidden">
                {pods.map(pod =>
                  <svg key={pod.metadata!.name + "indicator"}
                    className={clsx(
                      "ml-2 inline-block h-2 w-2 fill-current",
                      podStatusToColor(pod),
                    )}
                    viewBox="0 0 8 8"
                  >
                    <circle cx="4" cy="4" r="3" />
                  </svg>)}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="item-1">
          <AccordionTrigger>
            <span>Kustomization
              <Suspense fallback={<Loading />}>
                <Await resolve={kustomization}>
                  {(kustomization) => <>
                    {lastStatus(kustomization)?.status == "False" ? (
                      <Badge className="text-xs ml-2" variant="destructive">
                        False
                      </Badge>
                    ) : (
                      <Badge className="text-xs ml-2" variant="success">
                        True
                      </Badge>
                    )}
                  </>}
                </Await>
              </Suspense></span>

          </AccordionTrigger>
          <AccordionContent>
            <Suspense fallback={<Loading />}>
              <Await resolve={kustomization}>
                {(kustomization) => <Conditions conditions={kustomization?.status?.conditions} />}
              </Await>
            </Suspense>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>
            <span> Git source
              <Suspense fallback={<Loading />}>
                <Await resolve={gitRepo}>
                  {(gitRepo) => <>
                    {lastStatus(gitRepo)?.status == "False" ? (
                      <Badge className="text-xs ml-2" variant="destructive">
                        False
                      </Badge>
                    ) : (
                      <Badge className="text-xs ml-2" variant="success">
                        <span>True</span>
                      </Badge>
                    )}
                  </>}
                </Await>
              </Suspense>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Suspense fallback={<Loading />}>
              <Await resolve={gitRepo}>
                {(gitRepo) => <Conditions conditions={gitRepo?.status?.conditions} />}
              </Await>
            </Suspense>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
