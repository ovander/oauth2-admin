/**
 * MSW Node server — used by Vitest (Node/happy-dom environment).
 *
 * Lifecycle is managed in src/__tests__/setup.ts:
 *   beforeAll  → server.listen()
 *   afterEach  → server.resetHandlers()    (restores defaults)
 *   afterAll   → server.close()
 */
import { setupServer } from 'msw/node'
import { handlers }    from './handlers'

export const server = setupServer(...handlers)
