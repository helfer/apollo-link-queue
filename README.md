# apollo-link-queue

[![npm version](https://badge.fury.io/js/apollo-link-queue.svg)](https://badge.fury.io/js/apollo-link-queue)
[![Build Status](https://travis-ci.org/helfer/apollo-link-queue.svg?branch=master)](https://travis-ci.org/helfer/apollo-link-queue)
[![codecov](https://codecov.io/gh/helfer/apollo-link-queue/branch/master/graph/badge.svg)](https://codecov.io/gh/helfer/apollo-link-queue)

An Apollo Link that acts as a gate and queues requests when the gate is closed. This can be used when there is no internet connection or when the user has explicitly set an app to offline mode.

### Installation

```
npm install apollo-link-queue
```
or
```
yarn add apollo-link-queue
```

### Usage

```js
import QueueLink from 'apollo-link-queue';

const queueLink = new QueueLink();

// To start queueing requests
queueLink.close();

// To let requests pass (and execute all queued requests)
queueLink.open();
```

### Offline mode example with queueing and retry

```js
import { ApolloLink } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { RetryLink } from 'apollo-link-retry';

import QueueLink from 'apollo-link-queue';

const offlineLink = new QueueLink();

// Note: remove these listeners when your app is shut down to avoid leaking listeners.
window.addEventListener('offline', () => offlineLink.close());
window.addEventListener('online', () => offlineLink.open());

this.link = ApolloLink.from([
    new RetryLink(),
    offlineLink,
    new HttpLink({ uri: URI_TO_YOUR_GRAPHQL_SERVER }),
]);
```
