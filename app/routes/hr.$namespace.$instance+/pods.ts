import { LoaderFunctionArgs } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { K8sClient } from "~/lib/k8s/client";

export async function loader({ params, request }: LoaderFunctionArgs) {
  if (!params || !params.namespace || !params.instance) {
    throw new Error("Invalid parameters, no helm release found");
  }

  const client = new K8sClient();
  return eventStream(request.signal, function setup(send) {
    // check conditions every 5 seconds, use exponential backoff
    let timer: ReturnType<typeof setTimeout> | null = null;
    const lastSeenMap: Record<string, string> = {};
    const callWithBackoff = async (backoff = 1) => {
      try {
        const helmRelease = await client.getHR(
          params.namespace!,
          params.instance!,
        );
        if (!helmRelease) throw new Error("Helm release not found");
        const pods = await client.listHRPods(
          params.namespace!,
          params.instance!,
        );
        const seen = new Set<string>();
        for (const pod of pods) {
          const name = pod?.metadata?.name;
          if (!name) continue;
          seen.add(name);
          let emit = false;
          if (!lastSeenMap[name]) {
            lastSeenMap[name] = JSON.stringify(pod);
            emit = true;
          } else {
            const prev = lastSeenMap[name];
            const changed = prev !== JSON.stringify(pod);
            if (changed) {
              lastSeenMap[name] = JSON.stringify(pod);
              emit = true;
            }
          }
          if (emit)
            send({
              event: "pod",
              data: JSON.stringify({ name, pod }),
            });
        }
        for (const name in lastSeenMap) {
          if (!seen.has(name)) {
            delete lastSeenMap[name];
            send({
              event: "pod",
              data: JSON.stringify({ name, pod: undefined }),
            });
          }
        }
        timer = setTimeout(() => callWithBackoff(1), 5000);
      } catch (e) {
        console.error(e);
        timer = setTimeout(() => callWithBackoff(backoff * 2), 5000 * backoff);
      }
    };
    callWithBackoff();
    return function clear() {
      if (timer) clearTimeout(timer);
    };
  });
}
