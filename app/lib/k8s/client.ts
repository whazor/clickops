import k8s, {
  CoreV1Event,
  V1CustomResourceDefinition,
  V1Pod,
} from "@kubernetes/client-node";
import { KubernetesAPI } from "./interface";
import dayjs from "dayjs";
import { HelmRelease } from "@kubernetes-models/flux-cd/helm.toolkit.fluxcd.io/v2beta2";
import { Kustomization } from "@kubernetes-models/flux-cd/kustomize.toolkit.fluxcd.io/v1";
import { GitRepository } from "@kubernetes-models/flux-cd/source.toolkit.fluxcd.io/v1";
import { Log, LogsAPI } from "../logs/interface";
import https from "https";

function kcConfig() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc;
}
const kc = kcConfig();

export function catchK8SError<O>(func: () => O): O {
  try {
    return func();
  } catch (e: Error) {
    throw catchErrorResponse(e);
  }
}

export function catchErrorResponse(e: Error) {
  const errorMessage = `
    Something went wrong when performing the kubernetes requests.

    Kubernetes config is loaded from:
    1. environment variable $KUBECONFIG
    2. $HOME/.kube/config
    3. /var/run/secrets/kubernetes.io/serviceaccount/token
    4. environment variable $TOKEN_FILE_PATH
    5. no login to http://localhost:8080

    ${e.message}
    ${e.stack}
  `;
  return new Response(errorMessage, {
    status: 500,
  });
}

function loadk8s() {
  return catchK8SError(() => kc.makeApiClient(k8s.CoreV1Api));
}

// networking
function loadk8sNetworking() {
  return catchK8SError(() => kc.makeApiClient(k8s.NetworkingV1Api));
}

function loadk8sCustomObjectsApi() {
  return catchK8SError(() => kc.makeApiClient(k8s.CustomObjectsApi));
}

function loadk8sapiresources() {
  return catchK8SError(() => kc.makeApiClient(k8s.DiscoveryApi));
}

function loadk8sapis() {
  return catchK8SError(() => kc.makeApiClient(k8s.ApisApi));
}

function loadKubeCTL() {
  return async (...args: string[]) => {
    const { $ } = await import("zx");
    return await $`kubectl ${args}`;
  };
}

function loadHelm() {
  return async (...args: string[]) => {
    const { $ } = await import("zx");
    return await $`helm ${args}`;
  };
}

function customK8SRequest() {
  const options = {};

  return (url: string) => {
    return new Promise((resolve, reject) => {
      const server = new URL(kc.getCurrentCluster()!.server!);
      kc.applyToHTTPSOptions(options);
      const opts = {
        ...options,
        method: "GET",
        path: url,
        host: server.hostname,
        port: server.port,
      };
      const req = https.request(opts, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error("statusCode=" + res.statusCode));
        }
        let data: Uint8Array[] = [];
        res.on("data", (chunk) => {
          data.push(chunk);
        });
        res.on("end", () => {
          resolve(JSON.parse(Buffer.concat(data).toString()));
        });
      });
      req.on("error", (e) => {
        reject(e);
      });
      req.end();
    });
  };
}

const group = "helm.toolkit.fluxcd.io";
const defaultVersion = "v2";

type ObjectItem = {
  apiVersion: string;
  kind: string;
  metadata: object;
  spec?: object;
};

type VersionMap = Record<string, string | undefined>
let versionCache: VersionMap | null;

