import { createContext, useContext } from 'react';
import type { Me } from './client';

export const AccessContext = createContext<Me | null>(null);

export function useAccess(): Me {
  const value = useContext(AccessContext);

  if (!value) {
    throw new Error('useAccess must be used inside the app shell');
  }

  return value;
}
