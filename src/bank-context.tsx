import { createContext, useContext, useState, type ReactNode } from 'react';
import { send } from './bridge';
import { createDemoBank } from './demo-bank';
import type { ApiResult, Operation } from './api-model';
import type { Snapshot } from './domain';

type Bank = { call: (operation: Operation) => Promise<ApiResult>; demo: boolean };
const Context = createContext<Bank | null>(null);
export function BankProvider({
  mode,
  initial,
  children,
}: {
  mode: 'demo' | 'live';
  initial: Snapshot;
  children: ReactNode;
}) {
  const [bank] = useState<Bank>(() =>
    mode === 'demo'
      ? { call: createDemoBank(initial), demo: true }
      : {
          demo: false,
          call: async (operation) => {
            const reply = await send({ kind: 'api', operation });
            if (reply.kind !== 'api')
              throw new Error('Unexpected response from your bank connection.');
            return reply.result;
          },
        },
  );
  return <Context.Provider value={bank}>{children}</Context.Provider>;
}
export function useBank() {
  const bank = useContext(Context);
  if (!bank) throw new Error('A bank session is required.');
  return bank;
}
