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
        const conditions = helmRelease.status?.conditions || [];
        for (const condition of conditions) {
          let emit = false;
          const data = JSON.stringify(condition);
          // check if message is in lastSeenMap
          if (!lastSeenMap[condition.message]) {
            lastSeenMap[condition.message] = data;
            emit = true;
          } else {
            const prev = lastSeenMap[condition.message];
            // if type changed, emit
            // condition.lastTransitionTime, condition.reason, condition.status, condition.type
            const changed = prev !== data;
            if (changed) {
              lastSeenMap[condition.message] = data;
              emit = true;
            }
          }
          if (emit) send({ event: "condition", data });
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
