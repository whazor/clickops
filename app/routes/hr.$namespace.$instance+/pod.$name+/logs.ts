import { LoaderFunctionArgs } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { K8sClient } from "~/lib/k8s/client";
import { getLogsAPI } from "~/lib/logs";

export async function loader({ params, request }: LoaderFunctionArgs) {
  if (!params || !params.namespace || !params.name) {
    throw new Error("Invalid parameters, no helm release found");
  }

  const client = new K8sClient();
  const logsAPI = getLogsAPI(client);
  
  return eventStream(request.signal, function setup(send) {
      // check conditions every 5 seconds, use exponential backoff
    const TIME = 30_000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestTime: number|undefined = undefined;
      
    const callWithBackoff = async (backoff = 1) => {
      if (request.signal.aborted) return;
      try {
        const logs = await logsAPI?.getLogs(
          params.namespace!,
          [params.name!],
          latestTime
        );
        console.log("logs", logs.length);
        latestTime = Math.max(
          latestTime || 0,
          ...logs.map((log) => new Date(log.time).getTime())
        );
        send({ event: "logs", data: JSON.stringify(logs) });
        timer = setTimeout(() => callWithBackoff(1), TIME);
      } catch (e) {
        console.error(e);
        timer = setTimeout(() => callWithBackoff(backoff * 2), TIME * backoff);
      }
    };
    callWithBackoff();
    return function clear() {
      if (timer) clearTimeout(timer);
    };
  });
}
