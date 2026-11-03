# React: `@americanbible/api-bible-sdk-react`

```bash
npm install @americanbible/api-bible-sdk-react @americanbible/api-bible-sdk react
```

The package provides `ApiBibleProvider` and one hook per endpoint: `useBibles`, `useBible`,
`useBooks`, `useChapters`, `useChapter`, `useVerses`, `useVerse`, `usePassages`, `useSearch`,
`useSectionsForBook`, `useSectionsForChapter`, `useSection` and the `useAudio*` hooks. Each hook
returns `{ data, error, isLoading, status, refetch }`. It works with React 18 and 19.

## Keep the key out of the browser

**Never pass `apiKey` to a provider that runs in the browser.** Anything in a client bundle is
public. Point the provider at **your own server-side proxy** instead. The proxy adds the key and
forwards the request to `https://rest.api.bible/v1`.

```tsx
'use client';

import type { ReactNode } from 'react';
import { ApiBibleProvider } from '@americanbible/api-bible-sdk-react';

export function Providers({ children }: { children: ReactNode }) {
  return <ApiBibleProvider config={{ baseUrl: '/api/bible' }}>{children}</ApiBibleProvider>;
}
```

Use the reference proxy in the package README
(https://github.com/americanbible/api-bible-sdks/tree/main/packages/react#server-side-proxy), a
Next.js route handler at `app/api/bible/[...path]/route.ts`, rather than writing your own. A
careless proxy turns your key into an open relay. The reference version:

- adds `api-key` on the server and forwards none of the browser's headers;
- allows only `GET` under `/bibles` and `/audio-bibles`, and rejects encoded slashes;
- refuses redirects;
- rate-limits each client IP.

In Next.js App Router:

- Mount the provider from your own `'use client'` component (as above), and render that component
  from `app/layout.tsx`.
- In **Server Components**, import from `@americanbible/api-bible-sdk`, not from the React
  package, and use the key directly. The server is a trusted environment. Fetch there when the
  content should be in the initial HTML.

## FUMS with hooks

The hooks return only `data`. **They drop `meta`, so they never hand you `meta.fumsToken`.** For any
Scripture content you display, which web apps must report to FUMS, get the shared client with
`useApiBible()`, call the method yourself, and report the token:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useApiBible, type Passage } from '@americanbible/api-bible-sdk-react';

type Fums = (command: 'trackView', token: string) => void;

export function PassageView({ bibleId, passageId }: { bibleId: string; passageId: string }) {
  const client = useApiBible();
  const [passage, setPassage] = useState<Passage>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const controller = new AbortController();
    client.passages
      .get(bibleId, passageId, { contentType: 'text' }, controller.signal)
      .then(({ data, meta }) => {
        setPassage(data);
        const fums = (window as unknown as { fums?: Fums }).fums;
        if (meta?.fumsToken && fums) fums('trackView', meta.fumsToken);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err as Error);
      });
    return () => controller.abort();
  }, [client, bibleId, passageId]);

  if (error) return <p>Could not load {passageId}.</p>;
  if (!passage) return <p>Loading…</p>;
  return (
    <figure>
      <blockquote style={{ whiteSpace: 'pre-wrap' }}>{String(passage.content ?? '')}</blockquote>
      <figcaption>
        {passage.reference}. {passage.copyright}
      </figcaption>
    </figure>
  );
}
```

The page also needs the FUMS tracker script (see `licensing-and-fums.md`). When a Server
Component fetches the content instead, pass `meta.fumsToken` down as a prop and report it from a
small client component in a `useEffect`.

The hooks are fine as they are for data that carries no token and needs no reporting: Bible and
book lists (`useBibles`, `useBooks`, `useChapters`) and translation pickers.

## Errors

`error` on a hook is a typed SDK error (`AuthError`, `NotFoundError`, …), re-exported from this
package. An unknown or unlicensed `bibleId` arrives as `AuthError` (403), not `NotFoundError`. See
`errors-and-quotas.md`.
