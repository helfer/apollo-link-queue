# apollo-link-queue

An Apollo Link that acts as a gate and queues requests when the gate is closed. This can be used when there is no internet connection or when the user has explicitly set an app to offline mode.

## Usage

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

const queueLink = new QueueLink();

// Note: remove these listeners when your app is shut down to avoid leaking listeners.
window.addEventListener('offline', () => offlineLink.close());
window.addEventListener('online', () => offlineLink.open());

this.link = ApolloLink.from([
    new RetryLink(),
    offlineLink,
    new HttpLink({ uri: URI_TO_YOUR_GRAPHQL_SERVER }),
]);
```