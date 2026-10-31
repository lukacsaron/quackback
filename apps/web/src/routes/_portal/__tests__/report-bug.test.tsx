// @vitest-environment happy-dom
/**
 * Portal bug report form: signed-in requesters file a ticket through
 * createMyTicketFn; anonymous visitors are redirected to sign in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntlProvider } from 'react-intl'

const routeCtx = vi.hoisted(() => ({
  settings: { featureFlags: { supportTickets: true } } as {
    featureFlags: { supportTickets?: boolean }
  },
}))
const navigateSpy = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <T extends object>(options: T) => ({ ...options }),
  redirect: (opts: unknown) => ({ redirect: opts }),
  useRouteContext: (opts?: { select?: (context: never) => unknown }) =>
    opts?.select ? opts.select(routeCtx as never) : routeCtx,
  Navigate: (props: { to: string }) => {
    navigateSpy(props.to)
    return null
  },
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const createMyTicketFn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server/functions/tickets', () => ({ createMyTicketFn }))

import { Route } from '../report-bug'

type RouteShape = {
  beforeLoad: (args: { context: { session: unknown } }) => void
  component: React.ComponentType
}
const route = Route as unknown as RouteShape
const Page = route.component

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en" messages={{}}>
        <Page />
      </IntlProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  routeCtx.settings = { featureFlags: { supportTickets: true } }
  navigateSpy.mockReset()
  createMyTicketFn.mockReset()
})

afterEach(cleanup)

describe('portal report-bug route', () => {
  it('redirects a visitor with no session to sign in, returning to /report-bug', () => {
    expect(() => route.beforeLoad({ context: { session: null } })).toThrow()
    try {
      route.beforeLoad({ context: { session: null } })
    } catch (thrown) {
      expect(thrown).toEqual({
        redirect: { to: '/', search: { auth: 'signin', callbackUrl: '/report-bug' } },
      })
    }
  })

  it('redirects an anonymous principal to sign in', () => {
    expect(() =>
      route.beforeLoad({ context: { session: { user: { principalType: 'anonymous' } } } })
    ).toThrow()
  })

  it('lets a signed-in user through', () => {
    expect(() =>
      route.beforeLoad({ context: { session: { user: { principalType: 'user' } } } })
    ).not.toThrow()
  })

  it('files the report as a ticket and links to Messages', async () => {
    createMyTicketFn.mockResolvedValue({ id: 'ticket_1' })
    renderPage()

    fireEvent.change(screen.getByLabelText('What went wrong?'), {
      target: { value: '  Chart freezes  ' },
    })
    fireEvent.change(
      screen.getByLabelText('Steps to reproduce, what you expected, what happened'),
      { target: { value: 'Open the chart, wait 5 s' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(screen.getByText('Thanks, we got it')).toBeTruthy())
    expect(createMyTicketFn).toHaveBeenCalledWith({
      data: { title: 'Chart freezes', description: 'Open the chart, wait 5 s' },
    })
    expect(screen.getByRole('link', { name: 'Open Messages' }).getAttribute('href')).toBe(
      '/support'
    )
  })

  it('shows an error and keeps the form when the ticket cannot be created', async () => {
    createMyTicketFn.mockRejectedValue(new Error('boom'))
    renderPage()
    fireEvent.change(screen.getByLabelText('What went wrong?'), { target: { value: 'Bug' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Send report' })).toBeTruthy()
  })

  it('does not submit an empty title', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(createMyTicketFn).not.toHaveBeenCalled()
  })

  it('leaves the page when support tickets are off', () => {
    routeCtx.settings = { featureFlags: { supportTickets: false } }
    renderPage()
    expect(navigateSpy).toHaveBeenCalledWith('/')
    expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull()
  })
})
