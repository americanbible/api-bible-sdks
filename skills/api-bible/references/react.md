# React: `@americanbible/api-bible-sdk-react`

```bash
npm install @americanbible/api-bible-sdk-react @americanbible/api-bible-sdk react
```

The package provides `ApiBibleProvider` and one hook per endpoint: `useBibles`, `useBible`,
`useBooks`, `useChapters`, `useChapter`, `useVerses`, `useVerse`, `usePassages`, `useSearch`,
`useSectionsForBook`, `useSectionsForChapter`, `useSection` and the `useAudio*` hooks. Each hook
returns `{ data, meta, error, isLoading, status, refetch }`. It works with React 18 and 19.

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

The content hooks (`useVerse`, `useChapter`, `usePassages`, `useSection`, `useSearch`,
`useAudioChapter`) return the response's `meta` next to `data`. For any Scripture content you
display, which web apps must report to FUMS, report `meta.fumsToken` from an effect:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePassages } from '@americanbible/api-bible-sdk-react';

type Fums = (command: 'trackView' | 'trackListen', token: string) => void;

export function PassageView({ bibleId, passageId }: { bibleId: string; passageId: string }) {
  const { data: passage, meta, error, isLoading } = usePassages(bibleId, passageId, {
    contentType: 'text',
  });

  // Report each token once. The ref also stops StrictMode's dev-only effect re-run from
  // reporting twice.
  const reported = useRef<string | undefined>(undefined);
  useEffect(() => {
    const token = meta?.fumsToken;
    const fums = (window as unknown as { fums?: Fums }).fums;
    if (!token || !fums || reported.current === token) return;
    reported.current = token;
    fums('trackView', token);
  }, [meta?.fumsToken]);

  if (error) return <p>Could not load {passageId}.</p>;
  if (isLoading || !passage) return <p>Loading…</p>;
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

`meta` resets with `data` when the inputs change, so a token never belongs to stale content.
If the hook result has no `meta` field, the installed package predates it: upgrade
`@americanbible/api-bible-sdk-react`.

Components that request the same content at the same moment share one request and get the same
token. Report it from the one component that owns the content, not from each one that renders it.

Report `useAudioChapter`'s token with `trackListen` instead of `trackView`, on first play (in the
`<audio>` element's `onPlay`), once per chapter. Don't key an effect on the token: `refetch()`,
used to renew an expiring `resourceUrl`, brings a new token and would report the same chapter
again.

The page also needs the FUMS tracker script (see `licensing-and-fums.md`). When a Server
Component fetches the content instead, pass `meta.fumsToken` down as a prop and report it from a
small client component in a `useEffect`.

The list and metadata hooks (`useBibles`, `useBooks`, `useChapters`, the `useSectionsFor*` hooks
and the other `useAudio*` hooks) carry no token and return `meta: undefined`. They need no
reporting.

## Errors

`error` on a hook is a typed SDK error (`AuthError`, `NotFoundError`, …), re-exported from this
package. An unknown or unlicensed `bibleId` arrives as `AuthError` (403), not `NotFoundError`. See
`errors-and-quotas.md`.
