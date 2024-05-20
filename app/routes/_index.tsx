import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { K8sClient, catchErrorResponse } from "~/lib/k8s/client";

import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { HelmRelease } from "@kubernetes-models/flux-cd/helm.toolkit.fluxcd.io/v2beta2";
import Icon from "~/components/icon";
import clsx from "clsx";
import { V1Pod } from "@kubernetes/client-node";
import { buttonVariants } from "~/components/ui/button";
import {
  icon,
  lastStatus,
  objectFilter,
  podStatusToColor,
} from "~/lib/k8s/utils";

import { $path } from "remix-routes";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

export const meta: MetaFunction = () => {
  return [{ title: "ClickOps" }, { name: "description", content: "ClickOps" }];
};

export async function loader() {
  const client = new K8sClient();
  try {
    const pods = await client.listPods();
    const releases = await client.listHRs();
    const ingress = await client.listIngress();

    return {
      releases: releases.map((r) => ({
        release: r,
        pods: pods
          .filter((pod) => objectFilter(pod, r as HelmRelease))
          .sort((a, b) => {
            return (a.metadata?.creationTimestamp?.getTime() || 0) >
              (b.metadata?.creationTimestamp?.getTime() || 0)
              ? -1
              : 1;
          }),
        ingress: ingress.filter((ing) => objectFilter(ing, r as HelmRelease)),
      })),
    };
  } catch (e) {
    throw catchErrorResponse(e);
  }
}

const hrPodStatus = (pods: SerializeFrom<V1Pod>[]) => {
  const podsStatus = pods.map((pod) => lastStatus(pod));

  const podsReady = podsStatus.filter((status) => status?.status == "True");
  return podsStatus.length / podsReady.length;
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  const podLink = (pod) =>
    $path("/hr/:namespace/:instance/pod/:name", {
      namespace: pod.metadata.namespace!,
      instance: pod.metadata.labels?.["app.kubernetes.io/instance"] || "",
      name: pod.metadata.name,
    });
  return (
    <Card>
      <CardHeader className="px-7">
        <CardTitle>Flux Helm Releases</CardTitle>
        <CardDescription>
          Flux Helm Releases running in your cluster.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Release</TableHead>
              <TableHead className="hidden sm:table-cell">Namespace</TableHead>
              <TableHead className="">Ready</TableHead>
              <TableHead className="">Pods</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.releases
              .sort((a, b) => {
                // first sort by ready status, then pod status
                const aStatus = lastStatus(a.release)?.status;
                const bStatus = lastStatus(b.release)?.status;
                if (aStatus == "False" || bStatus == "False") {
                  return 1 * (aStatus == "True" ? 1 : -1);
                }
                const aPodsStatus = hrPodStatus(a.pods);
                const bPodsStatus = hrPodStatus(b.pods);
                if (aPodsStatus != bPodsStatus) {
                  return aPodsStatus - bPodsStatus;
                }
                const aName = a.release.metadata!.name!;
                const bName = b.release.metadata!.name!;
                return aName.localeCompare(bName);
              })
              .map(({ release, pods, ingress }) => (
                <TableRow key={release.metadata.uid}>
                  <TableCell>
                    <div className="font-medium">
                      <Link
                        to={$path("/hr/:namespace/:instance", {
                          namespace: release.metadata.namespace,
                          instance: release.metadata.name,
                        })}
                      >
                        {icon(release) ? <Icon icon={icon(release)} /> : null}
                        {release.metadata.name}
                      </Link>
                      <span>
                        {ingress.map((ing) => (
                          <a
                            key={ing?.metadata?.uid}
                            href={`http${
                              ing.spec?.tls ? "s" : ""
                            }://${ing.spec?.rules?.[0].host}`}
                            target="_blank"
                            rel="noreferrer"
                            className="first:ml-1 text-sm text-muted-foreground"
                          >
                            <Icon icon="external-link" />
                          </a>
                        ))}
                      </span>
                    </div>
                    {/* <div className="hidden text-sm text-muted-foreground md:inline">
                        {release.metadata.namespace} 
                      </div> */}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {release.metadata.namespace}
                  </TableCell>
                  {/* we want compact status without text */}
                  <TableCell className="table-cell sm:hidden">
                    <svg
                      className={clsx(
                        "h-4 w-4 fill-current",
                        lastStatus(release)?.status == "False"
                          ? "text-destructive"
                          : "text-success"
                      )}
                    >
                      <circle cx="8" cy="8" r="6" />
                    </svg>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {lastStatus(release)?.status == "False" ? (
                      <Badge className="text-xs" variant="destructive">
                        False
                      </Badge>
                    ) : (
                      <Badge className="text-xs" variant="success">
                        <span>True</span>
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="">
                    {pods.map((pod) => {
                      return (
                        <div
                          key={pod.metadata?.uid}
                          className="inline-block sm:block"
                        >
                          <Link to={podLink(pod)}>
                            <svg
                              className={clsx(
                                "ml-1 inline-block h-2 w-2 fill-current",
                                podStatusToColor(pod)
                              )}
                              viewBox="0 0 8 8"
                            >
                              <circle cx="4" cy="4" r="3" />
                            </svg>
                          </Link>
                          {pod?.metadata?.name && (
                            <Link
                              className={clsx(
                                buttonVariants({
                                  variant: "link",
                                  size: "link",
                                }),
                                "hidden sm:inline-block"
                              )}
                              to={podLink(pod)}
                            >
                              {pod.metadata?.name}
                            </Link>
                          )}
                          <span className="hidden sm:inline-block">
                            {dayjs(pod.metadata?.creationTimestamp).fromNow()}
                          </span>
                        </div>
                      );
                    })}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