export class K8sClient implements KubernetesAPI, LogsAPI {
  async getKustomization(namespace: string, name: string): Promise<Kustomization | undefined> {
    const group = "kustomize.toolkit.fluxcd.io";
    const k8sCustApi = loadk8sCustomObjectsApi();
    const apis = await this.listAPIs();
    const version = apis[group] || defaultVersion;
    const kust = await k8sCustApi.getNamespacedCustomObject({
      group,
      version,
      plural: "kustomizations",
      namespace,
      name,
    });
    if (!kust) return;
    return kust as Kustomization;
  }
  async getGitRepo(namespace: string, name: string): Promise<GitRepository | undefined> {
    const group = "source.toolkit.fluxcd.io";
    const k8sCustApi = loadk8sCustomObjectsApi();
    const apis = await this.listAPIs();
    const version = apis[group] || "v1";
    const repo = await k8sCustApi.getNamespacedCustomObject({
      group,
      version,
      plural: "gitrepositories",
      namespace,
      name,
    })
    if (!repo) return;
    return repo;
  }
  async listAPIs(): Promise<VersionMap> {
    const apis = loadk8sapis();
    let res = versionCache;
    if (!res) {
      const versions = await apis.getAPIVersions()
      res = versionCache = Object.fromEntries(versions.groups.map(
        group => (
          [group.name, group.preferredVersion?.version]
        )
      ));
    }
    return res;
  }
  async listHRResources(
    namespace: string,
    instance: string
  ): Promise<
    {
      apiVersion: string;
      kind: string;
      items: ObjectItem[];
    }[]
  > {
    // helm -n kube-system status clickops --show-resources --output json
    const helm = loadHelm();
    const info = await helm(
      "-n",
      namespace,
      "status",
      instance,
      "--show-resources",
      "--output",
      "json"
    );

    // 'v1/ServiceMonitor': [ { apiVersion: 'monitoring.coreos.com/v1',
    // kind: 'ServiceMonitor', metadata: [Object], spec: [Object] }, ...]
    const resources = JSON.parse(info.stdout).info.resources as Record<
      string,
      {
        apiVersion: string;
        kind: string;
        metadata: object;
        spec?: object;
      }[]
    >;

    return Object.entries(
      Object.values(resources)
        .flat()
        .reduce(
          (acc, val) => {
            const apiVersion = val.apiVersion;
            const kind = val.kind;
            const key = `${apiVersion}/${kind}`;
            if (!acc[key]) {
              acc[key] = [];
            }
            acc[key].push(val);
            return acc;
          },
          {} as Record<string, ObjectItem[]>
        )
    )
      .filter(([key, items]) => !key.includes("PodList"))
      .map(([key, items]) => {
        // apiVersion -> 'v1/ServiceMonitor'
        const apiVersionSplit = key.split("/");
        const apiVersion = apiVersionSplit.slice(0, -1).join("/");
        const kind = apiVersionSplit[apiVersionSplit.length - 1];

        return {
          apiVersion,
          kind,
          items,
        };
      });
  }

  async getHRResource(r: {
    namespace: string;
    // instance: string,
    group?: string;
    version: string;
    kind: string;
    name: string;
  }): Promise<any> {
    const request = customK8SRequest();

    console.log(
      "group",
      r.group,
      "version",
      r.version,
      "kind",
      r.kind,
      "name",
      r.name
    );
    if (!r.group) {
    }

    // const plural = kind.endsWith("s") ? kind : kind + "s";

    // group core version v1 kind ConfigMap name cilium-dashboard
    // /apis/networking.k8s.io/v1/namespaces/kube-system/ingresses/hubble-ui
    // /api/v1/namespaces/kube-system/configmaps/cilium-dashboard
    // /api/v1/namespaces/kube-system/ConfigMaps/cilium-dashboard
    //'/apis/{group}/{version}/namespaces/{namespace}/{plural}/{name}'
    // /api/v1/namespaces/kube-system/configmaps/cilium-dashboard
    let plural = r.kind.toLocaleLowerCase();
    plural = plural.endsWith("s") ? plural : plural + "s";
    if (plural === "ingress") {
      plural = "ingresses";
    }
    const isGlobal = plural.includes("cluster");

    // /apis/rbac.authorization.k8s.io/v1/clusterrolebindings/cilium-operator
    // /apis/rbac.authorization.k8s.io/v1/kube-system/clusterrolebindings/cilium-operator

    const url = r.group
      ? `/apis/${r.group}/${r.version}${!isGlobal ? "/namespaces/" + r.namespace : ""}/${plural}/${r.name}`
      : `/api/${r.version}${!isGlobal ? "/namespaces/" + r.namespace : ""}/${plural}/${r.name}`;
    console.log("url", url);
    const response = await request(url);
    return response;
  }

