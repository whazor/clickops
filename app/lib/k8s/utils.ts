import { HelmRelease } from "@kubernetes-models/flux-cd/helm.toolkit.fluxcd.io/v2beta2/HelmRelease";
import { V1ObjectMeta, V1Pod } from "@kubernetes/client-node";
import { SerializeFrom } from "@remix-run/node";
import { match } from "../utils";

export const icon = (release: HelmRelease) =>
  release?.spec?.values?.ingress?.main?.annotations?.["hajimari.io/icon"];

export const lastStatus = (release: HelmRelease | SerializeFrom<V1Pod>) =>
  release?.status?.conditions?.[release?.status?.conditions?.length - 1];

export const objectFilter = <O extends { metadata?: V1ObjectMeta }>(
  obj: O,
  release: HelmRelease,
) =>
  !!release?.metadata?.name &&
  obj?.metadata?.namespace == release?.metadata?.namespace &&
  obj?.metadata?.labels?.["app.kubernetes.io/instance"] ==
    release?.metadata?.name;

export const podStatusToColor = (pod: V1Pod | SerializeFrom<V1Pod>) =>
  match(pod?.status?.phase, {
    Running: "text-success",
    Pending: "text-neutral-400",
    Succeeded: "text-neutral-400",
    Failed: "text-destructive",
    _: "text-neutral-400",
  });
