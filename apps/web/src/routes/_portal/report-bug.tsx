import { useState } from 'react'
import { createFileRoute, Link, Navigate, redirect } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { FormattedMessage, useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createMyTicketFn } from '@/lib/server/functions/tickets'
import { buildSigninRedirect } from '@/lib/shared/auth-prompt'
import { useWorkspaceSettings } from '@/lib/client/hooks/use-root-context'

/**
 * Portal bug report form. Files a ticket as the signed-in requester through
 * `createMyTicketFn`; anonymous visitors are sent to sign in first and come
 * back here. Off unless support tickets are enabled.
 */
export const Route = createFileRoute('/_portal/report-bug')({
  beforeLoad: ({ context }) => {
    const user = context.session?.user
    if (!user || user.principalType === 'anonymous') {
      throw redirect(buildSigninRedirect('/report-bug'))
    }
  },
  component: ReportBugPage,
})

function ReportBugPage() {
  const intl = useIntl()
  const settings = useWorkspaceSettings()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      createMyTicketFn({
        data: { title: title.trim(), description: description.trim() || undefined },
      }),
  })

  if (!settings?.featureFlags?.supportTickets) {
    return <Navigate to="/" />
  }

  if (submit.isSuccess) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-foreground">
          <FormattedMessage id="portal.reportBug.sent.title" defaultMessage="Thanks, we got it" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <FormattedMessage
            id="portal.reportBug.sent.body"
            defaultMessage="Your report is now a ticket. You can follow it in Messages."
          />
        </p>
        <Button asChild className="mt-4">
          <Link to="/support">
            <FormattedMessage id="portal.reportBug.sent.cta" defaultMessage="Open Messages" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">
        <FormattedMessage id="portal.reportBug.title" defaultMessage="Report a bug" />
      </h1>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) submit.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-bug-title">
            <FormattedMessage id="portal.reportBug.field.title" defaultMessage="What went wrong?" />
          </Label>
          <Input
            id="report-bug-title"
            value={title}
            maxLength={300}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-bug-description">
            <FormattedMessage
              id="portal.reportBug.field.description"
              defaultMessage="Steps to reproduce, what you expected, what happened"
            />
          </Label>
          <Textarea
            id="report-bug-description"
            value={description}
            maxLength={4000}
            rows={6}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {submit.isError && (
          <p role="alert" className="text-sm text-destructive">
            {intl.formatMessage({
              id: 'portal.reportBug.error',
              defaultMessage: 'We could not send your report. Please try again.',
            })}
          </p>
        )}
        <div>
          <Button type="submit" disabled={!title.trim() || submit.isPending}>
            <FormattedMessage id="portal.reportBug.submit" defaultMessage="Send report" />
          </Button>
        </div>
      </form>
    </div>
  )
}
