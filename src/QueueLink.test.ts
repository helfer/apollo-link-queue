import QueueLink from './QueueLink';
import {
    assertObservableSequence,
    TestLink,
} from './TestUtils';
import {
    execute,
    GraphQLRequest,
    ApolloLink,
    } from '@apollo/client/link/core';
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

    const op: GraphQLRequest = {
        query: gql`{ hello }`,
        context: {
            testResponse,
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
        const sub = execute(link, op).subscribe(() => undefined);
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
