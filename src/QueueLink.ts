import {
    ApolloLink,
    GraphQLRequest,
    Operation,
    FetchResult,
    NextLink,
    OperationTypeNode,
    DocumentNode
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
    static filter: OperationTypeNode[] = null;
    private opQueue: OperationQueueEntry[] = [];
    private isOpen = true;

    public extract() {
        // Convert each Operation to a GraphQLRequest so we aren't persisting functions
        return this.opQueue.map(entry => ({
            query: entry.operation.query,
            variables: entry.operation.variables,
            operationName: entry.operation.operationName,
            context: entry.operation.getContext(),
            extensions: entry.operation.extensions,
        }));
    }

    public restore(client: ApolloLink, entries: GraphQLRequest[]) {
        entries.map(graphqlRequest => {
            const { query, variables, context } = graphqlRequest;
            if (this.isType(query, 'mutation')) {
                client.mutate({mutation: query, variables, context});
            } else {
                client.query({query, variables, context});
            }
        })
    }

    private isType(query: DocumentNode, type: OperationTypeNode) {
        return query.definitions.filter((e) => {
            return (e as any).operation === type
        }).length > 0;
    }

    private isFilteredOut(operation: Operation) {
        if (!QueueLink.filter || !QueueLink.filter.length) return false;
        return operation.query.definitions.filter((e) => {
            return QueueLink.filter.includes((e as any).operation)
        }).length > 0;
    }

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

    public static setFilter = (filter: OperationTypeNode[]) => {
        QueueLink.filter = filter;
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
        if (this.isFilteredOut(operation)) {
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
