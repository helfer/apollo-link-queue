import QueueLink from './QueueLink';
import {
    assertObservableSequence,
    executeMultiple,
    TestLink,
} from './TestUtils';
import {
    execute,
    GraphQLRequest,
    ApolloLink,
} from 'apollo-link';
import gql from 'graphql-tag';

describe('OnOffLink', () => {
    let link: ApolloLink;
    let onOffLink: QueueLink;
    let testLink: TestLink;

    const testResponse = {
        data: {
            hello: 'World',
        },
    };

    const testResponse2 = {
        data: {
            hello2: 'World',
        },
    };

    const op: GraphQLRequest = {
        query: gql`query hello { hello }`,
        context: {
            testResponse,
        },
    };

    const op2: GraphQLRequest = {
        query: gql`query hello2 { hello }`,
        context: {
            testResponse: testResponse2,
        },
    };

    beforeEach(() => {
        jest.useFakeTimers();
        testLink = new TestLink();
        onOffLink = new QueueLink();
        link = ApolloLink.from([onOffLink, testLink]);
    });

    it('forwards the operation', () => {
        return new Promise((resolve, reject) => {
            execute(link, op).subscribe({
                next: (data) => undefined,
                error: (error) => reject(error),
                complete: () => {
                    expect(testLink.operations.length).toBe(1);
                    expect(testLink.operations[0].query).toEqual(op.query);
                    resolve();
                },
            });
            jest.runAllTimers();
        });
    });
    it('skips the queue when asked to', () => {
        const opWithSkipQueue: GraphQLRequest = {
            query: gql`{ hello }`,
            context: {
                skipQueue: true,
            },
        };
        onOffLink.close();
        return new Promise((resolve, reject) => {
            execute(link, opWithSkipQueue).subscribe({
                next: (data) => undefined,
                error: (error) => reject(error),
                complete: () => {
                    expect(testLink.operations.length).toBe(1);
                    expect(testLink.operations[0].query).toEqual(op.query);
                    resolve();
                },
            });
            jest.runAllTimers();
        });
    });
    it('passes through errors', () => {
        const testError = new Error('Hello darkness my old friend');
        const opWithError: GraphQLRequest = {
            query: gql`{ hello }`,
            context: {
                testError,
            },
        };
        return new Promise((resolve, reject) => {
            resolve(assertObservableSequence(
                execute(link, opWithError),
                [
                    { type: 'error', value: testError },
                ],
                () => jest.runAllTimers(),
            ));
        });
    });
    it('holds requests when you close it', () => {
        onOffLink.close();
        const sub = execute(link, op).subscribe(() => null);
        expect(testLink.operations.length).toBe(0);
        sub.unsubscribe();
    });

    it('releases held requests when you open it', () => {
        onOffLink.close();
        return assertObservableSequence(
            execute(link, op),
            [
                { type: 'next', value: testResponse },
                { type: 'complete' },
            ],
            () => {
                expect(testLink.operations.length).toBe(0);
                onOffLink.open();
                expect(testLink.operations.length).toBe(1);
                jest.runAllTimers();
            },
        );
    });

    it('releases held deduplicated requests when you open it (last)', () => {
        const dedupOnOffLink = new QueueLink({keepPolicy: "last"});
        const myLink = ApolloLink.from([dedupOnOffLink, testLink]);
        dedupOnOffLink.close();
        return assertObservableSequence(
            executeMultiple(myLink, op, op2, op),
            [
                { type: 'next', value: testResponse2 },
                { type: 'next', value: testResponse },
                { type: 'complete' },
            ],
            () => {
                expect(testLink.operations.length).toBe(0);
                dedupOnOffLink.open();
                expect(testLink.operations.length).toBe(2);
                jest.runAllTimers();
            },
        );
    });

    it('releases held deduplicated requests when you open it (first)', () => {
        const dedupOnOffLink = new QueueLink({keepPolicy: "first"});
        const myLink = ApolloLink.from([dedupOnOffLink, testLink]);
        dedupOnOffLink.close();
        return assertObservableSequence(
            executeMultiple(myLink, op, op2, op),
            [
                { type: 'next', value: testResponse },
                { type: 'next', value: testResponse2 },
                { type: 'complete' },
            ],
            () => {
                expect(testLink.operations.length).toBe(0);
                dedupOnOffLink.open();
                expect(testLink.operations.length).toBe(2);
                jest.runAllTimers();
            },
        );
    });

    it('releases held deduplicated requests when you open it (all)', () => {
        const dedupOnOffLink = new QueueLink({keepPolicy: "all"});
        const myLink = ApolloLink.from([dedupOnOffLink, testLink]);
        dedupOnOffLink.close();
        return assertObservableSequence(
            executeMultiple(myLink, op, op2, op),
            [
                { type: 'next', value: testResponse },
                { type: 'next', value: testResponse2 },
                { type: 'next', value: testResponse },
                { type: 'complete' },
            ],
            () => {
                expect(testLink.operations.length).toBe(0);
                dedupOnOffLink.open();
                expect(testLink.operations.length).toBe(3);
                jest.runAllTimers();
            },
        );
    });

    it('removes operations from the queue that are cancelled while closed', () => {
        onOffLink.close();
        const observable = execute(link, op);
        const subscriber = observable.subscribe(() => { /* do nothing */ });
        subscriber.unsubscribe();
        onOffLink.open();
        expect(testLink.operations.length).toBe(0);
    });
});