  async getLogs(
    namespace: string,
    pods: string[],
    timestamp?: number | undefined
  ): Promise<Log[]> {
    const k8sApi = loadk8s();
    const logConverter = (log: string) => {
      // 2024-05-19T19:52:02.146179244+02:00 PermissionError: [Errno 13] Permission denied: '/Downloads'
      const split = log.split(" ");
      const time = split[0];

      const message = split.slice(1).join(" ");
      return { time, message };
    };
    // convert to sinceSeconds
    const logs = (
      await k8sApi.readNamespacedPodLog({
        name: pods[0],
        namespace,
        timestamps: true,
        tailLines: 100,
        // somehow, they don't work
        // sinceSeconds: 1// timestamp ? Math.floor(timestamp / 1000) : undefined,
        // sinceTime: timestamp ? new Date(timestamp).toISOString() : undefined,
      })
    )
      .split("\n")
      .filter(Boolean)
      .map(logConverter)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    // manual filter
    if (timestamp) {
      return logs.filter((log) => new Date(log.time).getTime() > timestamp);
    }
    return logs;
  }
  async getPod(namespace: string, name: string): Promise<V1Pod | undefined> {
    const k8sApi = loadk8s();
    const pod = await k8sApi.readNamespacedPod({
      name,
      namespace,
    });
    return pod;
  }
  async getPodEvents(namespace: string, name: string): Promise<CoreV1Event[]> {
    const k8sApi = loadk8s();
    return (
      await k8sApi.listNamespacedEvent({
        namespace,
        fieldSelector: `involvedObject.name=${name}`,
      })
    ).items;
  }

  async listHRs(): Promise<HelmRelease[]> {
    const apis = await this.listAPIs();
    const k8sCustApi = loadk8sCustomObjectsApi();
    let versions = []
    if (group in apis && apis[group]) {
      versions.push(apis[group])
    }
    return (
      await Promise.all(versions.map(async version =>
        (await k8sCustApi.listClusterCustomObject({
          group,
          version,
          plural: "helmreleases",
        })).items as HelmRelease[]
      ))
    ).flat();
  }
  async listPods(): Promise<V1Pod[]> {
    const k8sApi = loadk8s();

    return (await k8sApi.listPodForAllNamespaces()).items;
  }
  async listIngress(): Promise<k8s.V1Ingress[]> {
    const k8sNetworkingApi = loadk8sNetworking();
    return (await k8sNetworkingApi.listIngressForAllNamespaces()).items;
  }
  async listHRPods(namespace: string, instance: string): Promise<V1Pod[]> {
    const k8sApi = loadk8s();

    const pods = await k8sApi.listNamespacedPod({
      namespace,
      labelSelector: `app.kubernetes.io/instance=${instance}`,
    });
    return pods.items;
  }
  async getHR(
    namespace: string,
    instance: string
  ): Promise<HelmRelease | undefined> {
    const k8sCustApi = loadk8sCustomObjectsApi();
    const apis = await this.listAPIs();
    const version = apis[group] || defaultVersion;
    const hr = await k8sCustApi.getNamespacedCustomObject({
      group,
      version,
      plural: "helmreleases",
      namespace: namespace,
      name: instance,
    });
    if (!hr) return;
    return hr as HelmRelease;
  }

  async reconcileHR(namespace: string, instance: string): Promise<void> {
    const kubectl = loadKubeCTL();
    const requestedAt = dayjs().format("YYYY-MM-DDTHH:mm:ss.SSSSSSSSSZ");

    await kubectl(
      "annotate",
      "helmrelease",
      instance,
      "-n",
      namespace,
      "--overwrite",
      "reconcile.fluxcd.io/requestedAt=" + requestedAt
    );
  }
  async deletePod(namespace: string, name: string): Promise<void> {
    const k8sApi = loadk8s();
    await k8sApi.deleteNamespacedPod({
      name,
      namespace,
    });
  }
}
