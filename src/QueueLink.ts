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
        this.replayFirst()
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

    // Replay mutations sequentially
    private replayFirst() {
      const { forward, operation, observer }: OperationQueueEntry = this.opQueue.shift();
      forward(operation).subscribe((arg: any) => {
        if (this.opQueue.length > 1) this.replayFirst();
        observer.next(arg);
        observer.complete();
      })
    }

    private cancelOperation(entry: OperationQueueEntry) {
        this.opQueue = this.opQueue.filter(e => e !== entry);
    }

    private enqueue(entry: OperationQueueEntry) {
        this.opQueue.push(entry);
    }
}
