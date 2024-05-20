import { HelmRelease } from "@kubernetes-models/flux-cd/helm.toolkit.fluxcd.io/v2beta2";
import { CoreV1Event, V1Ingress, V1Pod } from "@kubernetes/client-node";

export interface KubernetesAPI {
  getPod(namespace: string, instance: string): Promise<V1Pod | undefined>;
  getPodEvents(namespace: string, instance: string): Promise<CoreV1Event[]>;

  getHR(namespace: string, instance: string): Promise<HelmRelease | undefined>;

  listHRs(): Promise<HelmRelease[]>;

  listHRPods(namespace: string, instance: string): Promise<V1Pod[]>;
  // listHRIngress(namespace: string, instance: string): Promise<V1Ingress[]>;

  // homepage: used for providing pod status from HRs. Getting all is more efficient for joining.
  listPods(): Promise<V1Pod[]>;
  // homepage: used for providing links to HRs. Getting all is more efficient for joining.
  listIngress(): Promise<V1Ingress[]>;

  reconcileHR(namespace: string, instance: string): Promise<void>;

  deletePod(namespace: string, name: string): Promise<void>;
}
