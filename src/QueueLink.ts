import {
    ApolloLink,
    Observable,
    Operation,
    Observer,
    FetchResult,
    NextLink,
} from 'apollo-link';

interface OperationQueueEntry {
    operation: Operation;
    forward: NextLink;
    observer: Observer<FetchResult>;
    subscription?: { unsubscribe: () => void };
}

export type KeepPolicy =
    | 'first'
    | 'last'
    | 'all';

export namespace QueueLink {
    export interface Options {
        /**
         * Decides which entry to keep in the queue in case of duplicate entries.
         *
         * Defaults to 'all'.
         */
        keepPolicy?: KeepPolicy;

        /**
         * Specifies which entries are considered duplicates
         *
         * Defaults to comparing operation operationA.toKey() === operationB.toKey()
         * https://www.apollographql.com/docs/link/overview.html
         */
        isDuplicate?: (operationA: Operation, operationB: Operation) => boolean;
    }
}

const defaultOptions: QueueLink.Options = {
    keepPolicy: 'all',
    isDuplicate: (a: Operation, b: Operation) => a.toKey() === b.toKey()
};

export class DedupedByQueueError extends Error {
    constructor() {
        super('Operation got deduplicated by apollo-link-queue.');
        Object.defineProperty(this, 'name', { value: 'DedupedByQueueError' });
    }
}

export default class QueueLink extends ApolloLink {
    private opQueue: OperationQueueEntry[] = [];
    private isOpen: boolean = true;
    private readonly keepPolicy: KeepPolicy;
    private readonly isDuplicate: (operationA: Operation, operationB: Operation) => boolean;

    constructor(options: QueueLink.Options = defaultOptions) {
        super();
        const {
            keepPolicy = defaultOptions.keepPolicy,
            isDuplicate = defaultOptions.isDuplicate
        } = options;
        this.keepPolicy = keepPolicy;
        this.isDuplicate = isDuplicate;
    }

    public open() {
        this.isOpen = true;
        this.opQueue.forEach(({ operation, forward, observer }) => {
            forward(operation).subscribe(observer);
        });
        this.opQueue = [];
    }

    public close() {
        this.isOpen = false;
    }

    public request(operation: Operation, forward: NextLink ) {
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
    }

    private enqueue(entry: OperationQueueEntry) {
        const isDuplicate = ({operation}: OperationQueueEntry) => this.isDuplicate(operation, entry.operation);
        switch (this.keepPolicy) {
            case "first":
                const alreadyInQueue = this.opQueue.some(isDuplicate);
                if (alreadyInQueue) {
                    // if there is already a duplicate entry the new one gets ignored
                    entry.observer.error(new DedupedByQueueError());
                } else {
                    this.opQueue.push(entry);
                }
                break;
            case "last":
                const index = this.opQueue.findIndex(isDuplicate);
                if (index !== -1) {
                    // if there is already a duplicate entry it gets removed
                    const [duplicate] = this.opQueue.splice(index, 1);
                    duplicate.observer.error(new DedupedByQueueError());
                }
                this.opQueue.push(entry);
                break;
            case "all":
                this.opQueue.push(entry);
                break;
        }
    }
}
