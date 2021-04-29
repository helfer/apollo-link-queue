import {
  ApolloLink,
  Operation,
  FetchResult,
  NextLink,
} from '@apollo/client/link/core';
import { Observable, Observer } from '@apollo/client/utilities';
import { createGuid } from './Utils';

interface OperationQueueEntry {
  operation: Operation;
  forward: NextLink;
  observer: Observer<FetchResult>;
  subscription?: { unsubscribe: () => void };
}

type event = 'dequeue' | 'enqueue' | 'change';

interface Listener {
  id: string;
  callback: (entry: any) => void;
}

export default class QueueLink extends ApolloLink {
  static listeners: Record<string, Listener[]> = {};
  private opQueue: OperationQueueEntry[] = [];
  private isOpen = true;

  public clear() {
    this.opQueue = [];
    QueueLink.listeners = {};
  }

  public open() {
    this.isOpen = true;

    const first: OperationQueueEntry | undefined = this.opQueue.shift();

    if (first !== undefined) {
      const { operation, forward, observer } = first;

      this.triggerListeners(first, 'dequeue');

      forward(operation).subscribe(
        (value) => {
          if (observer && observer.next) {
            observer?.next(value);
          }
        },
        (error) => {
          if (observer && observer.error) {
            observer?.error(error);
          }
          this.open();
        },
        () => {
          if (observer && observer.complete) {
            observer?.complete();
          }
          this.open();
        }
      );
    }
  }

  public static addLinkQueueEventListener = (
    opName: string,
    event: event,
    callback: (entry: any) => void
  ) => {
    if (event === 'change') opName = '';
    const key: string = QueueLink.key(opName, event);

    const newGuid = createGuid();

    const newListener = {
      [key]: [
        ...(key in QueueLink.listeners ? QueueLink.listeners[key] : []),
        ...[{ id: newGuid, callback }],
      ],
    };

    QueueLink.listeners = { ...QueueLink.listeners, ...newListener };

    return newGuid;
  };

  public static removeLinkQueueEventListener = (
    opName: string,
    event: event,
    id: string
  ) => {
    if (event === 'change') opName = '';
    const key: string = QueueLink.key(opName, event);

    if (QueueLink.listeners[key] !== undefined) {
      QueueLink.listeners[key] = QueueLink.listeners[key].filter(
        (listener) => listener.id !== id
      );

      if (QueueLink.listeners[key].length === 0) {
        delete QueueLink.listeners[key];
      }
    }
  };

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

  private static key(op: string, ev: string) {
    return `${op}${ev}`.toLocaleLowerCase();
  }

  private cancelOperation(entry: OperationQueueEntry) {
    this.opQueue = this.opQueue.filter((e) => e !== entry);
  }

  private enqueue(entry: OperationQueueEntry) {
    this.opQueue.push(entry);

    this.triggerListeners(entry, 'enqueue');
  }

  private triggerListeners(entry: OperationQueueEntry, event: string) {
    let key: string = QueueLink.key(entry.operation.operationName, event);
    if (key in QueueLink.listeners) {
      QueueLink.listeners[key].forEach((listener) => {
        listener.callback(entry);
      });
    }
    key = QueueLink.key('', 'change');
    if (key in QueueLink.listeners) {
      QueueLink.listeners[key].forEach((listener) => {
        listener.callback(this.opQueue);
      });
    }
  }
}
