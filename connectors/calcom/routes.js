// Generated from the pinned Cal.com OpenAPI spec.
export const routes = {
  "calcom.account.list_ip_allowlists": {
    "method": "GET",
    "path": "/v2/allowlists",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.account.get_ip_allowlist": {
    "method": "GET",
    "path": "/v2/allowlists/{service}",
    "pathParameters": [
      "service"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.bookings.create": {
    "method": "POST",
    "path": "/v2/bookings",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "start",
      "attendee",
      "bookingFieldsResponses",
      "leadEnrichmentOptOut",
      "eventTypeId",
      "eventTypeSlug",
      "username",
      "teamSlug",
      "organizationSlug",
      "usernames",
      "hostUsernames",
      "guests",
      "meetingUrl",
      "location",
      "metadata",
      "lengthInMinutes",
      "routing",
      "emailVerificationCode",
      "allowConflicts",
      "allowBookingOutOfBounds",
      "skipBookingLimits",
      "instant",
      "instantMeetingExpiresInSeconds",
      "recurrenceCount"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.list": {
    "method": "GET",
    "path": "/v2/bookings",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "status",
        "style": "form",
        "explode": true
      },
      {
        "name": "attendeeEmail",
        "style": "form",
        "explode": true
      },
      {
        "name": "attendeeName",
        "style": "form",
        "explode": true
      },
      {
        "name": "bookingUid",
        "style": "form",
        "explode": true
      },
      {
        "name": "eventTypeIds",
        "style": "form",
        "explode": true
      },
      {
        "name": "eventTypeId",
        "style": "form",
        "explode": true
      },
      {
        "name": "teamsIds",
        "style": "form",
        "explode": true
      },
      {
        "name": "teamId",
        "style": "form",
        "explode": true
      },
      {
        "name": "afterStart",
        "style": "form",
        "explode": true
      },
      {
        "name": "beforeEnd",
        "style": "form",
        "explode": true
      },
      {
        "name": "afterCreatedAt",
        "style": "form",
        "explode": true
      },
      {
        "name": "beforeCreatedAt",
        "style": "form",
        "explode": true
      },
      {
        "name": "afterUpdatedAt",
        "style": "form",
        "explode": true
      },
      {
        "name": "beforeUpdatedAt",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortStart",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortEnd",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortCreated",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortUpdatedAt",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-05-01"
  },
  "calcom.bookings.get_by_seat": {
    "method": "GET",
    "path": "/v2/bookings/by-seat/{seatUid}",
    "pathParameters": [
      "seatUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.get": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.get_recordings": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/recordings",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.get_transcripts": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/transcripts",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.reschedule": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/reschedule",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "start",
      "lengthInMinutes",
      "rescheduledBy",
      "reschedulingReason",
      "emailVerificationCode",
      "rescheduleWithSameHost",
      "allowConflicts",
      "allowBookingOutOfBounds",
      "skipBookingLimits",
      "seatUid"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.cancel": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/cancel",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "cancellationReason",
      "cancelSubsequentBookings",
      "seatUid"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.mark_absent": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/mark-absent",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "host",
      "attendees"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.reassign": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/reassign",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "userUuid",
      "reason"
    ],
    "version": "2026-02-25",
    "bodyRequired": false
  },
  "calcom.bookings.reassign_host": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/reassign/{userId}",
    "pathParameters": [
      "bookingUid",
      "userId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "reason"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.confirm": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/confirm",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.confirm_seats": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/seats/confirm",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "seatUids"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.decline_seats": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/seats/decline",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "seatUids",
      "reason"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.decline": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/decline",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "reason"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.request_reschedule": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/request-reschedule",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "rescheduleReason"
    ],
    "version": "2026-02-25",
    "bodyRequired": true
  },
  "calcom.bookings.get_calendar_links": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/calendar-links",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.get_references": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/references",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [
      {
        "name": "type",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.get_video_sessions": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/conferencing-sessions",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-02-25"
  },
  "calcom.bookings.update_location": {
    "method": "PATCH",
    "path": "/v2/bookings/{bookingUid}/location",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "location",
      "notifyHosts"
    ],
    "version": "2024-08-13",
    "bodyRequired": true
  },
  "calcom.bookings.send_email_code": {
    "method": "POST",
    "path": "/v2/bookings/verification/email/send-code",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email",
      "username",
      "language",
      "isVerifyingEmail",
      "eventTypeId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.bookings.check_email_verification": {
    "method": "GET",
    "path": "/v2/bookings/verification/email/check",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "email",
        "style": "form",
        "explode": true
      },
      {
        "name": "userSessionEmail",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.bookings.verify_email": {
    "method": "POST",
    "path": "/v2/bookings/verification/email/verify-code",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email",
      "code"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.bookings.list_attendees": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/attendees",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-08-13"
  },
  "calcom.bookings.add_attendee": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/attendees",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "timeZone",
      "phoneNumber",
      "language",
      "email"
    ],
    "version": "2024-08-13",
    "bodyRequired": true
  },
  "calcom.bookings.get_attendee": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/attendees/{attendeeId}",
    "pathParameters": [
      "bookingUid",
      "attendeeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-08-13"
  },
  "calcom.bookings.add_guests": {
    "method": "POST",
    "path": "/v2/bookings/{bookingUid}/guests",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "guests",
      "contactIds",
      "contactTagIds"
    ],
    "version": "2024-08-13",
    "bodyRequired": true
  },
  "calcom.bookings.get_routing_trace": {
    "method": "GET",
    "path": "/v2/bookings/{bookingUid}/routing-trace",
    "pathParameters": [
      "bookingUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-08-13"
  },
  "calcom.calendars.get_event": {
    "method": "GET",
    "path": "/v2/calendars/{calendar}/event/{eventUid}",
    "pathParameters": [
      "calendar",
      "eventUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.update_event": {
    "method": "PATCH",
    "path": "/v2/calendars/{calendar}/events/{eventUid}",
    "pathParameters": [
      "calendar",
      "eventUid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "start",
      "end",
      "title",
      "description",
      "attendees",
      "status"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.calendars.add_ics_feed": {
    "method": "POST",
    "path": "/v2/calendars/ics-feed/save",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "urls",
      "readOnly"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.calendars.check_ics_feed": {
    "method": "GET",
    "path": "/v2/calendars/ics-feed/check",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.get_busy_times": {
    "method": "GET",
    "path": "/v2/calendars/busy-times",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "loggedInUsersTz",
        "style": "form",
        "explode": true
      },
      {
        "name": "timeZone",
        "style": "form",
        "explode": true
      },
      {
        "name": "dateFrom",
        "style": "form",
        "explode": true
      },
      {
        "name": "dateTo",
        "style": "form",
        "explode": true
      },
      {
        "name": "calendar",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.list": {
    "method": "GET",
    "path": "/v2/calendars",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.get_connect_url": {
    "method": "GET",
    "path": "/v2/calendars/{calendar}/connect",
    "pathParameters": [
      "calendar"
    ],
    "queryParameters": [
      {
        "name": "isDryRun",
        "style": "form",
        "explode": true
      },
      {
        "name": "redir",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.check": {
    "method": "GET",
    "path": "/v2/calendars/{calendar}/check",
    "pathParameters": [
      "calendar"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.disconnect": {
    "method": "POST",
    "path": "/v2/calendars/{calendar}/disconnect",
    "pathParameters": [
      "calendar"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "id"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.apps.connect": {
    "method": "POST",
    "path": "/v2/conferencing/{app}/connect",
    "pathParameters": [
      "app"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.get_connect_url": {
    "method": "GET",
    "path": "/v2/conferencing/{app}/oauth/auth-url",
    "pathParameters": [
      "app"
    ],
    "queryParameters": [
      {
        "name": "returnTo",
        "style": "form",
        "explode": true
      },
      {
        "name": "onErrorReturnTo",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.list": {
    "method": "GET",
    "path": "/v2/conferencing",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.set_default": {
    "method": "POST",
    "path": "/v2/conferencing/{app}/default",
    "pathParameters": [
      "app"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.get_default": {
    "method": "GET",
    "path": "/v2/conferencing/default",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.disconnect": {
    "method": "DELETE",
    "path": "/v2/conferencing/{app}/disconnect",
    "pathParameters": [
      "app"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.list": {
    "method": "GET",
    "path": "/v2/contacts",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "search",
        "style": "form",
        "explode": true
      },
      {
        "name": "contactIds",
        "style": "form",
        "explode": true
      },
      {
        "name": "tagIds",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.add": {
    "method": "POST",
    "path": "/v2/contacts",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email",
      "name"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.contacts.get_history": {
    "method": "GET",
    "path": "/v2/contacts/{id}/history",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [
      {
        "name": "status",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.get_note": {
    "method": "GET",
    "path": "/v2/contacts/{id}/note",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.list_tags": {
    "method": "GET",
    "path": "/v2/contacts/tags",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.create_tag": {
    "method": "POST",
    "path": "/v2/contacts/tags",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "color"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.contacts.update": {
    "method": "PATCH",
    "path": "/v2/contacts/{id}",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "note"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.contacts.remove": {
    "method": "DELETE",
    "path": "/v2/contacts/{id}",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.add_tag": {
    "method": "POST",
    "path": "/v2/contacts/{id}/tags",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "tagId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.contacts.remove_tag": {
    "method": "DELETE",
    "path": "/v2/contacts/{id}/tags/{tagId}",
    "pathParameters": [
      "id",
      "tagId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.list_suggestions": {
    "method": "GET",
    "path": "/v2/contacts/suggestions",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.contacts.dismiss_suggestion": {
    "method": "POST",
    "path": "/v2/contacts/suggestions/dismissals",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.account.check_credits": {
    "method": "GET",
    "path": "/v2/credits/available",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.calendars.update_destinations": {
    "method": "PUT",
    "path": "/v2/destination-calendars",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "integration",
      "externalId",
      "delegationCredentialId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.discover.list_favorites": {
    "method": "GET",
    "path": "/v2/discover/favorites",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.discover.get_listings": {
    "method": "GET",
    "path": "/v2/discover/listings",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "ids",
        "style": "form",
        "explode": true
      },
      {
        "name": "includeNextAvailable",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.discover.search_listings": {
    "method": "GET",
    "path": "/v2/discover/listings/search",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "category",
        "style": "form",
        "explode": true
      },
      {
        "name": "subcategory",
        "style": "form",
        "explode": true
      },
      {
        "name": "query",
        "style": "form",
        "explode": true
      },
      {
        "name": "neighborhood",
        "style": "form",
        "explode": true
      },
      {
        "name": "onlineOnly",
        "style": "form",
        "explode": true
      },
      {
        "name": "localQuery",
        "style": "form",
        "explode": true
      },
      {
        "name": "area",
        "style": "form",
        "explode": true
      },
      {
        "name": "maximumPrice",
        "style": "form",
        "explode": true
      },
      {
        "name": "maximumDurationMinutes",
        "style": "form",
        "explode": true
      },
      {
        "name": "availableWithin",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.discover.call_business": {
    "method": "POST",
    "path": "/v2/discover/business-calls",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "businessUrl",
      "service",
      "timing",
      "staff",
      "notes",
      "daysFromToday",
      "callerName"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.discover.book_business": {
    "method": "POST",
    "path": "/v2/discover/booking-jobs",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "businessUrl",
      "service",
      "area",
      "daysFromToday",
      "partOfDay",
      "budgetDollars",
      "idempotencyKey"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.discover.create_service_request": {
    "method": "POST",
    "path": "/v2/discover/service-requests",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "service",
      "category",
      "subcategory",
      "searchedArea"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.event-types.get_sequence_page": {
    "method": "GET",
    "path": "/v2/event-type-sequences/{uid}",
    "pathParameters": [
      "uid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.list_sequence_slots": {
    "method": "GET",
    "path": "/v2/event-type-sequences/{uid}/slots",
    "pathParameters": [
      "uid"
    ],
    "queryParameters": [
      {
        "name": "start",
        "style": "form",
        "explode": true
      },
      {
        "name": "end",
        "style": "form",
        "explode": true
      },
      {
        "name": "timeZone",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.get_calendar_invite_templates": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/calendar-invites",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.update_calendar_invite_templates": {
    "method": "PATCH",
    "path": "/v2/event-types/{eventTypeId}/calendar-invites",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "host",
      "guest"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.create": {
    "method": "POST",
    "path": "/v2/event-types",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "calendarInvites",
      "lengthInMinutes",
      "lengthInMinutesOptions",
      "title",
      "slug",
      "description",
      "slotInterval",
      "minimumBookingNotice",
      "beforeEventBuffer",
      "afterEventBuffer",
      "scheduleId",
      "bookingLimitsCount",
      "bookerActiveBookingsLimit",
      "onlyShowFirstAvailableSlot",
      "bookingLimitsDuration",
      "bookingWindow",
      "offsetStart",
      "bookerLayouts",
      "confirmationPolicy",
      "recurrence",
      "requiresBookerEmailVerification",
      "skipAttendeeEmailDeliverabilityCheck",
      "emailSettings",
      "hideCalendarNotes",
      "lockTimeZoneToggleOnBookingPage",
      "color",
      "seats",
      "customName",
      "destinationCalendar",
      "useDestinationCalendarEmail",
      "hideCalendarEventDetails",
      "successRedirectUrl",
      "hideOrganizerEmail",
      "calVideoSettings",
      "hidden",
      "bookingRequiresAuthentication",
      "disableCancelling",
      "disableRescheduling",
      "interfaceLanguage",
      "weekStart",
      "allowReschedulingPastBookings",
      "allowReschedulingCancelledBookings",
      "showOptimizedSlots",
      "useIsolatedAvailability",
      "privateNoteEnabled",
      "privateNoteMode",
      "privateNoteTemplate",
      "locations",
      "bookingFields",
      "crm"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.list": {
    "method": "GET",
    "path": "/v2/event-types",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "username",
        "style": "form",
        "explode": true
      },
      {
        "name": "eventSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "usernames",
        "style": "form",
        "explode": true
      },
      {
        "name": "orgSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "orgId",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortCreatedAt",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.get_history": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/history",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.get_scheduling_config": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/scheduling-config",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.list_crm_sync_errors": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/crm-sync-errors",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [
      {
        "name": "appSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "includeDismissed",
        "style": "form",
        "explode": true
      },
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.get": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.update": {
    "method": "PATCH",
    "path": "/v2/event-types/{eventTypeId}",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "calendarInvites",
      "lengthInMinutes",
      "lengthInMinutesOptions",
      "title",
      "slug",
      "description",
      "slotInterval",
      "minimumBookingNotice",
      "beforeEventBuffer",
      "afterEventBuffer",
      "scheduleId",
      "bookingLimitsCount",
      "bookerActiveBookingsLimit",
      "onlyShowFirstAvailableSlot",
      "bookingLimitsDuration",
      "bookingWindow",
      "offsetStart",
      "bookerLayouts",
      "confirmationPolicy",
      "bookingProposalCount",
      "recurrence",
      "requiresBookerEmailVerification",
      "skipAttendeeEmailDeliverabilityCheck",
      "emailSettings",
      "hideCalendarNotes",
      "lockTimeZoneToggleOnBookingPage",
      "color",
      "seats",
      "customName",
      "destinationCalendar",
      "useDestinationCalendarEmail",
      "hideCalendarEventDetails",
      "successRedirectUrl",
      "hideOrganizerEmail",
      "calVideoSettings",
      "hidden",
      "bookingRequiresAuthentication",
      "disableCancelling",
      "disableRescheduling",
      "interfaceLanguage",
      "weekStart",
      "allowReschedulingPastBookings",
      "allowReschedulingCancelledBookings",
      "showOptimizedSlots",
      "useIsolatedAvailability",
      "privateNoteEnabled",
      "privateNoteMode",
      "privateNoteTemplate",
      "allowAffectingUpcomingBookings",
      "locations",
      "bookingFields",
      "crm"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.delete": {
    "method": "DELETE",
    "path": "/v2/event-types/{eventTypeId}",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.get_booking_fields": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/booking-fields",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.replace_booking_fields": {
    "method": "PUT",
    "path": "/v2/event-types/{eventTypeId}/booking-fields",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "bookingFields"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.add_booking_fields": {
    "method": "POST",
    "path": "/v2/event-types/{eventTypeId}/booking-fields",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "bookingFields"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.update_booking_fields": {
    "method": "PATCH",
    "path": "/v2/event-types/{eventTypeId}/booking-fields",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "bookingFields"
    ],
    "version": "2026-06-12",
    "bodyRequired": true
  },
  "calcom.event-types.delete_booking_field": {
    "method": "DELETE",
    "path": "/v2/event-types/{eventTypeId}/booking-fields/{slug}",
    "pathParameters": [
      "eventTypeId",
      "slug"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-06-12"
  },
  "calcom.event-types.create_webhook": {
    "method": "POST",
    "path": "/v2/event-types/{eventTypeId}/webhooks",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "payloadTemplate",
      "active",
      "subscriberUrl",
      "triggers",
      "customHeaders",
      "version",
      "time",
      "timeUnit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.event-types.list_webhooks": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/webhooks",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.clear_webhooks": {
    "method": "DELETE",
    "path": "/v2/event-types/{eventTypeId}/webhooks",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.update_webhook": {
    "method": "PATCH",
    "path": "/v2/event-types/{eventTypeId}/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId",
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "payloadTemplate",
      "active",
      "subscriberUrl",
      "triggers",
      "customHeaders",
      "version",
      "time",
      "timeUnit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.event-types.get_webhook": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId",
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.delete_webhook": {
    "method": "DELETE",
    "path": "/v2/event-types/{eventTypeId}/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId",
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.event-types.create_private_link": {
    "method": "POST",
    "path": "/v2/event-types/{eventTypeId}/private-links",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "expiresAt",
      "maxUsageCount"
    ],
    "version": "2024-09-04",
    "bodyRequired": true
  },
  "calcom.event-types.list_private_links": {
    "method": "GET",
    "path": "/v2/event-types/{eventTypeId}/private-links",
    "pathParameters": [
      "eventTypeId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-09-04"
  },
  "calcom.event-types.update_private_link": {
    "method": "PATCH",
    "path": "/v2/event-types/{eventTypeId}/private-links/{linkId}",
    "pathParameters": [
      "eventTypeId",
      "linkId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "expiresAt",
      "maxUsageCount"
    ],
    "version": "2024-09-04",
    "bodyRequired": true
  },
  "calcom.event-types.delete_private_link": {
    "method": "DELETE",
    "path": "/v2/event-types/{eventTypeId}/private-links/{linkId}",
    "pathParameters": [
      "eventTypeId",
      "linkId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-09-04"
  },
  "calcom.events.list": {
    "method": "GET",
    "path": "/v2/events",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "slug",
        "style": "form",
        "explode": true
      },
      {
        "name": "status",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-05-01"
  },
  "calcom.events.create": {
    "method": "POST",
    "path": "/v2/events",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "title",
      "startTime",
      "endTime",
      "timeZone",
      "slug",
      "description",
      "visibility",
      "capacity",
      "waitlistEnabled",
      "paymentTimeoutMinutes",
      "registrationOpensAt",
      "registrationClosesAt",
      "requiresApproval",
      "showOrganizerEmail",
      "guestList",
      "showPresentedBy",
      "theme",
      "background",
      "lineup",
      "schedule",
      "registrationFields",
      "hosts",
      "liveStreams",
      "category",
      "price",
      "currency",
      "locations"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.get": {
    "method": "GET",
    "path": "/v2/events/{uuid}",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.update": {
    "method": "PATCH",
    "path": "/v2/events/{uuid}",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "title",
      "endTime",
      "timeZone",
      "description",
      "paymentTimeoutMinutes",
      "registrationOpensAt",
      "registrationClosesAt",
      "theme",
      "background",
      "lineup",
      "schedule",
      "registrationFields",
      "hosts",
      "liveStreams",
      "price",
      "currency",
      "startTime",
      "slug",
      "visibility",
      "capacity",
      "waitlistEnabled",
      "requiresApproval",
      "showOrganizerEmail",
      "guestList",
      "showPresentedBy",
      "category"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.delete": {
    "method": "DELETE",
    "path": "/v2/events/{uuid}",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.publish": {
    "method": "POST",
    "path": "/v2/events/{uuid}/publish",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.cancel": {
    "method": "POST",
    "path": "/v2/events/{uuid}/cancel",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "reason"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.list_bookings": {
    "method": "GET",
    "path": "/v2/events/{uuid}/bookings",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "status",
        "style": "form",
        "explode": false
      },
      {
        "name": "rsvpResponse",
        "style": "form",
        "explode": true
      },
      {
        "name": "search",
        "style": "form",
        "explode": true
      },
      {
        "name": "locationId",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.check_in_guest": {
    "method": "POST",
    "path": "/v2/events/{uuid}/registrations/{registrationId}/check-in",
    "pathParameters": [
      "registrationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.remove_guest_check_in": {
    "method": "DELETE",
    "path": "/v2/events/{uuid}/registrations/{registrationId}/check-in",
    "pathParameters": [
      "registrationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.approve_guests": {
    "method": "POST",
    "path": "/v2/events/{uuid}/registrations/approve-all",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "search",
      "locationId",
      "retry"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.approve_guest": {
    "method": "POST",
    "path": "/v2/events/{uuid}/registrations/{registrationId}/approve",
    "pathParameters": [
      "registrationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.decline_guest": {
    "method": "POST",
    "path": "/v2/events/{uuid}/registrations/{registrationId}/decline",
    "pathParameters": [
      "registrationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.get_guest_counts": {
    "method": "GET",
    "path": "/v2/events/{uuid}/registrations/counts",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.list_co_hosts": {
    "method": "GET",
    "path": "/v2/events/{uuid}/co-hosts",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.invite_co_host": {
    "method": "POST",
    "path": "/v2/events/{uuid}/co-hosts",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "email"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.reorder_co_hosts": {
    "method": "PATCH",
    "path": "/v2/events/{uuid}/co-hosts/order",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "coHostIds"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.remove_co_host": {
    "method": "DELETE",
    "path": "/v2/events/{uuid}/co-hosts/{coHostId}",
    "pathParameters": [
      "coHostId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.search_host_candidates": {
    "method": "GET",
    "path": "/v2/events/{uuid}/host-candidates",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      },
      {
        "name": "search",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.get_coordinates": {
    "method": "GET",
    "path": "/v2/events/{uuid}/coordinates",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.update_coordinates": {
    "method": "PATCH",
    "path": "/v2/events/{uuid}/coordinates",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "latitude",
      "longitude"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.remove_cover_image": {
    "method": "DELETE",
    "path": "/v2/events/{uuid}/cover-image",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.list_locations": {
    "method": "GET",
    "path": "/v2/events/{uuid}/locations",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.add_location": {
    "method": "POST",
    "path": "/v2/events/{uuid}/locations",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "label",
      "price",
      "currency",
      "capacity",
      "type",
      "address",
      "link",
      "integration",
      "credentialId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.remove_location": {
    "method": "DELETE",
    "path": "/v2/events/{uuid}/locations/{locationId}",
    "pathParameters": [
      "locationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.update_location": {
    "method": "PATCH",
    "path": "/v2/events/{uuid}/locations/{locationId}",
    "pathParameters": [
      "locationId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "label",
      "price",
      "currency",
      "capacity",
      "type",
      "address",
      "link",
      "integration",
      "credentialId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.message_guests": {
    "method": "POST",
    "path": "/v2/events/{uuid}/messages",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "segment",
      "subject",
      "body",
      "scheduledAt",
      "locationId",
      "checkedIn",
      "contactTagId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.events.list_messages": {
    "method": "GET",
    "path": "/v2/events/{uuid}/messages",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [
      {
        "name": "cursor",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.cancel_message": {
    "method": "POST",
    "path": "/v2/events/{uuid}/messages/{messageId}/cancel",
    "pathParameters": [
      "messageId",
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.events.invite_guests": {
    "method": "POST",
    "path": "/v2/events/{uuid}/invitations",
    "pathParameters": [
      "uuid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "emails",
      "contactIds",
      "contactTagIds",
      "pastEventUuids",
      "hostNote"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_booking_limits_usage": {
    "method": "POST",
    "path": "/v2/insights/booking-limits/usage",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "date",
      "eventTypeId",
      "userUuids",
      "offset",
      "limit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_kpi_stats": {
    "method": "POST",
    "path": "/v2/insights/bookings/kpi-stats",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "timeZone",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_event_trends": {
    "method": "POST",
    "path": "/v2/insights/bookings/event-trends",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "timeZone",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_average_booking_duration": {
    "method": "POST",
    "path": "/v2/insights/bookings/average-duration",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "timeZone",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_booking_member_stats": {
    "method": "POST",
    "path": "/v2/insights/bookings/members",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "timeZone",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_routing_form_statuses": {
    "method": "POST",
    "path": "/v2/insights/routings/forms-by-status",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "startDate",
      "endDate",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_routing_form_responses": {
    "method": "POST",
    "path": "/v2/insights/routings/form-responses",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "startDate",
      "endDate",
      "columnFilters",
      "sorting",
      "offset",
      "limit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_routing_form_field_options": {
    "method": "POST",
    "path": "/v2/insights/routings/form-field-options",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "routingFormId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_routing_response_headers": {
    "method": "POST",
    "path": "/v2/insights/routings/form-response-headers",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "routingFormId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_failed_bookings_by_field": {
    "method": "POST",
    "path": "/v2/insights/routings/failed-bookings-by-field",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "startDate",
      "endDate",
      "columnFilters"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.insights.get_routed_users_per_period": {
    "method": "POST",
    "path": "/v2/insights/routings/routed-to-per-period",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "scope",
      "selectedTeamId",
      "startDate",
      "endDate",
      "columnFilters",
      "period",
      "limit",
      "searchQuery"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.account.get_link": {
    "method": "GET",
    "path": "/v2/links/{linkUid}",
    "pathParameters": [
      "linkUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.account.delete_link": {
    "method": "DELETE",
    "path": "/v2/links/{linkUid}",
    "pathParameters": [
      "linkUid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.profile.get": {
    "method": "GET",
    "path": "/v2/me",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.profile.update": {
    "method": "PATCH",
    "path": "/v2/me",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email",
      "name",
      "timeFormat",
      "defaultScheduleId",
      "weekStart",
      "timeZone",
      "locale",
      "avatarUrl",
      "bio",
      "metadata"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.profile.get_booking_limits": {
    "method": "GET",
    "path": "/v2/me/booking-limits",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.profile.update_booking_limits": {
    "method": "PATCH",
    "path": "/v2/me/booking-limits",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "perDay",
      "perWeek",
      "perMonth",
      "perYear"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.profile.clear_booking_limits": {
    "method": "DELETE",
    "path": "/v2/me/booking-limits",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.notifications.remove_slack_subscription": {
    "method": "DELETE",
    "path": "/v2/notifications/subscriptions/slack",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "identifier",
      "teamId",
      "subscriptionId",
      "subscriptionVersion"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.notifications.remove_telegram_subscription": {
    "method": "DELETE",
    "path": "/v2/notifications/subscriptions/telegram",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "identifier",
      "subscriptionId",
      "subscriptionVersion"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.notifications.remove_imessage_subscription": {
    "method": "DELETE",
    "path": "/v2/notifications/subscriptions/imessage",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "identifier",
      "subscriptionId",
      "subscriptionVersion"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.notifications.get_agent_channels": {
    "method": "GET",
    "path": "/v2/notifications/agent-channels",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.notifications.set_agent_channel": {
    "method": "PATCH",
    "path": "/v2/notifications/agent-channels/{channel}",
    "pathParameters": [
      "channel"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "enabled"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.profile.list_absences": {
    "method": "GET",
    "path": "/v2/me/ooo",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortStart",
        "style": "form",
        "explode": true
      },
      {
        "name": "sortEnd",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.profile.create_absence": {
    "method": "POST",
    "path": "/v2/me/ooo",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "start",
      "end",
      "notes",
      "toUserId",
      "reason"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.profile.update_absence": {
    "method": "PATCH",
    "path": "/v2/me/ooo/{oooId}",
    "pathParameters": [
      "oooId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "start",
      "end",
      "notes",
      "toUserId",
      "reason"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.profile.delete_absence": {
    "method": "DELETE",
    "path": "/v2/me/ooo/{oooId}",
    "pathParameters": [
      "oooId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.slots.calculate": {
    "method": "POST",
    "path": "/v2/routing-forms/{routingFormId}/calculate-slots",
    "pathParameters": [
      "routingFormId"
    ],
    "queryParameters": [
      {
        "name": "start",
        "style": "form",
        "explode": true
      },
      {
        "name": "end",
        "style": "form",
        "explode": true
      },
      {
        "name": "timeZone",
        "style": "form",
        "explode": true
      },
      {
        "name": "duration",
        "style": "form",
        "explode": true
      },
      {
        "name": "format",
        "style": "form",
        "explode": true
      },
      {
        "name": "bookingUidToReschedule",
        "style": "form",
        "explode": true
      },
      {
        "name": "rescheduleWithSameHost",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null,
    "bodyRequired": true,
    "wholeBody": "response"
  },
  "calcom.schedules.create": {
    "method": "POST",
    "path": "/v2/schedules",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "timeZone",
      "availability",
      "isDefault",
      "overrides"
    ],
    "version": "2024-06-11",
    "bodyRequired": true
  },
  "calcom.schedules.list": {
    "method": "GET",
    "path": "/v2/schedules",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-06-11"
  },
  "calcom.schedules.get_default": {
    "method": "GET",
    "path": "/v2/schedules/default",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-06-11"
  },
  "calcom.schedules.get": {
    "method": "GET",
    "path": "/v2/schedules/{scheduleId}",
    "pathParameters": [
      "scheduleId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-06-11"
  },
  "calcom.schedules.update": {
    "method": "PATCH",
    "path": "/v2/schedules/{scheduleId}",
    "pathParameters": [
      "scheduleId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "timeZone",
      "availability",
      "isDefault",
      "overrides"
    ],
    "version": "2024-06-11",
    "bodyRequired": true
  },
  "calcom.schedules.delete": {
    "method": "DELETE",
    "path": "/v2/schedules/{scheduleId}",
    "pathParameters": [
      "scheduleId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-06-11"
  },
  "calcom.calendars.add_selected": {
    "method": "POST",
    "path": "/v2/selected-calendars",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "integration",
      "externalId",
      "credentialId",
      "delegationCredentialId"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.calendars.remove_selected": {
    "method": "DELETE",
    "path": "/v2/selected-calendars",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "integration",
        "style": "form",
        "explode": true
      },
      {
        "name": "externalId",
        "style": "form",
        "explode": true
      },
      {
        "name": "credentialId",
        "style": "form",
        "explode": true
      },
      {
        "name": "delegationCredentialId",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.slots.list": {
    "method": "GET",
    "path": "/v2/slots",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "hostUsernames",
        "style": "form",
        "explode": true
      },
      {
        "name": "bookingUidToReschedule",
        "style": "form",
        "explode": true
      },
      {
        "name": "start",
        "style": "form",
        "explode": true
      },
      {
        "name": "end",
        "style": "form",
        "explode": true
      },
      {
        "name": "organizationSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "teamSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "username",
        "style": "form",
        "explode": true
      },
      {
        "name": "eventTypeSlug",
        "style": "form",
        "explode": true
      },
      {
        "name": "eventTypeId",
        "style": "form",
        "explode": true
      },
      {
        "name": "usernames",
        "style": "form",
        "explode": true
      },
      {
        "name": "format",
        "style": "form",
        "explode": true
      },
      {
        "name": "duration",
        "style": "form",
        "explode": true
      },
      {
        "name": "timeZone",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2024-09-04"
  },
  "calcom.slots.reserve": {
    "method": "POST",
    "path": "/v2/slots/reservations",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "eventTypeId",
      "slotStart",
      "slotDuration",
      "reservationDuration"
    ],
    "version": "2024-09-04",
    "bodyRequired": true
  },
  "calcom.slots.get_reservation": {
    "method": "GET",
    "path": "/v2/slots/reservations/{uid}",
    "pathParameters": [
      "uid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-09-04"
  },
  "calcom.slots.update_reservation": {
    "method": "PATCH",
    "path": "/v2/slots/reservations/{uid}",
    "pathParameters": [
      "uid"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "eventTypeId",
      "slotStart",
      "slotDuration",
      "reservationDuration"
    ],
    "version": "2024-09-04",
    "bodyRequired": true
  },
  "calcom.slots.delete_reservation": {
    "method": "DELETE",
    "path": "/v2/slots/reservations/{uid}",
    "pathParameters": [
      "uid"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2024-09-04"
  },
  "calcom.apps.get_stripe_connect_url": {
    "method": "GET",
    "path": "/v2/stripe/connect",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.apps.check_stripe_connection": {
    "method": "GET",
    "path": "/v2/stripe/check",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.profile.list_timezones": {
    "method": "GET",
    "path": "/v2/timezones",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "search",
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.verified-resources.send_email_code": {
    "method": "POST",
    "path": "/v2/verified-resources/emails/verification-code/request",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.verified-resources.send_phone_code": {
    "method": "POST",
    "path": "/v2/verified-resources/phones/verification-code/request",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "phone"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.verified-resources.verify_email": {
    "method": "POST",
    "path": "/v2/verified-resources/emails/verification-code/verify",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "email",
      "code"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.verified-resources.verify_phone": {
    "method": "POST",
    "path": "/v2/verified-resources/phones/verification-code/verify",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "phone",
      "code"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.verified-resources.list_emails": {
    "method": "GET",
    "path": "/v2/verified-resources/emails",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.verified-resources.list_phones": {
    "method": "GET",
    "path": "/v2/verified-resources/phones",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.verified-resources.get_email": {
    "method": "GET",
    "path": "/v2/verified-resources/emails/{id}",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.verified-resources.get_phone": {
    "method": "GET",
    "path": "/v2/verified-resources/phones/{id}",
    "pathParameters": [
      "id"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.webhooks.create": {
    "method": "POST",
    "path": "/v2/webhooks",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "payloadTemplate",
      "active",
      "subscriberUrl",
      "triggers",
      "customHeaders",
      "version",
      "time",
      "timeUnit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.webhooks.list": {
    "method": "GET",
    "path": "/v2/webhooks",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": null
  },
  "calcom.webhooks.update": {
    "method": "PATCH",
    "path": "/v2/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "payloadTemplate",
      "active",
      "subscriberUrl",
      "triggers",
      "customHeaders",
      "version",
      "time",
      "timeUnit"
    ],
    "version": null,
    "bodyRequired": true
  },
  "calcom.webhooks.get": {
    "method": "GET",
    "path": "/v2/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.webhooks.delete": {
    "method": "DELETE",
    "path": "/v2/webhooks/{webhookId}",
    "pathParameters": [
      "webhookId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": null
  },
  "calcom.workflows.list": {
    "method": "GET",
    "path": "/v2/workflows",
    "pathParameters": [],
    "queryParameters": [
      {
        "name": "take",
        "style": "form",
        "explode": true
      },
      {
        "name": "skip",
        "style": "form",
        "explode": true
      }
    ],
    "bodyProperties": [],
    "version": "2026-09-22"
  },
  "calcom.workflows.create": {
    "method": "POST",
    "path": "/v2/workflows",
    "pathParameters": [],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "activation",
      "trigger",
      "steps"
    ],
    "version": "2026-09-22",
    "bodyRequired": true,
    "rejectWorkflowStepSecret": true
  },
  "calcom.workflows.get": {
    "method": "GET",
    "path": "/v2/workflows/{workflowId}",
    "pathParameters": [
      "workflowId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-09-22"
  },
  "calcom.workflows.update": {
    "method": "PATCH",
    "path": "/v2/workflows/{workflowId}",
    "pathParameters": [
      "workflowId"
    ],
    "queryParameters": [],
    "bodyProperties": [
      "name",
      "activation",
      "trigger",
      "steps"
    ],
    "version": "2026-09-22",
    "bodyRequired": true,
    "rejectWorkflowStepSecret": true
  },
  "calcom.workflows.delete": {
    "method": "DELETE",
    "path": "/v2/workflows/{workflowId}",
    "pathParameters": [
      "workflowId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-09-22"
  },
  "calcom.workflows.list_condition_fields": {
    "method": "GET",
    "path": "/v2/workflows/{workflowId}/condition-fields",
    "pathParameters": [
      "workflowId"
    ],
    "queryParameters": [],
    "bodyProperties": [],
    "version": "2026-09-22"
  }
};

export const withheldFields = [
  "secret",
  "password",
  "shareToken",
  "pin",
  "accessCode",
  "meetingCode"
];

export const inputs = {
  "calcom.profile.get": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.profile.update": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "timeFormat": {
        "type": "number",
        "enum": [
          12,
          24
        ],
        "description": "Must be 12 or 24 Example: 12."
      },
      "defaultScheduleId": {
        "type": "number"
      },
      "weekStart": {
        "type": "string",
        "enum": [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        "description": "Example: Monday."
      },
      "timeZone": {
        "type": "string"
      },
      "locale": {
        "type": "string",
        "enum": [
          "ar",
          "ca",
          "de",
          "es",
          "eu",
          "he",
          "id",
          "ja",
          "lv",
          "pl",
          "ro",
          "sr",
          "th",
          "vi",
          "az",
          "cs",
          "el",
          "es-419",
          "fi",
          "hr",
          "it",
          "km",
          "nl",
          "pt",
          "ru",
          "sv",
          "tr",
          "zh-CN",
          "bg",
          "da",
          "en",
          "et",
          "fr",
          "hu",
          "iw",
          "ko",
          "no",
          "pt-BR",
          "sk",
          "sl",
          "ta",
          "uk",
          "zh-TW",
          "bn"
        ],
        "description": "Example: en."
      },
      "avatarUrl": {
        "type": "string",
        "description": "URL of the user's avatar image Cal.com format: uri. Example: https://cal.com/api/avatar/2b735186-b01b-46d3-87da-019b8f61776b.png."
      },
      "bio": {
        "type": "string",
        "description": "Bio Example: I am a bio."
      },
      "metadata": {
        "type": "object",
        "description": "You can store any additional data you want here. Metadata must have at most 50 keys, each key up to 40 characters, and values up to 500 characters. Cal.com validates the keys and values of this object. Example: {\"key\":\"value\"}."
      }
    },
    "additionalProperties": false
  },
  "calcom.profile.get_booking_limits": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.profile.update_booking_limits": {
    "type": "object",
    "properties": {
      "perDay": {
        "type": "number",
        "minimum": 1,
        "description": "Maximum number of bookings per day. This connector cannot clear this field to null. Example: 4."
      },
      "perWeek": {
        "type": "number",
        "minimum": 1,
        "description": "Maximum number of bookings per week. This connector cannot clear this field to null. Example: 20."
      },
      "perMonth": {
        "type": "number",
        "minimum": 1,
        "description": "Maximum number of bookings per month. This connector cannot clear this field to null. Example: 60."
      },
      "perYear": {
        "type": "number",
        "minimum": 1,
        "description": "Maximum number of bookings per year. This connector cannot clear this field to null. Example: 500."
      }
    },
    "additionalProperties": false
  },
  "calcom.profile.clear_booking_limits": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.profile.list_absences": {
    "type": "object",
    "properties": {
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      },
      "sortStart": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their start time in ascending or descending order. Example: ?sortStart=asc OR ?sortStart=desc."
      },
      "sortEnd": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their end time in ascending or descending order. Example: ?sortEnd=asc OR ?sortEnd=desc."
      }
    },
    "additionalProperties": false
  },
  "calcom.profile.create_absence": {
    "type": "object",
    "properties": {
      "start": {
        "type": "string",
        "description": "The start date and time of the out of office period in ISO 8601 format in UTC timezone. Cal.com format: date-time. Example: 2023-05-01T00:00:00.000Z."
      },
      "end": {
        "type": "string",
        "description": "The end date and time of the out of office period in ISO 8601 format in UTC timezone. Cal.com format: date-time. Example: 2023-05-10T23:59:59.999Z."
      },
      "notes": {
        "type": "string",
        "description": "Optional notes for the out of office entry. Example: Vacation in Hawaii."
      },
      "toUserId": {
        "type": "number",
        "description": "The ID of the user covering for the out of office period, if applicable. Example: 2."
      },
      "reason": {
        "type": "string",
        "enum": [
          "unspecified",
          "vacation",
          "travel",
          "sick",
          "public_holiday"
        ],
        "description": "the reason for the out of office entry, if applicable Example: vacation."
      }
    },
    "additionalProperties": false,
    "required": [
      "start",
      "end"
    ]
  },
  "calcom.profile.update_absence": {
    "type": "object",
    "properties": {
      "oooId": {
        "type": "number"
      },
      "start": {
        "type": "string",
        "description": "The start date and time of the out of office period in ISO 8601 format in UTC timezone. Cal.com format: date-time. Example: 2023-05-01T00:00:00.000Z."
      },
      "end": {
        "type": "string",
        "description": "The end date and time of the out of office period in ISO 8601 format in UTC timezone. Cal.com format: date-time. Example: 2023-05-10T23:59:59.999Z."
      },
      "notes": {
        "type": "string",
        "description": "Optional notes for the out of office entry. Example: Vacation in Hawaii."
      },
      "toUserId": {
        "type": "number",
        "description": "The ID of the user covering for the out of office period, if applicable. Example: 2."
      },
      "reason": {
        "type": "string",
        "enum": [
          "unspecified",
          "vacation",
          "travel",
          "sick",
          "public_holiday"
        ],
        "description": "the reason for the out of office entry, if applicable Example: vacation."
      }
    },
    "additionalProperties": false,
    "required": [
      "oooId"
    ]
  },
  "calcom.profile.delete_absence": {
    "type": "object",
    "properties": {
      "oooId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "oooId"
    ]
  },
  "calcom.profile.list_timezones": {
    "type": "object",
    "properties": {
      "search": {
        "type": "string",
        "maxLength": 100,
        "description": "Match city or timezone names by case-insensitive substring, or a complete IANA timezone identifier by case-insensitive equality. Omit it to get every city. Example: PDT."
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 250,
        "description": "Return at most this many entries (a whole number from 1 to 250). Results are ordered by relevance, so a limit keeps the entries a user is most likely to want. Omit it to get every match. Example: 20."
      }
    },
    "additionalProperties": false
  },
  "calcom.bookings.create": {
    "type": "object",
    "properties": {
      "start": {
        "type": "string"
      },
      "attendee": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the attendee. Example: John Doe."
          },
          "timeZone": {
            "type": "string",
            "description": "The time zone of the attendee. Example: America/New_York."
          },
          "phoneNumber": {
            "type": "string",
            "description": "The phone number of the attendee in international format. Example: +919876543210."
          },
          "language": {
            "type": "string",
            "enum": [
              "ar",
              "ca",
              "de",
              "es",
              "eu",
              "he",
              "id",
              "ja",
              "lv",
              "pl",
              "ro",
              "sr",
              "th",
              "vi",
              "az",
              "cs",
              "el",
              "es-419",
              "fi",
              "hr",
              "it",
              "km",
              "nl",
              "pt",
              "ru",
              "sv",
              "tr",
              "zh-CN",
              "bg",
              "da",
              "en",
              "et",
              "fr",
              "hu",
              "iw",
              "ko",
              "no",
              "pt-BR",
              "sk",
              "sl",
              "ta",
              "uk",
              "zh-TW",
              "bn"
            ],
            "description": "The preferred language of the attendee. Used for booking confirmation. Default: en. Example: it."
          },
          "email": {
            "type": "string",
            "description": "The email of the attendee. Example: john.doe@example.com."
          }
        },
        "required": [
          "name",
          "timeZone"
        ],
        "additionalProperties": false,
        "description": "The attendee's details."
      },
      "bookingFieldsResponses": {
        "type": "object",
        "description": "Booking field responses consisting of an object with booking field slug as keys and user response as values for custom booking fields added by you. Cal.com validates the keys and values of this object. Example: {\"customField\":\"customValue\"}."
      },
      "leadEnrichmentOptOut": {
        "type": "boolean",
        "description": "The booker's answer to the lead enrichment opt-out, for an event type with a workflow that looks bookers up with lead enrichment. Send `true` when the booker ticked the opt-out and `false` when they were shown it and left it unticked. Sending `false` asserts that the booker saw the opt-out. Leave it out when the booker was not shown it: a booking without an answer is never looked up. Example: false."
      },
      "eventTypeId": {
        "type": "number",
        "description": "The ID of the event type that is booked. Required unless eventTypeSlug and username are provided as an alternative to identifying the event type. Example: 123."
      },
      "eventTypeSlug": {
        "type": "string",
        "description": "The slug of the event type. Required along with username / teamSlug and optionally organizationSlug if eventTypeId is not provided. Example: my-event-type."
      },
      "username": {
        "type": "string",
        "description": "The username of the event owner. Required along with eventTypeSlug and optionally organizationSlug if eventTypeId is not provided. Example: john-doe."
      },
      "teamSlug": {
        "type": "string",
        "description": "Team slug for team that owns event type for which slots are fetched. Required along with eventTypeSlug and optionally organizationSlug if the team is part of organization Example: john-doe."
      },
      "organizationSlug": {
        "type": "string",
        "description": "The organization slug. Optional, only used when booking with eventTypeSlug + username, eventTypeSlug + teamSlug, or usernames. Example: acme-corp."
      },
      "usernames": {
        "type": "array",
        "minItems": 2,
        "maxItems": 20,
        "items": {
          "type": "string"
        },
        "description": "Usernames of the hosts for a dynamic group booking (no stored event type) - every listed user must be available. Must contain 2 to 20 distinct usernames, and can't be combined with eventTypeId, eventTypeSlug, username or teamSlug. Pass organizationSlug when the users belong to an organization; without it only users outside any organization are found. Platform managed users can only be booked with their own OAuth client's credentials or one of its access tokens; to any other request they are reported as not found. Duration defaults to 30 minutes and can be changed with lengthInMinutes (15, 30, 45, 60 or 90). Cal.com requires distinct items. Example: [\"alice\",\"bob\"]."
      },
      "hostUsernames": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Only for collective event types: books just these hosts instead of every host. The organizer is whichever of them comes first in the event type's host order, not in this list. For a team in an organization, use the hosts' organization usernames. Fetch slots with the same hostUsernames first. Every username must be a host of the event type, otherwise the request fails with 400 and the message \"invalid_hosts\". At most 50 distinct usernames of at most 255 characters each. Leaving it out, or passing an empty list, books every host. Ignored for other event types and for dynamic group bookings (usernames). A seated or recurring collective event type refuses it with 400. Can't be sent with instant or recurrenceCount, and rescheduling a booking keeps the hosts of the original booking. Example: [\"alice\",\"bob\"]."
      },
      "guests": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "An optional list of guest emails attending the event. Example: [\"guest1@example.com\",\"guest2@example.com\"]."
      },
      "meetingUrl": {
        "type": "string",
        "description": "Deprecated - use 'location' instead. Meeting URL just for this booking. Displayed in email and calendar event. If not provided then cal video link will be generated. Cal.com format: uri. Example: https://example.com/meeting."
      },
      "location": {
        "type": "object",
        "description": "One of the event type locations. If instead of passing one of the location objects as required by schema you are still passing a string please use an object. Cal.com variants: Address, Attendee Address, Attendee Defined, Attendee Phone, Integration, Link, Phone, Organizer Default App."
      },
      "metadata": {
        "type": "object",
        "description": "You can store any additional data you want here. Metadata must have at most 50 keys, each key up to 40 characters, and string values up to 500 characters. Cal.com validates the keys and values of this object. Example: {\"key\":\"value\"}."
      },
      "lengthInMinutes": {
        "type": "number",
        "minimum": 1,
        "description": "If it is an event type that has multiple possible lengths that attendee can pick from, you can pass the desired booking length here. If not provided then event type default length will be used for the booking. Example: 30."
      },
      "routing": {
        "type": "object",
        "properties": {
          "queuedResponseId": {
            "type": "string",
            "description": "The ID of the queued form response. Only present if the form response was queued. This connector cannot clear this field to null. Example: 123."
          },
          "responseId": {
            "type": "number",
            "description": "The ID of the routing form response. This connector cannot clear this field to null. Example: 123."
          },
          "teamMemberIds": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "Array of team member IDs that were routed to handle this booking. Example: [101,102]."
          },
          "teamMemberEmail": {
            "type": "string",
            "description": "The email of the team member assigned to handle this booking. Example: john.doe@example.com."
          },
          "skipContactOwner": {
            "type": "boolean",
            "description": "Whether to skip contact owner assignment from CRM integration. Example: true."
          },
          "crmAppSlug": {
            "type": "string",
            "description": "The CRM application slug for integration. Example: salesforce."
          },
          "crmOwnerRecordType": {
            "type": "string",
            "description": "The CRM owner record type for contact assignment. Example: Account."
          },
          "crmRecordOwnerFallbackTeamMemberIds": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "Eligible CRM owner fallback team member IDs to pass to the booking API. Example: [103,104]."
          },
          "crmRecordOwnerFallbackMode": {
            "type": "string",
            "enum": [
              "relationship",
              "attributeRules"
            ],
            "description": "The CRM owner fallback strategy used for this routing result. Example: relationship."
          }
        },
        "required": [
          "teamMemberIds"
        ],
        "additionalProperties": false,
        "description": "Routing information from routing forms that determined the booking assignment. Both responseId and teamMemberIds are required if provided. Example: {\"responseId\":123,\"teamMemberIds\":[101,102]}."
      },
      "emailVerificationCode": {
        "type": "string",
        "description": "Email verification code required when event type has email verification enabled. Example: 123456."
      },
      "allowConflicts": {
        "type": "boolean",
        "description": "When true, availability conflict checks are bypassed for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "allowBookingOutOfBounds": {
        "type": "boolean",
        "description": "When true, booking time out-of-bounds checks are bypassed, allowing bookings outside the normally permitted scheduling window, for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "skipBookingLimits": {
        "type": "boolean",
        "description": "When true, booking limit checks (event type, team, and per-host count and duration limits) are bypassed for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "instant": {
        "type": "boolean",
        "description": "Flag indicating if the booking is an instant booking. Only available for team events. Example: true."
      },
      "instantMeetingExpiresInSeconds": {
        "type": "number",
        "minimum": 1,
        "description": "How many seconds hosts have to accept the instant meeting. It can only shorten the event type's instant meeting expiry setting, which defaults to 90 seconds: a longer value is capped to that setting, and leaving it out uses the setting. The applied value is returned as instantMeetingExpiresInSeconds. Example: 120."
      },
      "recurrenceCount": {
        "type": "number",
        "minimum": 1,
        "maximum": 32,
        "description": "The number of recurrences. If not provided then event type recurrence count will be used. Can't be more than event type recurrence count Example: 5."
      }
    },
    "additionalProperties": false,
    "required": [
      "attendee"
    ]
  },
  "calcom.bookings.list": {
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "upcoming",
          "recurring",
          "past",
          "cancelled",
          "unconfirmed"
        ],
        "description": "Filter bookings by a single status. Pass one (e.g. `?status=upcoming`) or omit to walk all statuses ordered by `Booking.uuid DESC`. To list bookings across multiple statuses, issue parallel requests, one per status. Example: upcoming."
      },
      "attendeeEmail": {
        "type": "string",
        "description": "Filter bookings by the attendee's email address. Example: example@domain.com."
      },
      "attendeeName": {
        "type": "string",
        "description": "Filter bookings by the attendee's name. Example: John Doe."
      },
      "bookingUid": {
        "type": "string",
        "description": "Filter bookings by the booking Uid. Example: 2NtaeaVcKfpmSZ4CthFdfk."
      },
      "eventTypeIds": {
        "type": "string",
        "minItems": 1,
        "description": "Filter bookings by event type ids. Event type ids must be separated by a comma. Example: ?eventTypeIds=100,200."
      },
      "eventTypeId": {
        "type": "string",
        "description": "Filter bookings by event type id. Example: ?eventTypeId=100."
      },
      "teamsIds": {
        "type": "string",
        "minItems": 1,
        "description": "Filter bookings by team ids that user is part of. Team ids must be separated by a comma. Example: ?teamIds=50,60."
      },
      "teamId": {
        "type": "string",
        "description": "Filter bookings by team id that user is part of Example: ?teamId=50."
      },
      "afterStart": {
        "type": "string",
        "description": "Filter bookings with start after this date string. Example: ?afterStart=2025-03-07T10:00:00.000Z."
      },
      "beforeEnd": {
        "type": "string",
        "description": "Filter bookings with end before this date string. Example: ?beforeEnd=2025-03-07T11:00:00.000Z."
      },
      "afterCreatedAt": {
        "type": "string",
        "description": "Filter bookings that have been created after this date string. Example: ?afterCreatedAt=2025-03-07T10:00:00.000Z."
      },
      "beforeCreatedAt": {
        "type": "string",
        "description": "Filter bookings that have been created before this date string. Example: ?beforeCreatedAt=2025-03-14T11:00:00.000Z."
      },
      "afterUpdatedAt": {
        "type": "string",
        "description": "Filter bookings that have been updated after this date string. Example: ?afterUpdatedAt=2025-03-07T10:00:00.000Z."
      },
      "beforeUpdatedAt": {
        "type": "string",
        "description": "Filter bookings that have been updated before this date string. Example: ?beforeUpdatedAt=2025-03-14T11:00:00.000Z."
      },
      "sortStart": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their start time in ascending or descending order. Example: ?sortStart=asc OR ?sortStart=desc."
      },
      "sortEnd": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their end time in ascending or descending order. Example: ?sortEnd=asc OR ?sortEnd=desc."
      },
      "sortCreated": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their creation time (when booking was made) in ascending or descending order. Example: ?sortCreated=asc OR ?sortCreated=desc."
      },
      "sortUpdatedAt": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort results by their updated time (for example when booking status changes) in ascending or descending order. Example: ?sortUpdatedAt=asc OR ?sortUpdatedAt=desc."
      },
      "cursor": {
        "type": "string",
        "description": "Opaque cursor for cursor-based pagination. Pass the `pagination.nextCursor` value from a previous response to fetch the next page. Omit to fetch the first page. Example: eyJ2IjoxLCJzb3J0VXVpZCI6IjAxOGY0YzJlLTNmMWEtN2FiYy05ZGVmLTAxMjM0NTY3ODlhYiJ9."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 100,
        "description": "The number of items to return Default: 50. Example: 50."
      }
    },
    "additionalProperties": false
  },
  "calcom.bookings.get_by_seat": {
    "type": "object",
    "properties": {
      "seatUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "seatUid"
    ]
  },
  "calcom.bookings.get": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_recordings": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_transcripts": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.reschedule": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "start": {
        "type": "string",
        "description": "Start time in ISO 8601 format for the new booking Cal.com format: date-time. Example: 2024-08-13T10:00:00Z."
      },
      "lengthInMinutes": {
        "type": "number",
        "minimum": 1,
        "description": "If the event type has multiple possible lengths, you can pass the new booking length here. If not provided then the original booking length is kept. Example: 30."
      },
      "rescheduledBy": {
        "type": "string",
        "description": "Email of the person who is rescheduling the booking - only needed when rescheduling a booking that requires a confirmation. If event type owner email is provided then rescheduled booking will be automatically confirmed. If attendee email or no email is passed then the event type owner will have to confirm the rescheduled booking."
      },
      "reschedulingReason": {
        "type": "string",
        "description": "Reason for rescheduling the booking Example: User requested reschedule."
      },
      "emailVerificationCode": {
        "type": "string",
        "description": "Email verification code required when event type has email verification enabled. Example: 123456."
      },
      "rescheduleWithSameHost": {
        "type": "boolean",
        "description": "Only for round robin event types that let the person rescheduling choose the host. True keeps the original host, false lets round robin pick from the whole team. Ignored for every other event type. Example: true."
      },
      "allowConflicts": {
        "type": "boolean",
        "description": "When true, availability conflict checks are bypassed for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "allowBookingOutOfBounds": {
        "type": "boolean",
        "description": "When true, booking time out-of-bounds checks are bypassed, allowing bookings outside the normally permitted scheduling window, for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "skipBookingLimits": {
        "type": "boolean",
        "description": "When true, booking limit checks (event type, team, and per-host count and duration limits) are bypassed for an authenticated user who has access through the existing event owner, host, assigned user, team admin or organization admin checks. Team- and organization-scoped keys are restricted to events in their stored team or organization. Otherwise this parameter is silently ignored. Only supported on the 2026-02-25 and 2026-05-01 API versions. Example: true."
      },
      "seatUid": {
        "type": "string",
        "description": "Uid of the specific seat within booking. Example: 3be561a9-31f1-4b8e-aefc-9d9a085f0dd1."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "start"
    ]
  },
  "calcom.bookings.cancel": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "cancellationReason": {
        "type": "string",
        "description": "Example: User requested cancellation."
      },
      "cancelSubsequentBookings": {
        "type": "boolean",
        "description": "For recurring non-seated booking only - if true, cancel booking with the bookingUid of the individual recurrence and all recurrences that come after it."
      },
      "seatUid": {
        "type": "string",
        "description": "Uid of the specific seat within booking. Example: 3be561a9-31f1-4b8e-aefc-9d9a085f0dd1."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.mark_absent": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "host": {
        "type": "boolean",
        "description": "Whether the host was absent Example: false."
      },
      "attendees": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string"
            },
            "absent": {
              "type": "boolean"
            }
          },
          "required": [
            "email",
            "absent"
          ],
          "additionalProperties": false
        }
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.reassign": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "userUuid": {
        "type": "string",
        "description": "UUID of the user to reassign the booking to. Omit it to let Cal.com pick an available round robin host. For a managed event booking, list the eligible users with `GET /v2/bookings/{bookingUid}/reassignment-candidates` and pass a candidate's `uuid`. Cal.com format: uuid. Example: 3f2504e0-4f89-41d3-9a0c-0305e82c3301."
      },
      "reason": {
        "type": "string",
        "description": "Reason for reassigning the booking. Only recorded when `userUuid` is set. Example: Host has to take another call."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.reassign_host": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "userId": {
        "type": "number"
      },
      "reason": {
        "type": "string",
        "description": "Reason for reassigning the booking Example: Host has to take another call."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "userId"
    ]
  },
  "calcom.bookings.confirm": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.confirm_seats": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "seatUids": {
        "type": "array",
        "minItems": 1,
        "maxItems": 500,
        "items": {
          "type": "string",
          "minLength": 1
        },
        "description": "Seat UIDs to confirm. A seat that is already confirmed stays confirmed. Duplicate UIDs in one request are confirmed once. Example: [\"3be561a9-31f1-4b8e-aefc-9d9a085f0dd1\"]."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "seatUids"
    ]
  },
  "calcom.bookings.decline_seats": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "seatUids": {
        "type": "array",
        "minItems": 1,
        "maxItems": 500,
        "items": {
          "type": "string",
          "minLength": 1
        },
        "description": "Seat UIDs to decline. A waiting or confirmed seat becomes declined. A seat that is already declined stays declined. Duplicate UIDs in one request are declined once. Example: [\"3be561a9-31f1-4b8e-aefc-9d9a085f0dd1\"]."
      },
      "reason": {
        "type": "string",
        "maxLength": 1000,
        "description": "Reason for declining these seats. Shown on each declined seat's email and in that seat's booking-rejected workflow. Omit it to decline without a reason. Example: No availability that week."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "seatUids"
    ]
  },
  "calcom.bookings.decline": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "reason": {
        "type": "string",
        "description": "Reason for declining a booking that requires a confirmation Example: Host has to take another call."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.request_reschedule": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "rescheduleReason": {
        "type": "string",
        "description": "Reason for requesting to reschedule the booking Example: I need to reschedule due to a conflict."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_calendar_links": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_references": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "type": {
        "type": "string",
        "enum": [
          "google_calendar",
          "office365_calendar",
          "daily_video",
          "google_video",
          "office365_video",
          "zoom_video"
        ],
        "description": "Filter booking references by type Example: google_calendar."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_video_sessions": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.update_location": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "location": {
        "type": "object",
        "description": "One of the event type locations. If instead of passing one of the location objects as required by schema you are still passing a string please use an object. Cal.com variants: Address, Attendee Address, Attendee Defined, Attendee Phone, Integration, Link, Phone."
      },
      "notifyHosts": {
        "type": "boolean",
        "description": "Set to false to skip the location-change emails to hosts. Attendee notifications and the BOOKING_LOCATION_UPDATED webhook are unaffected. Default: true."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.send_email_code": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Cal.com format: email. Example: user@example.com."
      },
      "username": {
        "type": "string",
        "description": "Example: johndoe."
      },
      "language": {
        "type": "string",
        "description": "Example: en."
      },
      "isVerifyingEmail": {
        "type": "boolean",
        "description": "Example: true."
      },
      "eventTypeId": {
        "type": "number",
        "description": "Id of the event type being booked. When provided, the email honours the hide-branding setting of the event type's owner or team. Example: 123."
      }
    },
    "additionalProperties": false,
    "required": [
      "email"
    ]
  },
  "calcom.bookings.check_email_verification": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Example: user@example.com."
      },
      "userSessionEmail": {
        "type": "string",
        "description": "Example: user@example.com."
      }
    },
    "additionalProperties": false,
    "required": [
      "email"
    ]
  },
  "calcom.bookings.verify_email": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Cal.com format: email. Example: user@example.com."
      },
      "code": {
        "type": "string",
        "description": "Example: 123456."
      }
    },
    "additionalProperties": false,
    "required": [
      "email",
      "code"
    ]
  },
  "calcom.bookings.list_attendees": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.add_attendee": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "name": {
        "type": "string",
        "description": "The name of the attendee. Example: John Doe."
      },
      "timeZone": {
        "type": "string",
        "description": "The time zone of the attendee. Example: America/New_York."
      },
      "phoneNumber": {
        "type": "string",
        "description": "The phone number of the attendee in international format. Example: +919876543210."
      },
      "language": {
        "type": "string",
        "enum": [
          "ar",
          "ca",
          "de",
          "es",
          "eu",
          "he",
          "id",
          "ja",
          "lv",
          "pl",
          "ro",
          "sr",
          "th",
          "vi",
          "az",
          "cs",
          "el",
          "es-419",
          "fi",
          "hr",
          "it",
          "km",
          "nl",
          "pt",
          "ru",
          "sv",
          "tr",
          "zh-CN",
          "bg",
          "da",
          "en",
          "et",
          "fr",
          "hu",
          "iw",
          "ko",
          "no",
          "pt-BR",
          "sk",
          "sl",
          "ta",
          "uk",
          "zh-TW",
          "bn"
        ],
        "description": "The preferred language of the attendee. Used for booking confirmation. Default: en. Example: it."
      },
      "email": {
        "type": "string",
        "description": "The email of the attendee. Cal.com format: email. Example: john.doe@example.com."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "name",
      "timeZone",
      "email"
    ]
  },
  "calcom.bookings.get_attendee": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "attendeeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid",
      "attendeeId"
    ]
  },
  "calcom.bookings.add_guests": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "guests": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "The email of the guest. Example: john.doe@example.com."
            },
            "name": {
              "type": "string",
              "description": "The name of the guest. Example: John Doe."
            },
            "timeZone": {
              "type": "string",
              "description": "The time zone of the guest. Example: America/New_York."
            },
            "phoneNumber": {
              "type": "string",
              "description": "The phone number of the guest in international format. Example: +919876543210."
            },
            "language": {
              "type": "string",
              "enum": [
                "ar",
                "ca",
                "de",
                "es",
                "eu",
                "he",
                "id",
                "ja",
                "lv",
                "pl",
                "ro",
                "sr",
                "th",
                "vi",
                "az",
                "cs",
                "el",
                "es-419",
                "fi",
                "hr",
                "it",
                "km",
                "nl",
                "pt",
                "ru",
                "sv",
                "tr",
                "zh-CN",
                "bg",
                "da",
                "en",
                "et",
                "fr",
                "hu",
                "iw",
                "ko",
                "no",
                "pt-BR",
                "sk",
                "sl",
                "ta",
                "uk",
                "zh-TW",
                "bn"
              ],
              "description": "The preferred language of the guest. Used for booking confirmation. Default: en. Example: it."
            }
          },
          "required": [
            "email"
          ],
          "additionalProperties": false
        },
        "description": "Array of guests to add to the booking. Maximum 100 guests per request. Required unless `contactIds` or `contactTagIds` is given. Example: [{\"email\":\"john.doe@example.com\",\"name\":\"John Doe\",\"timeZone\":\"America/New_York\"},{\"email\":\"jane.smith@example.com\",\"name\":\"Jane Smith\"}]."
      },
      "contactIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 100,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Ids of the authenticated user's own contacts, from `GET /v2/contacts`. Each contact is added at its email and with its name, and they count with `guests` and `contactTagIds` toward the 100 guests a booking can have, once per email. Requires the `contacts` feature. A contact the user doesn't own is a 400. Example: [\"0192f3a1-7c2b-7d4e-9a10-0000000000a1\"]."
      },
      "contactTagIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 20,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Ids of the authenticated user's own contact tags, from the `tags` of each contact in `GET /v2/contacts`. Every contact with one of these tags is added, and they count with `guests` and `contactIds` toward the 100 guests a booking can have, once per email. Tags that don't fit are refused whole. Requires the `contacts` feature. A tag the user doesn't own is a 400. Example: [\"0192f3a1-7c2b-7d4e-9a10-00000000000a\"]."
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.bookings.get_routing_trace": {
    "type": "object",
    "properties": {
      "bookingUid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "bookingUid"
    ]
  },
  "calcom.slots.calculate": {
    "type": "object",
    "properties": {
      "start": {
        "type": "string",
        "description": "Time starting from which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to start of day or specify hours: 2024-08-13 (will have hours 00:00:00 aka at very beginning of the date) or you can specify hours manually like 2024-08-13T09:00:00Z Example: 2033-09-05."
      },
      "end": {
        "type": "string",
        "description": "Time until which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to end of day or specify hours: 2024-08-20 (will have hours 23:59:59 aka at the very end of the date) or you can specify hours manually like 2024-08-20T18:00:00Z Example: 2033-09-06."
      },
      "timeZone": {
        "type": "string",
        "description": "Time zone in which the available slots should be returned. Defaults to UTC. Example: Europe/Rome."
      },
      "duration": {
        "type": "number",
        "description": "If event type has multiple possible durations then you can specify the desired duration here. Also, if you are fetching slots for a dynamic event then you can specify the duration her which defaults to 30, meaning that returned slots will be each 30 minutes long. Example: 60."
      },
      "format": {
        "type": "string",
        "enum": [
          "range",
          "time"
        ],
        "description": "Format of slot times in response. Use 'range' to get start and end times. Example: range."
      },
      "bookingUidToReschedule": {
        "type": "string",
        "description": "The unique identifier of the booking being rescheduled. When provided will ensure that the original booking time appears within the returned available slots when rescheduling. Example: abc123def456."
      },
      "rescheduleWithSameHost": {
        "type": "boolean",
        "description": "Only for round robin event types that allow the person rescheduling to choose the host. True returns slots of the original host, false returns slots of any available host. Ignored for other event types. Example: true."
      },
      "routingFormId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "response": {
        "type": "object",
        "description": "Supply the routing form response as an object keyed by field identifier. Supply string values for the fields. Cal.com validates the response and receives this object as the whole request body."
      }
    },
    "additionalProperties": false,
    "required": [
      "start",
      "end",
      "routingFormId",
      "response"
    ]
  },
  "calcom.slots.list": {
    "type": "object",
    "properties": {
      "hostUsernames": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 255
        },
        "description": "Only for collective event types: returns the slots when just these hosts are all available, instead of every host. Pass usernames separated by commas e.g. ?hostUsernames=alice,bob, or repeat the key e.g. ?hostUsernames=alice&hostUsernames=bob. For a team in an organization, use the hosts' organization usernames. Every username must be a host of the event type, otherwise the request fails with 400 and the message \"invalid_hosts\". At most 50 distinct usernames of at most 255 characters each. Leaving it out, or passing it empty, returns the slots of every host. A seated event type refuses it with 400. Ignored for other event types, for dynamic events (usernames) and when bookingUidToReschedule is passed: a reschedule keeps the hosts of the original booking. To book the slot with the same hosts, pass the same hostUsernames when creating the booking. Example: [\"alice\",\"bob\"]. Supply an array of strings."
      },
      "bookingUidToReschedule": {
        "type": "string",
        "description": "The unique identifier of the booking being rescheduled. When provided will ensure that the original booking time appears within the returned available slots when rescheduling. Example: abc123def456."
      },
      "start": {
        "type": "string",
        "description": "Time starting from which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to start of day or specify hours: 2024-08-13 (will have hours 00:00:00 aka at very beginning of the date) or you can specify hours manually like 2024-08-13T09:00:00Z. Example: 2033-09-05."
      },
      "end": {
        "type": "string",
        "description": "Time until which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to end of day or specify hours: 2024-08-20 (will have hours 23:59:59 aka at the very end of the date) or you can specify hours manually like 2024-08-20T18:00:00Z. Example: 2033-09-06."
      },
      "organizationSlug": {
        "type": "string",
        "description": "The slug of the organization to which user with username belongs or team with teamSlug belongs. Example: org-slug."
      },
      "teamSlug": {
        "type": "string",
        "description": "The slug of the team who owns event type with eventTypeSlug - used when slots are checked for team event type. Example: team-slug."
      },
      "username": {
        "type": "string",
        "description": "The username of the user who owns event type with eventTypeSlug - used when slots are checked for individual user event type. Example: bob."
      },
      "eventTypeSlug": {
        "type": "string",
        "description": "The slug of the event type for which available slots should be checked. If slug is provided then username or teamSlug must be provided too and if relevant organizationSlug too. Example: event-type-slug."
      },
      "eventTypeId": {
        "type": "number",
        "description": "The ID of the event type for which available slots should be checked. Example: 100."
      },
      "usernames": {
        "type": "string",
        "description": "The usernames for which available slots should be checked separated by a comma. Checking slots by usernames is used mainly for dynamic events where there is no specific event but we just want to know when 2 or more people are available. Must contain at least 2 usernames. Example: alice,bob."
      },
      "format": {
        "type": "string",
        "description": "Format of slot times in response. Use 'range' to get start and end times. Use 'time' or omit this query parameter to get only start time. Example: range."
      },
      "duration": {
        "type": "number",
        "description": "If event type has multiple possible durations then you can specify the desired duration here. Also, if you are fetching slots for a dynamic event then you can specify the duration her which defaults to 30, meaning that returned slots will be each 30 minutes long. Example: 60."
      },
      "timeZone": {
        "type": "string",
        "description": "Time zone in which the available slots should be returned. Defaults to UTC. Example: Europe/Rome."
      }
    },
    "additionalProperties": false,
    "required": [
      "start",
      "end"
    ]
  },
  "calcom.slots.reserve": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number",
        "description": "The ID of the event type for which slot should be reserved. Example: 1."
      },
      "slotStart": {
        "type": "string",
        "description": "ISO 8601 datestring in UTC timezone representing available slot. Cal.com format: date-time. Example: 2024-09-04T09:00:00Z."
      },
      "slotDuration": {
        "type": "number",
        "description": "By default slot duration is equal to event type length, but if you want to reserve a slot for an event type that has a variable length you can specify it here as a number in minutes. If you don't have this set explicitly that event type can have one of many lengths you can omit this. Example: 30."
      },
      "reservationDuration": {
        "type": "number",
        "description": "ONLY for authenticated requests with api key, access token or OAuth credentials (ID + secret). For how many minutes the slot should be reserved - for this long time noone else can book this event type at `start` time. If not provided, defaults to 5 minutes. Example: 5."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "slotStart"
    ]
  },
  "calcom.slots.get_reservation": {
    "type": "object",
    "properties": {
      "uid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uid"
    ]
  },
  "calcom.slots.update_reservation": {
    "type": "object",
    "properties": {
      "uid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "eventTypeId": {
        "type": "number",
        "description": "The ID of the event type for which slot should be reserved. Example: 1."
      },
      "slotStart": {
        "type": "string",
        "description": "ISO 8601 datestring in UTC timezone representing available slot. Cal.com format: date-time. Example: 2024-09-04T09:00:00Z."
      },
      "slotDuration": {
        "type": "number",
        "description": "By default slot duration is equal to event type length, but if you want to reserve a slot for an event type that has a variable length you can specify it here as a number in minutes. If you don't have this set explicitly that event type can have one of many lengths you can omit this. Example: 30."
      },
      "reservationDuration": {
        "type": "number",
        "description": "ONLY for authenticated requests with api key, access token or OAuth credentials (ID + secret). For how many minutes the slot should be reserved - for this long time noone else can book this event type at `start` time. If not provided, defaults to 5 minutes. Example: 5."
      }
    },
    "additionalProperties": false,
    "required": [
      "uid",
      "eventTypeId",
      "slotStart"
    ]
  },
  "calcom.slots.delete_reservation": {
    "type": "object",
    "properties": {
      "uid": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uid"
    ]
  },
  "calcom.event-types.get_sequence_page": {
    "type": "object",
    "properties": {
      "uid": {
        "type": "string",
        "description": "The sequence's `uid`. Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uid"
    ]
  },
  "calcom.event-types.list_sequence_slots": {
    "type": "object",
    "properties": {
      "uid": {
        "type": "string",
        "description": "The sequence's `uid`. Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "start": {
        "type": "string",
        "description": "Time starting from which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to start of day or specify hours: 2024-08-13 (will have hours 00:00:00 aka at very beginning of the date) or you can specify hours manually like 2024-08-13T09:00:00Z Example: 2033-09-05."
      },
      "end": {
        "type": "string",
        "description": "Time until which available slots should be checked. Must be in UTC timezone as ISO 8601 datestring. You can pass date without hours which defaults to end of day or specify hours: 2024-08-20 (will have hours 23:59:59 aka at the very end of the date) or you can specify hours manually like 2024-08-20T18:00:00Z Example: 2033-09-06."
      },
      "timeZone": {
        "type": "string",
        "description": "Time zone in which the available slots should be returned. Defaults to UTC. Example: Europe/Rome."
      }
    },
    "additionalProperties": false,
    "required": [
      "uid",
      "start",
      "end"
    ]
  },
  "calcom.event-types.get_calendar_invite_templates": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.update_calendar_invite_templates": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "host": {
        "type": "object",
        "properties": {
          "mode": {
            "type": "string",
            "enum": [
              "inherit",
              "standard",
              "custom"
            ],
            "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
          },
          "template": {
            "type": "string",
            "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
          }
        },
        "required": [
          "mode"
        ],
        "additionalProperties": false,
        "description": "Host calendar-invite description settings. Example: {\"mode\":\"custom\",\"template\":\"Meeting with {ATTENDEE}\"}."
      },
      "guest": {
        "type": "object",
        "properties": {
          "mode": {
            "type": "string",
            "enum": [
              "inherit",
              "standard",
              "custom"
            ],
            "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
          },
          "template": {
            "type": "string",
            "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
          }
        },
        "required": [
          "mode"
        ],
        "additionalProperties": false,
        "description": "Guest calendar-invite description settings. Example: {\"mode\":\"inherit\"}."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.create": {
    "type": "object",
    "properties": {
      "calendarInvites": {
        "type": "object",
        "properties": {
          "host": {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "enum": [
                  "inherit",
                  "standard",
                  "custom"
                ],
                "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
              },
              "template": {
                "type": "string",
                "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
              }
            },
            "required": [
              "mode"
            ],
            "additionalProperties": false,
            "description": "Host calendar-invite description settings. Example: {\"mode\":\"custom\",\"template\":\"Meeting with {ATTENDEE}\"}."
          },
          "guest": {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "enum": [
                  "inherit",
                  "standard",
                  "custom"
                ],
                "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
              },
              "template": {
                "type": "string",
                "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
              }
            },
            "required": [
              "mode"
            ],
            "additionalProperties": false,
            "description": "Guest calendar-invite description settings. Example: {\"mode\":\"inherit\"}."
          }
        },
        "additionalProperties": false,
        "description": "Write-only host and guest calendar-invite description settings. These are saved separately from the event type and are not returned by event-type read endpoints. Example: {\"host\":{\"mode\":\"custom\",\"template\":\"Meeting with {ATTENDEE}\"}}."
      },
      "lengthInMinutes": {
        "type": "number",
        "minimum": 1,
        "description": "Example: 60."
      },
      "lengthInMinutesOptions": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "number",
          "minimum": 1
        },
        "description": "If you want that user can choose between different lengths of the event you can specify them here. Must include the provided `lengthInMinutes`. Cal.com requires distinct items. Example: [15,30,60]."
      },
      "title": {
        "type": "string",
        "description": "Example: Learn the secrets of masterchief!."
      },
      "slug": {
        "type": "string",
        "description": "Example: learn-the-secrets-of-masterchief."
      },
      "description": {
        "type": "string",
        "description": "Example: Discover the culinary wonders of the Argentina by making the best flan ever!."
      },
      "slotInterval": {
        "type": "number",
        "description": "Number representing length of each slot when event is booked. By default it equal length of the event type. If event length is 60 minutes then we would have slots 9AM, 10AM, 11AM etc. but if it was changed to 30 minutes then we would have slots 9AM, 9:30AM, 10AM, 10:30AM etc. as the available times to book the 60 minute event."
      },
      "minimumBookingNotice": {
        "type": "number",
        "minimum": 0,
        "description": "Minimum number of minutes before the event that a booking can be made."
      },
      "beforeEventBuffer": {
        "type": "number",
        "description": "Extra time automatically blocked on your calendar before a meeting starts. This gives you time to prepare, review notes, or transition from your previous activity."
      },
      "afterEventBuffer": {
        "type": "number",
        "description": "Extra time automatically blocked on your calendar after a meeting ends. This gives you time to wrap up, add notes, or decompress before your next commitment."
      },
      "scheduleId": {
        "type": "number",
        "description": "If you want that this event has different schedule than user's default one you can specify it here."
      },
      "bookingLimitsCount": {
        "type": "object",
        "description": "Limit how many times this event can be booked Cal.com variants: Booking Count Limit, Disabled."
      },
      "bookerActiveBookingsLimit": {
        "type": "object",
        "description": "Limit the number of active bookings a booker can make for this event type. Cal.com variants: Active Booking Limit, Disabled."
      },
      "onlyShowFirstAvailableSlot": {
        "type": "boolean",
        "description": "This will limit your availability for this event type to one slot per day, scheduled at the earliest available time."
      },
      "bookingLimitsDuration": {
        "type": "object",
        "description": "Limit total amount of time that this event can be booked Cal.com variants: Booking Duration Limit, Disabled."
      },
      "bookingWindow": {
        "type": "object",
        "description": "Limit how far in the future this event can be booked Cal.com variants: Business Days, Calendar Days, Date Range, Disabled."
      },
      "offsetStart": {
        "type": "number",
        "minimum": 0,
        "description": "Offset timeslots shown to bookers by a specified number of minutes"
      },
      "bookerLayouts": {
        "type": "object",
        "properties": {
          "defaultLayout": {
            "type": "string",
            "enum": [
              "month",
              "week",
              "column"
            ]
          },
          "enabledLayouts": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "month",
                "week",
                "column"
              ]
            },
            "description": "Array of valid layouts - month, week or column"
          }
        },
        "required": [
          "defaultLayout",
          "enabledLayouts"
        ],
        "additionalProperties": false,
        "description": "Should booker have week, month or column view. Specify default layout and enabled layouts user can pick."
      },
      "confirmationPolicy": {
        "type": "object",
        "description": "Specify how the booking needs to be manually confirmed before it is pushed to the integrations and a confirmation mail is sent. Cal.com variants: Confirmation Required, Disabled."
      },
      "recurrence": {
        "type": "object",
        "description": "Create a recurring event type. Cal.com variants: Recurring Event, Disabled."
      },
      "requiresBookerEmailVerification": {
        "type": "boolean"
      },
      "skipAttendeeEmailDeliverabilityCheck": {
        "type": "boolean",
        "description": "When true, skips the MX deliverability check for attendee emails on booking. Format validation and watchlist still apply. Requires the editor to belong to an organization (including platform orgs)."
      },
      "emailSettings": {
        "type": "object",
        "properties": {
          "disableEmailsToAttendees": {
            "type": "boolean",
            "description": "Disables all email communication to attendees for this event type, including booking confirmations, reminders, and cancellations. This DOES NOT include emails sent by custom email workflows."
          },
          "disableEmailsToHosts": {
            "type": "boolean",
            "description": "Disables all email communication to hosts for this event type, including booking confirmations, reminders, and cancellations. This DOES NOT include emails sent by custom email workflows."
          },
          "disableProposalEmailsToHosts": {
            "type": "boolean",
            "description": "Disables only the booking proposal 'choose a time' email sent to hosts for this event type (no one-click confirm links are issued to hosts either). Every other host email - confirmation requests, confirmations, reminders and cancellations - is unaffected. Use this when hosts confirm proposals through an external system."
          }
        },
        "additionalProperties": false,
        "description": "Email settings for this event type. Personal event types require an accepted organization membership; team event types require an organization team. This does not include emails sent by custom email workflows."
      },
      "hideCalendarNotes": {
        "type": "boolean"
      },
      "lockTimeZoneToggleOnBookingPage": {
        "type": "boolean"
      },
      "color": {
        "type": "object",
        "properties": {
          "lightThemeHex": {
            "type": "string",
            "pattern": "^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$",
            "description": "Color used for event types in light theme Example: #292929."
          },
          "darkThemeHex": {
            "type": "string",
            "pattern": "^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$",
            "description": "Color used for event types in dark theme Example: #fafafa."
          }
        },
        "required": [
          "lightThemeHex",
          "darkThemeHex"
        ],
        "additionalProperties": false
      },
      "seats": {
        "type": "object",
        "description": "Create an event type with multiple seats. Cal.com variants: Seated Event, Disabled."
      },
      "customName": {
        "type": "string",
        "description": "Customizable event name with valid variables: {Link title}, {Event type title} (legacy), {Organiser}, {Scheduler}, {Location}, {Organiser first name}, {Scheduler first name}, {Scheduler last name}, {Event duration}, {LOCATION}, {HOST/ATTENDEE}, {HOST}, {ATTENDEE}, {USER} Example: {Link title} between {Organiser} and {Scheduler}."
      },
      "destinationCalendar": {
        "type": "object",
        "properties": {
          "integration": {
            "type": "string",
            "description": "The integration type of the destination calendar. Refer to the /api/v2/calendars endpoint to retrieve the integration type of your connected calendars."
          },
          "externalId": {
            "type": "string",
            "description": "The external ID of the destination calendar. Refer to the /api/v2/calendars endpoint to retrieve the external IDs of your connected calendars."
          }
        },
        "required": [
          "integration",
          "externalId"
        ],
        "additionalProperties": false
      },
      "useDestinationCalendarEmail": {
        "type": "boolean"
      },
      "hideCalendarEventDetails": {
        "type": "boolean"
      },
      "successRedirectUrl": {
        "type": "string",
        "description": "A valid URL where the booker will redirect to, once the booking is completed successfully Cal.com format: uri. Example: https://masterchief.com/argentina/flan/video/9129412."
      },
      "hideOrganizerEmail": {
        "type": "boolean",
        "description": "Boolean to Hide organizer's email address from the booking screen, email notifications, and calendar events"
      },
      "calVideoSettings": {
        "type": "object",
        "properties": {
          "disableRecordingForOrganizer": {
            "type": "boolean",
            "description": "If true, the organizer will not be able to record the meeting Default: false."
          },
          "disableRecordingForGuests": {
            "type": "boolean",
            "description": "If true, the guests will not be able to record the meeting Default: false."
          },
          "redirectUrlOnExit": {
            "type": "string",
            "description": "URL to which participants are redirected when they exit the call This connector cannot clear this field to null. Cal.com format: uri."
          },
          "enableAutomaticRecordingForOrganizer": {
            "type": "boolean",
            "description": "If true, enables the automatic recording for the event when organizer joins the call Default: false."
          },
          "enableAutomaticTranscription": {
            "type": "boolean",
            "description": "If true, enables the automatic transcription for the event whenever someone joins the call Default: false."
          },
          "disableTranscriptionForGuests": {
            "type": "boolean",
            "description": "If true, the guests will not be able to receive transcription of the meeting Default: false."
          },
          "disableTranscriptionForOrganizer": {
            "type": "boolean",
            "description": "If true, the organizer will not be able to receive transcription of the meeting Default: false."
          },
          "hideTranscriptionForGuests": {
            "type": "boolean",
            "description": "If true, guests will not see live transcription captions during the meeting Default: false."
          },
          "hideTranscriptionForOrganizer": {
            "type": "boolean",
            "description": "If true, organizers will not see live transcription captions during the meeting Default: false."
          },
          "sendTranscriptionEmails": {
            "type": "boolean",
            "description": "Send emails with the transcription of the Cal Video after the meeting ends. Default: true."
          },
          "disableAttendeeRecordingDownloadEmail": {
            "type": "boolean",
            "description": "If true, attendees will not receive the Cal Video recording download email for this event type. Defaults to false. Organization guest notifications can still prevent this email from sending. Default: false."
          },
          "transcriptionLanguage": {
            "type": "string",
            "enum": [
              "multi",
              "ar",
              "bg",
              "ca",
              "zh-HK",
              "hr",
              "cs",
              "da",
              "nl",
              "nl-BE",
              "fi",
              "fr",
              "fr-CA",
              "de",
              "de-CH",
              "el",
              "he",
              "hi",
              "hu",
              "id",
              "it",
              "ja",
              "ko",
              "lv",
              "lt",
              "ms",
              "no",
              "pl",
              "pt",
              "pt-BR",
              "ro",
              "ru",
              "sr",
              "sk",
              "sl",
              "es",
              "es-419",
              "sv",
              "th",
              "tr",
              "uk",
              "vi"
            ],
            "description": "Deepgram language code for transcription (e.g. 'es', 'fr', 'de', 'pt-BR', or 'multi' for auto-detect). Defaults to English when not set. This connector cannot clear this field to null."
          }
        },
        "additionalProperties": false,
        "description": "Cal video settings for the event type. Platform customers can't manage this property because currently we have no way of determining if managed user is a host or an attendee."
      },
      "hidden": {
        "type": "boolean"
      },
      "bookingRequiresAuthentication": {
        "type": "boolean",
        "description": "Boolean to require authentication for booking this event type via api. If true, only authenticated users who are the event-type owner or org/team admin/owner can book this event type. Default: false."
      },
      "disableCancelling": {
        "type": "object",
        "properties": {
          "disabled": {
            "type": "boolean",
            "description": "If true, cancelling is always disabled for this event type. Example: true."
          }
        },
        "additionalProperties": false,
        "description": "Settings for disabling cancelling of this event type. Example: {\"disabled\":true}."
      },
      "disableRescheduling": {
        "type": "object",
        "properties": {
          "disabled": {
            "type": "boolean",
            "description": "If true, rescheduling is always disabled for this event type. Example: true."
          },
          "minutesBefore": {
            "type": "number",
            "minimum": 1,
            "description": "Disable rescheduling when less than the specified number of minutes before the meeting. If set, `disabled` should be false or undefined. Example: 60."
          }
        },
        "additionalProperties": false,
        "description": "Settings for disabling rescheduling of this event type. Can be always disabled or disabled when less than X minutes before the meeting. Example: {\"disabled\":false,\"minutesBefore\":60}."
      },
      "interfaceLanguage": {
        "type": "string",
        "enum": [
          "",
          "en",
          "ar",
          "az",
          "bg",
          "bn",
          "ca",
          "cs",
          "da",
          "de",
          "el",
          "es",
          "es-419",
          "eu",
          "et",
          "fi",
          "fr",
          "he",
          "hu",
          "it",
          "ja",
          "km",
          "ko",
          "nl",
          "no",
          "pl",
          "pt-BR",
          "pt",
          "ro",
          "ru",
          "sk-SK",
          "sl",
          "sr",
          "sv",
          "tr",
          "uk",
          "vi",
          "zh-CN",
          "zh-TW"
        ],
        "description": "Set preferred language for the booking interface. Use empty string for visitor's browser language (default)."
      },
      "weekStart": {
        "type": "string",
        "enum": [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        "description": "Day the booking page calendar starts the week on. Overrides the host's account setting for this event type only. Omit to inherit the account setting. This connector cannot clear this field to null. Example: Monday."
      },
      "allowReschedulingPastBookings": {
        "type": "boolean",
        "description": "Enabling this option allows for past events to be rescheduled. Default: false."
      },
      "allowReschedulingCancelledBookings": {
        "type": "boolean",
        "description": "When enabled, users will be able to create a new booking when trying to reschedule a cancelled booking. Default: false."
      },
      "showOptimizedSlots": {
        "type": "boolean",
        "description": "Arrange time slots to optimize availability. Default: false."
      },
      "useIsolatedAvailability": {
        "type": "boolean",
        "description": "When true, only this event type's own Cal.com bookings block the slot. The availability schedule and connected calendars still apply. Same as \"Consider only this booking link's bookings\" in the web app. Requires an organization with at least 15 members. Default: false."
      },
      "privateNoteEnabled": {
        "type": "boolean",
        "description": "When enabled, a private note calendar event is created alongside the booking with the resolved template as its description. Only visible to the host. Default: false."
      },
      "privateNoteMode": {
        "type": "string",
        "enum": [
          "duplicate_event",
          "separate_events"
        ],
        "description": "How private notes are delivered: as an additional host event or by sending separate host and guest invites. How private notes are delivered: as an additional host event or by sending separate host and guest invites. Example: duplicate_event."
      },
      "privateNoteTemplate": {
        "type": "string",
        "description": "Template for the private note content. Supports variables like {Attendee name}, {Link title}, {Event type title} (legacy), {Location}, {Host name}, {Event duration}, and custom booking field names. Example: Meeting with {Attendee name} for {Link title}."
      },
      "locations": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Address, Link, Integration, Phone, Attendee Address, Attendee Phone, Attendee Defined."
        },
        "description": "Locations where the event will take place. If not provided, cal video link will be used as the location. Note: Setting a location to a conferencing app does not install the app - the app must already be installed. Via API, only Google Meet (google-meet), Microsoft Teams (office365-video), and Zoom (zoom) can be installed. Cal Video (cal-video) is installed by default. All other conferencing apps must be connected via the Cal.com web app and are not available for Platform plan customers. You can only set an event type location to an app that has already been installed or connected."
      },
      "bookingFields": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL."
        },
        "description": "Booking fields for the event type. Omit this property to use the default fields. Provide an array to customize default fields or add custom booking fields. At least one of `email` or `attendeePhoneNumber` must be visible and required. The array cannot be empty, contain duplicate default fields or custom slugs, or use a default field's slug for a custom field. Omitted default fields are added with their default settings. Workflow-added fields are read-only and ignored."
      },
      "crm": {
        "type": "object",
        "properties": {
          "hubspot": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean",
                "description": "Whether the CRM app is enabled for this event type, mirroring the event type Apps tab toggle. The credential is resolved server-side — the app must be installed for the event type owner. Omitting this field leaves the app's stored enabled state unchanged and never enables the app."
              },
              "ignoreGuests": {
                "type": "boolean",
                "description": "Whether the CRM app ignores guests added to the booking, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              },
              "skipContactCreation": {
                "type": "boolean",
                "description": "Whether the CRM app skips creating a contact for the booker, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              }
            },
            "additionalProperties": false,
            "description": "HubSpot app settings for this event type."
          },
          "salesforce": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean",
                "description": "Whether the CRM app is enabled for this event type, mirroring the event type Apps tab toggle. The credential is resolved server-side — the app must be installed for the event type owner. Omitting this field leaves the app's stored enabled state unchanged and never enables the app."
              },
              "ignoreGuests": {
                "type": "boolean",
                "description": "Whether the CRM app ignores guests added to the booking, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              },
              "skipContactCreation": {
                "type": "boolean",
                "description": "Whether the CRM app skips creating a contact for the booker, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              }
            },
            "additionalProperties": false,
            "description": "Salesforce app settings for this event type."
          }
        },
        "additionalProperties": false,
        "description": "CRM app settings for the event type, mirroring the event type Apps tab toggles. The credential is resolved server-side — the app must be installed for the event type owner."
      }
    },
    "additionalProperties": false,
    "required": [
      "lengthInMinutes",
      "title",
      "slug"
    ]
  },
  "calcom.event-types.list": {
    "type": "object",
    "properties": {
      "username": {
        "type": "string",
        "description": "The username of the user to get event types for. If only username provided will get all event types."
      },
      "eventSlug": {
        "type": "string",
        "description": "Slug of event type to return. Notably, if eventSlug is provided then username must be provided too, because multiple users can have event with same slug."
      },
      "usernames": {
        "type": "string",
        "description": "Get dynamic event type for multiple usernames separated by comma. e.g `usernames=alice,bob`"
      },
      "orgSlug": {
        "type": "string",
        "description": "slug of the user's organization if he is in one, orgId is not required if using this parameter"
      },
      "orgId": {
        "type": "number",
        "description": "ID of the organization of the user you want the get the event-types of, orgSlug is not needed when using this parameter"
      },
      "sortCreatedAt": {
        "type": "string",
        "enum": [
          "asc",
          "desc"
        ],
        "description": "Sort event types by creation date. When not provided, no explicit ordering is applied."
      }
    },
    "additionalProperties": false
  },
  "calcom.event-types.get_history": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 50,
        "description": "The number of audit logs to return. Defaults to 25 and cannot exceed 50. Example: 25."
      },
      "cursor": {
        "type": "string",
        "maxLength": 2048,
        "description": "Pagination cursor from the previous response. Pass `pagination.nextCursor` to fetch the next page of audit logs. Example: eyJjcmVhdGVkQXQiOiIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSFgifQ."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.get_scheduling_config": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.list_crm_sync_errors": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "appSlug": {
        "type": "string",
        "description": "CRM app slug connected to the event type, for example `salesforce`. Example: salesforce."
      },
      "includeDismissed": {
        "type": "boolean",
        "description": "When true, returns dismissed historical errors as well as active errors. Defaults to false. Default: false. Example: true."
      },
      "cursor": {
        "type": "string",
        "description": "Opaque cursor from `pagination.nextCursor`. Omit to fetch the first page of CRM sync errors. Example: eyJ2IjoxLCJzb3J0VXVpZCI6IjAxOWVhODUwLWVmYzctN2E0OC04NTA4LWFlZDMxYjcyY2U2OCJ9."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum number of CRM sync errors to return. Default: 50. Example: 50."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "appSlug"
    ]
  },
  "calcom.event-types.get": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "string",
        "description": "Numeric event type ID or its UUID. Accepts the canonical UUID or its short-uuid (Flickr Base58) form, e.g. the one in an app.cal.com/links/{uuid} URL. Supply a string, including for numeric IDs.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.update": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "calendarInvites": {
        "type": "object",
        "properties": {
          "host": {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "enum": [
                  "inherit",
                  "standard",
                  "custom"
                ],
                "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
              },
              "template": {
                "type": "string",
                "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
              }
            },
            "required": [
              "mode"
            ],
            "additionalProperties": false,
            "description": "Host calendar-invite description settings. Example: {\"mode\":\"custom\",\"template\":\"Meeting with {ATTENDEE}\"}."
          },
          "guest": {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "enum": [
                  "inherit",
                  "standard",
                  "custom"
                ],
                "description": "Template source. `inherit` uses the organization default, `standard` uses Cal.com's standard description, and `custom` uses this object's template. Example: custom."
              },
              "template": {
                "type": "string",
                "description": "Custom Markdown description. Required only when mode is custom; maximum length is 5000 characters. Example: Meeting with {ATTENDEE} about {LINK_TITLE}."
              }
            },
            "required": [
              "mode"
            ],
            "additionalProperties": false,
            "description": "Guest calendar-invite description settings. Example: {\"mode\":\"inherit\"}."
          }
        },
        "additionalProperties": false,
        "description": "Write-only host and guest calendar-invite description settings. These are saved separately from the event type and are not returned by event-type read endpoints. Example: {\"guest\":{\"mode\":\"custom\",\"template\":\"Meeting with {ATTENDEE}\"}}."
      },
      "lengthInMinutes": {
        "type": "number",
        "description": "Example: 60."
      },
      "lengthInMinutesOptions": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "description": "If you want that user can choose between different lengths of the event you can specify them here. Must include the provided `lengthInMinutes`. Example: [15,30,60]."
      },
      "title": {
        "type": "string",
        "description": "Example: Learn the secrets of masterchief!."
      },
      "slug": {
        "type": "string",
        "description": "Example: learn-the-secrets-of-masterchief."
      },
      "description": {
        "type": "string",
        "description": "Example: Discover the culinary wonders of the Argentina by making the best flan ever!."
      },
      "slotInterval": {
        "type": "number",
        "description": "Number representing length of each slot when event is booked. By default it equal length of the event type. If event length is 60 minutes then we would have slots 9AM, 10AM, 11AM etc. but if it was changed to 30 minutes then we would have slots 9AM, 9:30AM, 10AM, 10:30AM etc. as the available times to book the 60 minute event."
      },
      "minimumBookingNotice": {
        "type": "number",
        "description": "Minimum number of minutes before the event that a booking can be made."
      },
      "beforeEventBuffer": {
        "type": "number",
        "description": "Extra time automatically blocked on your calendar before a meeting starts. This gives you time to prepare, review notes, or transition from your previous activity."
      },
      "afterEventBuffer": {
        "type": "number",
        "description": "Extra time automatically blocked on your calendar after a meeting ends. This gives you time to wrap up, add notes, or decompress before your next commitment."
      },
      "scheduleId": {
        "type": "number",
        "description": "If you want that this event has different schedule than user's default one you can specify it here."
      },
      "bookingLimitsCount": {
        "type": "object",
        "description": "Limit how many times this event can be booked Cal.com variants: Booking Count Limit, Disabled."
      },
      "bookerActiveBookingsLimit": {
        "type": "object",
        "description": "Limit the number of active bookings a booker can make for this event type. Cal.com variants: Active Booking Limit, Disabled."
      },
      "onlyShowFirstAvailableSlot": {
        "type": "boolean",
        "description": "This will limit your availability for this event type to one slot per day, scheduled at the earliest available time."
      },
      "bookingLimitsDuration": {
        "type": "object",
        "description": "Limit total amount of time that this event can be booked Cal.com variants: Booking Duration Limit, Disabled."
      },
      "bookingWindow": {
        "type": "object",
        "description": "Limit how far in the future this event can be booked Cal.com variants: Business Days, Calendar Days, Date Range, Disabled."
      },
      "offsetStart": {
        "type": "number",
        "description": "Offset timeslots shown to bookers by a specified number of minutes"
      },
      "bookerLayouts": {
        "type": "object",
        "properties": {
          "defaultLayout": {
            "type": "string",
            "enum": [
              "month",
              "week",
              "column"
            ]
          },
          "enabledLayouts": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "month",
                "week",
                "column"
              ]
            },
            "description": "Array of valid layouts - month, week or column"
          }
        },
        "required": [
          "defaultLayout",
          "enabledLayouts"
        ],
        "additionalProperties": false,
        "description": "Should booker have week, month or column view. Specify default layout and enabled layouts user can pick."
      },
      "confirmationPolicy": {
        "type": "object",
        "description": "Specify how the booking needs to be manually confirmed before it is pushed to the integrations and a confirmation mail is sent. Cal.com variants: Confirmation Required, Disabled."
      },
      "bookingProposalCount": {
        "type": "number",
        "description": "Maximum number of timeslots a proposal may include. The client chooses from 1 through this maximum. This connector cannot clear this field to null."
      },
      "recurrence": {
        "type": "object",
        "description": "Create a recurring event type. Cal.com variants: Recurring Event, Disabled."
      },
      "requiresBookerEmailVerification": {
        "type": "boolean"
      },
      "skipAttendeeEmailDeliverabilityCheck": {
        "type": "boolean",
        "description": "When true, skips the MX deliverability check for attendee emails on booking. Format validation and watchlist still apply. Requires the editor to belong to an organization (including platform orgs)."
      },
      "emailSettings": {
        "type": "object",
        "properties": {
          "disableEmailsToAttendees": {
            "type": "boolean",
            "description": "Disables all email communication to attendees for this event type, including booking confirmations, reminders, and cancellations. This DOES NOT include emails sent by custom email workflows."
          },
          "disableEmailsToHosts": {
            "type": "boolean",
            "description": "Disables all email communication to hosts for this event type, including booking confirmations, reminders, and cancellations. This DOES NOT include emails sent by custom email workflows."
          },
          "disableProposalEmailsToHosts": {
            "type": "boolean",
            "description": "Disables only the booking proposal 'choose a time' email sent to hosts for this event type (no one-click confirm links are issued to hosts either). Every other host email - confirmation requests, confirmations, reminders and cancellations - is unaffected. Use this when hosts confirm proposals through an external system."
          }
        },
        "additionalProperties": false,
        "description": "Email settings for this event type. Personal event types require an accepted organization membership; team event types require an organization team. This does not include emails sent by custom email workflows."
      },
      "hideCalendarNotes": {
        "type": "boolean"
      },
      "lockTimeZoneToggleOnBookingPage": {
        "type": "boolean"
      },
      "color": {
        "type": "object",
        "properties": {
          "lightThemeHex": {
            "type": "string",
            "pattern": "^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$",
            "description": "Color used for event types in light theme Example: #292929."
          },
          "darkThemeHex": {
            "type": "string",
            "pattern": "^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$",
            "description": "Color used for event types in dark theme Example: #fafafa."
          }
        },
        "required": [
          "lightThemeHex",
          "darkThemeHex"
        ],
        "additionalProperties": false
      },
      "seats": {
        "type": "object",
        "description": "Create an event type with multiple seats. Cal.com variants: Seated Event, Disabled."
      },
      "customName": {
        "type": "string",
        "description": "Customizable event name with valid variables: {Link title}, {Event type title} (legacy), {Organiser}, {Scheduler}, {Location}, {Organiser first name}, {Scheduler first name}, {Scheduler last name}, {Event duration}, {LOCATION}, {HOST/ATTENDEE}, {HOST}, {ATTENDEE}, {USER} Example: {Link title} between {Organiser} and {Scheduler}."
      },
      "destinationCalendar": {
        "type": "object",
        "properties": {
          "integration": {
            "type": "string",
            "description": "The integration type of the destination calendar. Refer to the /api/v2/calendars endpoint to retrieve the integration type of your connected calendars."
          },
          "externalId": {
            "type": "string",
            "description": "The external ID of the destination calendar. Refer to the /api/v2/calendars endpoint to retrieve the external IDs of your connected calendars."
          }
        },
        "required": [
          "integration",
          "externalId"
        ],
        "additionalProperties": false
      },
      "useDestinationCalendarEmail": {
        "type": "boolean"
      },
      "hideCalendarEventDetails": {
        "type": "boolean"
      },
      "successRedirectUrl": {
        "type": "string",
        "description": "A valid URL where the booker will redirect to, once the booking is completed successfully Example: https://masterchief.com/argentina/flan/video/9129412."
      },
      "hideOrganizerEmail": {
        "type": "boolean",
        "description": "Boolean to Hide organizer's email address from the booking screen, email notifications, and calendar events"
      },
      "calVideoSettings": {
        "type": "object",
        "properties": {
          "disableRecordingForOrganizer": {
            "type": "boolean",
            "description": "If true, the organizer will not be able to record the meeting Default: false."
          },
          "disableRecordingForGuests": {
            "type": "boolean",
            "description": "If true, the guests will not be able to record the meeting Default: false."
          },
          "redirectUrlOnExit": {
            "type": "string",
            "description": "URL to which participants are redirected when they exit the call This connector cannot clear this field to null. Cal.com format: uri."
          },
          "enableAutomaticRecordingForOrganizer": {
            "type": "boolean",
            "description": "If true, enables the automatic recording for the event when organizer joins the call Default: false."
          },
          "enableAutomaticTranscription": {
            "type": "boolean",
            "description": "If true, enables the automatic transcription for the event whenever someone joins the call Default: false."
          },
          "disableTranscriptionForGuests": {
            "type": "boolean",
            "description": "If true, the guests will not be able to receive transcription of the meeting Default: false."
          },
          "disableTranscriptionForOrganizer": {
            "type": "boolean",
            "description": "If true, the organizer will not be able to receive transcription of the meeting Default: false."
          },
          "hideTranscriptionForGuests": {
            "type": "boolean",
            "description": "If true, guests will not see live transcription captions during the meeting Default: false."
          },
          "hideTranscriptionForOrganizer": {
            "type": "boolean",
            "description": "If true, organizers will not see live transcription captions during the meeting Default: false."
          },
          "sendTranscriptionEmails": {
            "type": "boolean",
            "description": "Send emails with the transcription of the Cal Video after the meeting ends. Default: true."
          },
          "disableAttendeeRecordingDownloadEmail": {
            "type": "boolean",
            "description": "If true, attendees will not receive the Cal Video recording download email for this event type. Defaults to false. Organization guest notifications can still prevent this email from sending. Default: false."
          },
          "transcriptionLanguage": {
            "type": "string",
            "enum": [
              "multi",
              "ar",
              "bg",
              "ca",
              "zh-HK",
              "hr",
              "cs",
              "da",
              "nl",
              "nl-BE",
              "fi",
              "fr",
              "fr-CA",
              "de",
              "de-CH",
              "el",
              "he",
              "hi",
              "hu",
              "id",
              "it",
              "ja",
              "ko",
              "lv",
              "lt",
              "ms",
              "no",
              "pl",
              "pt",
              "pt-BR",
              "ro",
              "ru",
              "sr",
              "sk",
              "sl",
              "es",
              "es-419",
              "sv",
              "th",
              "tr",
              "uk",
              "vi"
            ],
            "description": "Deepgram language code for transcription (e.g. 'es', 'fr', 'de', 'pt-BR', or 'multi' for auto-detect). Defaults to English when not set. This connector cannot clear this field to null."
          }
        },
        "additionalProperties": false,
        "description": "Cal video settings for the event type"
      },
      "hidden": {
        "type": "boolean"
      },
      "bookingRequiresAuthentication": {
        "type": "boolean",
        "description": "Boolean to require authentication for booking this event type via api. If true, only authenticated users who are the event-type owner or org/team admin/owner can book this event type. Default: false."
      },
      "disableCancelling": {
        "type": "object",
        "properties": {
          "disabled": {
            "type": "boolean",
            "description": "If true, cancelling is always disabled for this event type. Example: true."
          }
        },
        "additionalProperties": false,
        "description": "Settings for disabling cancelling of this event type. Example: {\"disabled\":true}."
      },
      "disableRescheduling": {
        "type": "object",
        "properties": {
          "disabled": {
            "type": "boolean",
            "description": "If true, rescheduling is always disabled for this event type. Example: true."
          },
          "minutesBefore": {
            "type": "number",
            "minimum": 1,
            "description": "Disable rescheduling when less than the specified number of minutes before the meeting. If set, `disabled` should be false or undefined. Example: 60."
          }
        },
        "additionalProperties": false,
        "description": "Settings for disabling rescheduling of this event type. Can be always disabled or disabled when less than X minutes before the meeting. Example: {\"disabled\":false,\"minutesBefore\":60}."
      },
      "interfaceLanguage": {
        "type": "string",
        "enum": [
          "",
          "en",
          "ar",
          "az",
          "bg",
          "bn",
          "ca",
          "cs",
          "da",
          "de",
          "el",
          "es",
          "es-419",
          "eu",
          "et",
          "fi",
          "fr",
          "he",
          "hu",
          "it",
          "ja",
          "km",
          "ko",
          "nl",
          "no",
          "pl",
          "pt-BR",
          "pt",
          "ro",
          "ru",
          "sk-SK",
          "sl",
          "sr",
          "sv",
          "tr",
          "uk",
          "vi",
          "zh-CN",
          "zh-TW"
        ],
        "description": "Set preferred language for the booking interface. Use empty string for visitor's browser language (default)."
      },
      "weekStart": {
        "type": "string",
        "enum": [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        "description": "Day the booking page calendar starts the week on. Overrides the host's account setting for this event type only. Example: Monday. This connector cannot clear this field to null."
      },
      "allowReschedulingPastBookings": {
        "type": "boolean",
        "description": "Enabling this option allows for past events to be rescheduled. Default: false."
      },
      "allowReschedulingCancelledBookings": {
        "type": "boolean",
        "description": "When enabled, users will be able to create a new booking when trying to reschedule a cancelled booking. Default: false."
      },
      "showOptimizedSlots": {
        "type": "boolean",
        "description": "Arrange time slots to optimize availability. Default: false."
      },
      "useIsolatedAvailability": {
        "type": "boolean",
        "description": "When true, only this event type's own Cal.com bookings block the slot. The availability schedule and connected calendars still apply. Same as \"Consider only this booking link's bookings\" in the web app. Requires an organization with at least 15 members. Default: false."
      },
      "privateNoteEnabled": {
        "type": "boolean",
        "description": "When enabled, a private note calendar event is created alongside the booking with the resolved template as its description. Only visible to the host. Default: false."
      },
      "privateNoteMode": {
        "type": "string",
        "enum": [
          "duplicate_event",
          "separate_events"
        ],
        "description": "How private notes are delivered: as an additional host event or by sending separate host and guest invites. How private notes are delivered: as an additional host event or by sending separate host and guest invites. Example: duplicate_event."
      },
      "privateNoteTemplate": {
        "type": "string",
        "description": "Template for the private note content. Supports variables like {Attendee name}, {Link title}, {Event type title} (legacy), {Location}, {Host name}, {Event duration}, and custom booking field names. Example: Meeting with {Attendee name} for {Link title}."
      },
      "allowAffectingUpcomingBookings": {
        "type": "boolean",
        "description": "Allows this update to affect upcoming bookings when a live confirmation session exists. Not stored and not returned. `true` confirms the edit: - Turning seats off cancels every attendee and booking attempt, and new bookings are taken one at a time. - Turning confirmation off rejects pending requests, leaves accepted attendees, and confirms new booking attempts until the seats are full. - Setting the seat cap below the seats already accepted keeps existing bookings and their seats, and applies the lower cap to new bookings and later confirmations. `false` and omitting the field leave the update refused when it would affect upcoming bookings."
      },
      "locations": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Address, Link, Integration, Phone, Attendee Address, Attendee Phone, Attendee Defined."
        },
        "description": "Locations where the event will take place. If not provided, cal video link will be used as the location. Note: Setting a location to a conferencing app does not install the app - the app must already be installed. Via API, only Google Meet (google-meet), Microsoft Teams (office365-video), and Zoom (zoom) can be installed. Cal Video (cal-video) is installed by default. All other conferencing apps must be connected via the Cal.com web app and are not available for Platform plan customers. You can only set an event type location to an app that has already been installed or connected."
      },
      "bookingFields": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL."
        },
        "description": "Booking fields for the event type. Omit this property to keep the current fields. Provide an array to replace them, customize default fields, or add custom booking fields. At least one of `email` or `attendeePhoneNumber` must be visible and required. The array cannot be empty, contain duplicate default fields or custom slugs, or use a default field's slug for a custom field. Omitted default fields are restored with their default settings. Workflow-added fields are read-only and ignored."
      },
      "crm": {
        "type": "object",
        "properties": {
          "hubspot": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean",
                "description": "Whether the CRM app is enabled for this event type, mirroring the event type Apps tab toggle. The credential is resolved server-side — the app must be installed for the event type owner. Omitting this field leaves the app's stored enabled state unchanged and never enables the app."
              },
              "ignoreGuests": {
                "type": "boolean",
                "description": "Whether the CRM app ignores guests added to the booking, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              },
              "skipContactCreation": {
                "type": "boolean",
                "description": "Whether the CRM app skips creating a contact for the booker, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              }
            },
            "additionalProperties": false,
            "description": "HubSpot app settings for this event type."
          },
          "salesforce": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean",
                "description": "Whether the CRM app is enabled for this event type, mirroring the event type Apps tab toggle. The credential is resolved server-side — the app must be installed for the event type owner. Omitting this field leaves the app's stored enabled state unchanged and never enables the app."
              },
              "ignoreGuests": {
                "type": "boolean",
                "description": "Whether the CRM app ignores guests added to the booking, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              },
              "skipContactCreation": {
                "type": "boolean",
                "description": "Whether the CRM app skips creating a contact for the booker, mirroring the event type Apps tab toggle. Requires the app to be enabled — already enabled for the event type, or send enabled: true in the same request."
              }
            },
            "additionalProperties": false,
            "description": "Salesforce app settings for this event type."
          }
        },
        "additionalProperties": false,
        "description": "CRM app settings for the event type, mirroring the event type Apps tab toggles. The credential is resolved server-side — the app must be installed for the event type owner."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.delete": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.get_booking_fields": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.replace_booking_fields": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "bookingFields": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL."
        },
        "description": "Booking fields to add or use as a replacement. The array cannot be empty, contain duplicate default fields or custom slugs, or use a default field's slug for a custom field. When replacing fields, at least one of `email` or `attendeePhoneNumber` must remain visible and required. Workflow-added fields are read-only and ignored when replacing fields."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "bookingFields"
    ]
  },
  "calcom.event-types.add_booking_fields": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "bookingFields": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL."
        },
        "description": "Booking fields to add or use as a replacement. The array cannot be empty, contain duplicate default fields or custom slugs, or use a default field's slug for a custom field. When replacing fields, at least one of `email` or `attendeePhoneNumber` must remain visible and required. Workflow-added fields are read-only and ignored when replacing fields."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "bookingFields"
    ]
  },
  "calcom.event-types.update_booking_fields": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "bookingFields": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL. Each variant also requires slug."
        },
        "description": "Booking fields to update. Identify each field by `slug` and include at least one property to change. `field` and a custom field's `type` cannot be changed. Null values and repeated slugs are not allowed, except `showWhen: null`, which removes a follow-up condition. Workflow-added fields are read-only."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "bookingFields"
    ]
  },
  "calcom.event-types.delete_booking_field": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "slug": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "slug"
    ]
  },
  "calcom.event-types.create_webhook": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "payloadTemplate": {
        "type": "string",
        "description": "The template of the payload that will be sent to the subscriberUrl, check cal.com/help/webhooks for more information Example: {\"content\":\"A new event has been scheduled\",\"type\":\"{{type}}\",\"name\":\"{{title}}\",\"organizer\":\"{{organizer.name}}\",\"booker\":\"{{attendees.0.name}}\"}."
      },
      "active": {
        "type": "boolean"
      },
      "subscriberUrl": {
        "type": "string"
      },
      "triggers": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "BOOKING_CREATED",
            "BOOKING_PAYMENT_INITIATED",
            "BOOKING_PAID",
            "BOOKING_RESCHEDULED",
            "BOOKING_REQUESTED",
            "BOOKING_CANCELLED",
            "BOOKING_REJECTED",
            "BOOKING_SEAT_REJECTED",
            "BOOKING_NO_SHOW_UPDATED",
            "BOOKING_LOCATION_UPDATED",
            "BOOKING_TITLE_UPDATED",
            "BOOKING_REASSIGNED",
            "BOOKING_SEAT_ACCEPTED",
            "FORM_SUBMITTED",
            "MEETING_ENDED",
            "MEETING_STARTED",
            "RECORDING_READY",
            "INSTANT_MEETING",
            "INSTANT_MEETING_ACCEPTED",
            "RECORDING_TRANSCRIPTION_GENERATED",
            "OOO_CREATED",
            "AFTER_HOSTS_CAL_VIDEO_NO_SHOW",
            "AFTER_GUESTS_CAL_VIDEO_NO_SHOW",
            "FORM_SUBMITTED_NO_EVENT",
            "ROUTING_FORM_FALLBACK_HIT",
            "DELEGATION_CREDENTIAL_ERROR",
            "WRONG_ASSIGNMENT_REPORT",
            "DELEGATION_CREDENTIAL_SECRET_ROTATION_FAILED",
            "DELEGATION_CREDENTIAL_ROTATION_REQUIRED",
            "DELEGATION_CREDENTIAL_SECRET_ROTATED",
            "CALENDAR_ENTRY_REJECTED",
            "CAL_EVENT_REGISTRATION_REQUESTED",
            "CAL_EVENT_REGISTRATION_CONFIRMED",
            "CAL_EVENT_REGISTRATION_WAITLISTED",
            "CAL_EVENT_REGISTRATION_DECLINED",
            "CAL_EVENT_REGISTRATION_CANCELLED",
            "SEQUENCE_BOOKING_CREATED"
          ]
        },
        "description": "Example: [\"BOOKING_CREATED\",\"BOOKING_RESCHEDULED\",\"BOOKING_CANCELLED\",\"BOOKING_CONFIRMED\",\"BOOKING_REJECTED\",\"BOOKING_SEAT_REJECTED\",\"BOOKING_COMPLETED\",\"BOOKING_NO_SHOW\",\"BOOKING_REOPENED\"]."
      },
      "customHeaders": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "HTTP header name, at most 256 characters. Names starting with `X-Cal-` are reserved for Cal.com's own headers. Blocked names: host, content-length, transfer-encoding, connection, keep-alive, upgrade, trailer, te, proxy-authorization. Example: Authorization."
            },
            "value": {
              "type": "string",
              "description": "HTTP header value. Omit (or send the redacted `\"***\"`) on update to keep the stored value, as long as `subscriberUrl` stays the same: stored values are never sent to a new URL. Values are stored encrypted and are always redacted as `\"***\"` on read. Example: Bearer crsr_xxxxxxxxxxxxx."
            }
          },
          "required": [
            "name"
          ],
          "additionalProperties": false
        },
        "description": "Static HTTP headers sent on every webhook delivery (e.g. Authorization). Max 10 headers, values up to 4 KiB, stored encrypted and redacted on read. Changing `subscriberUrl` drops the stored values unless you send them again. An instance without the webhook header keyring (`CALCOM_KEYRING_WEBHOOK_HEADERS`) answers 400 to any request that sends headers."
      },
      "version": {
        "type": "string",
        "enum": [
          "2021-10-20",
          "2026-07-27"
        ],
        "description": "The payload format version of the webhook. Version 2026-07-27 adds generated ICS calendar content (`attendeeIcsContent`, `organizerIcsContent`) to BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, BOOKING_SEAT_ACCEPTED, and BOOKING_PAID (when the payment accepted the booking) payloads. Every version's builder-produced payload carries a `payload.platformOAuthClientId` field naming the owning platform OAuth client (`null` for non-platform events; for the flat-delivered MEETING_STARTED/MEETING_ENDED bodies the field appears at the top level of the body). Zapier deliveries, custom payload templates that do not reference the field, the `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW` bodies (delivered verbatim from the fire-time blob, never built) and the legacy `FORM_SUBMITTED_NO_EVENT` fallback delivery omit it. Example: 2021-10-20."
      },
      "time": {
        "type": "number",
        "minimum": 1,
        "description": "How long after the booking start time the no-show triggers are evaluated. Required, together with timeUnit, when subscribing to AFTER_HOSTS_CAL_VIDEO_NO_SHOW or AFTER_GUESTS_CAL_VIDEO_NO_SHOW Example: 5."
      },
      "timeUnit": {
        "type": "string",
        "enum": [
          "DAY",
          "HOUR",
          "MINUTE"
        ],
        "description": "The unit of the no-show time value Example: MINUTE."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "active",
      "subscriberUrl",
      "triggers"
    ]
  },
  "calcom.event-types.list_webhooks": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.clear_webhooks": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.update_webhook": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "eventTypeId": {
        "type": "number"
      },
      "payloadTemplate": {
        "type": "string",
        "description": "The template of the payload that will be sent to the subscriberUrl, check cal.com/help/webhooks for more information Example: {\"content\":\"A new event has been scheduled\",\"type\":\"{{type}}\",\"name\":\"{{title}}\",\"organizer\":\"{{organizer.name}}\",\"booker\":\"{{attendees.0.name}}\"}."
      },
      "active": {
        "type": "boolean"
      },
      "subscriberUrl": {
        "type": "string"
      },
      "triggers": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "BOOKING_CREATED",
            "BOOKING_PAYMENT_INITIATED",
            "BOOKING_PAID",
            "BOOKING_RESCHEDULED",
            "BOOKING_REQUESTED",
            "BOOKING_CANCELLED",
            "BOOKING_REJECTED",
            "BOOKING_SEAT_REJECTED",
            "BOOKING_NO_SHOW_UPDATED",
            "BOOKING_LOCATION_UPDATED",
            "BOOKING_TITLE_UPDATED",
            "BOOKING_REASSIGNED",
            "BOOKING_SEAT_ACCEPTED",
            "FORM_SUBMITTED",
            "MEETING_ENDED",
            "MEETING_STARTED",
            "RECORDING_READY",
            "INSTANT_MEETING",
            "INSTANT_MEETING_ACCEPTED",
            "RECORDING_TRANSCRIPTION_GENERATED",
            "OOO_CREATED",
            "AFTER_HOSTS_CAL_VIDEO_NO_SHOW",
            "AFTER_GUESTS_CAL_VIDEO_NO_SHOW",
            "FORM_SUBMITTED_NO_EVENT",
            "ROUTING_FORM_FALLBACK_HIT",
            "DELEGATION_CREDENTIAL_ERROR",
            "WRONG_ASSIGNMENT_REPORT",
            "DELEGATION_CREDENTIAL_SECRET_ROTATION_FAILED",
            "DELEGATION_CREDENTIAL_ROTATION_REQUIRED",
            "DELEGATION_CREDENTIAL_SECRET_ROTATED",
            "CALENDAR_ENTRY_REJECTED",
            "CAL_EVENT_REGISTRATION_REQUESTED",
            "CAL_EVENT_REGISTRATION_CONFIRMED",
            "CAL_EVENT_REGISTRATION_WAITLISTED",
            "CAL_EVENT_REGISTRATION_DECLINED",
            "CAL_EVENT_REGISTRATION_CANCELLED",
            "SEQUENCE_BOOKING_CREATED"
          ]
        },
        "description": "Example: [\"BOOKING_CREATED\",\"BOOKING_RESCHEDULED\",\"BOOKING_CANCELLED\",\"BOOKING_CONFIRMED\",\"BOOKING_REJECTED\",\"BOOKING_SEAT_REJECTED\",\"BOOKING_COMPLETED\",\"BOOKING_NO_SHOW\",\"BOOKING_REOPENED\"]."
      },
      "customHeaders": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "HTTP header name, at most 256 characters. Names starting with `X-Cal-` are reserved for Cal.com's own headers. Blocked names: host, content-length, transfer-encoding, connection, keep-alive, upgrade, trailer, te, proxy-authorization. Example: Authorization."
            },
            "value": {
              "type": "string",
              "description": "HTTP header value. Omit (or send the redacted `\"***\"`) on update to keep the stored value, as long as `subscriberUrl` stays the same: stored values are never sent to a new URL. Values are stored encrypted and are always redacted as `\"***\"` on read. Example: Bearer crsr_xxxxxxxxxxxxx."
            }
          },
          "required": [
            "name"
          ],
          "additionalProperties": false
        },
        "description": "Static HTTP headers sent on every webhook delivery (e.g. Authorization). Max 10 headers, values up to 4 KiB, stored encrypted and redacted on read. Changing `subscriberUrl` drops the stored values unless you send them again. An instance without the webhook header keyring (`CALCOM_KEYRING_WEBHOOK_HEADERS`) answers 400 to any request that sends headers."
      },
      "version": {
        "type": "string",
        "enum": [
          "2021-10-20",
          "2026-07-27"
        ],
        "description": "The payload format version of the webhook. Version 2026-07-27 adds generated ICS calendar content (`attendeeIcsContent`, `organizerIcsContent`) to BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, BOOKING_SEAT_ACCEPTED, and BOOKING_PAID (when the payment accepted the booking) payloads. Every version's builder-produced payload carries a `payload.platformOAuthClientId` field naming the owning platform OAuth client (`null` for non-platform events; for the flat-delivered MEETING_STARTED/MEETING_ENDED bodies the field appears at the top level of the body). Zapier deliveries, custom payload templates that do not reference the field, the `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW` bodies (delivered verbatim from the fire-time blob, never built) and the legacy `FORM_SUBMITTED_NO_EVENT` fallback delivery omit it. Example: 2021-10-20."
      },
      "time": {
        "type": "number",
        "minimum": 1,
        "description": "How long after the booking start time the no-show triggers are evaluated. Required, together with timeUnit, when subscribing to AFTER_HOSTS_CAL_VIDEO_NO_SHOW or AFTER_GUESTS_CAL_VIDEO_NO_SHOW Example: 5."
      },
      "timeUnit": {
        "type": "string",
        "enum": [
          "DAY",
          "HOUR",
          "MINUTE"
        ],
        "description": "The unit of the no-show time value Example: MINUTE."
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId",
      "eventTypeId"
    ]
  },
  "calcom.event-types.get_webhook": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId",
      "eventTypeId"
    ]
  },
  "calcom.event-types.delete_webhook": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId",
      "eventTypeId"
    ]
  },
  "calcom.event-types.create_private_link": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "expiresAt": {
        "type": "string",
        "description": "Expiration date for time-based links Cal.com format: date-time. Example: 2024-12-31T23:59:59.000Z."
      },
      "maxUsageCount": {
        "type": "number",
        "description": "Maximum number of times the link can be used. Pass `-1` to opt out of the count cap (the link is then gated only by `expiresAt`, or unbounded if that is also unset). If omitted and expiresAt is not provided, defaults to 1 (one time use). Default: 1. Example: 10."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.list_private_links": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId"
    ]
  },
  "calcom.event-types.update_private_link": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "linkId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "expiresAt": {
        "type": "string",
        "description": "New expiration date for time-based links Cal.com format: date-time. Example: 2024-12-31T23:59:59.000Z."
      },
      "maxUsageCount": {
        "type": "number",
        "description": "New maximum number of times the link can be used. Pass `-1` to opt out of the count cap. Example: 10."
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "linkId"
    ]
  },
  "calcom.event-types.delete_private_link": {
    "type": "object",
    "properties": {
      "eventTypeId": {
        "type": "number"
      },
      "linkId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "eventTypeId",
      "linkId"
    ]
  },
  "calcom.schedules.create": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Example: Catch up hours."
      },
      "timeZone": {
        "type": "string",
        "description": "Timezone is used to calculate available times when an event using the schedule is booked. Example: Europe/Rome."
      },
      "availability": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "days": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday"
                ]
              },
              "description": "Array of days when schedule is active. Example: [\"Monday\",\"Tuesday\"]."
            },
            "startTime": {
              "type": "string",
              "description": "startTime must be a valid time in format HH:MM e.g. 08:00 Example: 08:00."
            },
            "endTime": {
              "type": "string",
              "description": "endTime must be a valid time in format HH:MM e.g. 15:00 Example: 15:00."
            }
          },
          "required": [
            "days",
            "startTime",
            "endTime"
          ],
          "additionalProperties": false
        },
        "description": "Each object contains days and times when the user is available. If not passed, the default availability is Monday to Friday from 09:00 to 17:00. Example: [{\"days\":[\"Monday\",\"Tuesday\"],\"startTime\":\"17:00\",\"endTime\":\"19:00\"},{\"days\":[\"Wednesday\",\"Thursday\"],\"startTime\":\"16:00\",\"endTime\":\"20:00\"}]."
      },
      "isDefault": {
        "type": "boolean",
        "description": "Each user should have 1 default schedule. If you specified `timeZone` when creating managed user, then the default schedule will be created with that timezone. Default schedule means that if an event type is not tied to a specific schedule then the default schedule is used. Example: true."
      },
      "overrides": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "Example: 2024-05-20."
            },
            "startTime": {
              "type": "string",
              "description": "startTime must be a valid time in format HH:MM e.g. 12:00 Example: 12:00."
            },
            "endTime": {
              "type": "string",
              "description": "endTime must be a valid time in format HH:MM e.g. 13:00 Example: 13:00."
            }
          },
          "required": [
            "date",
            "startTime",
            "endTime"
          ],
          "additionalProperties": false
        },
        "description": "Need to change availability for a specific date? Add an override. Example: [{\"date\":\"2024-05-20\",\"startTime\":\"18:00\",\"endTime\":\"21:00\"}]."
      }
    },
    "additionalProperties": false,
    "required": [
      "name",
      "timeZone",
      "isDefault"
    ]
  },
  "calcom.schedules.list": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.schedules.get_default": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.schedules.get": {
    "type": "object",
    "properties": {
      "scheduleId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "scheduleId"
    ]
  },
  "calcom.schedules.update": {
    "type": "object",
    "properties": {
      "scheduleId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "name": {
        "type": "string",
        "description": "Example: One-on-one coaching."
      },
      "timeZone": {
        "type": "string",
        "description": "Example: Europe/Rome."
      },
      "availability": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "days": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday"
                ]
              },
              "description": "Array of days when schedule is active. Example: [\"Monday\",\"Tuesday\"]."
            },
            "startTime": {
              "type": "string",
              "description": "startTime must be a valid time in format HH:MM e.g. 08:00 Example: 08:00."
            },
            "endTime": {
              "type": "string",
              "description": "endTime must be a valid time in format HH:MM e.g. 15:00 Example: 15:00."
            }
          },
          "required": [
            "days",
            "startTime",
            "endTime"
          ],
          "additionalProperties": false
        },
        "description": "Example: [{\"days\":[\"Monday\",\"Tuesday\"],\"startTime\":\"09:00\",\"endTime\":\"10:00\"}]."
      },
      "isDefault": {
        "type": "boolean",
        "description": "Example: true."
      },
      "overrides": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "Example: 2024-05-20."
            },
            "startTime": {
              "type": "string",
              "description": "startTime must be a valid time in format HH:MM e.g. 12:00 Example: 12:00."
            },
            "endTime": {
              "type": "string",
              "description": "endTime must be a valid time in format HH:MM e.g. 13:00 Example: 13:00."
            }
          },
          "required": [
            "date",
            "startTime",
            "endTime"
          ],
          "additionalProperties": false
        },
        "description": "Example: [{\"date\":\"2024-05-20\",\"startTime\":\"12:00\",\"endTime\":\"14:00\"}]."
      }
    },
    "additionalProperties": false,
    "required": [
      "scheduleId"
    ]
  },
  "calcom.schedules.delete": {
    "type": "object",
    "properties": {
      "scheduleId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "scheduleId"
    ]
  },
  "calcom.calendars.get_event": {
    "type": "object",
    "properties": {
      "calendar": {
        "type": "string",
        "enum": [
          "google"
        ]
      },
      "eventUid": {
        "type": "string",
        "description": "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints: - For team events: https://cal.com/docs/api-reference/v2/orgs-teams-bookings/get-booking-references-for-a-booking - For user events: https://cal.com/docs/api-reference/v2/bookings/get-booking-references-for-a-booking",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "calendar",
      "eventUid"
    ]
  },
  "calcom.calendars.update_event": {
    "type": "object",
    "properties": {
      "calendar": {
        "type": "string",
        "enum": [
          "google"
        ]
      },
      "eventUid": {
        "type": "string",
        "description": "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints: - For team events: https://cal.com/docs/api-reference/v2/orgs-teams-bookings/get-booking-references-for-a-booking - For user events: https://cal.com/docs/api-reference/v2/bookings/get-booking-references-for-a-booking",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "start": {
        "type": "object",
        "properties": {
          "time": {
            "type": "string",
            "description": "Cal.com format: date-time."
          },
          "timeZone": {
            "type": "string"
          }
        },
        "additionalProperties": false,
        "description": "Start date and time of the calendar event with timezone information"
      },
      "end": {
        "type": "object",
        "properties": {
          "time": {
            "type": "string",
            "description": "Cal.com format: date-time."
          },
          "timeZone": {
            "type": "string"
          }
        },
        "additionalProperties": false,
        "description": "End date and time of the calendar event with timezone information"
      },
      "title": {
        "type": "string",
        "description": "Title of the calendar event"
      },
      "description": {
        "type": "string",
        "description": "Detailed description of the calendar event This connector cannot clear this field to null."
      },
      "attendees": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "description": "Email address of the attendee"
            },
            "name": {
              "type": "string",
              "description": "Display name of the attendee"
            },
            "responseStatus": {
              "type": "string",
              "enum": [
                "accepted",
                "pending",
                "declined",
                "needsAction"
              ],
              "description": "Attendee's response to the invitation Response status of the attendee"
            },
            "self": {
              "type": "boolean",
              "description": "Indicates if this attendee is the current user This connector cannot clear this field to null."
            },
            "optional": {
              "type": "boolean",
              "description": "Indicates if this attendee's attendance is optional This connector cannot clear this field to null."
            },
            "host": {
              "type": "boolean",
              "description": "Indicates if this attendee is the host This connector cannot clear this field to null."
            }
          },
          "additionalProperties": false
        },
        "description": "List of attendees. CAUTION: You must pass the entire array with all updated values. Any attendees not included in this array will be removed from the event. This connector cannot clear this field to null."
      },
      "status": {
        "type": "string",
        "enum": [
          "accepted",
          "pending",
          "declined",
          "cancelled"
        ],
        "description": "Status of the event (accepted, pending, declined, cancelled) Status of the event (accepted, pending, declined, cancelled) Example: accepted."
      }
    },
    "additionalProperties": false,
    "required": [
      "calendar",
      "eventUid"
    ]
  },
  "calcom.calendars.add_ics_feed": {
    "type": "object",
    "properties": {
      "urls": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string",
          "description": "Example: https://cal.com/ics/feed.ics."
        },
        "description": "An array of ICS URLs Example: [\"https://cal.com/ics/feed.ics\"]."
      },
      "readOnly": {
        "type": "boolean",
        "description": "Whether to allowing writing to the calendar or not Default: true. Example: false."
      }
    },
    "additionalProperties": false,
    "required": [
      "urls"
    ]
  },
  "calcom.calendars.check_ics_feed": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.calendars.get_busy_times": {
    "type": "object",
    "properties": {
      "loggedInUsersTz": {
        "type": "string",
        "description": "Deprecated: Use timeZone instead. The timezone of the user represented as a string Example: America/New_York."
      },
      "timeZone": {
        "type": "string",
        "description": "The timezone for the busy times query represented as a string Example: America/New_York."
      },
      "dateFrom": {
        "type": "string",
        "description": "The starting date for the busy times query Example: 2023-10-01."
      },
      "dateTo": {
        "type": "string",
        "description": "The ending date for the busy times query Example: 2023-10-31."
      },
      "calendar": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^\\d+,.+$"
        },
        "description": "Calendar to load busy times from, formatted as credentialId,externalId. Repeat the parameter to load multiple calendars, e.g. calendar=135,alice@example.com&calendar=200,bob@example.com. At least one calendar is required. Example: [\"135,alice@example.com\"]. Required here although Cal.com's spec marks it optional: measured 2026-11-23 on two accounts, the call without it answered HTTP 400 and with one calendar answered 200."
      }
    },
    "additionalProperties": false,
    "required": [
      "dateFrom",
      "dateTo",
      "calendar"
    ]
  },
  "calcom.calendars.list": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.calendars.get_connect_url": {
    "type": "object",
    "properties": {
      "calendar": {
        "type": "string",
        "enum": [
          "office365",
          "google"
        ]
      },
      "isDryRun": {
        "type": "boolean"
      },
      "redir": {
        "type": "string",
        "description": "Redirect URL after successful calendar authorization."
      }
    },
    "additionalProperties": false,
    "required": [
      "calendar",
      "isDryRun"
    ]
  },
  "calcom.calendars.check": {
    "type": "object",
    "properties": {
      "calendar": {
        "type": "string",
        "enum": [
          "apple",
          "google",
          "office365"
        ]
      }
    },
    "additionalProperties": false,
    "required": [
      "calendar"
    ]
  },
  "calcom.calendars.disconnect": {
    "type": "object",
    "properties": {
      "calendar": {
        "type": "string",
        "enum": [
          "apple",
          "google",
          "office365"
        ]
      },
      "id": {
        "type": "integer",
        "description": "Credential ID of the calendar to delete, as returned by the /calendars endpoint Example: 10."
      }
    },
    "additionalProperties": false,
    "required": [
      "calendar",
      "id"
    ]
  },
  "calcom.calendars.update_destinations": {
    "type": "object",
    "properties": {
      "integration": {
        "type": "string",
        "enum": [
          "apple_calendar",
          "google_calendar",
          "office365_calendar"
        ],
        "description": "The calendar service you want to integrate, as returned by the /calendars endpoint Example: apple_calendar."
      },
      "externalId": {
        "type": "string",
        "description": "Unique identifier used to represent the specific calendar, as returned by the /calendars endpoint Example: https://caldav.icloud.com/26962146906/calendars/1644422A-1945-4438-BBC0-4F0Q23A57R7S/."
      },
      "delegationCredentialId": {
        "type": "string"
      }
    },
    "additionalProperties": false,
    "required": [
      "integration",
      "externalId"
    ]
  },
  "calcom.calendars.add_selected": {
    "type": "object",
    "properties": {
      "integration": {
        "type": "string"
      },
      "externalId": {
        "type": "string"
      },
      "credentialId": {
        "type": "number"
      },
      "delegationCredentialId": {
        "type": "string"
      }
    },
    "additionalProperties": false,
    "required": [
      "integration",
      "externalId",
      "credentialId"
    ]
  },
  "calcom.calendars.remove_selected": {
    "type": "object",
    "properties": {
      "integration": {
        "type": "string"
      },
      "externalId": {
        "type": "string"
      },
      "credentialId": {
        "type": "string"
      },
      "delegationCredentialId": {
        "type": "string"
      }
    },
    "additionalProperties": false,
    "required": [
      "integration",
      "externalId",
      "credentialId"
    ]
  },
  "calcom.apps.connect": {
    "type": "object",
    "properties": {
      "app": {
        "type": "string",
        "enum": [
          "google-meet"
        ],
        "description": "Conferencing application type"
      }
    },
    "additionalProperties": false,
    "required": [
      "app"
    ]
  },
  "calcom.apps.get_connect_url": {
    "type": "object",
    "properties": {
      "app": {
        "type": "string",
        "enum": [
          "zoom",
          "msteams"
        ],
        "description": "Conferencing application type"
      },
      "returnTo": {
        "type": "string"
      },
      "onErrorReturnTo": {
        "type": "string"
      }
    },
    "additionalProperties": false,
    "required": [
      "app",
      "returnTo",
      "onErrorReturnTo"
    ]
  },
  "calcom.apps.list": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.apps.set_default": {
    "type": "object",
    "properties": {
      "app": {
        "type": "string",
        "enum": [
          "google-meet",
          "zoom",
          "msteams",
          "daily-video"
        ],
        "description": "Conferencing application type"
      }
    },
    "additionalProperties": false,
    "required": [
      "app"
    ]
  },
  "calcom.apps.get_default": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.apps.disconnect": {
    "type": "object",
    "properties": {
      "app": {
        "type": "string",
        "enum": [
          "google-meet",
          "zoom",
          "msteams"
        ],
        "description": "Conferencing application type"
      }
    },
    "additionalProperties": false,
    "required": [
      "app"
    ]
  },
  "calcom.apps.get_stripe_connect_url": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.apps.check_stripe_connection": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.contacts.list": {
    "type": "object",
    "properties": {
      "search": {
        "type": "string",
        "maxLength": 100,
        "description": "Part of a contact's name or email, to narrow the list. Example: jamie."
      },
      "contactIds": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Contact ids from an earlier `GET /v2/contacts`, to list only those contacts. Separate ids with commas, or repeat the parameter once per id. Example: [\"0192f3a1-7c2b-7d4e-9a10-000000000001\",\"0192f3a1-7c2b-7d4e-9a10-000000000002\"]."
      },
      "tagIds": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Tag ids from `GET /v2/contacts/tags`, to list only contacts carrying at least one of them. Separate ids with commas, or repeat the parameter once per id. Example: [\"0192f3a1-7c2b-7d4e-9a10-00000000000a\",\"0192f3a1-7c2b-7d4e-9a10-00000000000b\"]."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 50,
        "description": "Maximum number of contacts to return. Default: 50. Example: 50."
      },
      "cursor": {
        "type": "string",
        "description": "Opaque cursor from pagination.nextCursor. Omit for the first page; keep the same search, contactIds and tagIds on subsequent pages."
      }
    },
    "additionalProperties": false
  },
  "calcom.contacts.add": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "minLength": 1,
        "maxLength": 254,
        "description": "The email address to add. It is checked for its format and mail server, and stored lowercased. Example: jamie.rivera@example.com."
      },
      "name": {
        "type": "string",
        "maxLength": 50,
        "description": "The contact's name. Leave out when there is none. Example: Jamie Rivera."
      }
    },
    "additionalProperties": false,
    "required": [
      "email"
    ]
  },
  "calcom.contacts.get_history": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "status": {
        "type": "string",
        "enum": [
          "upcoming",
          "past"
        ],
        "description": "Which meetings to list: `upcoming` soonest first, or `past` newest first, from `summary.coveredSince` onwards. Example: past."
      },
      "cursor": {
        "type": "string",
        "description": "Opaque cursor from pagination.nextCursor. Omit for the first page; keep the same status on subsequent pages."
      }
    },
    "additionalProperties": false,
    "required": [
      "id",
      "status"
    ]
  },
  "calcom.contacts.get_note": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "id"
    ]
  },
  "calcom.contacts.list_tags": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 50,
        "description": "Maximum number of tags to return. Default: 50. Example: 50."
      },
      "cursor": {
        "type": "string",
        "description": "The pagination.nextCursor value from the previous page. Omit for the first page. Cal.com format: uuid."
      }
    },
    "additionalProperties": false
  },
  "calcom.contacts.create_tag": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 50,
        "description": "The tag's name. Example: Investors."
      },
      "color": {
        "type": "string",
        "pattern": "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
        "description": "A hex color. Leave out for the default. Example: #0ea5e9."
      }
    },
    "additionalProperties": false,
    "required": [
      "name"
    ]
  },
  "calcom.contacts.update": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 50,
        "description": "The contact's new name. A contact on Cal (`type: calUser`) can't have its name changed. Example: Jamie R.."
      },
      "note": {
        "type": "string",
        "maxLength": 2000,
        "description": "The user's private note on the contact, which replaces the stored note. To add to it, read it with `GET /v2/contacts/{id}/note` and send the whole new note. An empty string clears it. It is trimmed, and scripts and event handlers are removed, as on the Contacts page. Any contact can have a note, including one on Cal. This connector cannot clear this field to null. Example: Prefers a scissor cut on top, short back and sides. Wants a #2 fade.."
      }
    },
    "additionalProperties": false,
    "required": [
      "id"
    ]
  },
  "calcom.contacts.remove": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "id"
    ]
  },
  "calcom.contacts.add_tag": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "tagId": {
        "type": "string",
        "description": "The id of one of the user's own tags, from `GET /v2/contacts/tags`. Cal.com format: uuid. Example: 0192f3a1-7c2b-7d4e-9a10-00000000000a."
      }
    },
    "additionalProperties": false,
    "required": [
      "id",
      "tagId"
    ]
  },
  "calcom.contacts.remove_tag": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The contact's `id` from `GET /v2/contacts`. Example: 0192f3a1-7c2b-7d4e-9a10-000000000001.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "tagId": {
        "type": "string",
        "description": "The tag's `id` from the contact's `tags`. Example: 0192f3a1-7c2b-7d4e-9a10-00000000000a.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "id",
      "tagId"
    ]
  },
  "calcom.contacts.list_suggestions": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 50,
        "description": "Maximum number of suggestions to return. Default: 50. Example: 50."
      },
      "cursor": {
        "type": "string",
        "description": "Opaque cursor from pagination.nextCursor. Omit for the first page."
      }
    },
    "additionalProperties": false
  },
  "calcom.contacts.dismiss_suggestion": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "minLength": 1,
        "maxLength": 254,
        "description": "The suggestion's email from `GET /v2/contacts/suggestions`. It is matched without regard to case or surrounding spaces. Example: jamie.rivera@example.com."
      }
    },
    "additionalProperties": false,
    "required": [
      "email"
    ]
  },
  "calcom.events.list": {
    "type": "object",
    "properties": {
      "cursor": {
        "type": "string",
        "description": "Opaque cursor for cursor-based pagination. Pass the `pagination.nextCursor` value from a previous response to fetch the next page. Omit to fetch the first page. Example: eyJ2IjoyLCJzdGFydFRpbWUiOiIyMDMwLTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJldmVudFR5cGVVdWlkIjoiMDE4ZjRjMmUtM2YxYS03YWJjLTlkZWYtMDEyMzQ1Njc4OWFiIn0."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of Events to return. Default: 50. Example: 25."
      },
      "slug": {
        "type": "string",
        "description": "Filter by the event's public page slug (cal.com/{slug}). Example: team-offsite."
      },
      "status": {
        "type": "string",
        "enum": [
          "draft",
          "upcoming",
          "past"
        ],
        "description": "Filter events by lifecycle status. `draft`: not published and not cancelled, ordered soonest first. `upcoming`: published and not yet ended, or cancelled but not yet started, ordered soonest first. `past`: everything else, ordered latest first. Omit to return all statuses, newest first. When provided, `pagination.nextCursor` encodes the status — cursors from one status value cannot be used with another and return 400. Example: upcoming."
      }
    },
    "additionalProperties": false
  },
  "calcom.events.create": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "minLength": 1,
        "maxLength": 255,
        "description": "The Event's title. Example: Team offsite."
      },
      "startTime": {
        "type": "string",
        "description": "When the Event starts, in ISO 8601 format in UTC timezone. It must not be in the past. Example: 2030-01-01T10:00:00.000Z."
      },
      "endTime": {
        "type": "string",
        "description": "When the Event ends, in ISO 8601 format in UTC timezone. It must be after `startTime`. Example: 2030-01-01T11:00:00.000Z."
      },
      "timeZone": {
        "type": "string",
        "description": "The IANA time zone the Event's times are shown in. Example: Europe/Berlin."
      },
      "slug": {
        "type": "string",
        "description": "Public page slug (cal.com/{slug}): 10-100 lowercase letters, digits and hyphens. Generated from the title when omitted. Example: team-offsite-2030."
      },
      "description": {
        "type": "string",
        "maxLength": 5000,
        "description": "What the Event is about, shown on its page. This connector cannot clear this field to null."
      },
      "visibility": {
        "type": "string",
        "enum": [
          "PUBLIC",
          "UNLISTED"
        ],
        "description": "Once published: PUBLIC is listed on the owner's page, UNLISTED only opens from its link. Defaults to PUBLIC. Default: PUBLIC."
      },
      "capacity": {
        "type": "number",
        "minimum": 1,
        "maximum": 100000,
        "description": "The most guests the Event can take. Omit for unlimited. Ignored once any location has its own `capacity`: the Event then takes the sum of the location capacities, or is unlimited if any location has none. The waitlist only opens when the Event or the chosen location is full, so it only works when capacity is set on the Event or on a location. This connector cannot clear this field to null."
      },
      "waitlistEnabled": {
        "type": "boolean",
        "description": "Let guests join a waitlist when the Event is full. The waitlist only opens when the Event or the chosen location is full, so it only works when capacity is set on the Event or on a location. Default: false."
      },
      "paymentTimeoutMinutes": {
        "type": "number",
        "minimum": 10,
        "maximum": 10080,
        "description": "How many minutes a guest's seat is held while they pay. This connector cannot clear this field to null."
      },
      "registrationOpensAt": {
        "type": "string",
        "description": "When guests can start registering, in ISO 8601 format in UTC timezone. Must be before registration closes. This connector cannot clear this field to null. Example: 2029-12-01T09:00:00.000Z."
      },
      "registrationClosesAt": {
        "type": "string",
        "description": "When registration closes, in ISO 8601 format in UTC timezone. Must not be after `startTime`. Guests already on the waitlist can still be promoted after it closes. This connector cannot clear this field to null. Example: 2029-12-31T12:00:00.000Z."
      },
      "requiresApproval": {
        "type": "boolean",
        "description": "Registrations wait for a host's approval. Default: false."
      },
      "showOrganizerEmail": {
        "type": "boolean",
        "description": "Show the organizer's email to guests. Default: true."
      },
      "guestList": {
        "type": "string",
        "enum": [
          "hidden",
          "names",
          "count"
        ],
        "description": "Who guests can see on the Event's page. `names` lists them, `count` shows how many, `hidden` shows neither. Defaults to `names`. Default: names."
      },
      "showPresentedBy": {
        "type": "boolean",
        "description": "Show who the Event is presented by. Default: true."
      },
      "theme": {
        "type": "string",
        "enum": [
          "light",
          "dark"
        ],
        "description": "Default theme of the event page. This connector cannot clear this field to null."
      },
      "background": {
        "type": "object",
        "properties": {
          "effect": {
            "type": "string",
            "enum": [
              "aurora",
              "tide",
              "satin",
              "resonance",
              "veil",
              "facet",
              "lumen",
              "contour",
              "recess",
              "halftone",
              "strata"
            ],
            "description": "Which animated effect renders."
          },
          "colors": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
              "type": "string",
              "pattern": "^#[0-9a-f]{6}$"
            },
            "description": "Exactly three hex colors the effect is drawn with. Example: [\"#0b1c2c\",\"#1f6feb\",\"#a5d8ff\"]."
          }
        },
        "required": [
          "effect",
          "colors"
        ],
        "additionalProperties": false,
        "description": "Animated background of the event page."
      },
      "lineup": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Heading above the people on the event page. This connector cannot clear this field to null."
          },
          "people": {
            "type": "array",
            "maxItems": 30,
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "pattern": "\\S"
                },
                "role": {
                  "type": "string",
                  "description": "Shown under the person's name, e.g. their job title or act. This connector cannot clear this field to null."
                },
                "avatarUrl": {
                  "type": "string",
                  "description": "Avatar for this person. Must be a Cal Event media URL returned by the person avatar endpoint. This connector cannot clear this field to null."
                },
                "links": {
                  "type": "array",
                  "maxItems": 5,
                  "items": {
                    "type": "object",
                    "properties": {
                      "url": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "url"
                    ],
                    "additionalProperties": false
                  }
                },
                "media": {
                  "type": "array",
                  "maxItems": 6,
                  "items": {
                    "type": "object",
                    "properties": {
                      "url": {
                        "type": "string"
                      },
                      "label": {
                        "type": "string",
                        "description": "This connector cannot clear this field to null."
                      }
                    },
                    "required": [
                      "url"
                    ],
                    "additionalProperties": false
                  },
                  "description": "Spotify, YouTube or SoundCloud links, shown as players with the person."
                }
              },
              "required": [
                "name"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "people"
        ],
        "additionalProperties": false,
        "description": "Speakers or performers on the event page. Avatars need the Event uuid, so create people without avatarUrl and upload avatars with the person avatar endpoint afterwards."
      },
      "schedule": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "object",
          "properties": {
            "startTime": {
              "type": "string",
              "description": "When the item starts, in ISO 8601 format in UTC timezone. Send either startTime or timeLabel. Required when endTime is set. This connector cannot clear this field to null. Example: 2030-01-01T10:10:00.000Z."
            },
            "endTime": {
              "type": "string",
              "description": "When the item ends, in ISO 8601 format in UTC timezone. Must be after startTime. This connector cannot clear this field to null. Example: 2030-01-01T10:40:00.000Z."
            },
            "timeLabel": {
              "type": "string",
              "pattern": "\\S",
              "description": "Free text such as \"Doors open\" for an item without a startTime. Send either startTime or timeLabel. This connector cannot clear this field to null."
            },
            "content": {
              "type": "string",
              "pattern": "\\S",
              "description": "What happens during this item."
            },
            "people": {
              "type": "array",
              "maxItems": 10,
              "items": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "\\S"
                  },
                  "role": {
                    "type": "string",
                    "description": "This connector cannot clear this field to null."
                  },
                  "avatarUrl": {
                    "type": "string",
                    "description": "Avatar for this person. Must be a Cal Event media URL returned by the person avatar endpoint. This connector cannot clear this field to null."
                  },
                  "links": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {
                      "type": "object",
                      "properties": {
                        "url": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "url"
                      ],
                      "additionalProperties": false
                    }
                  }
                },
                "required": [
                  "name"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "content"
          ],
          "additionalProperties": false
        },
        "description": "Agenda on the event page. Each item has either a startTime or a timeLabel. Avatars need the Event uuid, so create people without avatarUrl and upload avatars with the person avatar endpoint afterwards."
      },
      "registrationFields": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL. Cal.com disallows the combination of showWhen."
        },
        "description": "The questions guests answer when they register. Every guest sees every question, so `showWhen` is rejected."
      },
      "hosts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "userId": {
              "type": "number",
              "minimum": 1,
              "description": "Example: 123."
            }
          },
          "required": [
            "userId"
          ],
          "additionalProperties": false
        },
        "description": "The Event's hosts. The creator is always a host and always listed first, even when not passed. Personal Events can only have the creator, so passing other ids returns a 400. On team Events every id must be an accepted team member, otherwise it returns a 400."
      },
      "liveStreams": {
        "type": "array",
        "maxItems": 5,
        "items": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "maxLength": 2048,
              "description": "Where people can watch the event live."
            }
          },
          "required": [
            "url"
          ],
          "additionalProperties": false
        },
        "description": "Links where people can watch the event live."
      },
      "category": {
        "type": "string",
        "enum": [
          "meetup",
          "conference",
          "music",
          "sports"
        ],
        "description": "What kind of event it is. If not passed, it's guessed from the title."
      },
      "price": {
        "type": "number",
        "minimum": 1,
        "description": "Price of the Event, in the currency's smallest unit. Only for Events without locations, which need at least one live stream; Events with locations are priced per location. Check `paymentsEnabled` on the Event before setting it. This connector cannot clear this field to null. Example: 1500."
      },
      "currency": {
        "type": "string",
        "enum": [
          "usd",
          "eur",
          "gbp",
          "cad",
          "aud",
          "chf",
          "nzd",
          "jpy",
          "brl",
          "mxn",
          "inr",
          "sgd",
          "hkd",
          "dkk",
          "nok",
          "sek",
          "pln",
          "czk",
          "huf",
          "ron",
          "bgn",
          "krw",
          "thb",
          "php",
          "myr",
          "idr",
          "try",
          "zar",
          "aed",
          "cop"
        ],
        "description": "Cal Pay currency code. Required when `price` is set. This connector cannot clear this field to null. Example: usd."
      },
      "locations": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: EventAddressLocationInput, EventLinkLocationInput, EventIntegrationLocationInput, EventOrganizersDefaultAppLocationInput."
        },
        "description": "Where the Event happens. Links can repeat. An Event can have one address and one conferencing location, either an integration or the organizer's default app."
      }
    },
    "additionalProperties": false,
    "required": [
      "title",
      "startTime",
      "endTime",
      "timeZone"
    ]
  },
  "calcom.events.get": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`).",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.update": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "title": {
        "type": "string",
        "minLength": 1,
        "maxLength": 255,
        "description": "The Event's title. Example: Team offsite."
      },
      "endTime": {
        "type": "string",
        "description": "When the Event ends, in ISO 8601 format in UTC timezone. It must be after `startTime`. Example: 2030-01-01T11:00:00.000Z."
      },
      "timeZone": {
        "type": "string",
        "description": "The IANA time zone the Event's times are shown in. Example: Europe/Berlin."
      },
      "description": {
        "type": "string",
        "maxLength": 5000,
        "description": "What the Event is about, shown on its page. This connector cannot clear this field to null."
      },
      "paymentTimeoutMinutes": {
        "type": "number",
        "minimum": 10,
        "maximum": 10080,
        "description": "How many minutes a guest's seat is held while they pay. This connector cannot clear this field to null."
      },
      "registrationOpensAt": {
        "type": "string",
        "description": "When guests can start registering, in ISO 8601 format in UTC timezone. Must be before registration closes. This connector cannot clear this field to null. Example: 2029-12-01T09:00:00.000Z."
      },
      "registrationClosesAt": {
        "type": "string",
        "description": "When registration closes, in ISO 8601 format in UTC timezone. Must not be after `startTime`. Guests already on the waitlist can still be promoted after it closes. This connector cannot clear this field to null. Example: 2029-12-31T12:00:00.000Z."
      },
      "theme": {
        "type": "string",
        "enum": [
          "light",
          "dark"
        ],
        "description": "Default theme of the event page. This connector cannot clear this field to null."
      },
      "background": {
        "type": "object",
        "properties": {
          "effect": {
            "type": "string",
            "enum": [
              "aurora",
              "tide",
              "satin",
              "resonance",
              "veil",
              "facet",
              "lumen",
              "contour",
              "recess",
              "halftone",
              "strata"
            ],
            "description": "Which animated effect renders."
          },
          "colors": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
              "type": "string",
              "pattern": "^#[0-9a-f]{6}$"
            },
            "description": "Exactly three hex colors the effect is drawn with. Example: [\"#0b1c2c\",\"#1f6feb\",\"#a5d8ff\"]."
          }
        },
        "required": [
          "effect",
          "colors"
        ],
        "additionalProperties": false,
        "description": "Animated background of the event page."
      },
      "lineup": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Heading above the people on the event page. This connector cannot clear this field to null."
          },
          "people": {
            "type": "array",
            "maxItems": 30,
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "pattern": "\\S"
                },
                "role": {
                  "type": "string",
                  "description": "Shown under the person's name, e.g. their job title or act. This connector cannot clear this field to null."
                },
                "avatarUrl": {
                  "type": "string",
                  "description": "Avatar for this person. Must be a Cal Event media URL returned by the person avatar endpoint. This connector cannot clear this field to null."
                },
                "links": {
                  "type": "array",
                  "maxItems": 5,
                  "items": {
                    "type": "object",
                    "properties": {
                      "url": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "url"
                    ],
                    "additionalProperties": false
                  }
                },
                "media": {
                  "type": "array",
                  "maxItems": 6,
                  "items": {
                    "type": "object",
                    "properties": {
                      "url": {
                        "type": "string"
                      },
                      "label": {
                        "type": "string",
                        "description": "This connector cannot clear this field to null."
                      }
                    },
                    "required": [
                      "url"
                    ],
                    "additionalProperties": false
                  },
                  "description": "Spotify, YouTube or SoundCloud links, shown as players with the person."
                }
              },
              "required": [
                "name"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "people"
        ],
        "additionalProperties": false,
        "description": "Speakers or performers on the event page. Avatars need the Event uuid, so create people without avatarUrl and upload avatars with the person avatar endpoint afterwards."
      },
      "schedule": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "object",
          "properties": {
            "startTime": {
              "type": "string",
              "description": "When the item starts, in ISO 8601 format in UTC timezone. Send either startTime or timeLabel. Required when endTime is set. This connector cannot clear this field to null. Example: 2030-01-01T10:10:00.000Z."
            },
            "endTime": {
              "type": "string",
              "description": "When the item ends, in ISO 8601 format in UTC timezone. Must be after startTime. This connector cannot clear this field to null. Example: 2030-01-01T10:40:00.000Z."
            },
            "timeLabel": {
              "type": "string",
              "pattern": "\\S",
              "description": "Free text such as \"Doors open\" for an item without a startTime. Send either startTime or timeLabel. This connector cannot clear this field to null."
            },
            "content": {
              "type": "string",
              "pattern": "\\S",
              "description": "What happens during this item."
            },
            "people": {
              "type": "array",
              "maxItems": 10,
              "items": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string",
                    "pattern": "\\S"
                  },
                  "role": {
                    "type": "string",
                    "description": "This connector cannot clear this field to null."
                  },
                  "avatarUrl": {
                    "type": "string",
                    "description": "Avatar for this person. Must be a Cal Event media URL returned by the person avatar endpoint. This connector cannot clear this field to null."
                  },
                  "links": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {
                      "type": "object",
                      "properties": {
                        "url": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "url"
                      ],
                      "additionalProperties": false
                    }
                  }
                },
                "required": [
                  "name"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "content"
          ],
          "additionalProperties": false
        },
        "description": "Agenda on the event page. Each item has either a startTime or a timeLabel. Avatars need the Event uuid, so create people without avatarUrl and upload avatars with the person avatar endpoint afterwards."
      },
      "registrationFields": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Cal.com variants: Default Full Name, Default Split Name, Default Email, Default Location, Default Title, Default Notes, Default Guests, Default Reschedule Reason, Default Attendee Phone, Workflow-added SMS Reminder, Workflow-added AI Agent Phone, Custom Email, Custom Phone, Custom Address, Custom Short Text, Custom Number, Custom Long Text, Custom Select, Custom Multi-Select, Custom Multiple Emails, Custom Checkbox Group, Custom Checkbox, Custom Radio Group, Custom URL. Cal.com disallows the combination of showWhen."
        },
        "description": "The questions guests answer when they register. Every guest sees every question, so `showWhen` is rejected."
      },
      "hosts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "userId": {
              "type": "number",
              "minimum": 1,
              "description": "Example: 123."
            }
          },
          "required": [
            "userId"
          ],
          "additionalProperties": false
        },
        "description": "The Event's hosts. The creator is always a host and always listed first, even when not passed. Personal Events can only have the creator, so passing other ids returns a 400. On team Events every id must be an accepted team member, otherwise it returns a 400."
      },
      "liveStreams": {
        "type": "array",
        "maxItems": 5,
        "items": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "maxLength": 2048,
              "description": "Where people can watch the event live."
            }
          },
          "required": [
            "url"
          ],
          "additionalProperties": false
        },
        "description": "Links where people can watch the event live."
      },
      "price": {
        "type": "number",
        "minimum": 1,
        "description": "Price of the Event, in the currency's smallest unit. Only for Events without locations, which need at least one live stream; Events with locations are priced per location. Check `paymentsEnabled` on the Event before setting it. This connector cannot clear this field to null. Example: 1500."
      },
      "currency": {
        "type": "string",
        "enum": [
          "usd",
          "eur",
          "gbp",
          "cad",
          "aud",
          "chf",
          "nzd",
          "jpy",
          "brl",
          "mxn",
          "inr",
          "sgd",
          "hkd",
          "dkk",
          "nok",
          "sek",
          "pln",
          "czk",
          "huf",
          "ron",
          "bgn",
          "krw",
          "thb",
          "php",
          "myr",
          "idr",
          "try",
          "zar",
          "aed",
          "cop"
        ],
        "description": "Cal Pay currency code. Required when `price` is set. This connector cannot clear this field to null. Example: usd."
      },
      "startTime": {
        "type": "string",
        "description": "When the Event starts, in ISO 8601 format in UTC timezone. It must be before `endTime`. Example: 2030-01-01T10:00:00.000Z."
      },
      "slug": {
        "type": "string",
        "description": "Public page slug (cal.com/{slug}): 10-100 lowercase letters, digits and hyphens. It can't change once the Event is published. Example: team-offsite-2030."
      },
      "visibility": {
        "type": "string",
        "enum": [
          "PUBLIC",
          "UNLISTED"
        ],
        "description": "Once published: PUBLIC is listed on the owner's page, UNLISTED only opens from its link."
      },
      "capacity": {
        "type": "number",
        "minimum": 1,
        "maximum": 100000,
        "description": "The most guests the Event can take. Ignored once any location has its own `capacity`: the Event then takes the sum of the location capacities, or is unlimited if any location has none. It can't go below the number of confirmed guests. This connector cannot clear this field to null."
      },
      "waitlistEnabled": {
        "type": "boolean",
        "description": "Let guests join a waitlist when the Event is full. The waitlist only opens when the Event or the chosen location is full, so it only works when capacity is set on the Event or on a location."
      },
      "requiresApproval": {
        "type": "boolean",
        "description": "Registrations wait for a host's approval."
      },
      "showOrganizerEmail": {
        "type": "boolean",
        "description": "Show the organizer's email to guests."
      },
      "guestList": {
        "type": "string",
        "enum": [
          "hidden",
          "names",
          "count"
        ],
        "description": "Who guests can see on the Event's page. `names` lists them, `count` shows how many, `hidden` shows neither. It can't change once the Event is published."
      },
      "showPresentedBy": {
        "type": "boolean",
        "description": "Show who the Event is presented by."
      },
      "category": {
        "type": "string",
        "enum": [
          "meetup",
          "conference",
          "music",
          "sports"
        ],
        "description": "What kind of event it is."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.delete": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.publish": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.cancel": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "reason": {
        "type": "string",
        "maxLength": 500,
        "description": "Why the Event is cancelled. Included in the cancellation email every registered guest receives. Example: The venue fell through — we will announce a new date soon.."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.list_bookings": {
    "type": "object",
    "properties": {
      "cursor": {
        "type": "string",
        "description": "Opaque cursor for cursor-based pagination. Pass the `pagination.nextCursor` value from a previous response to fetch the next page. Omit to fetch the first page."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of guests to return. Default: 50. Example: 25."
      },
      "status": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string",
          "enum": [
            "PENDING_APPROVAL",
            "WAITLISTED",
            "PENDING_PAYMENT",
            "PENDING_CONFIRMATION",
            "OFFER_EXPIRED",
            "CONFIRMED",
            "DECLINED",
            "CANCELLED",
            "RESERVED"
          ]
        },
        "description": "Filter by registration status. Separate several statuses with a comma. Defaults to confirmed guests only. Default: [\"CONFIRMED\"]. Example: ?status=PENDING_APPROVAL,WAITLISTED."
      },
      "rsvpResponse": {
        "type": "string",
        "enum": [
          "YES",
          "NO",
          "MAYBE"
        ],
        "description": "Filter by the guest's RSVP response."
      },
      "search": {
        "type": "string",
        "maxLength": 255,
        "description": "Filter by guest name or email, case-insensitive substring match."
      },
      "locationId": {
        "type": "string",
        "maxLength": 128,
        "description": "Filter by the location the guest registered for."
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.check_in_guest": {
    "type": "object",
    "properties": {
      "registrationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "registrationId",
      "uuid"
    ]
  },
  "calcom.events.remove_guest_check_in": {
    "type": "object",
    "properties": {
      "registrationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "registrationId",
      "uuid"
    ]
  },
  "calcom.events.approve_guests": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "search": {
        "type": "string",
        "maxLength": 255,
        "description": "Only approve guests whose name or email contains this text, case-insensitive."
      },
      "locationId": {
        "type": "string",
        "maxLength": 128,
        "description": "Only approve guests who registered for this location."
      },
      "retry": {
        "type": "boolean",
        "description": "Paid Events only: when the previous approve-all failed, approve the guests it had not reached instead of reading the pending guests again."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.approve_guest": {
    "type": "object",
    "properties": {
      "registrationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "registrationId",
      "uuid"
    ]
  },
  "calcom.events.decline_guest": {
    "type": "object",
    "properties": {
      "registrationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "registrationId",
      "uuid"
    ]
  },
  "calcom.events.get_guest_counts": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.list_co_hosts": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.invite_co_host": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "email": {
        "type": "string",
        "minLength": 3,
        "maxLength": 320,
        "description": "Email address to invite as a co-host. Trimmed and lowercased; it must be deliverable and not on a blocklist. Example: co-host@example.com."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid",
      "email"
    ]
  },
  "calcom.events.reorder_co_hosts": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "coHostIds": {
        "type": "array",
        "maxItems": 500,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Every co-host id on the Event, accepted and pending alike, in the new display order. Each id must appear exactly once. These are the `id` values from `GET /v2/events/{uuid}/co-hosts`, not user ids."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid",
      "coHostIds"
    ]
  },
  "calcom.events.remove_co_host": {
    "type": "object",
    "properties": {
      "coHostId": {
        "type": "string",
        "description": "Id of the co-host on this Event, the `id` from `GET /v2/events/{uuid}/co-hosts`. Not a user id. Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "coHostId",
      "uuid"
    ]
  },
  "calcom.events.search_host_candidates": {
    "type": "object",
    "properties": {
      "cursor": {
        "type": "string",
        "description": "Opaque cursor for cursor-based pagination. Pass the `pagination.nextCursor` value from a previous response to fetch the next page. Omit to fetch the first page."
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of team members to return. Default: 50. Example: 25."
      },
      "search": {
        "type": "string",
        "maxLength": 255,
        "description": "Filter by the team member's name or email, case-insensitive substring match."
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.get_coordinates": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.update_coordinates": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "latitude": {
        "type": "number",
        "minimum": -90,
        "maximum": 90,
        "description": "Latitude of the Event's address location. Must stay within 1 km of the geocoded address. Example: 51.5092."
      },
      "longitude": {
        "type": "number",
        "minimum": -180,
        "maximum": 180,
        "description": "Longitude of the Event's address location. Must stay within 1 km of the geocoded address. Example: -0.1278."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid",
      "latitude",
      "longitude"
    ]
  },
  "calcom.events.remove_cover_image": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.list_locations": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.add_location": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "label": {
        "type": "string",
        "maxLength": 100,
        "description": "Name shown for this location."
      },
      "price": {
        "type": "number",
        "minimum": 1,
        "description": "Price for this location, in the currency's smallest unit. Example: 1500."
      },
      "currency": {
        "type": "string",
        "enum": [
          "usd",
          "eur",
          "gbp",
          "cad",
          "aud",
          "chf",
          "nzd",
          "jpy",
          "brl",
          "mxn",
          "inr",
          "sgd",
          "hkd",
          "dkk",
          "nok",
          "sek",
          "pln",
          "czk",
          "huf",
          "ron",
          "bgn",
          "krw",
          "thb",
          "php",
          "myr",
          "idr",
          "try",
          "zar",
          "aed",
          "cop"
        ],
        "description": "Cal Pay currency code. Required when `price` is set. Example: usd."
      },
      "capacity": {
        "type": "number",
        "minimum": 1,
        "maximum": 100000,
        "description": "Seats at this location. Omit for unlimited. All locations together can have at most 100000 seats."
      },
      "type": {
        "type": "string",
        "enum": [
          "address",
          "link",
          "integration",
          "organizersDefaultApp"
        ]
      },
      "address": {
        "type": "string",
        "minLength": 1,
        "description": "Example: 1 Example Street, Berlin."
      },
      "link": {
        "type": "string",
        "description": "Cal.com format: uri. Example: https://example.com/watch."
      },
      "integration": {
        "type": "string",
        "enum": [
          "cal-video",
          "google-meet",
          "zoom",
          "whereby-video",
          "whatsapp-video",
          "webex-video",
          "telegram-video",
          "tandem",
          "sylaps-video",
          "skype-video",
          "sirius-video",
          "signal-video",
          "shimmer-video",
          "salesroom-video",
          "roam-video",
          "riverside-video",
          "ping-video",
          "office365-video",
          "mirotalk-video",
          "jitsi",
          "jelly-video",
          "jelly-conferencing",
          "huddle",
          "facetime-video",
          "element-call-video",
          "eightxeight-video",
          "discord-video",
          "demodesk-video",
          "campfire-video"
        ],
        "description": "Example: cal-video."
      },
      "credentialId": {
        "type": "number",
        "description": "Identifies which connected account will host the Event when a host has multiple connected accounts."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid",
      "type"
    ]
  },
  "calcom.events.remove_location": {
    "type": "object",
    "properties": {
      "locationId": {
        "type": "string",
        "description": "Id of the location, the `id` from `GET /v2/events/{uuid}/locations`. Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "locationId",
      "uuid"
    ]
  },
  "calcom.events.update_location": {
    "type": "object",
    "properties": {
      "locationId": {
        "type": "string",
        "description": "The location's `id`, from `GET /v2/events/{uuid}/locations`.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "label": {
        "type": "string",
        "maxLength": 100,
        "description": "Name shown for this location. This connector cannot clear this field to null."
      },
      "price": {
        "type": "number",
        "minimum": 1,
        "description": "Price for this location, in the currency's smallest unit. This connector cannot clear this field to null. Example: 1500."
      },
      "currency": {
        "type": "string",
        "enum": [
          "usd",
          "eur",
          "gbp",
          "cad",
          "aud",
          "chf",
          "nzd",
          "jpy",
          "brl",
          "mxn",
          "inr",
          "sgd",
          "hkd",
          "dkk",
          "nok",
          "sek",
          "pln",
          "czk",
          "huf",
          "ron",
          "bgn",
          "krw",
          "thb",
          "php",
          "myr",
          "idr",
          "try",
          "zar",
          "aed",
          "cop"
        ],
        "description": "Cal Pay currency code. Required with `price` when the location has no currency yet. Example: usd."
      },
      "capacity": {
        "type": "number",
        "minimum": 1,
        "maximum": 100000,
        "description": "Seats at this location. All locations together can have at most 100000 seats. This connector cannot clear this field to null."
      },
      "type": {
        "type": "string",
        "enum": [
          "address",
          "link",
          "integration",
          "organizersDefaultApp"
        ]
      },
      "address": {
        "type": "string",
        "minLength": 1,
        "description": "Example: 1 Example Street, Berlin."
      },
      "link": {
        "type": "string",
        "description": "Cal.com format: uri. Example: https://example.com/watch."
      },
      "integration": {
        "type": "string",
        "enum": [
          "cal-video",
          "google-meet",
          "zoom",
          "whereby-video",
          "whatsapp-video",
          "webex-video",
          "telegram-video",
          "tandem",
          "sylaps-video",
          "skype-video",
          "sirius-video",
          "signal-video",
          "shimmer-video",
          "salesroom-video",
          "roam-video",
          "riverside-video",
          "ping-video",
          "office365-video",
          "mirotalk-video",
          "jitsi",
          "jelly-video",
          "jelly-conferencing",
          "huddle",
          "facetime-video",
          "element-call-video",
          "eightxeight-video",
          "discord-video",
          "demodesk-video",
          "campfire-video"
        ],
        "description": "Switching the integration drops the stored `credentialId` unless a new one is sent. Example: cal-video."
      },
      "credentialId": {
        "type": "number",
        "description": "Identifies which connected account will host the Event when a host has multiple connected accounts."
      }
    },
    "additionalProperties": false,
    "required": [
      "locationId",
      "uuid",
      "type"
    ]
  },
  "calcom.events.message_guests": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "segment": {
        "type": "string",
        "enum": [
          "GOING",
          "MAYBE",
          "PENDING"
        ],
        "description": "Which guests receive the message: `GOING` (confirmed, RSVP yes), `MAYBE` (confirmed, RSVP maybe) or `PENDING` (waiting for approval)."
      },
      "subject": {
        "type": "string",
        "description": "Email subject in plain text, up to 200 characters. HTML is refused."
      },
      "body": {
        "type": "string",
        "description": "Message in plain text, up to 5000 characters. Links are allowed as plain URLs; HTML is refused."
      },
      "scheduledAt": {
        "type": "string",
        "description": "When to send the message, as an ISO 8601 date-time such as `2030-01-01T09:00:00Z`. It must be at least 5 minutes from now and earlier than 7 days after the Event ends. Omit it to send the message now. Cancel a scheduled message before this time with the cancel endpoint. Example: 2030-01-01T09:00:00Z."
      },
      "locationId": {
        "type": "string",
        "maxLength": 128,
        "description": "Only message guests who registered for this location of the Event."
      },
      "checkedIn": {
        "type": "boolean",
        "description": "Only message guests who checked in (`true`) or who did not (`false`). Omit to message both."
      },
      "contactTagId": {
        "type": "string",
        "description": "Only message guests whose email is among your contacts with this tag. It must be one of your own contact tags, from `GET /v2/contacts/tags`. Cal.com format: uuid."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid",
      "segment",
      "subject",
      "body"
    ]
  },
  "calcom.events.list_messages": {
    "type": "object",
    "properties": {
      "cursor": {
        "type": "string",
        "description": "Opaque cursor for cursor-based pagination. Pass the `pagination.nextCursor` value from a previous response to fetch the next page. Omit to fetch the first page."
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.events.cancel_message": {
    "type": "object",
    "properties": {
      "messageId": {
        "type": "string",
        "description": "Unique identifier of the message. Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`). Cal.com format: uuid.",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "messageId",
      "uuid"
    ]
  },
  "calcom.events.invite_guests": {
    "type": "object",
    "properties": {
      "uuid": {
        "type": "string",
        "description": "Event UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`).",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "emails": {
        "type": "array",
        "items": {
          "type": "string",
          "description": "Cal.com format: email."
        },
        "description": "Email addresses to invite, up to 200 per request. Send at least one email, `contactIds`, `contactTagIds` or `pastEventUuids`. Example: [\"guest@example.com\"]."
      },
      "contactIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 200,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Ids of the authenticated user's own contacts, from `GET /v2/contacts`. Each contact is invited at its email, and they count with `emails` and `contactTagIds` toward the 200 guests one request can invite. Requires the `contacts` feature. A contact the user doesn't own is a 400. Example: [\"0192f3a1-7c2b-7d4e-9a10-0000000000a1\"]."
      },
      "contactTagIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 20,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Ids of the authenticated user's own contact tags, from the `tags` of each contact in `GET /v2/contacts`. Every contact with one of these tags is invited, and they count with `emails` and `contactIds` toward the 200 guests one request can invite. Requires the `contacts` feature. A tag the user doesn't own is a 400. Example: [\"0192f3a1-7c2b-7d4e-9a10-00000000000a\"]."
      },
      "pastEventUuids": {
        "type": "array",
        "minItems": 1,
        "maxItems": 20,
        "items": {
          "type": "string",
          "description": "Cal.com format: uuid."
        },
        "description": "Uuids of other Events, usually past ones, such as those `GET /v2/events` returns. Everyone with a confirmed registration on them is invited, and they count with `emails`, `contactIds` and `contactTagIds` toward the 200 guests one request can invite. Only Events the authenticated user owns, hosts or co-hosts, or that belong to a team where they have the `calEvent.read` permission, add guests; any other Event adds nobody. Example: [\"0192f3a1-7c2b-7d4e-9a10-0000000000e1\"]."
      },
      "hostNote": {
        "type": "string",
        "maxLength": 500,
        "description": "A personal note from the host, included in the invitation email."
      }
    },
    "additionalProperties": false,
    "required": [
      "uuid"
    ]
  },
  "calcom.webhooks.create": {
    "type": "object",
    "properties": {
      "payloadTemplate": {
        "type": "string",
        "description": "The template of the payload that will be sent to the subscriberUrl, check cal.com/help/webhooks for more information Example: {\"content\":\"A new event has been scheduled\",\"type\":\"{{type}}\",\"name\":\"{{title}}\",\"organizer\":\"{{organizer.name}}\",\"booker\":\"{{attendees.0.name}}\"}."
      },
      "active": {
        "type": "boolean"
      },
      "subscriberUrl": {
        "type": "string"
      },
      "triggers": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "BOOKING_CREATED",
            "BOOKING_PAYMENT_INITIATED",
            "BOOKING_PAID",
            "BOOKING_RESCHEDULED",
            "BOOKING_REQUESTED",
            "BOOKING_CANCELLED",
            "BOOKING_REJECTED",
            "BOOKING_SEAT_REJECTED",
            "BOOKING_NO_SHOW_UPDATED",
            "BOOKING_LOCATION_UPDATED",
            "BOOKING_TITLE_UPDATED",
            "BOOKING_REASSIGNED",
            "BOOKING_SEAT_ACCEPTED",
            "FORM_SUBMITTED",
            "MEETING_ENDED",
            "MEETING_STARTED",
            "RECORDING_READY",
            "INSTANT_MEETING",
            "INSTANT_MEETING_ACCEPTED",
            "RECORDING_TRANSCRIPTION_GENERATED",
            "OOO_CREATED",
            "AFTER_HOSTS_CAL_VIDEO_NO_SHOW",
            "AFTER_GUESTS_CAL_VIDEO_NO_SHOW",
            "FORM_SUBMITTED_NO_EVENT",
            "ROUTING_FORM_FALLBACK_HIT",
            "DELEGATION_CREDENTIAL_ERROR",
            "WRONG_ASSIGNMENT_REPORT",
            "DELEGATION_CREDENTIAL_SECRET_ROTATION_FAILED",
            "DELEGATION_CREDENTIAL_ROTATION_REQUIRED",
            "DELEGATION_CREDENTIAL_SECRET_ROTATED",
            "CALENDAR_ENTRY_REJECTED",
            "CAL_EVENT_REGISTRATION_REQUESTED",
            "CAL_EVENT_REGISTRATION_CONFIRMED",
            "CAL_EVENT_REGISTRATION_WAITLISTED",
            "CAL_EVENT_REGISTRATION_DECLINED",
            "CAL_EVENT_REGISTRATION_CANCELLED",
            "SEQUENCE_BOOKING_CREATED"
          ]
        },
        "description": "Example: [\"BOOKING_CREATED\",\"BOOKING_RESCHEDULED\",\"BOOKING_CANCELLED\",\"BOOKING_CONFIRMED\",\"BOOKING_REJECTED\",\"BOOKING_SEAT_REJECTED\",\"BOOKING_COMPLETED\",\"BOOKING_NO_SHOW\",\"BOOKING_REOPENED\"]."
      },
      "customHeaders": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "HTTP header name, at most 256 characters. Names starting with `X-Cal-` are reserved for Cal.com's own headers. Blocked names: host, content-length, transfer-encoding, connection, keep-alive, upgrade, trailer, te, proxy-authorization. Example: Authorization."
            },
            "value": {
              "type": "string",
              "description": "HTTP header value. Omit (or send the redacted `\"***\"`) on update to keep the stored value, as long as `subscriberUrl` stays the same: stored values are never sent to a new URL. Values are stored encrypted and are always redacted as `\"***\"` on read. Example: Bearer crsr_xxxxxxxxxxxxx."
            }
          },
          "required": [
            "name"
          ],
          "additionalProperties": false
        },
        "description": "Static HTTP headers sent on every webhook delivery (e.g. Authorization). Max 10 headers, values up to 4 KiB, stored encrypted and redacted on read. Changing `subscriberUrl` drops the stored values unless you send them again. An instance without the webhook header keyring (`CALCOM_KEYRING_WEBHOOK_HEADERS`) answers 400 to any request that sends headers."
      },
      "version": {
        "type": "string",
        "enum": [
          "2021-10-20",
          "2026-07-27"
        ],
        "description": "The payload format version of the webhook. Version 2026-07-27 adds generated ICS calendar content (`attendeeIcsContent`, `organizerIcsContent`) to BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, BOOKING_SEAT_ACCEPTED, and BOOKING_PAID (when the payment accepted the booking) payloads. Every version's builder-produced payload carries a `payload.platformOAuthClientId` field naming the owning platform OAuth client (`null` for non-platform events; for the flat-delivered MEETING_STARTED/MEETING_ENDED bodies the field appears at the top level of the body). Zapier deliveries, custom payload templates that do not reference the field, the `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW` bodies (delivered verbatim from the fire-time blob, never built) and the legacy `FORM_SUBMITTED_NO_EVENT` fallback delivery omit it. Example: 2021-10-20."
      },
      "time": {
        "type": "number",
        "minimum": 1,
        "description": "How long after the booking start time the no-show triggers are evaluated. Required, together with timeUnit, when subscribing to AFTER_HOSTS_CAL_VIDEO_NO_SHOW or AFTER_GUESTS_CAL_VIDEO_NO_SHOW Example: 5."
      },
      "timeUnit": {
        "type": "string",
        "enum": [
          "DAY",
          "HOUR",
          "MINUTE"
        ],
        "description": "The unit of the no-show time value Example: MINUTE."
      }
    },
    "additionalProperties": false,
    "required": [
      "active",
      "subscriberUrl",
      "triggers"
    ]
  },
  "calcom.webhooks.list": {
    "type": "object",
    "properties": {
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      }
    },
    "additionalProperties": false
  },
  "calcom.webhooks.update": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      },
      "payloadTemplate": {
        "type": "string",
        "description": "The template of the payload that will be sent to the subscriberUrl, check cal.com/help/webhooks for more information Example: {\"content\":\"A new event has been scheduled\",\"type\":\"{{type}}\",\"name\":\"{{title}}\",\"organizer\":\"{{organizer.name}}\",\"booker\":\"{{attendees.0.name}}\"}."
      },
      "active": {
        "type": "boolean"
      },
      "subscriberUrl": {
        "type": "string"
      },
      "triggers": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "BOOKING_CREATED",
            "BOOKING_PAYMENT_INITIATED",
            "BOOKING_PAID",
            "BOOKING_RESCHEDULED",
            "BOOKING_REQUESTED",
            "BOOKING_CANCELLED",
            "BOOKING_REJECTED",
            "BOOKING_SEAT_REJECTED",
            "BOOKING_NO_SHOW_UPDATED",
            "BOOKING_LOCATION_UPDATED",
            "BOOKING_TITLE_UPDATED",
            "BOOKING_REASSIGNED",
            "BOOKING_SEAT_ACCEPTED",
            "FORM_SUBMITTED",
            "MEETING_ENDED",
            "MEETING_STARTED",
            "RECORDING_READY",
            "INSTANT_MEETING",
            "INSTANT_MEETING_ACCEPTED",
            "RECORDING_TRANSCRIPTION_GENERATED",
            "OOO_CREATED",
            "AFTER_HOSTS_CAL_VIDEO_NO_SHOW",
            "AFTER_GUESTS_CAL_VIDEO_NO_SHOW",
            "FORM_SUBMITTED_NO_EVENT",
            "ROUTING_FORM_FALLBACK_HIT",
            "DELEGATION_CREDENTIAL_ERROR",
            "WRONG_ASSIGNMENT_REPORT",
            "DELEGATION_CREDENTIAL_SECRET_ROTATION_FAILED",
            "DELEGATION_CREDENTIAL_ROTATION_REQUIRED",
            "DELEGATION_CREDENTIAL_SECRET_ROTATED",
            "CALENDAR_ENTRY_REJECTED",
            "CAL_EVENT_REGISTRATION_REQUESTED",
            "CAL_EVENT_REGISTRATION_CONFIRMED",
            "CAL_EVENT_REGISTRATION_WAITLISTED",
            "CAL_EVENT_REGISTRATION_DECLINED",
            "CAL_EVENT_REGISTRATION_CANCELLED",
            "SEQUENCE_BOOKING_CREATED"
          ]
        },
        "description": "Example: [\"BOOKING_CREATED\",\"BOOKING_RESCHEDULED\",\"BOOKING_CANCELLED\",\"BOOKING_CONFIRMED\",\"BOOKING_REJECTED\",\"BOOKING_SEAT_REJECTED\",\"BOOKING_COMPLETED\",\"BOOKING_NO_SHOW\",\"BOOKING_REOPENED\"]."
      },
      "customHeaders": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "HTTP header name, at most 256 characters. Names starting with `X-Cal-` are reserved for Cal.com's own headers. Blocked names: host, content-length, transfer-encoding, connection, keep-alive, upgrade, trailer, te, proxy-authorization. Example: Authorization."
            },
            "value": {
              "type": "string",
              "description": "HTTP header value. Omit (or send the redacted `\"***\"`) on update to keep the stored value, as long as `subscriberUrl` stays the same: stored values are never sent to a new URL. Values are stored encrypted and are always redacted as `\"***\"` on read. Example: Bearer crsr_xxxxxxxxxxxxx."
            }
          },
          "required": [
            "name"
          ],
          "additionalProperties": false
        },
        "description": "Static HTTP headers sent on every webhook delivery (e.g. Authorization). Max 10 headers, values up to 4 KiB, stored encrypted and redacted on read. Changing `subscriberUrl` drops the stored values unless you send them again. An instance without the webhook header keyring (`CALCOM_KEYRING_WEBHOOK_HEADERS`) answers 400 to any request that sends headers."
      },
      "version": {
        "type": "string",
        "enum": [
          "2021-10-20",
          "2026-07-27"
        ],
        "description": "The payload format version of the webhook. Version 2026-07-27 adds generated ICS calendar content (`attendeeIcsContent`, `organizerIcsContent`) to BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, BOOKING_SEAT_ACCEPTED, and BOOKING_PAID (when the payment accepted the booking) payloads. Every version's builder-produced payload carries a `payload.platformOAuthClientId` field naming the owning platform OAuth client (`null` for non-platform events; for the flat-delivered MEETING_STARTED/MEETING_ENDED bodies the field appears at the top level of the body). Zapier deliveries, custom payload templates that do not reference the field, the `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW` bodies (delivered verbatim from the fire-time blob, never built) and the legacy `FORM_SUBMITTED_NO_EVENT` fallback delivery omit it. Example: 2021-10-20."
      },
      "time": {
        "type": "number",
        "minimum": 1,
        "description": "How long after the booking start time the no-show triggers are evaluated. Required, together with timeUnit, when subscribing to AFTER_HOSTS_CAL_VIDEO_NO_SHOW or AFTER_GUESTS_CAL_VIDEO_NO_SHOW Example: 5."
      },
      "timeUnit": {
        "type": "string",
        "enum": [
          "DAY",
          "HOUR",
          "MINUTE"
        ],
        "description": "The unit of the no-show time value Example: MINUTE."
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId"
    ]
  },
  "calcom.webhooks.get": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId"
    ]
  },
  "calcom.webhooks.delete": {
    "type": "object",
    "properties": {
      "webhookId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "webhookId"
    ]
  },
  "calcom.workflows.list": {
    "type": "object",
    "properties": {
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      }
    },
    "additionalProperties": false
  },
  "calcom.workflows.create": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Name of the workflow Example: Platform Test Workflow."
      },
      "activation": {
        "type": "object",
        "properties": {
          "isActiveOnAllEventTypes": {
            "type": "boolean",
            "description": "Whether the workflow is active for all the event-types Default: false. Example: false."
          },
          "activeOnEventTypeIds": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "List of event-types IDs the workflow applies to, required if isActiveOnAllEventTypes is false Default: []. Example: [698191]."
          }
        },
        "required": [
          "isActiveOnAllEventTypes"
        ],
        "additionalProperties": false,
        "description": "Activation settings for the workflow"
      },
      "trigger": {
        "type": "object",
        "description": "Trigger configuration for the event-type workflow, allowed triggers are beforeEvent,eventCancelled,newEvent,afterEvent,rescheduleEvent,afterHostsCalVideoNoShow,afterGuestsCalVideoNoShow,bookingRejected,bookingRequested,bookingPaymentInitiated,bookingPaid,bookingNoShowUpdated Cal.com variants: Before Event, After Event, Event Cancelled, New Event, Event Rescheduled, After Guest No-Show, After Host No-Show, Booking Rejected, Booking Requested, Booking Paid, Booking Payment Initiated, Booking No-Show Updated."
      },
      "steps": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "description": "A workflow step cannot carry a secret key. Set its signing secret in Cal.com. Cal.com variants: Paths, Filter, Email Address, Email Attendee, Email Host, WhatsApp Attendee, WhatsApp Number, SMS Number, SMS Attendee, Webhook."
        },
        "description": "Steps to execute as part of the event-type workflow, allowed steps are email_host,email_attendee,email_address,sms_attendee,sms_number,whatsapp_attendee,whatsapp_number,cal_ai_phone_call,paths,filter"
      }
    },
    "additionalProperties": false,
    "required": [
      "name",
      "activation",
      "trigger",
      "steps"
    ]
  },
  "calcom.workflows.get": {
    "type": "object",
    "properties": {
      "workflowId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "workflowId"
    ]
  },
  "calcom.workflows.update": {
    "type": "object",
    "properties": {
      "workflowId": {
        "type": "number"
      },
      "name": {
        "type": "string",
        "description": "Name of the workflow Example: Platform Test Workflow."
      },
      "activation": {
        "type": "object",
        "properties": {
          "isActiveOnAllEventTypes": {
            "type": "boolean",
            "description": "Whether the workflow is active for all the event-types Default: false. Example: false."
          },
          "activeOnEventTypeIds": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "List of event-types IDs the workflow applies to, required if isActiveOnAllEventTypes is false Default: []. Example: [698191]."
          }
        },
        "required": [
          "isActiveOnAllEventTypes"
        ],
        "additionalProperties": false,
        "description": "Activation settings for the workflow"
      },
      "trigger": {
        "type": "object",
        "description": "Trigger configuration for the event-type workflow, allowed triggers are beforeEvent,eventCancelled,newEvent,afterEvent,rescheduleEvent,afterHostsCalVideoNoShow,afterGuestsCalVideoNoShow,bookingRejected,bookingRequested,bookingPaymentInitiated,bookingPaid,bookingNoShowUpdated Cal.com variants: Before Event, After Event, Event Cancelled, New Event, Event Rescheduled, After Guest No-Show, After Host No-Show, Booking Rejected, Booking Requested, Booking Paid, Booking Payment Initiated, Booking No-Show Updated."
      },
      "steps": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "description": "A workflow step cannot carry a secret key. Set its signing secret in Cal.com. Cal.com variants: Email Address, Email Attendee, Email Host, SMS Attendee, WhatsApp Number, WhatsApp Attendee, SMS Number, Paths, Filter, Delay (existing step), Lead enrichment (existing step), Webhook."
        },
        "description": "Steps to execute. This is the complete desired step list: omitted steps are deleted and omitted pathId makes a sending step unconditional. Omit steps entirely to preserve the graph. Existing delays and lead enrichment must still be echoed by id and keep their relative order."
      }
    },
    "additionalProperties": false,
    "required": [
      "workflowId"
    ]
  },
  "calcom.workflows.delete": {
    "type": "object",
    "properties": {
      "workflowId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "workflowId"
    ]
  },
  "calcom.workflows.list_condition_fields": {
    "type": "object",
    "properties": {
      "workflowId": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "workflowId"
    ]
  },
  "calcom.insights.get_booking_limits_usage": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "`user`: the caller only. `team`: accepted members of `selectedTeamId`. `org`: the hosts of `eventTypeId`, which is then required. Example: team."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Required for team scope. Example: 12."
      },
      "date": {
        "type": "string",
        "description": "Calendar day (YYYY-MM-DD). Reports the day, week, month and year containing it, each read in its limit's own time zone: the user's for the global limit, the event type's for the event-type limit. Defaults to today. Example: 2026-10-13."
      },
      "eventTypeId": {
        "type": "string",
        "description": "Adds the event type's own booking limit. Accepts a numeric ID or UUID. Must be an event type inside the scope; required for org scope. Supply a string, including for numeric IDs. Example: 101."
      },
      "userUuids": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string"
        },
        "description": "Only report these users. Every uuid must be inside the scope. Example: [\"3f2504e0-4f89-41d3-9a0c-0305e82c3301\"]."
      },
      "offset": {
        "type": "number",
        "description": "Example: 0."
      },
      "limit": {
        "type": "number",
        "maximum": 100,
        "description": "Example: 50."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "offset",
      "limit"
    ]
  },
  "calcom.insights.get_kpi_stats": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped insights Example: 12."
      },
      "timeZone": {
        "type": "string",
        "description": "IANA timezone used to group time-series insights Example: America/New_York."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Column identifier"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false,
              "description": "Filter value discriminated by type field"
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=startTime or id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]. Required here although Cal.com's spec marks it optional: measured 2026-11-23, the call without a date range filter (id createdAt or startTime, value type dr) answered HTTP 400 and with one answered 200."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "timeZone",
      "columnFilters"
    ]
  },
  "calcom.insights.get_event_trends": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped insights Example: 12."
      },
      "timeZone": {
        "type": "string",
        "description": "IANA timezone used to group time-series insights Example: America/New_York."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Column identifier"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false,
              "description": "Filter value discriminated by type field"
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=startTime or id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]. Required here although Cal.com's spec marks it optional: measured 2026-11-23, the call without a date range filter (id createdAt or startTime, value type dr) answered HTTP 400 and with one answered 200."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "timeZone",
      "columnFilters"
    ]
  },
  "calcom.insights.get_average_booking_duration": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped insights Example: 12."
      },
      "timeZone": {
        "type": "string",
        "description": "IANA timezone used to group time-series insights Example: America/New_York."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Column identifier"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false,
              "description": "Filter value discriminated by type field"
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=startTime or id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]. Required here although Cal.com's spec marks it optional: measured 2026-11-23, the call without a date range filter (id createdAt or startTime, value type dr) answered HTTP 400 and with one answered 200."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "timeZone",
      "columnFilters"
    ]
  },
  "calcom.insights.get_booking_member_stats": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped insights Example: 12."
      },
      "timeZone": {
        "type": "string",
        "description": "IANA timezone used to group time-series insights Example: America/New_York."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Column identifier"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false,
              "description": "Filter value discriminated by type field"
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=startTime or id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "timeZone"
    ]
  },
  "calcom.insights.get_routing_form_statuses": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "startDate": {
        "type": "string",
        "description": "Inclusive start date for routing insights Example: 2024-01-01."
      },
      "endDate": {
        "type": "string",
        "description": "Inclusive end date for routing insights Example: 2024-01-31."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "startDate",
      "endDate"
    ]
  },
  "calcom.insights.get_routing_form_responses": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "startDate": {
        "type": "string",
        "description": "Inclusive start date for routing insights Example: 2024-01-01."
      },
      "endDate": {
        "type": "string",
        "description": "Inclusive end date for routing insights Example: 2024-01-31."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]."
      },
      "sorting": {
        "type": "array",
        "description": "Example: [{\"id\":\"createdAt\",\"desc\":true}]."
      },
      "offset": {
        "type": "number",
        "description": "Example: 0."
      },
      "limit": {
        "type": "number",
        "maximum": 100,
        "description": "Example: 50."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "startDate",
      "endDate",
      "offset",
      "limit"
    ]
  },
  "calcom.insights.get_routing_form_field_options": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "routingFormId": {
        "type": "string",
        "description": "Routing form ID to filter fields Example: form_123."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope"
    ]
  },
  "calcom.insights.get_routing_response_headers": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "routingFormId": {
        "type": "string",
        "description": "Routing form ID to filter fields Example: form_123."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope"
    ]
  },
  "calcom.insights.get_failed_bookings_by_field": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "startDate": {
        "type": "string",
        "description": "Inclusive start date for routing insights Example: 2024-01-01."
      },
      "endDate": {
        "type": "string",
        "description": "Inclusive end date for routing insights Example: 2024-01-31."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "startDate",
      "endDate"
    ]
  },
  "calcom.insights.get_routed_users_per_period": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "user",
          "team",
          "org"
        ],
        "description": "Example: user."
      },
      "selectedTeamId": {
        "type": "number",
        "description": "Team ID for team-scoped routing insights Example: 12."
      },
      "startDate": {
        "type": "string",
        "description": "Inclusive start date for routing insights Example: 2024-01-01."
      },
      "endDate": {
        "type": "string",
        "description": "Inclusive end date for routing insights Example: 2024-01-31."
      },
      "columnFilters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "value": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "ss",
                    "ms",
                    "t",
                    "n",
                    "dr"
                  ]
                },
                "data": {
                  "type": "object",
                  "description": "Cal.com validates the keys and values of this object."
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "description": "Data-table column filters (discriminated union by type: ss, ms, t, n, dr). Date range filters use id=createdAt. Example: [{\"id\":\"createdAt\",\"value\":{\"type\":\"dr\",\"data\":{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-01-31\",\"preset\":\"custom\"}}}]."
      },
      "period": {
        "type": "string",
        "enum": [
          "perDay",
          "perWeek",
          "perMonth"
        ],
        "description": "Example: perWeek."
      },
      "limit": {
        "type": "number",
        "maximum": 100,
        "description": "Example: 10."
      },
      "searchQuery": {
        "type": "string",
        "description": "Example: Alice."
      }
    },
    "additionalProperties": false,
    "required": [
      "scope",
      "startDate",
      "endDate",
      "period",
      "limit"
    ]
  },
  "calcom.verified-resources.send_email_code": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Email to verify. Cal.com format: email. Example: acme@example.com."
      }
    },
    "additionalProperties": false,
    "required": [
      "email"
    ]
  },
  "calcom.verified-resources.send_phone_code": {
    "type": "object",
    "properties": {
      "phone": {
        "type": "string",
        "description": "Phone number to verify. Example: +372 5555 6666."
      }
    },
    "additionalProperties": false,
    "required": [
      "phone"
    ]
  },
  "calcom.verified-resources.verify_email": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Email to verify. Cal.com format: email. Example: example@acme.com."
      },
      "code": {
        "type": "string",
        "description": "verification code sent to the email to verify Example: 1ABG2C."
      }
    },
    "additionalProperties": false,
    "required": [
      "email",
      "code"
    ]
  },
  "calcom.verified-resources.verify_phone": {
    "type": "object",
    "properties": {
      "phone": {
        "type": "string",
        "description": "phone number to verify. Example: +37255556666."
      },
      "code": {
        "type": "string",
        "description": "verification code sent to the phone number to verify Example: 1ABG2C."
      }
    },
    "additionalProperties": false,
    "required": [
      "phone",
      "code"
    ]
  },
  "calcom.verified-resources.list_emails": {
    "type": "object",
    "properties": {
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      }
    },
    "additionalProperties": false
  },
  "calcom.verified-resources.list_phones": {
    "type": "object",
    "properties": {
      "take": {
        "type": "number",
        "minimum": 1,
        "maximum": 250,
        "description": "Maximum number of items to return Default: 250. Example: 25."
      },
      "skip": {
        "type": "number",
        "minimum": 0,
        "description": "Number of items to skip Default: 0. Example: 0."
      }
    },
    "additionalProperties": false
  },
  "calcom.verified-resources.get_email": {
    "type": "object",
    "properties": {
      "id": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "id"
    ]
  },
  "calcom.verified-resources.get_phone": {
    "type": "object",
    "properties": {
      "id": {
        "type": "number"
      }
    },
    "additionalProperties": false,
    "required": [
      "id"
    ]
  },
  "calcom.notifications.remove_slack_subscription": {
    "type": "object",
    "properties": {
      "identifier": {
        "type": "string",
        "description": "Slack user ID Example: U0123456789."
      },
      "teamId": {
        "type": "string",
        "description": "Slack team (workspace) ID Example: T0123456789."
      },
      "subscriptionId": {
        "type": "number",
        "minimum": 1,
        "description": "Delete only this subscription ID; requires subscriptionVersion"
      },
      "subscriptionVersion": {
        "type": "string",
        "description": "Delete only this generation; requires subscriptionId"
      }
    },
    "additionalProperties": false,
    "required": [
      "identifier",
      "teamId"
    ]
  },
  "calcom.notifications.remove_telegram_subscription": {
    "type": "object",
    "properties": {
      "identifier": {
        "type": "string",
        "description": "Chat platform identifier to remove Example: U0123456789."
      },
      "subscriptionId": {
        "type": "number",
        "minimum": 1,
        "description": "Delete only this subscription ID; requires subscriptionVersion"
      },
      "subscriptionVersion": {
        "type": "string",
        "description": "Delete only this generation; requires subscriptionId"
      }
    },
    "additionalProperties": false,
    "required": [
      "identifier"
    ]
  },
  "calcom.notifications.remove_imessage_subscription": {
    "type": "object",
    "properties": {
      "identifier": {
        "type": "string",
        "description": "Chat platform identifier to remove Example: U0123456789."
      },
      "subscriptionId": {
        "type": "number",
        "minimum": 1,
        "description": "Delete only this subscription ID; requires subscriptionVersion"
      },
      "subscriptionVersion": {
        "type": "string",
        "description": "Delete only this generation; requires subscriptionId"
      }
    },
    "additionalProperties": false,
    "required": [
      "identifier"
    ]
  },
  "calcom.notifications.get_agent_channels": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.notifications.set_agent_channel": {
    "type": "object",
    "properties": {
      "channel": {
        "type": "string",
        "enum": [
          "slack",
          "telegram",
          "imessage"
        ]
      },
      "enabled": {
        "type": "boolean",
        "description": "Example: true."
      }
    },
    "additionalProperties": false,
    "required": [
      "channel",
      "enabled"
    ]
  },
  "calcom.discover.list_favorites": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.discover.get_listings": {
    "type": "object",
    "properties": {
      "ids": {
        "type": "array",
        "minItems": 1,
        "maxItems": 50,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 2147483647
        },
        "description": "Discover listing ids, such as the `listingId` values a Discover search returned. Repeat the parameter (`ids=12&ids=34`) or separate the ids with commas (`ids=12,34`). Duplicates are read once. Example: [12,34]."
      },
      "includeNextAvailable": {
        "type": "boolean",
        "description": "Also look up each listing's earliest open slot in the next 7 days. Only the first 10 listings are checked, so list the ones you care about first. Default: false. Example: true."
      }
    },
    "additionalProperties": false,
    "required": [
      "ids"
    ]
  },
  "calcom.discover.search_listings": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": [
          "medical",
          "barbers",
          "coaching",
          "consulting",
          "lessons",
          "pets",
          "sports",
          "dance",
          "social",
          "online-services",
          "saas",
          "home-services",
          "other"
        ],
        "description": "The Discover category the need maps to, such as `medical` for tooth pain. Example: barbers."
      },
      "subcategory": {
        "type": "string",
        "enum": [
          "dentistry",
          "therapy",
          "physiotherapy",
          "nutrition",
          "somatic-and-breathwork",
          "doula",
          "general-care",
          "haircuts",
          "beard-and-shave",
          "coloring",
          "kids-cuts",
          "nails",
          "waxing",
          "lashes",
          "skin-and-spa",
          "massage",
          "tattoo",
          "life",
          "career",
          "executive",
          "mindset",
          "spiritual",
          "business",
          "tech-and-ai",
          "finance-and-tax",
          "legal",
          "real-estate",
          "marketing",
          "hr",
          "academic",
          "language",
          "music-and-voice",
          "arts",
          "chess",
          "veterinary",
          "grooming",
          "training",
          "sitting",
          "fitness",
          "yoga",
          "tennis",
          "swimming",
          "skiing",
          "salsa",
          "ballet",
          "hip-hop",
          "ballroom",
          "clubs",
          "workshops",
          "networking",
          "tours",
          "photoshoots-and-studios",
          "pop-ups-and-showrooms",
          "design",
          "development",
          "writing",
          "virtual-assistance",
          "legal-advice",
          "product-demos",
          "onboarding",
          "customer-support",
          "sales",
          "cleaning",
          "repairs",
          "heating-and-cooling",
          "inspections",
          "auto"
        ],
        "description": "A subcategory of `category`, such as `dentistry` under `medical`. Ignored without its category, and named in `ignoredFilters` when it is not one of the category's. Example: haircuts."
      },
      "query": {
        "type": "string",
        "maxLength": 100,
        "description": "Free text matched against the title, description, provider and subcategory. Never a place. Example: skin fade."
      },
      "neighborhood": {
        "type": "string",
        "maxLength": 80,
        "description": "A neighborhood of a launch region, such as `Capitol Hill`, for in-person listings there only. An unknown name comes back in `ignoredFilters`. Example: Capitol Hill."
      },
      "onlineOnly": {
        "type": "boolean",
        "description": "Keep only online listings and search them everywhere, whatever `area` says. Online searches never fall back to the web. Example: false."
      },
      "localQuery": {
        "type": "string",
        "maxLength": 100,
        "description": "For the web fallback, the need in the area's local language when it is not English, such as `Zahnarzt` for a dentist in Hamburg. Example: Zahnarzt."
      },
      "area": {
        "type": "string",
        "maxLength": 80,
        "description": "The place to search around: a ZIP code, neighborhood or city. Without it, the search uses your saved ZIP code, and answers `areaNeeded` when there is none. Pass `anywhere` for results from anywhere. Example: 98122."
      },
      "maximumPrice": {
        "type": "number",
        "minimum": 0,
        "description": "The highest price, in whole currency units: 50 means $50, 0 means free only. Example: 50."
      },
      "maximumDurationMinutes": {
        "type": "number",
        "minimum": 1,
        "description": "The longest session, in minutes. Example: 60."
      },
      "availableWithin": {
        "type": "string",
        "enum": [
          "today",
          "tomorrow",
          "this_week"
        ],
        "description": "Only listings with a real open slot in this window, in your saved time zone. `this_week` means the next 7 days. Example: today."
      }
    },
    "additionalProperties": false
  },
  "calcom.discover.call_business": {
    "type": "object",
    "properties": {
      "businessUrl": {
        "type": "string",
        "maxLength": 2048,
        "description": "The business's URL, exactly as a `search_listings` web business gave it in `webBusinesses[].url`. Only a business found by your own search in the last 24 hours can be called. Example: https://barbers.example/book."
      },
      "service": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120,
        "description": "What to book, in plain words, such as `upright piano full tuning and pitch raise`. Put when the user can come in `timing`, the staff member they asked for in `staff` and their booking details in `notes`. Never put contact details (phone, email, address) in it. Example: upright piano full tuning and pitch raise."
      },
      "timing": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120,
        "description": "When the user can come, in their words, such as `Thursday after 5 or Friday morning`. Leave it out when they named no window. Never put contact details in it. Example: Thursday after 5 or Friday morning."
      },
      "staff": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "description": "The staff member the user asked for, in their words, such as `Sam`. Leave it out when they named none; never take one from the business's page. Example: Sam."
      },
      "notes": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200,
        "description": "Booking details the user gave for this booking, such as `allergic to lavender`. Only what they said, never contact details. Leave it out when they gave none. Example: allergic to lavender."
      },
      "daysFromToday": {
        "type": "number",
        "minimum": 0,
        "maximum": 60,
        "description": "The day the user asked for, in days from today in their saved time zone: 0 today, 1 tomorrow. Cal asks the business for that date. Leave it out when the user named no day. Example: 1."
      },
      "callerName": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "description": "The name the user gave for themselves, which Cal gives on the call. Leave it out to use the account name; never a name from a search result. Example: Jamie Rivera."
      }
    },
    "additionalProperties": false,
    "required": [
      "businessUrl",
      "service"
    ]
  },
  "calcom.discover.book_business": {
    "type": "object",
    "properties": {
      "businessUrl": {
        "type": "string",
        "maxLength": 2048,
        "description": "The business's URL, exactly as a `search_listings` web business gave it in `webBusinesses[].url`. Only a business found by your own search in the last 24 hours can be booked. Example: https://barbers.example/book."
      },
      "service": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "description": "What to book, in plain words, such as `haircut`. Example: haircut."
      },
      "area": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120,
        "description": "The user's area as they gave it: a ZIP code, neighborhood or city. Example: Capitol Hill, Seattle."
      },
      "daysFromToday": {
        "type": "number",
        "minimum": 0,
        "maximum": 60,
        "description": "The day the user asked for, in days from today in their saved time zone: `0` today, `1` tomorrow. Example: 1."
      },
      "partOfDay": {
        "type": "string",
        "enum": [
          "morning",
          "afternoon",
          "evening",
          "any"
        ],
        "description": "The part of that day the user asked for, on the business's local clock; `any` when they did not say. Example: afternoon."
      },
      "budgetDollars": {
        "type": "number",
        "minimum": 1,
        "maximum": 100000,
        "description": "The most the user wants to pay for the service, in US dollars, when they said so. Example: 60."
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100,
        "description": "A key you generate once per booking, such as a UUID. Send the same key to retry the same request: you get its job back, and no second job starts. Example: 4b7d1c2e-9f0a-4e1b-8c3d-2a6f5e7d9b10."
      }
    },
    "additionalProperties": false,
    "required": [
      "businessUrl",
      "service",
      "area",
      "daysFromToday",
      "partOfDay",
      "idempotencyKey"
    ]
  },
  "calcom.discover.create_service_request": {
    "type": "object",
    "properties": {
      "service": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "description": "The service in two or three words, as a provider would list it, such as dentist or piano lessons. Never the user's own words or personal details. Example: piano lessons."
      },
      "category": {
        "type": "string",
        "enum": [
          "medical",
          "barbers",
          "coaching",
          "consulting",
          "lessons",
          "pets",
          "sports",
          "dance",
          "social",
          "online-services",
          "saas",
          "home-services",
          "other"
        ],
        "description": "The Discover category it belongs to. Example: lessons."
      },
      "subcategory": {
        "type": "string",
        "pattern": "^[a-z0-9-]+$",
        "maxLength": 64,
        "description": "The subcategory slug within that category, when one fits. A subcategory outside the category is ignored. Example: music-and-voice."
      },
      "searchedArea": {
        "type": "string",
        "maxLength": 120,
        "description": "The `searchedArea` a `search_listings` (`GET /v2/discover/listings/search`) result returned when it found nothing, copied as given; it decides the region the request is matched in, and a repeat returns the open request only from the same region. Leave it out when there was none. Example: within 10 miles of Seattle, WA."
      }
    },
    "additionalProperties": false,
    "required": [
      "service",
      "category"
    ]
  },
  "calcom.account.list_ip_allowlists": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.account.get_ip_allowlist": {
    "type": "object",
    "properties": {
      "service": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "service"
    ]
  },
  "calcom.account.check_credits": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "calcom.account.get_link": {
    "type": "object",
    "properties": {
      "linkUid": {
        "type": "string",
        "description": "Link UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`).",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "linkUid"
    ]
  },
  "calcom.account.delete_link": {
    "type": "object",
    "properties": {
      "linkUid": {
        "type": "string",
        "description": "Link UUID. Accepts the canonical UUID (e.g. `018ff5cd-6dc4-7d57-bcbc-374702ca8b38`) or its short-uuid (Flickr Base58) form (e.g. `1cbZYoAFoJdwqN4tixezd5`).",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
      }
    },
    "additionalProperties": false,
    "required": [
      "linkUid"
    ]
  }
};
