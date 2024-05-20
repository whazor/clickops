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
    const callWithBackoff = async (backoff = 1) => {
      try {
        const pod = await client.getPod(params.namespace!, params.name!);
        send({ event: "status", data: pod?.status?.phase || null });
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
