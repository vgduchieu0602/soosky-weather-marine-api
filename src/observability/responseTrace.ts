import { AsyncLocalStorage } from 'node:async_hooks'

export type DataSourceStatus = 'upstream' | 'cache' | 'stale-cache' | 'unavailable'

export type DataSourceMeta = {
    source: string;
    status: DataSourceStatus;
    dataFetchedAt: string | null;
}

type ResponseTrace = {
    requestReceivedAt: Date;
    dataSources: DataSourceMeta[];
}

const traceStorage = new AsyncLocalStorage<ResponseTrace>()

export function runWithResponseTrace<T> (callback: () => T): T {
    return traceStorage.run({ requestReceivedAt: new Date(), dataSources: [] }, callback)
}

export function recordDataSource (source: DataSourceMeta): void {
    traceStorage.getStore()?.dataSources.push(source)
}

export function getResponseMeta (): {
    requestReceivedAt: string;
    responseSentAt: string;
    processingMs: number;
    dataSources: DataSourceMeta[];
} {
    const responseSentAt = new Date()
    const trace = traceStorage.getStore()
    const requestReceivedAt = trace?.requestReceivedAt ?? responseSentAt

    return {
        requestReceivedAt: requestReceivedAt.toISOString(),
        responseSentAt: responseSentAt.toISOString(),
        processingMs: responseSentAt.getTime() - requestReceivedAt.getTime(),
        dataSources: trace?.dataSources ?? []
    }
}
