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
