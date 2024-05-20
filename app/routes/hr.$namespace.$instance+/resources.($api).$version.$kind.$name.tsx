import { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { $path } from "remix-routes";

import { K8sClient } from "~/lib/k8s/client";

export const handle = {
  breadcrumb: ({ params, resource }: SerializeFrom<typeof loader>) =>
    !!params ? (
      <span>{`${resource.kind} ${resource.metadata?.name || ""}`}</span>
    ) : null,
};

export async function loader({ params }: LoaderFunctionArgs) {
  // $api, $version, $kind, $name
  // check whether all params are there
  if (
    !params ||
    !params.namespace ||
    // !params.api ||
    !params.version ||
    !params.kind ||
    !params.name
  ) {
    throw new Error("Invalid parameters, no resource found");
  }

  const client = new K8sClient();
  const resource = await client.getHRResource({
    namespace: params.namespace,
    group: params.api,
    version: params.version,
    kind: params.kind,
    name: params.name,
  });

  // delete metatdata.annotations[kubectl.kubernetes.io/last-applied-configuration]
  if (resource?.metadata?.annotations) {
    delete resource.metadata.annotations[
      "kubectl.kubernetes.io/last-applied-configuration"
    ];
  }
  // also delete managed fields
  if (resource?.metadata?.managedFields) {
    delete resource.metadata.managedFields;
  }

  const YAML = (await import("zx")).YAML;
  return {
    resource,
    yaml: YAML.stringify(resource),
    params,
  };
}

export default function ResourceView() {
  const { yaml } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Resource View</h1>
      <pre>{yaml}</pre>
    </div>
  );
}
