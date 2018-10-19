import {
    ApolloLink,
    Observable,
    Operation,
    Observer,
    FetchResult,
    NextLink
} from 'apollo-link';

export interface PersistentStore<T> {
    getItem: (key: string) => Promise<T> | T;
    setItem: (key: string, data: T) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
}

export type PersistedData = string | null;

interface OperationQueueEntry {
    operation: Operation;
    forward: NextLink;
    observer: Observer<FetchResult>;
    subscription?: { unsubscribe: () => void };
}

/**
 * Initialization options for QueueLink
 */
interface QueueLinkOptions {
    /**
     * store used to persist queue. 
     */
    store?: {
        // window.localstore, AsyncStore or anything that conforms to interface
        engine: PersistentStore<PersistedData>,
        // key used to store data
        storeKey: string | "apollo-link-queue"
    },
    /**
     * Queue only specific operations
     **/
    filter?: "mutation" | "query"
}

export default class QueueLink extends ApolloLink {
    private opQueue: OperationQueueEntry[] = [];
    private isOpen: boolean = true;

    private store: PersistentStore<string>;
    private filter: string;
    private storeKey: string;

    public constructor(options?: QueueLinkOptions) {
        super()
        if (options) {
            if (options.store) {
                this.store = options.store.engine;
                this.storeKey = options.store.storeKey;
                this.restoreDataFromStore();
            }
            this.filter = options.filter
        }
    }

    public open() {
        this.isOpen = true;
        this.opQueue.forEach(({ operation, forward, observer }) => {
            forward(operation).subscribe(observer);
        });
        this.opQueue = [];
        if (this.store) {
            this.store.removeItem(this.storeKey)
        }
    }

    public close() {
        this.isOpen = false;
    }

    public request(operation: Operation, forward: NextLink) {
        if (this.isOpen) {
            return forward(operation);
        }
        if (operation.getContext().skipQueue) {
            return forward(operation);
        }
        return new Observable(observer => {
            const operationEntry = { operation, forward, observer };
            this.enqueue(operationEntry);
            return () => this.cancelOperation(operationEntry);
        });
    }

    private cancelOperation(entry: OperationQueueEntry) {
        this.opQueue = this.opQueue.filter(e => e !== entry);
        this.storeQueue();
    }

    private storeQueue() {
        if (this.store) {
            this.store.setItem(this.storeKey, JSON.stringify(this.opQueue));
        }
    }

    private enqueue(entry: OperationQueueEntry) {
        if (this.filter) {
            if (this.matchesOperation(this.filter, entry.operation)) {
                this.save(entry);
            }
        } else {
            this.save(entry);
        }
    }

    private save(entry: OperationQueueEntry) {
        this.opQueue.push(entry);
        this.storeQueue();
    }

    private matchesOperation(filter: string, operation: Operation): boolean {
        if (operation.query && operation.query.definitions) {
            return operation.query.definitions.filter((e) => {
                return (e as any).operation === filter
            }).length > 0;
        } else {
            return false;
        }
    }

    private restoreDataFromStore() {
        if (this.store) {
            const store = this.store.getItem(this.storeKey);
            if (typeof store === 'string') {
                this.opQueue = JSON.parse(store as string);
            }
            else {
                store.then((data) => {
                    this.opQueue = JSON.parse(data);
                }).catch((err) => {
                    console.log(err);
                });
            }
        }
    }
}
