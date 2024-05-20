import { useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { useEventSource } from "remix-utils/sse/react";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { HelmRelease } from "@kubernetes-models/flux-cd/helm.toolkit.fluxcd.io/v2beta2";
import { Log } from "~/lib/logs/interface";
import { ScrollArea } from "../ui/scroll-area";
dayjs.extend(relativeTime);

export function PodLogs(props: {
  namespace: string;
  instance: string;
    name: string;
}) {
  const { namespace, instance, name } = props;
  const logsJSON = useEventSource(`/hr/${namespace}/${instance}/pod/${name}/logs`, {
    event: "logs",
  });
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    if (logsJSON) {
      const newLogs = JSON.parse(logsJSON) as Log[];
      setLogs((logs) => [...newLogs, ...logs].slice(0, 100));
    }
  }, [logsJSON]);
  return (
    <>
      <ScrollArea className="max-h-[400px] rounded-md overflow-y-auto">
        <Table className="">
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs
              .sort(
                (a, b) =>
                  new Date(b.time).getTime() - new Date(a.time).getTime()
              )
              .map((log) => (
                <TableRow key={log.time + log.message}>
                  <TableCell className="p-1">
                    {/* {log.time} */}
                    {dayjs(log.time).fromNow()}
                  </TableCell>
                  <TableCell className="p-1">{log.message}</TableCell>
                </TableRow>
              ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="p-3">
                  No logs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </>
  );
}
