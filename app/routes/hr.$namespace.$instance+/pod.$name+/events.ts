import { LoaderFunctionArgs } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { K8sClient } from "~/lib/k8s/client";

export async function loader({ params, request }: LoaderFunctionArgs) {
  if (!params || !params.namespace || !params.name) {
    throw new Error("Invalid parameters, no helm release found");
  }

  const client = new K8sClient();
  return eventStream(request.signal, function setup(send) {
    // check conditions every 5 seconds, use exponential backoff
    let timer: ReturnType<typeof setTimeout> | null = null;
    const lastSeenMap: Record<string, string> = {};
    const callWithBackoff = async (backoff = 1) => {
      try {
        const events = await client.getPodEvents(
          params.namespace!,
          params.name!,
        );
        for (const event of events) {
          if (!event.message) continue;
          let emit = false;
          const data = JSON.stringify(event);
          // check if message is in lastSeenMap
          if (!lastSeenMap[event.message]) {
            lastSeenMap[event.message] = data;
            emit = true;
          } else {
            const prev = lastSeenMap[event.message];
            // if type changed, emit
            const changed = prev !== data;
            if (changed) {
              lastSeenMap[event.message] = data;
              emit = true;
            }
          }
          if (emit) send({ event: "event", data });
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
