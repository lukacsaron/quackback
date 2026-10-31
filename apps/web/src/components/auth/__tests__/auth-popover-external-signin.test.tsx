// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { AuthPopoverProvider, useAuthPopover } from '../auth-popover-context'

const EXTERNAL = 'https://app.example.com/api/feedback/sso'

type Ctx = ReturnType<typeof useAuthPopover>
let ctx: Ctx | null = null
function Probe() {
  ctx = useAuthPopover()
  return null
}

describe('AuthPopoverProvider with externalSignInUrl', () => {
  const assign = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    assign.mockClear()
    ctx = null
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/b/ideas', search: '?sort=top', assign },
    })
  })
  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('sends a portal sign-in to the external URL with the current path as returnTo', () => {
    render(
      <AuthPopoverProvider externalSignInUrl={EXTERNAL}>
        <Probe />
      </AuthPopoverProvider>
    )
    act(() => ctx!.openAuthPopover({ mode: 'login' }))
    expect(assign).toHaveBeenCalledWith(`${EXTERNAL}?returnTo=%2Fb%2Fideas%3Fsort%3Dtop`)
    expect(ctx!.isOpen).toBe(false)
  })

  it('prefers an explicit callbackUrl', () => {
    render(
      <AuthPopoverProvider externalSignInUrl={EXTERNAL}>
        <Probe />
      </AuthPopoverProvider>
    )
    act(() => ctx!.openAuthPopover({ mode: 'login', callbackUrl: '/roadmap' }))
    expect(assign).toHaveBeenCalledWith(`${EXTERNAL}?returnTo=%2Froadmap`)
  })

  it('keeps the native dialog for team sign-in, error landings and link conflicts', () => {
    render(
      <AuthPopoverProvider externalSignInUrl={EXTERNAL}>
        <Probe />
      </AuthPopoverProvider>
    )
    act(() => ctx!.openAuthPopover({ mode: 'login', callbackUrl: '/admin' }))
    act(() => ctx!.openAuthPopover({ mode: 'login', nativeDialog: true }))
    act(() => ctx!.openAuthPopover({ mode: 'login', linkConflict: { email: 'a@b.c' } }))
    expect(assign).not.toHaveBeenCalled()
    expect(ctx!.isOpen).toBe(true)
  })

  it('without the setting, opens the native dialog (unchanged)', () => {
    render(
      <AuthPopoverProvider>
        <Probe />
      </AuthPopoverProvider>
    )
    act(() => ctx!.openAuthPopover({ mode: 'login' }))
    expect(assign).not.toHaveBeenCalled()
    expect(ctx!.isOpen).toBe(true)
  })
})
