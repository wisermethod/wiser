---
name: calcom
type: connector
category: communication
description: Reads and manages bookings, availability, calendars, events, and related settings in personal Cal.com accounts through labelled connections, with confirmation on every write
version: 0.1.1
---

# Cal.com

Cal.com schedules meetings and hosts events. This connector reaches the personal-account API, including bookings and attendees, event types, availability, calendars, contacts, Events, webhooks, workflows, insights, and Discover.

## Status

Shipped 2026-11-23. Verified at release against the gateway's fake provider, and before release by live calls to Cal.com's API: a read in each module, every one answering except `verified-resources`, and a create, read back and removal of an event type, a schedule, an out-of-office entry, a webhook, a slot reservation and a booking. Every other write is verified against the fake provider only. The human connect through the Wiser endpoint is separate and is not claimed here.

## Several accounts

Use one labelled connection per Cal.com account. Use the account's own name as the label, such as its Cal.com username. One connect binds every Cal.com module under that label to the same key. Name the label on every call. If only labelled connections exist, the gateway refuses a call with no label. An unlabelled connection can serve a single account. See [Connecting Cal.com](auth.md).

## Reaching it

Call `execute` with the action id through the Wiser endpoint or the local gateway. Pass `label` beside `action` and `input` as a gateway argument. The connector supplies the pinned `cal-api-version` header on endpoints that require it. The action schema has no version-header input.

Use `describe_action` for the full schema and the action's description. The gateway checks required inputs, types, enums, patterns and array item types. The module checks the published nested rules and length, value and item bounds. Lengths count code points. Cal.com checks formats and variant-specific requirements. Published nullable fields accept their non-null type only. Use a string for the numeric or UUID `eventTypeId` on `calcom.event-types.get` and `calcom.insights.get_booking_limits_usage`. Supply `hostUsernames` as an array to `calcom.slots.list`. The connector sends one query value per username.

For `calcom.bookings.create`, regular and recurring bookings take `attendee` and a UTC `start`, with the event type determining whether a booking recurs. For an instant booking supply `attendee` and `instant: true`. Regular or recurring rescheduling takes `start`, and rescheduling a seat also takes `seatUid`. Cancelling a seat takes `seatUid`. A location's `type` selects its address, link, integration or organizer's default app variant. On location creation, the first three variants also require `address`, `link`, or `integration` respectively. On update, `type` must match the saved location and Cal.com validates any changes to it.

Cal.com validates keys and values in open objects such as profile `metadata`, booking `metadata` and `bookingFieldsResponses`. On `calcom.slots.calculate`, `response` is the whole JSON body. Use routing form field identifiers as keys and option labels as answers. The action calculates slots without saving the response.

## What it sends

Every action below stops for confirmation every time, including actions that queue delivery or set up future delivery. Every other write also stops every time.

| Actions | Who or what they reach |
|---|---|
| `calcom.bookings.create`, `calcom.bookings.cancel`, `calcom.bookings.reschedule`, `calcom.bookings.confirm`, `calcom.bookings.decline`, `calcom.bookings.confirm_seats`, `calcom.bookings.decline_seats` | Cal.com can notify the host, attendees and invited guests, or the attendees in the selected seats. |
| `calcom.bookings.request_reschedule` | Cancels the booking and emails the attendee a link to reschedule. |
| `calcom.bookings.reassign`, `calcom.bookings.reassign_host` | Can notify the affected hosts and booking participants. The destination host is selected by Cal.com or identified by the caller. |
| `calcom.bookings.add_attendee`, `calcom.bookings.add_guests` | An added attendee receives the booking details. Adding guests can notify the new guests, existing guests, organizer and team members according to event type settings. Recipients can come from explicit addresses, contacts or contact tags. |
| `calcom.bookings.update_location` | Emails attendees and, unless `notifyHosts` is false, hosts. It also updates the connected calendar event and can provision a conference link. |
| `calcom.bookings.send_email_code`, `calcom.verified-resources.send_email_code`, `calcom.verified-resources.send_phone_code` | Sends a verification code to the supplied email address or phone number. |
| `calcom.events.invite_guests`, `calcom.events.invite_co_host` | Emails the selected guests an invitation or the named co-host a link to accept. Guest recipients can come from supplied addresses, contacts, contact tags or confirmed guests of a prior Event. |
| `calcom.events.message_guests`, `calcom.events.cancel_message` | Queues email to the selected guest segment, with SMS for phone-only guests where available, or stops a scheduled message before delivery. |
| `calcom.events.publish`, `calcom.events.cancel`, `calcom.events.delete` | Publishing opens the Event's public page and adds it to the hosts' calendars. Cancellation notifies registered guests. Deleting an upcoming published Event cancels it before removal and sends those notices. |
| `calcom.events.approve_guest`, `calcom.events.approve_guests`, `calcom.events.decline_guest` | Acts on the selected guests' registrations. Cal.com emails a declined guest and sends payment requests for approvals on paid Events. |
| `calcom.events.add_location`, `calcom.events.update_location`, `calcom.events.remove_location` | Changing a published Event's locations emails registered guests. |
| `calcom.webhooks.create`, `calcom.webhooks.update`, `calcom.event-types.create_webhook`, `calcom.event-types.update_webhook` | Configures Cal.com to send booking data on the selected triggers to an address the caller names. |
| `calcom.workflows.create`, `calcom.workflows.update` | Configures later sends without another gateway confirmation. Steps can send email or SMS to hosts, attendees or supplied destinations, including WhatsApp messages and webhook deliveries where the workflow supports them. |
| `calcom.discover.book_business`, `calcom.discover.call_business` | Reaches the third-party business identified by `businessUrl`, either through its online booking page or by phone. Either action can spend Cal.com credits at an unpublished price. |
| `calcom.discover.create_service_request`, `calcom.profile.update` | A service request can result in an email to the account address when a matching provider joins. A profile email change can require verification of the new address. |

