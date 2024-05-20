import { K8sClient } from "../k8s/client";
import { LogsAPI } from "./interface";
import { LogsQL } from "./logsql";

export function getLogsAPI(k8s: K8sClient): LogsAPI {
  // check if LOGSQL_URL in env
  console.log("LOGSQL_URL", process.env.LOGSQL_URL);
  if (process.env.LOGSQL_URL) {
    return new LogsQL(process.env.LOGSQL_URL);
  }
  return k8s;
}
