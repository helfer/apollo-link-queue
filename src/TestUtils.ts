import {
    ApolloLink,
    Operation,
    Observable,
    execute,
} from 'apollo-link';
import {
    ExecutionResult,
} from 'graphql';
import {
    GraphQLRequest
} from 'apollo-link/src/types';

export class TestLink extends ApolloLink {
    public operations: Operation[];
    constructor() {
        super();
        this.operations = [];
    }

    public request (operation: Operation) {
        this.operations.push(operation);
        // TODO(helfer): Throw an error if neither testError nor testResponse is defined
        return new Observable(observer => {
            if (operation.getContext().testError) {
                setTimeout(() => observer.error(operation.getContext().testError), 0);
                return;
            }
            setTimeout(() => observer.next(operation.getContext().testResponse), 0);
            setTimeout(() => observer.complete(), 0);
        });
    }
}

export interface ObservableValue {
    value?: ExecutionResult | Error;
    delay?: number;
    type: 'next' | 'error' | 'complete';
}

export interface Unsubscribable {
    unsubscribe: () => void;
}

export const assertObservableSequence = (
    observable: Observable<ExecutionResult>,
    sequence: ObservableValue[],
    initializer: (sub: Unsubscribable) => void = () => undefined,
): Promise<boolean | Error> => {
    let index = 0;
    if (sequence.length === 0) {
        throw new Error('Observable sequence must have at least one element');
    }
    return new Promise((resolve, reject) => {
        const sub = observable.subscribe({
            next: (value) => {
                expect({ type: 'next', value }).toEqual(sequence[index]);
                index++;
                if (index === sequence.length) {
                    resolve(true);
                }
            },
            error: (value) => {
                expect({ type: 'error', value }).toEqual(sequence[index]);
                index++;
                // This check makes sure that there is no next element in
                // the sequence. If there is, it will print a somewhat useful error
                expect(undefined).toEqual(sequence[index]);
                resolve(true);
            },
            complete: () => {
                expect({ type: 'complete' }).toEqual(sequence[index]);
                index++;
                // This check makes sure that there is no next element in
                // the sequence. If there is, it will print a somewhat useful error
                expect(undefined).toEqual(sequence[index]);
                resolve(true);
            },
        });
        initializer(sub);
    });
};

export function executeMultiple(link: ApolloLink, ...operations: GraphQLRequest[]) {
    return new Observable(sub => {
        let i = 0;
        const s = {
            next: (v: any) => sub.next(v),
            error: (e: any) => sub.error(e),
            complete() {
                i++;
                if (i === operations.length) sub.complete()
            }
        };
        operations.forEach(op => execute(link, op).subscribe(s))
    });
}
