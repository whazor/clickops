import { Log, LogsAPI } from "./interface";

export class LogsQL implements LogsAPI {
  url: string;
  constructor(_url: string) {
    // remove / suffix if there
    _url = _url.replace(/\/$/, "");
    this.url = `${_url}/select/logsql/query`;
    console.log("LogsQL url: " + this.url);
  }
  async getLogs(
    _ns: string,
    pods: string[],
    timestamp?: number
  ): Promise<Log[]> {
    // curl http://localhost:9428/select/logsql/query" -d 'query=error' -d 'limit=10'
    // query=kubernetes_pod_name:exact("vm-logs-fluent-bit-gwcrk") OR kubernetes_pod_name:exact("vm-logs-fluent-bit-gwcrk")
    let query = pods
      .map((name) => `kubernetes_pod_name:exact("${name}")`)
      .join(" OR ");
    // _time:YYYY-MM-DDTHH:MM:SS
    // const timeFilter: {_time:string}|object = timestamp ? {
    //     _time: (new Date(timestamp).toISOString())
    // } : {}
    // console.log(timeFilter)
    if (timestamp) {
      query = `_time:${new Date(timestamp).toISOString()} AND (${query})`;
    }
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query, limit: "100" }),
    });
    const data = await response.text();
    return data
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error("line not parsed", line);
          return undefined;
        }
      })
      .filter(Boolean)
      .map((msg) => ({
        time: msg._time,
        message: msg._msg,
      }));
  }
}