import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { hostContract } from './contract.js';
import { ToudocuClient, type Operation } from './toudocu/client.js';

const clients = new Map<string, ToudocuClient>();
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    read: ({ cwd, operation, value, fresh }, context) => {
      let client = clients.get(cwd);
      if (!client || client.signal?.aborted) {
        if (clients.size >= 32) clients.delete(clients.keys().next().value!);
        client = new ToudocuClient(cwd, 'toudocu', context.lifecycle.signal);
        clients.set(cwd, client);
      }
      return client.call(operation as Operation, value, context.signal, fresh);
    },
  },
});
