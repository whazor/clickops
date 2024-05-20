export type Log = {
    time: string,
    message: string
}

export interface LogsAPI {
  getLogs(
    namespace: string,
    pods: string[],
    timestamp?: number
  ): Promise<Log[]>;
}