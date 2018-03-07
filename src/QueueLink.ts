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

export default class QueueLink extends ApolloLink {
    private opQueue: OperationQueueEntry[] = [];
    private isOpen: boolean = true;

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
        this.opQueue.push(entry);
    }
}
