import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { resolveExternalSignInUrl } from '@/lib/shared/external-signin'

type AuthMode = 'login' | 'signup'

/** An `account_not_linked` recovery request: the OAuth sign-in found an
 *  existing local account that isn't verified yet. The dialog opens
 *  straight into the link-conflict view so the user can confirm the
 *  email and have the provider connected. */
export interface LinkConflictContext {
  providerId?: string
  providerType?: 'oidc' | 'social'
  email?: string
}

interface OpenAuthPopoverOptions {
  mode: AuthMode
  onSuccess?: () => void
  callbackUrl?: string
  linkConflict?: LinkConflictContext
  /** Keep Quackback's own dialog even when sign-in is delegated — set when the
   *  dialog is opened to show a sign-in error, which a redirect would lose
   *  (and could loop on). */
  nativeDialog?: boolean
}

interface AuthPopoverContextValue {
  isOpen: boolean
  mode: AuthMode
  callbackUrl: string | undefined
  linkConflict: LinkConflictContext | undefined
  openAuthPopover: (options: OpenAuthPopoverOptions) => void
  closeAuthPopover: () => void
  setMode: (mode: AuthMode) => void
  /** Called when auth completes successfully */
  onAuthSuccess: () => void
}

const AuthPopoverContext = createContext<AuthPopoverContextValue | null>(null)

interface AuthPopoverProviderProps {
  children: ReactNode
  /** `portalConfig.externalSignInUrl`: when set, opening the dialog sends the
   *  visitor to the workspace's own sign-in instead (team targets excepted). */
  externalSignInUrl?: string | null
}

export function AuthPopoverProvider({ children, externalSignInUrl }: AuthPopoverProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [callbackUrl, setCallbackUrl] = useState<string | undefined>(undefined)
  const [linkConflict, setLinkConflict] = useState<LinkConflictContext | undefined>(undefined)
  const onSuccessCallbackRef = useRef<(() => void) | null>(null)

  const openAuthPopover = useCallback(
    (options: OpenAuthPopoverOptions) => {
      // Delegated portal sign-in. A link-conflict recovery is a Quackback-side
      // OAuth state and an error landing must show its error, so both keep the
      // dialog.
      if (externalSignInUrl && !options.linkConflict && !options.nativeDialog) {
        const here = `${window.location.pathname}${window.location.search}`
        const target = resolveExternalSignInUrl(externalSignInUrl, options.callbackUrl ?? here)
        if (target) {
          window.location.assign(target)
          return
        }
      }
      setMode(options.mode)
      onSuccessCallbackRef.current = options.onSuccess || null
      setCallbackUrl(options.callbackUrl)
      setLinkConflict(options.linkConflict)
      setIsOpen(true)
    },
    [externalSignInUrl]
  )

  const reset = useCallback(() => {
    setIsOpen(false)
    setCallbackUrl(undefined)
    setLinkConflict(undefined)
    onSuccessCallbackRef.current = null
  }, [])

  const closeAuthPopover = reset

  const onAuthSuccess = useCallback(() => {
    onSuccessCallbackRef.current?.()
    reset()
  }, [reset])

  return (
    <AuthPopoverContext.Provider
      value={{
        isOpen,
        mode,
        callbackUrl,
        linkConflict,
        openAuthPopover,
        closeAuthPopover,
        setMode,
        onAuthSuccess,
      }}
    >
      {children}
    </AuthPopoverContext.Provider>
  )
}

export function useAuthPopover(): AuthPopoverContextValue {
  const context = useContext(AuthPopoverContext)
  if (!context) {
    throw new Error('useAuthPopover must be used within an AuthPopoverProvider')
  }
  return context
}

/**
 * Safe version that returns null if not within provider.
 * Useful for components that may be rendered outside portal layout.
 */
export function useAuthPopoverSafe(): AuthPopoverContextValue | null {
  return useContext(AuthPopoverContext)
}
