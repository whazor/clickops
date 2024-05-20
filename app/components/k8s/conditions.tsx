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
dayjs.extend(relativeTime);

type Condition = Exclude<
  Exclude<HelmRelease["status"], null | undefined>["conditions"],
  null | undefined
>[0];

function findAllOccurrences(str: string, search: string) {
  const indexes = [];
  for (let i = 0; i < str.length; i++) {
    if (str.slice(i, i + search.length) === search) {
      indexes.push(i);
    }
  }
  return indexes;
}

function format(message: string) {
  const opening = [": "];
  const closing = [". ", "; "];
  //   let tabs = 0;
  // for every opening, add enter and add tab
  // for every closing, add enter and remove tab
  const openingIndexes = opening
    .flatMap((op) => findAllOccurrences(message, op))
    .sort((a, b) => a - b);
  const closingIndexes = closing
    .flatMap((cl) => findAllOccurrences(message, cl))
    .sort((a, b) => a - b);

  let lastSlice = 0;
  const indexes = openingIndexes.concat(closingIndexes).sort((a, b) => a - b);

  for (let i = 0; i < indexes.length; i++) {
    const tabs = i + 1 - closingIndexes.filter((cl) => cl <= indexes[i]).length;
    const sliceIndex = lastSlice + indexes[i] + 2;
    const len = message.length;
    message = `${message.slice(0, sliceIndex)}\n${" ".repeat(
      tabs,
    )}${message.slice(sliceIndex)}`;
    lastSlice += message.length - len;
  }

  return message;
}

export function Conditions(props: {
  conditions: Condition[];
  namespace: string;
  instance: string;
}) {
  const { namespace, instance } = props;
  const condition = useEventSource(`/hr/${namespace}/${instance}/conditions`, {
    event: "condition",
  });
  const [conditions, setConditions] = useState<Record<string, Condition>>(
    props.conditions.reduce((acc, c) => ({ ...acc, [c.message]: c }), {}),
  );
  useEffect(() => {
    if (condition) {
      // setConditions([...conditions, JSON.parse(condition)]);
      const con = JSON.parse(condition) as Condition;
      setConditions((conditions) => ({ ...conditions, [con.message]: con }));
    }
  }, [condition]);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.values(conditions)
            .sort(
              (a, b) =>
                new Date(b.lastTransitionTime).getTime() -
                new Date(a.lastTransitionTime).getTime(),
            )
            .map((condition) => (
              <TableRow
                key={
                  condition.message || "" + condition.lastTransitionTime || ""
                }
              >
                <TableCell>
                  <span title={condition.lastTransitionTime}>
                    {dayjs(condition.lastTransitionTime).fromNow()}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {condition.type}
                  </div>
                  <div className="font-medium">
                    <pre className="">{format(condition.message)}</pre>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge>{condition.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </>
  );
}
