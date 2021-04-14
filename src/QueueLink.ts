import {
    ApolloLink,
    Operation,
    FetchResult,
    NextLink,
} from '@apollo/client/link/core';
import {
    Observable,
    Observer,
} from '@apollo/client/utilities';

interface OperationQueueEntry {
    operation: Operation;
    forward: NextLink;
    observer: Observer<FetchResult>;
    subscription?: { unsubscribe: () => void };
}

export default class QueueLink extends ApolloLink {
    static listeners: Record< string, ((entry: any) => void)[] > = {};
    private opQueue: OperationQueueEntry[] = [];
    private isOpen = true;

    public open() {
        this.isOpen = true;
        this.opQueue.forEach(({ operation, forward, observer }) => {
            const key: string = QueueLink.key(operation.operationName, 'dequeue');
            if (key in QueueLink.listeners) {
                QueueLink.listeners[key].forEach((listener) => {
                    listener({ operation, forward, observer });
                });
            }
            forward(operation).subscribe(observer);
        });
        this.opQueue = [];
    }

    public static addLinkQueueEventListener = (opName: string, event: 'dequeue' | 'enqueue', listener: (entry: any) => void) => {
        const key: string = QueueLink.key(opName, event);

        const newListener = { [key]: [
            ...(key in QueueLink.listeners ? QueueLink.listeners[key] : []),
            ...[listener], ]
        };

        QueueLink.listeners = { ...QueueLink.listeners, ...newListener };
    };

    private static key(op: string, ev: string) {
        return `${op}${ev}`.toLocaleLowerCase();
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
        return new Observable<FetchResult>((observer: Observer<FetchResult>) => {
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

        const key: string = QueueLink.key(entry.operation.operationName, 'enqueue');
        if (key in QueueLink.listeners) {
            QueueLink.listeners[key].forEach((listener) => {
                listener(entry);
            });
        }
    }
}