Cal.com charges nothing per API call on a personal plan. Calendar disconnect removes the connection to the selected calendar and stops for confirmation as a destructive action.

## Secrets

The connector replaces every answer field named `secret` (webhook signing secret), `password`, `pin`, `accessCode` or `meetingCode` (what a calendar event's video, phone or SIP location needs to join), or `shareToken` (Cal Video recording token) with `null`. When it withholds values, the result includes a `withheld` array with each field's path. Identifiers such as `credentialId` and flags such as `hasSecret` pass through.

No action publishes a `secret` input. Workflow step objects are open because Cal.com defines their variants. A step carrying a top-level `secret` key is refused as `invalid_arguments` on `steps` before the connector sends the request. Set webhook and workflow signing secrets in Cal.com.

## Failures

A Cal.com HTTP refusal reports `vendor_error` with the HTTP status, endpoint and method. The refusal's reason and response body are withheld. Check the action's published schema and description against the inputs you sent. If Cal.com returns an error inside a successful HTTP response, the connector also reports its string `error.code` when present.

A 429 is subject to the Cal.com account key's own limit of 120 requests per minute. For 401 and 403, the gateway refreshes the connection status. If a call returns `needs_connect`, connect the intended account label before trying again.

## Excluded

| Operations | Reason |
|---|---|
| `POST /v2/api-keys/refresh` | Returns a new API key and revokes the key the gateway holds. |
| `GET /v2/auth/oauth2/clients/{clientId}`, `POST /v2/auth/oauth2/token` | Handle OAuth client credentials or exchange tokens. |
| `GET /v2/calendars/{calendar}/save`, `GET /v2/conferencing/{app}/oauth/callback`, `GET /v2/stripe/save` | Browser redirect targets that receive authorization codes. |
| `POST /v2/calendars/{calendar}/credentials` | Requires an Apple app-specific password. |
| `POST /v2/notifications/subscriptions/app-push`, `DELETE /v2/notifications/subscriptions/app-push` | Require the Cal.com mobile app's device push token. |
| `POST /v2/notifications/subscriptions/{slack,telegram,imessage}/link-intents` | Return a linking token. |
| `POST /v2/events/{uuid}/check-ins` | Requires a scanned guest ticket token. Check-in by registration ID is available. |
| `POST /v2/feedback` | Submits feedback about Cal.com's own MCP server. |
| `POST /v2/credits/charge` | Charges Cal.com credits at an unpublished price. |
| `POST /v2/events/{uuid}/cover-image`, `POST /v2/events/{uuid}/person-avatar` | Multipart uploads require prepared file records that the connector's agreement checks cannot supply. Deferred to a future build. |

Teams, Organizations and deprecated Platform endpoints are outside the personal-account connector.

## Credentials

The gateway's provider holds the Cal.com API key for toolkit `CAL`. The connector uses the provider's proxy without unwrapping the key. There is no connector credential file. A Cal.com API key grants account-wide read and write access, so every module declares grant privilege `write`, even when its actions only read.

## Modules

A question mark marks an optional input. Cal.com can require an optional input for a specific variant. The action's description gives those requirements.

<!-- generated:modules -->

### profile

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.profile.clear_booking_limits` | Clear my booking limits. | `always` | `{}` |
| `calcom.profile.create_absence` | Create an out-of-office entry for the authenticated user. | `always` | `{start, end, notes?, toUserId?, reason?}` |
| `calcom.profile.delete_absence` | Delete an out-of-office entry for the authenticated user. | `always` | `{oooId}` |
| `calcom.profile.get` | Get my profile. | `none` | `{}` |
| `calcom.profile.get_booking_limits` | Get my booking limits. | `none` | `{}` |
| `calcom.profile.list_absences` | Get all out-of-office entries for the authenticated user. | `none` | `{take?, skip?, sortStart?, sortEnd?}` |
| `calcom.profile.list_timezones` | Get timezones. | `none` | `{search?, limit?}` |
| `calcom.profile.update` | Update my profile. | `always` | `{email?, name?, timeFormat?, defaultScheduleId?, weekStart?, timeZone?, locale?, avatarUrl?, bio?, metadata?}` |
| `calcom.profile.update_absence` | Update an out-of-office entry for the authenticated user. | `always` | `{oooId, start?, end?, notes?, toUserId?, reason?}` |
| `calcom.profile.update_booking_limits` | Update my booking limits. | `always` | `{perDay?, perWeek?, perMonth?, perYear?}` |

### bookings

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.bookings.add_attendee` | Add an attendee to a booking. | `always` | `{bookingUid, name, timeZone, phoneNumber?, language?, email}` |
| `calcom.bookings.add_guests` | Add guests to an existing booking. | `always` | `{bookingUid, guests?, contactIds?, contactTagIds?}` |
| `calcom.bookings.cancel` | Cancel a booking. | `always` | `{bookingUid, cancellationReason?, cancelSubsequentBookings?, seatUid?}` |
| `calcom.bookings.check_email_verification` | Check if email verification is required. | `none` | `{email, userSessionEmail?}` |
| `calcom.bookings.confirm` | Confirm a booking. | `always` | `{bookingUid}` |
| `calcom.bookings.confirm_seats` | Confirm booking seats. | `always` | `{bookingUid, seatUids}` |
| `calcom.bookings.create` | Create a booking. | `always` | `{start?, attendee, bookingFieldsResponses?, leadEnrichmentOptOut?, eventTypeId?, eventTypeSlug?, username?, teamSlug?, organizationSlug?, usernames?, hostUsernames?, guests?, meetingUrl?, location?, metadata?, lengthInMinutes?, routing?, emailVerificationCode?, allowConflicts?, allowBookingOutOfBounds?, skipBookingLimits?, instant?, instantMeetingExpiresInSeconds?, recurrenceCount?}` |
| `calcom.bookings.decline` | Decline a booking. | `always` | `{bookingUid, reason?}` |
| `calcom.bookings.decline_seats` | Decline booking seats. | `always` | `{bookingUid, seatUids, reason?}` |
| `calcom.bookings.get` | Get a booking. | `none` | `{bookingUid}` |
| `calcom.bookings.get_attendee` | Get a specific attendee for a booking. | `none` | `{bookingUid, attendeeId}` |
| `calcom.bookings.get_by_seat` | Get a booking by seat UID. | `none` | `{seatUid}` |
| `calcom.bookings.get_calendar_links` | Get 'Add to Calendar' links for a booking. | `none` | `{bookingUid}` |
| `calcom.bookings.get_recordings` | Get all the recordings for the booking. | `none` | `{bookingUid}` |
| `calcom.bookings.get_references` | Get booking references. | `none` | `{bookingUid, type?}` |
| `calcom.bookings.get_routing_trace` | Get the routing trace for a booking. | `none` | `{bookingUid}` |
| `calcom.bookings.get_transcripts` | Get Cal Video real time transcript download links for the booking. | `none` | `{bookingUid}` |
| `calcom.bookings.get_video_sessions` | Get Video Meeting Sessions. | `none` | `{bookingUid}` |
| `calcom.bookings.list` | Get all bookings. | `none` | `{status?, attendeeEmail?, attendeeName?, bookingUid?, eventTypeIds?, eventTypeId?, teamsIds?, teamId?, afterStart?, beforeEnd?, afterCreatedAt?, beforeCreatedAt?, afterUpdatedAt?, beforeUpdatedAt?, sortStart?, sortEnd?, sortCreated?, sortUpdatedAt?, cursor?, limit?}` |
| `calcom.bookings.list_attendees` | Get all attendees for a booking. | `none` | `{bookingUid}` |
| `calcom.bookings.mark_absent` | Mark a booking absence. | `always` | `{bookingUid, host?, attendees?}` |
| `calcom.bookings.reassign` | Reassign a booking. | `always` | `{bookingUid, userUuid?, reason?}` |
| `calcom.bookings.reassign_host` | Reassign a booking to a specific host. | `always` | `{bookingUid, userId, reason?}` |
| `calcom.bookings.request_reschedule` | Request to reschedule a booking. | `always` | `{bookingUid, rescheduleReason?}` |
| `calcom.bookings.reschedule` | Reschedule a booking. | `always` | `{bookingUid, start, lengthInMinutes?, rescheduledBy?, reschedulingReason?, emailVerificationCode?, rescheduleWithSameHost?, allowConflicts?, allowBookingOutOfBounds?, skipBookingLimits?, seatUid?}` |
| `calcom.bookings.send_email_code` | Send email verification code. | `always` | `{email, username?, language?, isVerifyingEmail?, eventTypeId?}` |
| `calcom.bookings.update_location` | Update booking location for an existing booking. | `always` | `{bookingUid, location?, notifyHosts?}` |
| `calcom.bookings.verify_email` | Verify email with code. | `always` | `{email, code}` |

### slots

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.slots.calculate` | Calculate slots based on routing form response. | `none` | `{start, end, timeZone?, duration?, format?, bookingUidToReschedule?, rescheduleWithSameHost?, routingFormId, response}` |
| `calcom.slots.delete_reservation` | Delete a reserved slot. | `always` | `{uid}` |
| `calcom.slots.get_reservation` | Get reserved slot. | `none` | `{uid}` |
| `calcom.slots.list` | Get available time slots for an event type. | `none` | `{hostUsernames?, bookingUidToReschedule?, start, end, organizationSlug?, teamSlug?, username?, eventTypeSlug?, eventTypeId?, usernames?, format?, duration?, timeZone?}` |
| `calcom.slots.reserve` | Reserve a slot. | `always` | `{eventTypeId, slotStart, slotDuration?, reservationDuration?}` |
| `calcom.slots.update_reservation` | Update a reserved slot. | `always` | `{uid, eventTypeId, slotStart, slotDuration?, reservationDuration?}` |

### event-types

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.event-types.add_booking_fields` | Add custom booking fields. | `always` | `{eventTypeId, bookingFields}` |
| `calcom.event-types.clear_webhooks` | Delete all webhooks. | `always` | `{eventTypeId}` |
| `calcom.event-types.create` | Create an event type. | `always` | `{calendarInvites?, lengthInMinutes, lengthInMinutesOptions?, title, slug, description?, slotInterval?, minimumBookingNotice?, beforeEventBuffer?, afterEventBuffer?, scheduleId?, bookingLimitsCount?, bookerActiveBookingsLimit?, onlyShowFirstAvailableSlot?, bookingLimitsDuration?, bookingWindow?, offsetStart?, bookerLayouts?, confirmationPolicy?, recurrence?, requiresBookerEmailVerification?, skipAttendeeEmailDeliverabilityCheck?, emailSettings?, hideCalendarNotes?, lockTimeZoneToggleOnBookingPage?, color?, seats?, customName?, destinationCalendar?, useDestinationCalendarEmail?, hideCalendarEventDetails?, successRedirectUrl?, hideOrganizerEmail?, calVideoSettings?, hidden?, bookingRequiresAuthentication?, disableCancelling?, disableRescheduling?, interfaceLanguage?, weekStart?, allowReschedulingPastBookings?, allowReschedulingCancelledBookings?, showOptimizedSlots?, useIsolatedAvailability?, privateNoteEnabled?, privateNoteMode?, privateNoteTemplate?, locations?, bookingFields?, crm?}` |
| `calcom.event-types.create_private_link` | Create a private link for an event type. | `always` | `{eventTypeId, expiresAt?, maxUsageCount?}` |
| `calcom.event-types.create_webhook` | Create a webhook. | `always` | `{eventTypeId, payloadTemplate?, active, subscriberUrl, triggers, customHeaders?, version?, time?, timeUnit?}` |
| `calcom.event-types.delete` | Delete an event type. | `always` | `{eventTypeId}` |
| `calcom.event-types.delete_booking_field` | Delete a custom booking field. | `always` | `{eventTypeId, slug}` |
| `calcom.event-types.delete_private_link` | Delete a private link for an event type. | `always` | `{eventTypeId, linkId}` |
| `calcom.event-types.delete_webhook` | Delete a webhook. | `always` | `{webhookId, eventTypeId}` |
| `calcom.event-types.get` | Get an event type. | `none` | `{eventTypeId}` |
| `calcom.event-types.get_booking_fields` | Get booking fields. | `none` | `{eventTypeId}` |
| `calcom.event-types.get_calendar_invite_templates` | Get event-type calendar-invite templates. | `none` | `{eventTypeId}` |
| `calcom.event-types.get_history` | Get event type history. | `none` | `{eventTypeId, limit?, cursor?}` |
| `calcom.event-types.get_scheduling_config` | Get scheduling configuration. | `none` | `{eventTypeId}` |
| `calcom.event-types.get_sequence_page` | Get a sequence's booking page. | `none` | `{uid}` |
| `calcom.event-types.get_webhook` | Get a webhook. | `none` | `{webhookId, eventTypeId}` |
| `calcom.event-types.list` | List event types. | `none` | `{username?, eventSlug?, usernames?, orgSlug?, orgId?, sortCreatedAt?}` |
| `calcom.event-types.list_crm_sync_errors` | List CRM sync errors for an event type. | `none` | `{eventTypeId, appSlug, includeDismissed?, cursor?, limit?}` |
| `calcom.event-types.list_private_links` | Get all private links for an event type. | `none` | `{eventTypeId}` |
| `calcom.event-types.list_sequence_slots` | Get a sequence's available start times. | `none` | `{uid, start, end, timeZone?}` |
| `calcom.event-types.list_webhooks` | Get all webhooks. | `none` | `{eventTypeId, take?, skip?}` |
| `calcom.event-types.replace_booking_fields` | Replace booking fields. | `always` | `{eventTypeId, bookingFields}` |
| `calcom.event-types.update` | Update an event type. | `always` | `{eventTypeId, calendarInvites?, lengthInMinutes?, lengthInMinutesOptions?, title?, slug?, description?, slotInterval?, minimumBookingNotice?, beforeEventBuffer?, afterEventBuffer?, scheduleId?, bookingLimitsCount?, bookerActiveBookingsLimit?, onlyShowFirstAvailableSlot?, bookingLimitsDuration?, bookingWindow?, offsetStart?, bookerLayouts?, confirmationPolicy?, bookingProposalCount?, recurrence?, requiresBookerEmailVerification?, skipAttendeeEmailDeliverabilityCheck?, emailSettings?, hideCalendarNotes?, lockTimeZoneToggleOnBookingPage?, color?, seats?, customName?, destinationCalendar?, useDestinationCalendarEmail?, hideCalendarEventDetails?, successRedirectUrl?, hideOrganizerEmail?, calVideoSettings?, hidden?, bookingRequiresAuthentication?, disableCancelling?, disableRescheduling?, interfaceLanguage?, weekStart?, allowReschedulingPastBookings?, allowReschedulingCancelledBookings?, showOptimizedSlots?, useIsolatedAvailability?, privateNoteEnabled?, privateNoteMode?, privateNoteTemplate?, allowAffectingUpcomingBookings?, locations?, bookingFields?, crm?}` |
| `calcom.event-types.update_booking_fields` | Update booking fields. | `always` | `{eventTypeId, bookingFields}` |
| `calcom.event-types.update_calendar_invite_templates` | Update event-type calendar-invite templates. | `always` | `{eventTypeId, host?, guest?}` |
| `calcom.event-types.update_private_link` | Update a private link for an event type. | `always` | `{eventTypeId, linkId, expiresAt?, maxUsageCount?}` |
| `calcom.event-types.update_webhook` | Update a webhook. | `always` | `{webhookId, eventTypeId, payloadTemplate?, active?, subscriberUrl?, triggers?, customHeaders?, version?, time?, timeUnit?}` |

### schedules

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.schedules.create` | Create a schedule. | `always` | `{name, timeZone, availability?, isDefault, overrides?}` |
| `calcom.schedules.delete` | Delete a schedule. | `always` | `{scheduleId}` |
| `calcom.schedules.get` | Get a schedule. | `none` | `{scheduleId}` |
| `calcom.schedules.get_default` | Get default schedule. | `none` | `{}` |
| `calcom.schedules.list` | Get all schedules. | `none` | `{}` |
| `calcom.schedules.update` | Update a schedule. | `always` | `{scheduleId, name?, timeZone?, availability?, isDefault?, overrides?}` |

### calendars

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.calendars.add_ics_feed` | Save an ICS feed. | `always` | `{urls, readOnly?}` |
| `calcom.calendars.add_selected` | Add a selected calendar. | `always` | `{integration, externalId, credentialId, delegationCredentialId?}` |
| `calcom.calendars.check` | Check a calendar connection. | `none` | `{calendar}` |
| `calcom.calendars.check_ics_feed` | Check an ICS feed. | `none` | `{}` |
| `calcom.calendars.disconnect` | Disconnect a calendar. | `always` | `{calendar, id}` |
| `calcom.calendars.get_busy_times` | Get busy times. | `none` | `{loggedInUsersTz?, timeZone?, dateFrom, dateTo, calendar}` |
| `calcom.calendars.get_connect_url` | Get OAuth connect URL. | `none` | `{calendar, isDryRun, redir?}` |
| `calcom.calendars.get_event` | Get meeting details from calendar. | `none` | `{calendar, eventUid}` |
| `calcom.calendars.list` | Get all calendars. | `none` | `{}` |
| `calcom.calendars.remove_selected` | Delete a selected calendar. | `always` | `{integration, externalId, credentialId, delegationCredentialId?}` |
| `calcom.calendars.update_destinations` | Update destination calendars. | `always` | `{integration, externalId, delegationCredentialId?}` |
| `calcom.calendars.update_event` | Update meeting details in calendar. | `always` | `{calendar, eventUid, start?, end?, title?, description?, attendees?, status?}` |

### apps

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.apps.check_stripe_connection` | Check Stripe connection. | `none` | `{}` |
| `calcom.apps.connect` | Connect your conferencing application. | `always` | `{app}` |
| `calcom.apps.disconnect` | Disconnect your conferencing application. | `always` | `{app}` |
| `calcom.apps.get_connect_url` | Get OAuth conferencing app auth URL. | `none` | `{app, returnTo, onErrorReturnTo}` |
| `calcom.apps.get_default` | Get your default conferencing application. | `none` | `{}` |
| `calcom.apps.get_stripe_connect_url` | Get Stripe connect URL. | `none` | `{}` |
| `calcom.apps.list` | List your conferencing applications. | `none` | `{}` |
| `calcom.apps.set_default` | Set your default conferencing application. | `always` | `{app}` |

### contacts

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.contacts.add` | Add a personal contact. | `always` | `{email, name?}` |
| `calcom.contacts.add_tag` | Add a tag to a contact. | `always` | `{id, tagId}` |
| `calcom.contacts.create_tag` | Create a contact tag. | `always` | `{name, color?}` |
| `calcom.contacts.dismiss_suggestion` | Dismiss a suggested contact. | `always` | `{email}` |
| `calcom.contacts.get_history` | Get a personal contact's meeting history. | `none` | `{id, status, cursor?}` |
| `calcom.contacts.get_note` | Get a personal contact's note. | `none` | `{id}` |
| `calcom.contacts.list` | List personal contacts. | `none` | `{search?, contactIds?, tagIds?, limit?, cursor?}` |
| `calcom.contacts.list_suggestions` | List suggested contacts. | `none` | `{limit?, cursor?}` |
| `calcom.contacts.list_tags` | List contact tags. | `none` | `{limit?, cursor?}` |
| `calcom.contacts.remove` | Remove a personal contact. | `always` | `{id}` |
| `calcom.contacts.remove_tag` | Remove a tag from a contact. | `always` | `{id, tagId}` |
| `calcom.contacts.update` | Update a personal contact. | `always` | `{id, name?, note?}` |

### events

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.events.add_location` | Add a location to an Event. | `always` | `{uuid, label?, price?, currency?, capacity?, type, address?, link?, integration?, credentialId?}` |
| `calcom.events.approve_guest` | Approve a guest. | `always` | `{registrationId, uuid}` |
| `calcom.events.approve_guests` | Approve every pending guest. | `always` | `{uuid, search?, locationId?, retry?}` |
| `calcom.events.cancel` | Cancel an Event. | `always` | `{uuid, reason?}` |
| `calcom.events.cancel_message` | Cancel a scheduled message. | `always` | `{messageId, uuid}` |
| `calcom.events.check_in_guest` | Check in a guest by registration id. | `always` | `{registrationId, uuid}` |
| `calcom.events.create` | Create an Event. | `always` | `{title, startTime, endTime, timeZone, slug?, description?, visibility?, capacity?, waitlistEnabled?, paymentTimeoutMinutes?, registrationOpensAt?, registrationClosesAt?, requiresApproval?, showOrganizerEmail?, guestList?, showPresentedBy?, theme?, background?, lineup?, schedule?, registrationFields?, hosts?, liveStreams?, category?, price?, currency?, locations?}` |
| `calcom.events.decline_guest` | Decline a guest. | `always` | `{registrationId, uuid}` |
| `calcom.events.delete` | Delete an Event. | `always` | `{uuid}` |
| `calcom.events.get` | Get an Event. | `none` | `{uuid}` |
| `calcom.events.get_coordinates` | Get an Event's coordinates. | `none` | `{uuid}` |
| `calcom.events.get_guest_counts` | Count an Event's guests. | `none` | `{uuid}` |
| `calcom.events.invite_co_host` | Invite a co-host to an Event. | `always` | `{uuid, email}` |
| `calcom.events.invite_guests` | Invite guests to an Event. | `always` | `{uuid, emails?, contactIds?, contactTagIds?, pastEventUuids?, hostNote?}` |
| `calcom.events.list` | List Events (cursor pagination). | `none` | `{cursor?, limit?, slug?, status?}` |
| `calcom.events.list_bookings` | List an Event's bookings. | `none` | `{cursor?, limit?, status?, rsvpResponse?, search?, locationId?, uuid}` |
| `calcom.events.list_co_hosts` | List an Event's co-hosts. | `none` | `{uuid}` |
| `calcom.events.list_locations` | Get an Event's locations. | `none` | `{uuid}` |
| `calcom.events.list_messages` | List the messages sent to an Event's guests. | `none` | `{cursor?, uuid}` |
| `calcom.events.message_guests` | Message an Event's guests. | `always` | `{uuid, segment, subject, body, scheduledAt?, locationId?, checkedIn?, contactTagId?}` |
| `calcom.events.publish` | Publish an Event. | `always` | `{uuid}` |
| `calcom.events.remove_co_host` | Remove a co-host from an Event. | `always` | `{coHostId, uuid}` |
| `calcom.events.remove_cover_image` | Remove an Event cover image. | `always` | `{uuid}` |
| `calcom.events.remove_guest_check_in` | Undo a guest's check-in. | `always` | `{registrationId, uuid}` |
| `calcom.events.remove_location` | Remove a location from an Event. | `always` | `{locationId, uuid}` |
| `calcom.events.reorder_co_hosts` | Reorder an Event's co-hosts. | `always` | `{uuid, coHostIds}` |
| `calcom.events.search_host_candidates` | Search the team members who can host an Event. | `none` | `{cursor?, limit?, search?, uuid}` |
| `calcom.events.update` | Update an Event. | `always` | `{uuid, title?, endTime?, timeZone?, description?, paymentTimeoutMinutes?, registrationOpensAt?, registrationClosesAt?, theme?, background?, lineup?, schedule?, registrationFields?, hosts?, liveStreams?, price?, currency?, startTime?, slug?, visibility?, capacity?, waitlistEnabled?, requiresApproval?, showOrganizerEmail?, guestList?, showPresentedBy?, category?}` |
| `calcom.events.update_coordinates` | Update an Event's coordinates. | `always` | `{uuid, latitude, longitude}` |
| `calcom.events.update_location` | Edit an Event's location. | `always` | `{locationId, uuid, label?, price?, currency?, capacity?, type, address?, link?, integration?, credentialId?}` |

### webhooks

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.webhooks.create` | Create a webhook. | `always` | `{payloadTemplate?, active, subscriberUrl, triggers, customHeaders?, version?, time?, timeUnit?}` |
| `calcom.webhooks.delete` | Delete a webhook. | `always` | `{webhookId}` |
| `calcom.webhooks.get` | Get a webhook. | `none` | `{webhookId}` |
| `calcom.webhooks.list` | Get all webhooks. | `none` | `{take?, skip?}` |
| `calcom.webhooks.update` | Update a webhook. | `always` | `{webhookId, payloadTemplate?, active?, subscriberUrl?, triggers?, customHeaders?, version?, time?, timeUnit?}` |

### workflows

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.workflows.create` | Create a workflow. | `always` | `{name, activation, trigger, steps}` |
| `calcom.workflows.delete` | Delete your workflow. | `always` | `{workflowId}` |
| `calcom.workflows.get` | Get your workflow. | `none` | `{workflowId}` |
| `calcom.workflows.list` | Get your workflows. | `none` | `{take?, skip?}` |
| `calcom.workflows.list_condition_fields` | Get the fields a workflow's conditions can read. | `none` | `{workflowId}` |
| `calcom.workflows.update` | Update your workflow. | `always` | `{workflowId, name?, activation?, trigger?, steps?}` |

### insights

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.insights.get_average_booking_duration` | Get average booking duration. | `none` | `{scope, selectedTeamId?, timeZone, columnFilters}` |
| `calcom.insights.get_booking_limits_usage` | Get booking limits usage. | `none` | `{scope, selectedTeamId?, date?, eventTypeId?, userUuids?, offset, limit}` |
| `calcom.insights.get_booking_member_stats` | Get booking member stats. | `none` | `{scope, selectedTeamId?, timeZone, columnFilters?}` |
| `calcom.insights.get_event_trends` | Get booking event trends. | `none` | `{scope, selectedTeamId?, timeZone, columnFilters}` |
| `calcom.insights.get_failed_bookings_by_field` | Get failed bookings by routing field. | `none` | `{scope, selectedTeamId?, startDate, endDate, columnFilters?}` |
| `calcom.insights.get_kpi_stats` | Get booking KPI stats. | `none` | `{scope, selectedTeamId?, timeZone, columnFilters}` |
| `calcom.insights.get_routed_users_per_period` | Get routed-to users per period. | `none` | `{scope, selectedTeamId?, startDate, endDate, columnFilters?, period, limit, searchQuery?}` |
| `calcom.insights.get_routing_form_field_options` | Get routing form field options. | `none` | `{scope, selectedTeamId?, routingFormId?}` |
| `calcom.insights.get_routing_form_responses` | Get routing form responses. | `none` | `{scope, selectedTeamId?, startDate, endDate, columnFilters?, sorting?, offset, limit}` |
| `calcom.insights.get_routing_form_statuses` | Get routing forms by status. | `none` | `{scope, selectedTeamId?, startDate, endDate, columnFilters?}` |
| `calcom.insights.get_routing_response_headers` | Get routing form response headers. | `none` | `{scope, selectedTeamId?, routingFormId?}` |

### verified-resources

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.verified-resources.get_email` | Get verified email by id. | `none` | `{id}` |
| `calcom.verified-resources.get_phone` | Get verified phone number by id. | `none` | `{id}` |
| `calcom.verified-resources.list_emails` | Get list of verified emails. | `none` | `{take?, skip?}` |
| `calcom.verified-resources.list_phones` | Get list of verified phone numbers. | `none` | `{take?, skip?}` |
| `calcom.verified-resources.send_email_code` | Request email verification code. | `always` | `{email}` |
| `calcom.verified-resources.send_phone_code` | Request phone number verification code. | `always` | `{phone}` |
| `calcom.verified-resources.verify_email` | Verify an email. | `always` | `{email, code}` |
| `calcom.verified-resources.verify_phone` | Verify a phone number. | `always` | `{phone, code}` |

### notifications

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.notifications.get_agent_channels` | Get the agent notification channel selection. | `none` | `{}` |
| `calcom.notifications.remove_imessage_subscription` | Remove an iMessage push subscription. | `always` | `{identifier, subscriptionId?, subscriptionVersion?}` |
| `calcom.notifications.remove_slack_subscription` | Remove a Slack push subscription. | `always` | `{identifier, teamId, subscriptionId?, subscriptionVersion?}` |
| `calcom.notifications.remove_telegram_subscription` | Remove a Telegram push subscription. | `always` | `{identifier, subscriptionId?, subscriptionVersion?}` |
| `calcom.notifications.set_agent_channel` | Enable or disable an agent notification channel. | `always` | `{channel, enabled}` |

### discover

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.discover.book_business` | Book a web-found business online. | `always` | `{businessUrl, service, area, daysFromToday, partOfDay, budgetDollars?, idempotencyKey}` |
| `calcom.discover.call_business` | Call a web-found business to book. | `always` | `{businessUrl, service, timing?, staff?, notes?, daysFromToday?, callerName?}` |
| `calcom.discover.create_service_request` | Ask to be told when a Discover provider joins. | `always` | `{service, category, subcategory?, searchedArea?}` |
| `calcom.discover.get_listings` | Get Discover listings by id. | `none` | `{ids, includeNextAvailable?}` |
| `calcom.discover.list_favorites` | List your Discover favorites. | `none` | `{}` |
| `calcom.discover.search_listings` | Search Discover listings. | `none` | `{category?, subcategory?, query?, neighborhood?, onlineOnly?, localQuery?, area?, maximumPrice?, maximumDurationMinutes?, availableWithin?}` |

### account

| Action id | Summary | Confirmation | Inputs |
|---|---|---|---|
| `calcom.account.check_credits` | Check available credits. | `none` | `{}` |
| `calcom.account.delete_link` | Delete a link. | `always` | `{linkUid}` |
| `calcom.account.get_ip_allowlist` | Get the Cal.com IP allowlist of one service. | `none` | `{service}` |
| `calcom.account.get_link` | Get a link. | `none` | `{linkUid}` |
| `calcom.account.list_ip_allowlists` | Get the Cal.com IP allowlists. | `none` | `{}` |

<!-- /generated:modules -->

## Reference

- [Connecting Cal.com](auth.md)
- [Gateway setup](../../gateway/SETUP.md)
- [Cal.com API v2](https://cal.com/docs/api-reference/v2/introduction.md)
