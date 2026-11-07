// Reviewed provider tools. Schemas, narrowed fields and hint tags copied from tool definitions.
export const CURATED = Object.freeze([
  {
    "id": "google.gmail.list_labels",
    "toolkit": "GMAIL",
    "tool": "GMAIL_LIST_LABELS",
    "kind": "read",
    "summary": "List the labels in your Gmail.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListLabelsRequest",
      "properties": {
        "include_details": {
          "type": "boolean",
          "title": "Include Details",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "If true, fetches detailed info for each label including message/thread counts (messagesTotal, messagesUnread, threadsTotal, threadsUnread). This requires additional API calls and may be slower for accounts with many labels. If false (default), returns basic label info (id, name, type) which is faster. Counts are eventually consistent and may lag real-time mailbox state by a few seconds.",
          "human_parameter_name": "Include details",
          "human_parameter_description": "Set to true if you need message and thread counts for each label. Leave false for faster results with basic label info."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.get_label",
    "toolkit": "GMAIL",
    "tool": "GMAIL_GET_LABEL",
    "kind": "read",
    "summary": "Read one Gmail label and its message counts.",
    "key_fields": [
      "id"
    ],
    "input_schema": {
      "type": "object",
      "title": "GetLabelRequest",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "title": "Id",
          "examples": [
            "INBOX",
            "SENT",
            "Label_1",
            "Label_42"
          ],
          "description": "The ID of the label to retrieve. Can be a system label (e.g., INBOX, SENT, DRAFT, UNREAD, STARRED, SPAM, TRASH) or a user-created label ID (e.g., Label_1, Label_42)."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.list_threads",
    "toolkit": "GMAIL",
    "tool": "GMAIL_LIST_THREADS",
    "kind": "read",
    "summary": "List conversations in your Gmail, optionally matching a search.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListThreadsRequest",
      "properties": {
        "query": {
          "type": "string",
          "title": "Query",
          "default": "",
          "examples": [
            "is:unread",
            "from:john.doe@example.com",
            "subject:important"
          ],
          "description": "Filter for threads, using Gmail search query syntax (e.g., 'from:user@example.com is:unread'). Supported operators include `from:`, `to:`, `subject:`, `label:`, `is:unread`, `has:attachment`, `after:`, `before:`. Dates must use `YYYY/MM/DD` format; date operators are UTC-based. Exact subject phrases require quotes (e.g., `subject:'meeting notes'`).",
          "human_parameter_name": "Query",
          "human_parameter_description": "Use this field to search for specific threads based on criteria like sender or subject."
        },
        "verbose": {
          "type": "boolean",
          "title": "Verbose",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "If false, returns threads with basic fields (id, snippet, historyId). If true, returns threads with complete message details including headers, body, attachments, and metadata for each message in the thread. Combining `verbose=true` with large `max_results` produces very large responses; keep `max_results` modest when verbose is enabled.",
          "human_parameter_name": "Verbose",
          "human_parameter_description": "Choose whether you want just the basic thread info or detailed message content."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "examples": [
            "abcPageToken123"
          ],
          "description": "Token from a previous response to retrieve a specific page of results; omit for the first page.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you're looking for more threads, use this token to get the next set of results."
        },
        "max_results": {
          "type": "integer",
          "title": "Max Results",
          "default": 10,
          "maximum": 500,
          "minimum": 1,
          "examples": [
            "10",
            "50",
            "100"
          ],
          "description": "Maximum number of threads to return. Hard cap is ~500 per call. For full mailbox coverage, loop using `nextPageToken` via `page_token` until absent.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "Specify how many threads you would like to see in the response, up to 500."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.fetch_message_by_thread_id",
    "toolkit": "GMAIL",
    "tool": "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "kind": "read",
    "summary": "Read every message in one Gmail conversation.",
    "key_fields": [
      "thread_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "FetchMessageByThreadIdRequest",
      "required": [
        "thread_id"
      ],
      "properties": {
        "thread_id": {
          "type": "string",
          "title": "Thread Id",
          "examples": [
            "19bf77729bcb3a44",
            "msg-f:19bf77729bcb3a44"
          ],
          "description": "Hexadecimal thread ID from Gmail API (e.g., '19bf77729bcb3a44'). Obtain from GMAIL_LIST_THREADS or GMAIL_FETCH_EMAILS. Prefixes like 'msg-f:' or 'thread-f:' are auto-stripped. Legacy Gmail web UI IDs (e.g., 'FMfcgzQfBZdVqKZcSVBhqwWLKWCtDdWQ') are NOT supported - use the API thread ID instead. Deduplicate thread_ids before calling when multiple listed messages share the same threadId to avoid redundant calls.",
          "human_parameter_name": "Thread ID",
          "human_parameter_description": "The unique hexadecimal identifier of the email thread (e.g., '19bf77729bcb3a44'). Obtain this from GMAIL_LIST_THREADS or GMAIL_FETCH_EMAILS actions. Legacy Gmail web UI IDs are not supported."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "examples": [
            "CiAKGhIKJdealEffectivelyPageToken"
          ],
          "description": "Opaque page token for fetching a specific page of messages if results are paginated. Iterate calls by passing the returned `nextPageToken` until it is absent; stopping early will miss messages in long threads.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "Use this token to navigate to a specific set of messages if there are many. It helps in paginating through results."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.list_drafts",
    "toolkit": "GMAIL",
    "tool": "GMAIL_LIST_DRAFTS",
    "kind": "read",
    "summary": "List your Gmail drafts.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListDraftsRequest",
      "properties": {
        "verbose": {
          "type": "boolean",
          "title": "Verbose",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "If true, fetches full draft details including subject, sender, recipient, body, and timestamp. If false, returns only draft IDs (faster). Increases response payload size; tune max_results accordingly. Use verbose=true before destructive operations to confirm draft identity by subject, recipient, and timestamp.",
          "human_parameter_name": "Verbose",
          "human_parameter_description": "Decide if you want detailed information about each draft or just the basic IDs. More details can help you see what\u2019s inside."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "examples": [
            "CiaKJDhWSE5UURE9PSIsImMiOiJhYmMxMjMifQ=="
          ],
          "description": "Token from a previous response to retrieve a specific page of drafts. Ordering is non-guaranteed; continue paginating until page_token is absent in the response to retrieve all drafts.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "Use this token to get the next page of draft results if you have more drafts to display."
        },
        "max_results": {
          "type": "integer",
          "title": "Max Results",
          "default": 1,
          "maximum": 500,
          "minimum": 1,
          "examples": [
            10,
            100,
            500
          ],
          "description": "Maximum number of drafts to return per page.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "Specify how many drafts you want to retrieve in one request. Choose between 1 and 500."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.get_draft",
    "toolkit": "GMAIL",
    "tool": "GMAIL_GET_DRAFT",
    "kind": "read",
    "summary": "Read one Gmail draft.",
    "key_fields": [
      "draft_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "GetDraftRequest",
      "required": [
        "draft_id"
      ],
      "properties": {
        "format": {
          "type": "string",
          "title": "Format",
          "default": "full",
          "examples": [
            "full",
            "metadata",
            "minimal",
            "raw"
          ],
          "description": "Format for the draft message: 'minimal' (ID/labels only), 'full' (complete data with parsed payload), 'raw' (base64url-encoded RFC 2822 format), 'metadata' (ID/labels/headers only)."
        },
        "draft_id": {
          "type": "string",
          "title": "Draft Id",
          "examples": [
            "r99885592323229922",
            "r-8388446164079304564"
          ],
          "description": "The ID of the draft to retrieve. Draft IDs are typically alphanumeric strings (e.g., 'r99885592323229922'). Use GMAIL_LIST_DRAFTS to retrieve valid draft IDs."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.get_profile",
    "toolkit": "GMAIL",
    "tool": "GMAIL_GET_PROFILE",
    "kind": "read",
    "summary": "Read your Gmail address and mailbox totals.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetProfileRequest",
      "properties": {}
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.get_contacts",
    "toolkit": "GMAIL",
    "tool": "GMAIL_GET_CONTACTS",
    "kind": "read",
    "summary": "List your Google contacts.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetContactsRequest",
      "properties": {
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "description": "Token to retrieve a specific page of results, obtained from 'nextPageToken' in a previous response. Repeat calls with each successive `nextPageToken` until it is absent \u2014 stopping early silently omits contacts.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "Use this token to fetch a specific page of results. It helps you navigate through large sets of contacts."
        },
        "person_fields": {
          "type": "string",
          "title": "Person Fields",
          "default": "emailAddresses,names,birthdays,genders",
          "examples": [
            "addresses",
            "ageRanges",
            "biographies",
            "birthdays",
            "coverPhotos",
            "emailAddresses",
            "events",
            "genders",
            "imClients",
            "interests",
            "locales",
            "memberships",
            "metadata",
            "names",
            "nicknames",
            "occupations",
            "organizations",
            "phoneNumbers",
            "photos",
            "relations",
            "residences",
            "sipAddresses",
            "skills",
            "urls",
            "userDefined"
          ],
          "description": "Comma-separated person fields to retrieve for each contact (e.g., 'names,emailAddresses').",
          "human_parameter_name": "Person Fields",
          "human_parameter_description": "List the fields you want to get for each contact, separated by commas. This helps you customize the information returned."
        },
        "resource_name": {
          "type": "string",
          "title": "Resource Name",
          "default": "people/me",
          "description": "Identifier for the person resource whose connections are listed; use 'people/me' for the authenticated user.",
          "human_parameter_name": "Resource Name",
          "human_parameter_description": "Provide the identifier for the person's resource. Use 'people/me' to access your own account."
        },
        "include_other_contacts": {
          "type": "boolean",
          "title": "Include Other Contacts",
          "default": true,
          "description": "Include 'Other Contacts' (interacted with but not explicitly saved) in addition to regular contacts. WARNING: 'Other Contacts' often have incomplete data - they may lack names, phone numbers, and other fields even when requested. These auto-generated contacts are created from email interactions and typically only have email addresses. Set to False if you need contacts with complete name information. When True, each contact will have a 'contactSource' field indicating its origin. When True, `person_fields` is restricted to `emailAddresses`, `names`, `phoneNumbers`, and `metadata` only \u2014 requesting other fields (e.g., `organizations`, `birthdays`) causes validation errors or silent omissions.",
          "human_parameter_name": "Include Other Contacts?",
          "human_parameter_description": "Decide whether to include contacts you've interacted with but haven't saved. WARNING: These contacts often only have email addresses and may lack names and other requested fields."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.search_people",
    "toolkit": "GMAIL",
    "tool": "GMAIL_SEARCH_PEOPLE",
    "kind": "read",
    "summary": "Search your Google contacts by name or email.",
    "key_fields": [
      "query"
    ],
    "input_schema": {
      "type": "object",
      "title": "SearchPeopleRequest",
      "required": [
        "query"
      ],
      "properties": {
        "query": {
          "type": "string",
          "title": "Query",
          "description": "Matches contact names, nicknames, email addresses, phone numbers, and organization fields.",
          "human_parameter_name": "Search Query",
          "human_parameter_description": "Provide the name, email, or phone number of the person you're looking for to help filter your search."
        },
        "page_size": {
          "type": "integer",
          "title": "Page Size",
          "default": 10,
          "maximum": 30,
          "minimum": 0,
          "description": "Maximum results to return; values >30 are capped to 30 by the API.",
          "human_parameter_name": "Maximum Results",
          "human_parameter_description": "Specify how many results you want to see at once, up to 30 for efficiency."
        },
        "person_fields": {
          "type": "string",
          "title": "Person Fields",
          "default": "emailAddresses,metadata,names,phoneNumbers",
          "examples": [
            "addresses",
            "ageRanges",
            "biographies",
            "birthdays",
            "coverPhotos",
            "emailAddresses",
            "events",
            "genders",
            "imClients",
            "interests",
            "locales",
            "memberships",
            "metadata",
            "names",
            "nicknames",
            "occupations",
            "organizations",
            "phoneNumbers",
            "photos",
            "relations",
            "residences",
            "sipAddresses",
            "skills",
            "urls",
            "userDefined"
          ],
          "description": "Comma-separated fields to return (e.g., 'names,emailAddresses'). When 'other_contacts' is true, only 'emailAddresses', 'metadata', 'names', 'phoneNumbers' are allowed. For full field access including 'organizations', set 'other_contacts' to false.",
          "human_parameter_name": "Fields to Return",
          "human_parameter_description": "List the specific details you want returned about each person, like names and email addresses, to keep your results focused."
        },
        "other_contacts": {
          "type": "boolean",
          "title": "Other Contacts",
          "default": true,
          "description": "When True, searches both saved contacts and 'Other Contacts' (people you've interacted with but not explicitly saved). Note: This restricts person_fields to only 'emailAddresses', 'metadata', 'names', 'phoneNumbers'. When False, searches only saved contacts but allows all person_fields including 'organizations', 'addresses', etc.",
          "human_parameter_name": "Include Other Contacts?",
          "human_parameter_description": "Indicate whether to include people you've interacted with but haven't saved as contacts, allowing for a broader search."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.gmail.create_label",
    "toolkit": "GMAIL",
    "tool": "GMAIL_CREATE_LABEL",
    "kind": "change",
    "summary": "Create a new Gmail label.",
    "key_fields": [
      "label_name"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateLabelRequest",
      "required": [
        "label_name"
      ],
      "properties": {
        "label_name": {
          "type": "string",
          "title": "Label Name",
          "examples": [
            "Work",
            "Project Documents",
            "Receipts 2024",
            "Work/Projects",
            "Personal/Finance",
            "1. Action Items"
          ],
          "description": "REQUIRED. The name for the new label. Must be unique within the account, non-blank, maximum length 225 characters, cannot contain commas (','), not only whitespace, and must not be a reserved system label. Reserved English system labels include: Inbox, Starred, Important, Sent, Draft, Drafts, Spam, Trash, etc. Forward slashes ('/') are allowed and used to create hierarchical nested labels (e.g., 'Work/Projects', 'Personal/Finance'). When creating nested labels, any missing parent labels will be automatically created (similar to 'mkdir -p'). Periods ('.') are allowed and commonly used for numbering schemes (e.g., '1. Action Items', '2. Projects'). Note: 'name' is also accepted as an alias for this field. If a label with this name already exists, returns a 409 conflict; use GMAIL_LIST_LABELS to check existing labels and reuse the existing labelId, or use GMAIL_PATCH_LABEL to update it."
        },
        "text_color": {
          "enum": [
            "#000000",
            "#434343",
            "#666666",
            "#999999",
            "#cccccc",
            "#efefef",
            "#f3f3f3",
            "#ffffff",
            "#fb4c2f",
            "#ffad47",
            "#fad165",
            "#16a766",
            "#43d692",
            "#4a86e8",
            "#a479e2",
            "#f691b3",
            "#f6c5be",
            "#ffe6c7",
            "#fef1d1",
            "#b9e4d0",
            "#c6f3de",
            "#c9daf8",
            "#e4d7f5",
            "#fcdee8",
            "#efa093",
            "#ffd6a2",
            "#fce8b3",
            "#89d3b2",
            "#a0eac9",
            "#a4c2f4",
            "#d0bcf1",
            "#fbc8d9",
            "#e66550",
            "#ffbc6b",
            "#fcda83",
            "#44b984",
            "#68dfa9",
            "#6d9eeb",
            "#b694e8",
            "#f7a7c0",
            "#cc3a21",
            "#eaa041",
            "#f2c960",
            "#149e60",
            "#3dc789",
            "#3c78d8",
            "#8e63ce",
            "#e07798",
            "#ac2b16",
            "#cf8933",
            "#d5ae49",
            "#0b804b",
            "#2a9c68",
            "#285bac",
            "#653e9b",
            "#b65775",
            "#464646",
            "#e7e7e7",
            "#0d3472",
            "#b6cff5",
            "#0d3b44",
            "#98d7e4",
            "#3d188e",
            "#e3d7ff",
            "#711a36",
            "#fbd3e0",
            "#8a1c0a",
            "#f2b2a8",
            "#7a2e0b",
            "#ffc8af",
            "#7a4706",
            "#ffdeb5",
            "#594c05",
            "#fbe983",
            "#684e07",
            "#fdedc1",
            "#0b4f30",
            "#b3efd3",
            "#04502e",
            "#a2dcc1",
            "#c2c2c2",
            "#4986e7",
            "#2da2bb",
            "#b99aff",
            "#994a64",
            "#f691b2",
            "#ff7537",
            "#ffad46",
            "#662e37",
            "#cca6ac",
            "#094228",
            "#42d692",
            "#076239",
            "#16a765",
            "#1a764d",
            "#1c4587",
            "#41236d",
            "#822111",
            "#83334c",
            "#a46a21",
            "#aa8831",
            "#ebdbde"
          ],
          "type": "string",
          "title": "GmailLabelColor",
          "examples": [
            "BLACK",
            "WHITE",
            "YELLOW",
            "RED",
            "BLUE",
            "GREEN",
            "#000000",
            "#ffffff",
            "ROYAL_BLUE"
          ],
          "description": "Text color for the label. Gmail only accepts colors from a predefined palette of 102 specific hex values. Common color names like 'YELLOW', 'RED', 'BLUE', 'GREEN', 'ORANGE', 'PURPLE', 'PINK' are automatically mapped to the closest Gmail palette color. Provide either a common color name, a Gmail palette color name (e.g., 'BLACK', 'ROYAL_BLUE'), or exact hex value (e.g., '#000000', '#4a86e8'). If only text_color is provided without background_color, a complementary background color (white or black) will be auto-selected for optimal contrast. Full palette: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels#Color Must be supplied together with background_color \u2014 providing only one will cause a 400 error. The auto-selected complementary color behavior does not apply; both colors are required.",
          "human_parameter_name": "Text Color",
          "human_parameter_description": "Pick a color for the label text. Common names like 'YELLOW', 'RED', 'BLUE', 'GREEN' are automatically mapped to Gmail palette colors."
        },
        "background_color": {
          "enum": [
            "#000000",
            "#434343",
            "#666666",
            "#999999",
            "#cccccc",
            "#efefef",
            "#f3f3f3",
            "#ffffff",
            "#fb4c2f",
            "#ffad47",
            "#fad165",
            "#16a766",
            "#43d692",
            "#4a86e8",
            "#a479e2",
            "#f691b3",
            "#f6c5be",
            "#ffe6c7",
            "#fef1d1",
            "#b9e4d0",
            "#c6f3de",
            "#c9daf8",
            "#e4d7f5",
            "#fcdee8",
            "#efa093",
            "#ffd6a2",
            "#fce8b3",
            "#89d3b2",
            "#a0eac9",
            "#a4c2f4",
            "#d0bcf1",
            "#fbc8d9",
            "#e66550",
            "#ffbc6b",
            "#fcda83",
            "#44b984",
            "#68dfa9",
            "#6d9eeb",
            "#b694e8",
            "#f7a7c0",
            "#cc3a21",
            "#eaa041",
            "#f2c960",
            "#149e60",
            "#3dc789",
            "#3c78d8",
            "#8e63ce",
            "#e07798",
            "#ac2b16",
            "#cf8933",
            "#d5ae49",
            "#0b804b",
            "#2a9c68",
            "#285bac",
            "#653e9b",
            "#b65775",
            "#464646",
            "#e7e7e7",
            "#0d3472",
            "#b6cff5",
            "#0d3b44",
            "#98d7e4",
            "#3d188e",
            "#e3d7ff",
            "#711a36",
            "#fbd3e0",
            "#8a1c0a",
            "#f2b2a8",
            "#7a2e0b",
            "#ffc8af",
            "#7a4706",
            "#ffdeb5",
            "#594c05",
            "#fbe983",
            "#684e07",
            "#fdedc1",
            "#0b4f30",
            "#b3efd3",
            "#04502e",
            "#a2dcc1",
            "#c2c2c2",
            "#4986e7",
            "#2da2bb",
            "#b99aff",
            "#994a64",
            "#f691b2",
            "#ff7537",
            "#ffad46",
            "#662e37",
            "#cca6ac",
            "#094228",
            "#42d692",
            "#076239",
            "#16a765",
            "#1a764d",
            "#1c4587",
            "#41236d",
            "#822111",
            "#83334c",
            "#a46a21",
            "#aa8831",
            "#ebdbde"
          ],
          "type": "string",
          "title": "GmailLabelColor",
          "examples": [
            "YELLOW",
            "RED",
            "BLUE",
            "GREEN",
            "ROYAL_BLUE",
            "CARIBBEAN_GREEN",
            "#4a86e8",
            "#43d692"
          ],
          "description": "Background color for the label. Gmail only accepts colors from a predefined palette of 102 specific hex values. Common color names like 'YELLOW', 'RED', 'BLUE', 'GREEN', 'ORANGE', 'PURPLE', 'PINK' are automatically mapped to the closest Gmail palette color. Provide either a common color name, a Gmail palette color name (e.g., 'ROYAL_BLUE', 'CARIBBEAN_GREEN'), or exact hex value (e.g., '#4a86e8', '#43d692'). If only background_color is provided without text_color, a complementary text color (white or black) will be auto-selected for optimal contrast. Full palette: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels#Color Must be supplied together with text_color \u2014 providing only one will cause a 400 error. The auto-selected complementary color behavior does not apply; both colors are required.",
          "human_parameter_name": "Background Color",
          "human_parameter_description": "Choose a background color for your label. Common names like 'YELLOW', 'RED', 'BLUE', 'GREEN' are automatically mapped to Gmail palette colors."
        },
        "label_list_visibility": {
          "enum": [
            "labelShow",
            "labelShowIfUnread",
            "labelHide"
          ],
          "type": "string",
          "title": "Label List Visibility",
          "default": "labelShow",
          "examples": [
            "labelShow",
            "labelShowIfUnread",
            "labelHide"
          ],
          "description": "Controls how the label is displayed in the label list in the Gmail sidebar. Valid values: 'labelShow' (always show), 'labelShowIfUnread' (show only if unread messages), 'labelHide' (hide from list).",
          "human_parameter_name": "Label List Visibility",
          "human_parameter_description": "Select how you want the label to appear in the Gmail sidebar. You can show it all the time, show it only if there are unread messages, or hide it completely."
        },
        "message_list_visibility": {
          "enum": [
            "show",
            "hide"
          ],
          "type": "string",
          "title": "Message List Visibility",
          "default": "show",
          "examples": [
            "show",
            "hide"
          ],
          "description": "Controls how messages with this label are displayed in the message list. Valid values: 'show' or 'hide'. Note: These values are different from label_list_visibility - do NOT use 'labelShow' or 'labelHide' here.",
          "human_parameter_name": "Message List Visibility",
          "human_parameter_description": "Choose whether messages with this label should be visible in the message list or hidden away."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "createHint",
      "openWorldHint"
    ]
  },
  {
    "id": "google.gmail.update_draft",
    "toolkit": "GMAIL",
    "tool": "GMAIL_UPDATE_DRAFT",
    "kind": "change",
    "summary": "Change an existing Gmail draft without sending it.",
    "key_fields": [
      "draft_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "UpdateDraftRequest",
      "required": [
        "draft_id"
      ],
      "properties": {
        "cc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Cc",
          "default": [],
          "examples": [
            [
              "cc.recipient1@example.com",
              "CC User <cc.recipient2@example.com>"
            ]
          ],
          "description": "Carbon Copy (CC) recipients' email addresses. Each must be a valid email address or display name format."
        },
        "bcc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Bcc",
          "default": [],
          "examples": [
            [
              "bcc.recipient@example.com",
              "BCC User <bcc.user@example.com>"
            ]
          ],
          "description": "Blind Carbon Copy (BCC) recipients' email addresses. Each must be a valid email address or display name format."
        },
        "body": {
          "type": "string",
          "title": "Body",
          "examples": [
            "Hello Team,\n\nPlease find the attached report.\n\nBest regards",
            "<h1>Meeting Confirmation</h1><p>This confirms our meeting.</p>"
          ],
          "description": "Email body content (plain text or HTML); is_html must be True if HTML. If not provided, previous body is preserved. Can also be provided as 'message_body'."
        },
        "is_html": {
          "type": "boolean",
          "title": "Is Html",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "Set to True if body is already formatted HTML. When False, plain text newlines are auto-converted to <br/> tags."
        },
        "subject": {
          "type": "string",
          "title": "Subject",
          "examples": [
            "Project Update Q3",
            "Meeting Reminder"
          ],
          "description": "Email subject line. If not provided, previous subject is preserved."
        },
        "draft_id": {
          "type": "string",
          "title": "Draft Id",
          "examples": [
            "r-8388446164079304564",
            "r1234567890123456789"
          ],
          "description": "The ID of the draft to update. Must be a valid draft ID from GMAIL_LIST_DRAFTS or GMAIL_CREATE_EMAIL_DRAFT."
        },
        "thread_id": {
          "type": "string",
          "title": "Thread Id",
          "examples": [
            "17f45ec49a9c3f1b"
          ],
          "description": "ID of an existing Gmail thread. If provided, the draft will be part of this thread."
        },
        "recipient_email": {
          "type": "string",
          "title": "Recipient Email",
          "examples": [
            "john.doe@example.com",
            "John Doe <john.doe@example.com>"
          ],
          "description": "Primary recipient's email address. Must be a valid email address (e.g., 'user@example.com') or display name format (e.g., 'John Doe <user@example.com>'). Optional - if not provided, previous recipients are preserved."
        },
        "extra_recipients": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Extra Recipients",
          "default": [],
          "examples": [
            [
              "jane.doe@example.com",
              "Jane Doe <jane.doe@example.com>"
            ]
          ],
          "description": "Additional 'To' recipients' email addresses. Each must be a valid email address or display name format. Should only be used if recipient_email is also provided."
        },
        "include_signature": {
          "type": "boolean",
          "title": "Include Signature",
          "default": true,
          "description": "Append the sender's Gmail signature (the 'Send mail as' signature configured in Gmail settings) to the message body, ahead of any quoted or forwarded content. Skipped when the body already ends with that signature, when no signature is configured, or when the connection lacks permission to read Gmail settings. Set to false to send the body exactly as provided.",
          "human_parameter_name": "Include Gmail signature?",
          "human_parameter_description": "Append the sender's configured Gmail signature to the message."
        }
      }
    },
    "narrowed": [
      "user_id",
      "attachment"
    ],
    "hint": [
      "openWorldHint",
      "updateHint"
    ]
  },
  {
    "id": "google.calendar.list_calendars",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_LIST_CALENDARS",
    "kind": "read",
    "summary": "List the calendars you can see.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListCalendarsRequest",
      "properties": {
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "examples": [
            " nextPageToken123"
          ],
          "description": "Token for the page of results to return, from a previous response.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you\u2019re continuing from a previous list, paste the page token here to get the next set of calendars. Leave blank to start from the beginning."
        },
        "sync_token": {
          "type": "string",
          "title": "Sync Token",
          "examples": [
            "syncToken123"
          ],
          "description": "Sync token from a previous list request to get only changed entries; showDeleted, showHidden, and pageToken are ignored if provided. Also ignores minAccessRole. An HTTP 410 Gone response means the token has expired; perform a full resync by omitting sync_token.",
          "human_parameter_name": "Sync Token",
          "human_parameter_description": "Provide a sync token from a previous run to fetch only calendars that changed since then. Use this for faster incremental updates."
        },
        "max_results": {
          "type": "integer",
          "title": "Max Results",
          "default": 100,
          "maximum": 250,
          "minimum": 1,
          "examples": [
            25,
            100
          ],
          "description": "Maximum calendars to return on one page. Google defaults to 100 and allows at most 250. Follow next_page_token until absent to enumerate every accessible calendar.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "How many calendars to show in one batch. Increase this to see more at once (up to 250)."
        },
        "show_hidden": {
          "type": "boolean",
          "title": "Show Hidden",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "Include calendars not typically shown in the UI.",
          "human_parameter_name": "Show Hidden",
          "human_parameter_description": "Include calendars that are hidden in your calendar view. Enable this if you\u2019re looking for calendars you\u2019ve hidden."
        },
        "show_deleted": {
          "type": "boolean",
          "title": "Show Deleted",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "Include deleted calendars in the result.",
          "human_parameter_name": "Show Deleted",
          "human_parameter_description": "Turn this on to include calendars you\u2019ve deleted in the results. Most people can leave this off."
        },
        "min_access_role": {
          "enum": [
            "freeBusyReader",
            "reader",
            "writerWithoutPrivateAccess",
            "writer",
            "owner"
          ],
          "type": "string",
          "title": "Min Access Role",
          "examples": [
            "reader",
            "owner"
          ],
          "description": "Minimum access role for returned calendars: 'freeBusyReader', 'reader', 'writerWithoutPrivateAccess', 'writer', or 'owner'. freeBusyReader calendars expose only free/busy slots. Omit this filter to include every accessible role.",
          "human_parameter_name": "Min Access Role",
          "human_parameter_description": "Only include calendars where you have at least this level of access. For example, choose 'owner' to see just calendars you own."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.get_calendar",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_GET_CALENDAR",
    "kind": "read",
    "summary": "Read one calendar's details.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetCalendarRequest",
      "properties": {
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary",
            "user@example.com",
            "en.usa#holiday@group.v.calendar.google.com"
          ],
          "description": "Identifier of the Google Calendar to retrieve. Must be 'primary' (the default) for the user's main calendar, or an email-like identifier (e.g., 'user@example.com' or 'en.usa#holiday@group.v.calendar.google.com'). IMPORTANT: Calendar display names/titles (e.g., 'Work', 'Vacation') are NOT valid identifiers and will result in errors. To find a calendar's ID, use the LIST_CALENDARS action which returns the 'id' field for each calendar.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "Which calendar you want to retrieve. Use 'primary' for your main calendar, or use the calendar's email-like identifier for a shared or secondary calendar. IMPORTANT: Calendar display names (like 'Work' or 'Vacation') are NOT valid - you must use 'primary' or the calendar's email address. If you only know the calendar's name, use the List Calendars action to find its ID."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.events_list_all_calendars",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
    "kind": "read",
    "summary": "List events across all your calendars in a time range.",
    "key_fields": [
      "time_min",
      "time_max"
    ],
    "input_schema": {
      "type": "object",
      "title": "EventsListAllCalendarsRequest",
      "required": [
        "time_min",
        "time_max"
      ],
      "properties": {
        "q": {
          "type": "string",
          "title": "Q",
          "description": "Free text search terms to find events that match these terms in any field, except for extended properties. Optional."
        },
        "time_max": {
          "type": "string",
          "title": "Time Max",
          "description": "Upper bound (exclusive) for an event's start time to filter by. Must be an RFC3339 timestamp with mandatory time zone offset (e.g., 2011-06-03T10:00:00-07:00 or 2011-06-03T10:00:00Z). If timezone offset is missing, UTC (Z) will be automatically appended. Required."
        },
        "time_min": {
          "type": "string",
          "title": "Time Min",
          "description": "Lower bound (inclusive) for an event's end time to filter by. Must be an RFC3339 timestamp with mandatory time zone offset (e.g., 2011-06-03T10:00:00-07:00 or 2011-06-03T10:00:00Z). If timezone offset is missing, UTC (Z) will be automatically appended. Required."
        },
        "event_types": {
          "type": "array",
          "items": {
            "enum": [
              "birthday",
              "default",
              "focusTime",
              "fromGmail",
              "outOfOffice",
              "workingLocation"
            ],
            "type": "string",
            "title": "EventType",
            "description": "Valid event types for Google Calendar API."
          },
          "title": "Event Types",
          "description": "Event types to return. Optional."
        },
        "calendar_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Calendar Ids",
          "description": "Optional list of specific calendar IDs to query. If not provided, all calendars from the user's calendar list will be queried."
        },
        "show_deleted": {
          "type": "boolean",
          "title": "Show Deleted",
          "default": false,
          "description": "Whether to include deleted events (with status equals 'cancelled') in the result. Optional. The default is False."
        },
        "single_events": {
          "type": "boolean",
          "title": "Single Events",
          "default": true,
          "description": "Whether to expand recurring events into instances and only return single one-off events and instances of recurring events. Optional. The default is True."
        },
        "response_detail": {
          "enum": [
            "minimal",
            "full"
          ],
          "type": "string",
          "title": "Response Detail",
          "default": "minimal",
          "description": "Level of detail in the response. 'minimal' (default) returns only the compact summary_view, omitting the large events array to reduce token usage. 'full' returns both summary_view and the full detailed events array."
        },
        "max_results_per_calendar": {
          "type": "integer",
          "title": "Max Results Per Calendar",
          "description": "Maximum number of events returned per calendar. Optional. If not provided, defaults to the API's default (250). Results may be paginated; follow `nextPageToken` in the response until absent to retrieve the complete event list."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.events_instances",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_EVENTS_INSTANCES",
    "kind": "read",
    "summary": "List the dates of one repeating event.",
    "key_fields": [
      "calendarId",
      "eventId"
    ],
    "input_schema": {
      "type": "object",
      "title": "EventsInstancesRequest",
      "required": [
        "calendarId",
        "eventId"
      ],
      "properties": {
        "eventId": {
          "type": "string",
          "title": "Event Id",
          "examples": [
            "a1b2c3d4e5f6g7h8i9j0k1l2m3"
          ],
          "description": "REQUIRED. The ID of the recurring event whose instances you want to retrieve. You must first use GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to find recurring events and get their IDs. This action only works with recurring events that have a recurrence rule.",
          "human_parameter_name": "Event ID",
          "human_parameter_description": "REQUIRED. The ID of the recurring event whose instances you want to retrieve. First use GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to search for recurring events and get their IDs. This action only works with recurring events."
        },
        "timeMax": {
          "type": "string",
          "title": "Time Max",
          "examples": [
            "2024-07-31T23:59:59Z"
          ],
          "description": "Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset.",
          "human_parameter_name": "Time Max",
          "human_parameter_description": "Only include instances that start before this date and time. Use a full timestamp with time zone."
        },
        "timeMin": {
          "type": "string",
          "title": "Time Min",
          "examples": [
            "2024-07-01T00:00:00Z"
          ],
          "description": "Lower bound (inclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset.",
          "human_parameter_name": "Time Min",
          "human_parameter_description": "Start of the time window to filter instances. Use a full timestamp with time zone."
        },
        "timeZone": {
          "type": "string",
          "title": "Time Zone",
          "examples": [
            "America/Los_Angeles",
            "Europe/London"
          ],
          "description": "Time zone used in the response. Optional. The default is the time zone of the calendar.",
          "human_parameter_name": "Time Zone",
          "human_parameter_description": "Choose the time zone for times in the response so they match your preference."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "Token specifying which result page to return. Optional.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you got a next page token from a previous call, paste it here to continue where you left off."
        },
        "calendarId": {
          "type": "string",
          "title": "Calendar Id",
          "examples": [
            "primary",
            "example.calendar.id@group.calendar.google.com"
          ],
          "description": "Calendar identifier. To retrieve calendar IDs call the `calendarList.list` method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar you want to read from. Use 'primary' for your own calendar or paste a specific calendar ID."
        },
        "maxResults": {
          "type": "integer",
          "title": "Max Results",
          "maximum": 2500,
          "minimum": 1,
          "examples": [
            100,
            250
          ],
          "description": "Maximum number of events returned on one result page. By default the value is 250 events. The page size can never be larger than 2500 events. Optional.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "How many event instances to return per page. Use a smaller number to load results faster."
        },
        "showDeleted": {
          "type": "boolean",
          "title": "Show Deleted",
          "examples": [
            true,
            false
          ],
          "description": "Whether to include deleted events (with status equals \"cancelled\") in the result. Cancelled instances of recurring events will still be included if `singleEvents` is False. Optional. The default is False.",
          "human_parameter_name": "Show Deleted",
          "human_parameter_description": "Include canceled or deleted instances in the results. Turn this on only if you need to see removed occurrences."
        },
        "maxAttendees": {
          "type": "integer",
          "title": "Max Attendees",
          "examples": [
            5,
            10
          ],
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional.",
          "human_parameter_name": "Max Attendees",
          "human_parameter_description": "Limits how many attendees are returned for each instance, helping keep the results short and easier to scan."
        },
        "originalStart": {
          "type": "string",
          "title": "Original Start",
          "examples": [
            "2024-07-15T10:00:00Z"
          ],
          "description": "The original start time of the instance in the result. Optional.",
          "human_parameter_name": "Original Start",
          "human_parameter_description": "If you\u2019re targeting a single instance, enter that instance\u2019s original start time to pinpoint it."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.find_event",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_FIND_EVENT",
    "kind": "read",
    "summary": "Find events by words in their title or details.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "FindEventRequest",
      "properties": {
        "query": {
          "type": "string",
          "title": "Query",
          "examples": [
            "Project Alpha Review",
            "Birthday Party",
            "Q3 Planning session"
          ],
          "description": "Free-text search terms to find events. This query is matched against various event fields including summary, description, location, attendees' details (displayName, email), and organizer's details. Cannot search by event_id. Performs full-text match (not exact); broad terms may return unrelated events. For person-based matching, prefer attendees[].email over display names. If results appear incomplete, use GOOGLECALENDAR_EVENTS_LIST with client-side filtering.",
          "human_parameter_name": "Search Query",
          "human_parameter_description": "The words or phrases to look for in events. Use this to find meetings by title, description, location, or people."
        },
        "order_by": {
          "type": "string",
          "title": "Order By",
          "examples": [
            "startTime",
            "updated"
          ],
          "description": "Order of events: 'startTime' (ascending by start time) or 'updated' (ascending by last modification time). Note: 'startTime' requires single_events=true. Use 'updated' if you need to include recurring masters (e.g., cancelled series).",
          "human_parameter_name": "Order By",
          "human_parameter_description": "How to sort the results\u2014by start time or by last updated time. Pick start time for a chronological list."
        },
        "time_max": {
          "type": "string",
          "title": "Time Max",
          "examples": [
            "2024-12-31T23:59:59Z",
            "2025-01-01 10:00:00"
          ],
          "description": "Upper bound (exclusive) for an event's start time to filter by. Only events starting before this time are included. Accepts multiple formats:\n1. RFC3339 timestamp (e.g., '2024-12-06T13:00:00Z')\n2. Comma-separated date/time parts (e.g., '2024,12,06,13,00,00')\n3. Simple datetime string (e.g., '2024-12-06 13:00:00') Set to the first instant after the desired period to avoid missing boundary events, especially all-day events (date-only fields). Overly wide ranges expand many recurring instances, causing large payloads and high latency \u2014 constrain to the minimum required window.",
          "human_parameter_name": "Time Max",
          "human_parameter_description": "The latest date and time to include in your search window. Events starting after this won't be shown."
        },
        "time_min": {
          "type": "string",
          "title": "Time Min",
          "examples": [
            "2024-01-01T00:00:00Z",
            "2024-06-15 09:00:00"
          ],
          "description": "Lower bound (exclusive) for an event's end time to filter by. Only events ending after this time are included. Accepts multiple formats:\n1. RFC3339 timestamp (e.g., '2024-12-06T13:00:00Z')\n2. Comma-separated date/time parts (e.g., '2024,12,06,13,00,00')\n3. Simple datetime string (e.g., '2024-12-06 13:00:00') RFC3339 timestamps must include explicit timezone offsets; missing or mismatched offsets can silently exclude matching events. To align with the calendar's timezone, retrieve it via GOOGLECALENDAR_GET_CALENDAR.",
          "human_parameter_name": "Time Min",
          "human_parameter_description": "The earliest date and time to include in your search window. Events before this won't be shown."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Token from a previous response's `nextPageToken` to fetch the subsequent page of results. Always follow every `nextPageToken` until absent; skipping pagination silently omits events on busy calendars.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you\u2019re fetching the next page of results, paste the token from the previous response here."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary",
            "user@example.com",
            "abc123xyz@group.calendar.google.com"
          ],
          "description": "Identifier of the Google Calendar to query. IMPORTANT: This must be a valid calendar identifier, NOT a calendar name/title. Valid formats are: 'primary' (the authenticated user's primary calendar), an email address (e.g., 'user@example.com'), or a calendar ID (e.g., 'abc123xyz@group.calendar.google.com'). To find the calendar ID for a named calendar, first use the List Calendars action (GOOGLECALENDAR_LIST_CALENDARS) to retrieve all available calendars with their IDs. 'primary' searches only the authenticated user's primary calendar; to search all calendars, retrieve each ID via GOOGLECALENDAR_LIST_CALENDARS and query separately.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "Which calendar you want to search. MUST be 'primary', an email address, or a calendar ID - NOT a calendar name. To get the ID for a named calendar, first use List Calendars to find the ID."
        },
        "event_types": {
          "type": "array",
          "items": {
            "enum": [
              "birthday",
              "default",
              "focusTime",
              "outOfOffice",
              "workingLocation"
            ],
            "type": "string",
            "title": "EventType",
            "description": "Event type constraints:\n- 'birthday': Requires transparency='transparent', description must be omitted\n- 'outOfOffice': Requires calendar_id='primary', Workspace/enterprise calendar,\n  transparency='opaque', location and attendees must be omitted,\n  create_meeting_room must be false\n- 'focusTime': Requires Google Workspace Enterprise account with Focus Time feature enabled\n- 'workingLocation': Requires Google Workspace Enterprise account"
          },
          "title": "Event Types",
          "default": [
            "birthday",
            "default",
            "focusTime",
            "outOfOffice",
            "workingLocation"
          ],
          "examples": [
            "default",
            "focusTime",
            "outOfOffice",
            "birthday",
            "workingLocation"
          ],
          "description": "Event types to include. Supported values: 'birthday', 'default', 'focusTime', 'outOfOffice', 'workingLocation'.",
          "human_parameter_name": "Event Types",
          "human_parameter_description": "Choose which kinds of events to include (like default events, birthdays, out of office). Leave as-is to include all types."
        },
        "max_results": {
          "type": "integer",
          "title": "Max Results",
          "default": 10,
          "description": "Maximum number of events per page (1-2500).",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "How many events to return per page of results. Larger numbers show more at once; smaller numbers are easier to scan."
        },
        "updated_min": {
          "type": "string",
          "title": "Updated Min",
          "examples": [
            "2024-07-01T00:00:00Z"
          ],
          "description": "Lower bound (exclusive) for an event's last modification time to filter by. Only events updated after this time are included. When specified, events deleted since this time are also included, regardless of the `show_deleted` parameter. Accepts multiple formats:\n1. RFC3339 timestamp (e.g., '2024-12-06T13:00:00Z')\n2. Comma-separated date/time parts (e.g., '2024,12,06,13,00,00')\n3. Simple datetime string (e.g., '2024-12-06 13:00:00')",
          "human_parameter_name": "Updated Min",
          "human_parameter_description": "Only show events that were changed after this date and time. Useful for finding recent updates."
        },
        "show_deleted": {
          "type": "boolean",
          "title": "Show Deleted",
          "description": "Include events whose status is 'cancelled'. This surfaces cancelled/deleted events, not a separate 'trash' view. Behavior with recurring events: when single_events=true, only individual cancelled instances are returned (the recurring master is omitted); to include cancelled recurring masters, set single_events=false. If updated_min is provided, events deleted since that time are included regardless of this flag.",
          "human_parameter_name": "Show Deleted/Cancelled",
          "human_parameter_description": "Whether to include events that were cancelled or deleted. Turn this on if you need to see removed events."
        },
        "single_events": {
          "type": "boolean",
          "title": "Single Events",
          "default": true,
          "description": "When true, recurring event series are expanded into their individual instances. When false, only the recurring master events are returned. Note: Ordering by 'startTime' requires singleEvents=true. For large calendars, it is strongly recommended to specify both timeMin and timeMax to limit the expansion window and improve performance.",
          "human_parameter_name": "Single Events",
          "human_parameter_description": "Whether to expand recurring series into individual events. Turn off to see just the main series entry."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.find_free_slots",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "kind": "read",
    "summary": "Find free time across calendars.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "FindFreeSlotsRequest",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Items",
          "default": [
            "primary"
          ],
          "examples": [
            [
              "primary"
            ],
            [
              "primary",
              "user@example.com"
            ]
          ],
          "description": "List of calendar identifiers to query for free/busy information. Pass as a simple list of strings, e.g., ['primary'] or ['primary', 'user@example.com']. Valid values include: 'primary' (authenticated user's main calendar), calendar IDs from the user's calendar list (typically ending in @group.calendar.google.com), or email addresses of users whose free/busy information you want to query. The FreeBusy API will return error information for any calendars that are not accessible or invalid in the response under the 'errors' key for each calendar. Calendars omitted from `items` or inaccessible are treated as free (not unknown), which can silently produce incorrect availability results.",
          "human_parameter_name": "Calendar Items",
          "human_parameter_description": "Which calendars you want to check. Use 'primary' for your main calendar, or use calendar IDs from your calendar list."
        },
        "time_max": {
          "type": "string",
          "title": "Time Max",
          "examples": [
            "2024-12-06T18:00:00Z",
            "2024,12,06,18,00,00",
            "2024-12-06 18:00:00"
          ],
          "description": "End datetime for the query interval. Accepts ISO, comma-separated, or simple datetime formats. If provided without an explicit timezone, it is interpreted in the specified `timezone`. If not provided, defaults to 23:59:59 of the day specified in `time_min` (if provided), otherwise defaults to 23:59:59 of the current day in the specified `timezone`. Maximum span between time_min and time_max is approximately 90 days per Google Calendar freeBusy API limit. `time_max` is exclusive; to cover a full day, set `time_max` to 00:00:00 of the following day in the target timezone rather than 23:59:59.",
          "human_parameter_name": "End Time",
          "human_parameter_description": "When to stop looking for availability. Leave this blank to use the end of the day (23:59:59) from your start time, or the current day if no start time is provided."
        },
        "time_min": {
          "type": "string",
          "title": "Time Min",
          "examples": [
            "2024-12-06T13:00:00Z",
            "2024,12,06,13,00,00",
            "2024-12-06 13:00:00"
          ],
          "description": "Start datetime for the query interval. Accepts ISO, comma-separated, or simple datetime formats. If provided without an explicit timezone, it is interpreted in the specified `timezone`. If not provided, defaults to the current timestamp in the specified `timezone` to ensure only future/bookable slots are returned. Maximum span between time_min and time_max is approximately 90 days per Google Calendar freeBusy API limit.",
          "human_parameter_name": "Start Time",
          "human_parameter_description": "When to start looking for availability. Leave this blank to use the current time in your selected timezone."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "default": "UTC",
          "examples": [
            "UTC",
            "America/New_York",
            "Europe/Berlin"
          ],
          "description": "IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Determines how naive `time_min`/`time_max` are interpreted and the timezone used in the response for `timeMin`, `timeMax`, busy periods, and calculated free slots. Note: 'local' is not supported; use a specific IANA timezone name.",
          "human_parameter_name": "Timezone",
          "human_parameter_description": "The time zone to interpret your dates and show results. Choose where you are (e.g., America/New_York or Europe/London) so times make sense to you."
        },
        "group_expansion_max": {
          "type": "integer",
          "title": "Group Expansion Max",
          "default": 100,
          "maximum": 100,
          "minimum": 1,
          "description": "Maximum calendar identifiers to return for a single group. Must be between 1 and 100 (inclusive). Values exceeding 100 will be rejected.",
          "human_parameter_name": "Max Groups",
          "human_parameter_description": "The maximum number of calendars to expand when you provide a group address. Most users can keep the default."
        },
        "calendar_expansion_max": {
          "type": "integer",
          "title": "Calendar Expansion Max",
          "default": 50,
          "maximum": 50,
          "minimum": 1,
          "description": "Maximum calendars for which FreeBusy information is provided. Must be between 1 and 50 (inclusive). Values exceeding 50 will be rejected.",
          "human_parameter_name": "Max Calendars",
          "human_parameter_description": "The maximum number of calendars to include in the free/busy check. Increase only if you're checking many calendars at once."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.get_current_date_time",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_GET_CURRENT_DATE_TIME",
    "kind": "read",
    "summary": "Read the current date and time in a time zone.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetCurrentDateTimeRequest",
      "properties": {}
    },
    "narrowed": [
      "timezone"
    ],
    "hint": [
      "idempotentHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.calendar.quick_add",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_QUICK_ADD",
    "kind": "send",
    "summary": "Add an event from one line of text, such as \"Lunch with Sam Friday 1pm\".",
    "key_fields": [
      "text"
    ],
    "input_schema": {
      "type": "object",
      "title": "QuickAddRequest",
      "required": [
        "text"
      ],
      "properties": {
        "text": {
          "type": "string",
          "title": "Text",
          "examples": [
            "Appointment at Somewhere on June 3rd 10am-10:25am",
            "Dentist appointment tomorrow at 2pm for 45 minutes"
          ],
          "minLength": 1,
          "description": "Required natural language input describing the event. It must contain at least one non-whitespace character. Google Calendar parses it for event details like title, date, and time.",
          "human_parameter_name": "Event Description",
          "human_parameter_description": "Describe the event in plain language (e.g., 'Lunch with Alex tomorrow at 12pm'). Google Calendar will parse this to set the title, date, and time."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary",
            "user@example.com",
            "xxxxxxxxxxxxxxxxx@group.calendar.google.com"
          ],
          "description": "Identifier of the calendar for the event. Use 'primary' for the main calendar, or provide a specific calendar ID (e.g., email address).",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar where you want this event to be created. Use 'primary' for your main calendar, or provide a specific calendar ID or email address."
        },
        "send_updates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string",
          "title": "Send Updates",
          "default": "none",
          "description": "Controls whether email notifications about the event creation are sent to attendees.",
          "human_parameter_name": "Email Notifications",
          "human_parameter_description": "Choose whether attendees should receive email notifications when the event is created. Select 'all' to notify everyone, 'externalOnly' to notify guests outside your organization, or 'none' for no emails."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint",
      "openWorldHint"
    ]
  },
  {
    "id": "google.calendar.patch_event",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_PATCH_EVENT",
    "kind": "send",
    "summary": "Change some details of an existing event.",
    "key_fields": [
      "calendar_id",
      "event_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "PatchEventRequest",
      "required": [
        "calendar_id",
        "event_id"
      ],
      "properties": {
        "summary": {
          "type": "string",
          "title": "Summary",
          "examples": [
            "Updated Team Meeting"
          ],
          "description": "New title for the event.",
          "human_parameter_description": "What you want to call the event. This becomes the event's title people will see in their calendars."
        },
        "color_id": {
          "type": "string",
          "title": "Color Id",
          "pattern": "^([1-9]|1[0-1])$",
          "examples": [
            "1",
            "5",
            "11"
          ],
          "description": "Color ID for the event (1-11). Use GOOGLECALENDAR_COLORS_GET to retrieve available colors."
        },
        "end_time": {
          "type": "string",
          "title": "End Time",
          "examples": [
            "2024-07-01T11:00:00-07:00",
            "2024-07-02"
          ],
          "description": "New end time (RFC3339 timestamp, e.g., '2024-07-01T11:00:00-07:00'). Explicit timezone information (Z or an offset) is preserved; offset-less values are interpreted in `timezone`, or UTC when it is omitted. For all-day events, use YYYY-MM-DD format (exclusive end date). Optional when updating start_time - the original event duration will be preserved if end_time is not specified. Must be strictly after `start_time`; mismatched or mixed formats cause HTTP 400 `timeRangeEmpty`.",
          "human_parameter_name": "End Time",
          "human_parameter_description": "When the event should end. Provide a date and time or the next day for all-day events. Optional when changing start time - the event duration will be kept the same."
        },
        "event_id": {
          "type": "string",
          "title": "Event Id",
          "examples": [
            "pna920peji8r3jj2a18m6bk8ms",
            "abc123def456_20260115T100000Z"
          ],
          "description": "The unique technical identifier of the event to update. IMPORTANT: This is NOT the event title/name. Event IDs are opaque strings typically base32hex encoded (5-1024 characters using lowercase a-v and digits 0-9). For recurring event instances, the ID format is 'baseEventId_YYYYMMDDTHHMMSSZ' with an underscore separator (e.g., 'abc123def456_20260115T100000Z'). To get an event ID, first use GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to search for events and retrieve their IDs. Use master event ID to update the entire recurring series; use instance ID to update only that occurrence \u2014 confirm scope before patching.",
          "human_parameter_name": "Event ID",
          "human_parameter_description": "The unique technical identifier of the event (NOT the event title). For recurring event instances, the ID includes an underscore followed by the instance date. To find this ID, first list or search events in the calendar."
        },
        "location": {
          "type": "string",
          "title": "Location",
          "examples": [
            "Conference Room B",
            "https://hangouts.google.com/foo"
          ],
          "description": "New geographic location (physical address or virtual meeting link).",
          "human_parameter_description": "Where the event takes place, such as a room name, address, or meeting link."
        },
        "sequence": {
          "type": "integer",
          "title": "Sequence",
          "minimum": 0,
          "examples": [
            0,
            1,
            2
          ],
          "description": "Sequence number as per iCalendar specification. Incremented on each event update."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "examples": [
            "America/Los_Angeles",
            "Europe/Berlin"
          ],
          "description": "IANA Time Zone Database name for start/end times (e.g., 'America/Los_Angeles'). Interprets offset-less values and sets the display/recurrence zone; Z or numeric offsets still identify the instant. When provided without start_time or end_time, updates the display zone of an existing timed event while preserving its instants. All-day events do not have a time zone.",
          "human_parameter_name": "Time Zone",
          "human_parameter_description": "The display and recurrence time zone. It interprets date-times without a Z suffix or numeric offset; explicit offsets still identify the instant."
        },
        "attendees": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Attendees",
          "examples": [
            [
              "user1@example.com",
              "user2@example.com"
            ],
            []
          ],
          "description": "List of valid email addresses for attendees (e.g., 'user@example.com'). Replaces existing attendees. Provide an empty list to remove all.",
          "human_parameter_name": "Attendees",
          "human_parameter_description": "Email addresses of people you want to include on the event. Supplying this replaces the current attendee list; send an empty list to remove everyone."
        },
        "recurrence": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Recurrence",
          "examples": [
            [
              "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"
            ],
            [
              "RRULE:FREQ=DAILY;INTERVAL=2"
            ]
          ],
          "description": "RRULE, EXRULE, RDATE and EXDATE lines per RFC5545 for recurring events. Replaces existing recurrence rules if provided."
        },
        "start_time": {
          "type": "string",
          "title": "Start Time",
          "examples": [
            "2024-07-01T10:00:00-07:00",
            "2024-07-01"
          ],
          "description": "New start time (RFC3339 timestamp, e.g., '2024-07-01T10:00:00-07:00'). Explicit timezone information (Z or an offset) is preserved; offset-less values are interpreted in `timezone`, or UTC when it is omitted. For all-day events, use YYYY-MM-DD format. When only start_time is provided without end_time, the event's original duration is preserved automatically.",
          "human_parameter_name": "Start Time",
          "human_parameter_description": "When the event should start. Provide a date and time or just a date for all-day events. A Z suffix or numeric offset identifies the instant; otherwise the time zone below is used. If you only change the start time, the event duration is preserved."
        },
        "visibility": {
          "enum": [
            "default",
            "public",
            "private",
            "confidential"
          ],
          "type": "string",
          "title": "Visibility",
          "examples": [
            "default",
            "public",
            "private",
            "confidential"
          ],
          "description": "Visibility of the event."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "examples": [
            "primary",
            "secondary_calendar_id"
          ],
          "description": "Identifier of the calendar. Use 'primary' for the primary calendar of the logged-in user. To find other calendar IDs, use the `calendarList.list` method. Must be provided in snake_case format.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar where the event lives. Use 'primary' to update your main calendar, or paste the ID of another calendar you can edit."
        },
        "description": {
          "type": "string",
          "title": "Description",
          "examples": [
            "Weekly team sync meeting to discuss project updates."
          ],
          "description": "New description for the event; can include HTML.",
          "human_parameter_description": "Details you want to include for the event, like agenda, notes, or links. You can use plain text or HTML."
        },
        "send_updates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string",
          "title": "Send Updates",
          "examples": [
            "all",
            "externalOnly",
            "none"
          ],
          "description": "Whether to send update notifications to attendees. Uses default user behavior if unspecified. Set explicitly to avoid unintended notifications when removing attendees or making bulk updates.",
          "human_parameter_name": "Send Updates",
          "human_parameter_description": "Choose whether guests should receive email notifications about these changes."
        },
        "transparency": {
          "enum": [
            "opaque",
            "transparent"
          ],
          "type": "string",
          "title": "Transparency",
          "examples": [
            "opaque",
            "transparent"
          ],
          "description": "Whether the event blocks time on the calendar. 'opaque' (default) blocks time, 'transparent' does not."
        },
        "max_attendees": {
          "type": "integer",
          "title": "Max Attendees",
          "examples": [
            10,
            100
          ],
          "description": "Maximum attendees in response; does not affect invited count. If more, response includes organizer only. Must be positive.",
          "exclusiveMinimum": 0,
          "human_parameter_name": "Max Attendees",
          "human_parameter_description": "Limit how many attendees are returned in the response (doesn't change who is invited). Useful to keep responses small."
        },
        "rsvp_response": {
          "enum": [
            "needsAction",
            "declined",
            "tentative",
            "accepted"
          ],
          "type": "string",
          "title": "Rsvp Response",
          "examples": [
            "accepted",
            "declined",
            "tentative",
            "needsAction"
          ],
          "description": "RSVP response status for the authenticated user. Updates only the current user's response status without affecting other attendees. Note: RSVP is only supported for regular calendar events (eventType='default'); attempting to RSVP to focusTime, outOfOffice, birthday, or workingLocation events will result in an error.",
          "human_parameter_name": "RSVP Response",
          "human_parameter_description": "How you want to respond to this event as the signed-in user (accepted, tentative, declined, or needs action). This won't change other attendees. Only works for regular calendar events, not for special event types like focus time or out-of-office."
        },
        "attendees_omitted": {
          "type": "boolean",
          "title": "Attendees Omitted",
          "examples": [
            true,
            false
          ],
          "description": "Whether attendees may have been omitted from the event's representation."
        },
        "guests_can_modify": {
          "type": "boolean",
          "title": "Guests Can Modify",
          "examples": [
            true,
            false
          ],
          "description": "Whether attendees other than the organizer can modify the event (default: false)."
        },
        "anyone_can_add_self": {
          "type": "boolean",
          "title": "Anyone Can Add Self",
          "examples": [
            true,
            false
          ],
          "description": "Whether anyone can invite themselves to the event (default: false)."
        },
        "supports_attachments": {
          "type": "boolean",
          "title": "Supports Attachments",
          "examples": [
            true,
            false
          ],
          "description": "Client application supports event attachments. Set to `True` if so.",
          "human_parameter_name": "Supports Attachments",
          "human_parameter_description": "Let us know if your app can handle event attachments. Turn this on if you want to work with attached files."
        },
        "conference_data_version": {
          "type": "integer",
          "title": "Conference Data Version",
          "maximum": 1,
          "minimum": 0,
          "examples": [
            0,
            1
          ],
          "description": "API client's conference data support version. Set to 1 to manage conference details (e.g., Google Meet links); 0 (default) ignores conference data. Setting to 1 enables reading/preserving conference data but does not generate a new Meet link \u2014 use GOOGLECALENDAR_UPDATE_EVENT with `create_meeting_room=true` to create one.",
          "human_parameter_name": "Conference Data Version",
          "human_parameter_description": "Enable support for conference details like Google Meet links. Set to 1 to manage meeting links; leave blank to ignore."
        },
        "guests_can_invite_others": {
          "type": "boolean",
          "title": "Guests Can Invite Others",
          "examples": [
            true,
            false
          ],
          "description": "Whether attendees other than the organizer can invite others (default: true)."
        },
        "guests_can_see_other_guests": {
          "type": "boolean",
          "title": "Guests Can See Other Guests",
          "examples": [
            true,
            false
          ],
          "description": "Whether attendees can see who the event's attendees are (default: true)."
        }
      },
      "description": "Request model for patching a Google Calendar event.\n\nIMPORTANT API NOTES:\n- This action uses the events.patch endpoint, NOT events.list\n- Valid query params: sendUpdates, conferenceDataVersion, maxAttendees, supportsAttachments\n- Event times use 'start' and 'end' objects in the request body (each with dateTime/date and timeZone)\n- NEVER use 'timeMin' or 'timeMax' - those are events.list query parameters and will cause API errors"
    },
    "narrowed": [
      "source",
      "status",
      "reminders",
      "attachments",
      "conference_data",
      "extended_properties",
      "focus_time_properties",
      "out_of_office_properties",
      "working_location_properties"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "updateHint"
    ]
  },
  {
    "id": "google.calendar.events_move",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_EVENTS_MOVE",
    "kind": "send",
    "summary": "Move an event to another calendar.",
    "key_fields": [
      "calendar_id",
      "event_id",
      "destination"
    ],
    "input_schema": {
      "type": "object",
      "title": "EventsMoveRequest",
      "required": [
        "calendar_id",
        "event_id",
        "destination"
      ],
      "properties": {
        "event_id": {
          "type": "string",
          "title": "Event Id",
          "examples": [
            "7cbh8j70fer2s71jgm1bmeb0f1"
          ],
          "description": "Event identifier. To retrieve event identifiers call the events.list method.",
          "human_parameter_name": "Event ID",
          "human_parameter_description": "The unique ID of the event you want to move. You can get this from an event list or search."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "examples": [
            "primary"
          ],
          "description": "Calendar identifier of the source calendar. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar that currently owns the event. Enter its ID or use 'primary' for your main calendar so we know where to move the event from."
        },
        "destination": {
          "type": "string",
          "title": "Destination",
          "examples": [
            "secondaryCalendarId"
          ],
          "description": "Calendar identifier of the destination calendar. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "human_parameter_name": "Destination Calendar ID",
          "human_parameter_description": "The calendar you want to move the event to. Enter its ID or use 'primary' for your main calendar to make that calendar the new organizer."
        },
        "send_updates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string",
          "title": "SendUpdates",
          "examples": [
            "all",
            "externalOnly",
            "none"
          ],
          "description": "Options for who should receive notifications about event changes.",
          "human_parameter_name": "Send Updates",
          "human_parameter_description": "Choose who should receive email notifications about this change. Use 'all' to notify everyone, 'externalOnly' to notify non-Google guests only, or 'none' to send no notifications."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "updateHint"
    ]
  },
  {
    "id": "google.calendar.create_calendar",
    "toolkit": "GOOGLECALENDAR",
    "tool": "GOOGLECALENDAR_CREATE_CALENDAR",
    "kind": "change",
    "summary": "Create a new calendar.",
    "key_fields": [
      "summary"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateCalendarRequest",
      "required": [
        "summary"
      ],
      "properties": {
        "summary": {
          "type": "string",
          "title": "Summary",
          "examples": [
            "Team Events",
            "Project Deadlines",
            "Marketing Calendar"
          ],
          "minLength": 1,
          "description": "Title of the calendar. This is the name that will be displayed in Google Calendar."
        },
        "location": {
          "type": "string",
          "title": "Location",
          "examples": [
            "San Francisco, CA",
            "New York Office"
          ],
          "description": "Geographic location of the calendar as free-form text."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "examples": [
            "America/New_York",
            "Europe/London",
            "Asia/Tokyo"
          ],
          "description": "The time zone of the calendar, specified as an IANA Time Zone Database name (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). If not specified, defaults to UTC."
        },
        "description": {
          "type": "string",
          "title": "Description",
          "examples": [
            "Calendar for tracking team events and meetings"
          ],
          "description": "Description of the calendar. Provides additional context about the calendar's purpose."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint",
      "openWorldHint"
    ]
  },
  {
    "id": "google.drive.find_folder",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_FIND_FOLDER",
    "kind": "read",
    "summary": "Find folders in your Google Drive by name.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "FindFolderRequest",
      "properties": {
        "starred": {
          "type": "boolean",
          "title": "Starred",
          "description": "Set to true to search for folders that are starred, or false for those that are not.",
          "human_parameter_name": "Starred folders?",
          "human_parameter_description": "Choose whether to only include folders you've starred (true) or those you haven't (false). Leave blank to ignore this."
        },
        "page_size": {
          "type": "integer",
          "title": "Page Size",
          "default": 100,
          "maximum": 1000,
          "minimum": 1,
          "description": "The maximum number of folders to return in this call (1-1000). This action returns one page per call; use the response's nextPageToken to retrieve additional pages.",
          "human_parameter_name": "Page size",
          "human_parameter_description": "How many folders to return in this call. Use the next page token from the response to retrieve more."
        },
        "name_exact": {
          "type": "string",
          "title": "Name Exact",
          "examples": [
            "Project Alpha",
            "Q1 Financials",
            "Folder 8",
            "Report 2024"
          ],
          "description": "The exact name of the folder to search for as a string. This search is case-sensitive. Do not pass numbers - convert to string if needed.",
          "human_parameter_name": "Exact folder name",
          "human_parameter_description": "Type the folder's exact name if you know it. This matches the name exactly, including capitalization."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque token for the next page. Omit for the first page, then pass the previous response's nextPageToken unchanged to continue the same search.",
          "human_parameter_name": "Page token",
          "human_parameter_description": "Leave blank for the first page. To continue, paste the nextPageToken from the previous response without modifying it."
        },
        "name_contains": {
          "type": "string",
          "title": "Name Contains",
          "examples": [
            "report",
            "meeting notes",
            "2024",
            "project"
          ],
          "description": "A substring to search for within folder names as a string. This search is case-insensitive.",
          "human_parameter_name": "Substring for folder names",
          "human_parameter_description": "Enter a word or phrase that should appear in the folder name. Helpful when you're not sure of the full name."
        },
        "modified_after": {
          "type": "string",
          "title": "Modified After",
          "examples": [
            "2023-08-01T00:00:00Z"
          ],
          "description": "Search for folders modified after a specific date and time. The timestamp must be in RFC 3339 format (e.g., '2023-01-15T10:00:00Z' or '2023-01-15T10:00:00.000Z').",
          "human_parameter_name": "Modified after date",
          "human_parameter_description": "Only show folders updated after this date and time. Use a timestamp like 2023-01-15T10:00:00Z."
        },
        "parent_folder_id": {
          "type": "string",
          "title": "Parent Folder Id",
          "examples": [
            "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
            "0B1234567890abcdefg"
          ],
          "description": "The ID of the parent folder to search within. Only folders directly inside this parent folder will be returned. You can find parent folder IDs by first searching for the parent folder by name. Supports folders in both My Drive and Shared Drives.",
          "human_parameter_name": "Parent folder ID",
          "human_parameter_description": "Search only within a specific parent folder. Paste the ID of the parent folder you want to look inside."
        },
        "name_not_contains": {
          "type": "string",
          "title": "Name Not Contains",
          "examples": [
            "archive",
            "old",
            "backup",
            "temp"
          ],
          "description": "A substring to exclude from folder names as a string. Folders with names containing this substring will not be returned. This search is case-insensitive.",
          "human_parameter_name": "Substring to exclude from folder names",
          "human_parameter_description": "Enter a word or phrase that must not appear in the folder name. Use this to filter out folders like 'archive' or 'old'."
        },
        "full_text_contains": {
          "type": "string",
          "title": "Full Text Contains",
          "examples": [
            "confidential project details",
            "keyword"
          ],
          "description": "A string to search for within the folder's name or description (NOT the content of files inside the folder). This search is case-insensitive. Note: Google Drive's fullText search on folders only matches the folder's own metadata, not files contained within.",
          "human_parameter_name": "Substring for folder name/description",
          "human_parameter_description": "Enter words that should appear in the folder's name or description. Note: This does NOT search inside files within the folder."
        },
        "full_text_not_contains": {
          "type": "string",
          "title": "Full Text Not Contains",
          "examples": [
            "draft",
            "internal use only"
          ],
          "description": "A string to exclude from the folder's name or description (NOT the content of files inside the folder). This search is case-insensitive. Note: Google Drive's fullText search on folders only matches the folder's own metadata, not files contained within.",
          "human_parameter_name": "Substring to exclude from folder name/description",
          "human_parameter_description": "Enter words that should NOT appear in the folder's name or description. Note: This does NOT search inside files within the folder."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.list_children_v2",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_LIST_CHILDREN_V2",
    "kind": "read",
    "summary": "List what is inside one Drive folder.",
    "key_fields": [
      "folderId"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListChildrenV2Request",
      "required": [
        "folderId"
      ],
      "properties": {
        "q": {
          "type": "string",
          "title": "Q",
          "description": "Query string for searching children."
        },
        "fields": {
          "type": "string",
          "title": "Fields",
          "description": "Selector specifying which fields to include in a partial response. This endpoint returns ChildReference objects, NOT full File objects. Valid ChildReference fields are: 'id' (child ID), 'selfLink' (link to this reference), 'kind' (resource type), 'childLink' (link to the child). File-level fields like 'title', 'modifiedDate', 'fileSize', 'alternateLink', 'mimeType' are NOT valid. Example: 'items(id,childLink),nextPageToken'"
        },
        "orderBy": {
          "type": "string",
          "title": "Order By",
          "description": "A comma-separated list of sort keys. Valid keys are 'createdDate', 'folder', 'lastViewedByMeDate', 'modifiedByMeDate', 'modifiedDate', 'quotaBytesUsed', 'recency', 'sharedWithMeDate', 'starred', and 'title'. Each key sorts ascending by default, but may be reversed with the 'desc' modifier. Example usage: ?orderBy=folder,modifiedDate desc,title."
        },
        "folderId": {
          "type": "string",
          "title": "Folder Id",
          "examples": [
            "root",
            "1xygSVDktMDb4chxS3AQTMzABKWYdWtOB"
          ],
          "description": "The ID of the folder."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "Page token for children."
        },
        "maxResults": {
          "type": "integer",
          "title": "Max Results",
          "description": "Maximum number of children to return."
        }
      }
    },
    "narrowed": [
      "alt",
      "key",
      "xgafv",
      "callback",
      "quotaUser",
      "uploadType",
      "oauth_token",
      "prettyPrint",
      "access_token",
      "upload_protocol"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.get_about",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_GET_ABOUT",
    "kind": "read",
    "summary": "Read your Drive account and storage use.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetAboutRequest",
      "properties": {
        "fields": {
          "type": "string",
          "title": "Fields",
          "default": "*",
          "examples": [
            "*",
            "user,storageQuota",
            "user,storageQuota,kind"
          ],
          "description": "A comma-separated list of fields to include in the response. Use `*` to include all fields. Supported fields in Drive API v3: kind, user, storageQuota, importFormats, exportFormats, maxImportSizes, maxUploadSize, appInstalled, canCreateDrives, canCreateTeamDrives (deprecated), driveThemes, teamDriveThemes (deprecated), folderColorPalette. Note: rootFolderId was removed in v3 and is not supported. Note: storageQuota sub-fields (limit, usage, usageInDrive, usageInDriveTrash) are returned as strings representing bytes \u2014 convert to numeric types before arithmetic.",
          "human_parameter_name": "Fields to include",
          "human_parameter_description": "Choose which details you want returned. Use '*' to include everything, or provide a comma-separated list of supported fields. Supported fields: kind, user, storageQuota, importFormats, exportFormats, maxImportSizes, maxUploadSize, appInstalled, canCreateDrives, driveThemes, folderColorPalette."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.list_comments",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_LIST_COMMENTS",
    "kind": "read",
    "summary": "List the comments on one Drive file.",
    "key_fields": [
      "fileId"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListCommentsRequest",
      "required": [
        "fileId"
      ],
      "properties": {
        "fields": {
          "type": "string",
          "title": "Fields",
          "default": "*",
          "examples": [
            "*",
            "comments(id,content,author)"
          ],
          "description": "A comma-separated list of fields to include in the response. Use `*` to include all fields. Prefer selective field masks (e.g., 'comments(id,content,author)') over '*' to reduce payload size and latency.",
          "human_parameter_name": "Fields",
          "human_parameter_description": "Choose which comment details to return. Use '*' to include everything, or specify only the fields you need."
        },
        "fileId": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "1234567890abcdefghijklmnopqrstuvwxyz"
          ],
          "description": "The ID of the file. Equivalent to the Google Docs document_id; pass it here under the fileId parameter name.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The unique ID of the Google Drive file whose comments you want to list. You can copy this from the file's URL."
        },
        "pageSize": {
          "type": "integer",
          "title": "Page Size",
          "default": 20,
          "maximum": 100,
          "minimum": 1,
          "description": "The maximum number of comments to return per page.",
          "human_parameter_name": "Page size",
          "human_parameter_description": "How many comments to return in one page of results. Larger numbers show more at once (maximum 100)."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "The token for continuing a previous list request on the next page. This should be set to the value of 'nextPageToken' from the previous response. Comments may be added or modified during pagination on active files; use startModifiedTime to bound the window if consistency is required.",
          "human_parameter_name": "Page token",
          "human_parameter_description": "If you're continuing from a previous list, paste the nextPageToken from that response to get the next page."
        },
        "includeDeleted": {
          "type": "boolean",
          "title": "Include Deleted",
          "default": false,
          "description": "Whether to include deleted comments. Deleted comments will not include their original content.",
          "human_parameter_name": "Include deleted comments?",
          "human_parameter_description": "Choose whether to include comments that were deleted. Deleted comments will appear without their original text."
        },
        "startModifiedTime": {
          "type": "string",
          "title": "Start Modified Time",
          "description": "The minimum value of 'modifiedTime' for the result comments (RFC 3339 date-time).",
          "human_parameter_name": "Start modified time",
          "human_parameter_description": "Only show comments updated on or after this date and time. Helpful for fetching recent changes."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.get_comment",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_GET_COMMENT",
    "kind": "read",
    "summary": "Read one comment on a Drive file.",
    "key_fields": [
      "fileId",
      "commentId"
    ],
    "input_schema": {
      "type": "object",
      "title": "GetCommentRequest",
      "required": [
        "fileId",
        "commentId"
      ],
      "properties": {
        "fileId": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "1a2b3c4d5e6f7g8h9i0j"
          ],
          "description": "The ID of the file.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The unique ID of the Google Drive file that contains the comment you want to view. You can copy it from the file's URL."
        },
        "commentId": {
          "type": "string",
          "title": "Comment Id",
          "examples": [
            "11a22b33c44d55e66f77g88h99i00j"
          ],
          "description": "The ID of the comment.",
          "human_parameter_name": "Comment ID",
          "human_parameter_description": "The unique ID of the comment you want to retrieve. You can get this from a previous comments list or when viewing the comment in Drive."
        },
        "includeDeleted": {
          "type": "boolean",
          "title": "Include Deleted",
          "description": "Whether to return deleted comments. Deleted comments will not include their original content.",
          "human_parameter_name": "Include deleted comments?",
          "human_parameter_description": "Choose whether to include comments that were deleted. Useful if you need the full discussion history; deleted comments won't show their original text."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.list_replies",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_LIST_REPLIES",
    "kind": "read",
    "summary": "List the replies to one comment on a Drive file.",
    "key_fields": [
      "file_id",
      "comment_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListRepliesRequest",
      "required": [
        "file_id",
        "comment_id"
      ],
      "properties": {
        "fields": {
          "type": "string",
          "title": "Fields",
          "default": "*",
          "description": "Selector specifying which fields to include in a partial response. Use '*' for all fields or e.g. 'replies(id,content),nextPageToken'",
          "human_parameter_name": "Fields",
          "human_parameter_description": "Choose which details to include in the results. Leave as '*' to get everything, or specify only what you need to keep responses smaller."
        },
        "file_id": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "12345abcdef"
          ],
          "description": "The ID of the file.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The ID of the file whose comment replies you want to list. You can copy this from the file's URL in Google Drive."
        },
        "page_size": {
          "type": "integer",
          "title": "Page Size",
          "maximum": 100,
          "minimum": 1,
          "description": "The maximum number of replies to return per page.",
          "human_parameter_name": "Page size",
          "human_parameter_description": "How many replies to return per page. Use a smaller number for quicker responses or a larger number to see more at once (up to 100)."
        },
        "comment_id": {
          "type": "string",
          "title": "Comment Id",
          "examples": [
            "67890ghijkl"
          ],
          "description": "The ID of the comment.",
          "human_parameter_name": "Comment ID",
          "human_parameter_description": "The specific comment on the file whose replies you want to retrieve. You can get this from a previous comment list or from the comment's link."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "The token for continuing a previous list request on the next page. This should be set to the value of 'nextPageToken' from the previous response.",
          "human_parameter_name": "Page token",
          "human_parameter_description": "If you're continuing from a previous page, paste the nextPageToken you received to keep going. Leave blank to start from the beginning."
        },
        "include_deleted": {
          "type": "boolean",
          "title": "Include Deleted",
          "default": false,
          "description": "Whether to include deleted replies. Deleted replies will not include their original content.",
          "human_parameter_name": "Include deleted replies?",
          "human_parameter_description": "Choose whether to include replies that were deleted. This can help you see the full history, but the deleted replies won't show their original text."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.list_revisions",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_LIST_REVISIONS",
    "kind": "read",
    "summary": "List the saved versions of one Drive file.",
    "key_fields": [
      "fileId"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListRevisionsRequest",
      "required": [
        "fileId"
      ],
      "properties": {
        "fileId": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "1234567890abcdefghijklmnopqrstuvwxyz"
          ],
          "description": "The ID of the file.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The unique ID of the Google Drive file whose revisions you want to view. You can copy this from the file's URL."
        },
        "pageSize": {
          "type": "integer",
          "title": "Page Size",
          "maximum": 1000,
          "minimum": 1,
          "examples": [
            100
          ],
          "description": "The maximum number of revisions to return per page.",
          "human_parameter_name": "Maximum number of revisions to return",
          "human_parameter_description": "How many revisions to show at once. Choose a smaller number for easier browsing or a larger number to see more results per page."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "examples": [
            "abcdef123456"
          ],
          "description": "The token for continuing a previous list request on the next page. This should be set to the value of 'nextPageToken' from the previous response. Continue paginating until `nextPageToken` is absent; stopping early silently omits revisions.",
          "human_parameter_name": "Page token for next page",
          "human_parameter_description": "If you're continuing from a previous list, paste the next page token you received to load the following set of revisions. Leave blank to start from the first page."
        }
      }
    },
    "narrowed": [
      "supportsAllDrives"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.list_shared_drives",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_LIST_SHARED_DRIVES",
    "kind": "read",
    "summary": "List the shared drives you belong to.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListSharedDrivesRequest",
      "properties": {
        "q": {
          "type": "string",
          "title": "Q",
          "description": "Query string for searching shared drives using Google Drive query syntax (e.g., \"name contains 'ProjectX'\" or \"createdTime > '2023-01-01T00:00:00'\"). Query format: query_term operator values. Common query terms: name, createdTime, memberCount, organizerCount, hidden. Common operators: contains, =, >, <, >=, !=. String values must be enclosed in single quotes. Special characters (apostrophes, backslashes) must be escaped. Multiple terms can be combined with 'and'/'or' operators and parentheses for grouping.",
          "human_parameter_name": "Search query",
          "human_parameter_description": "A search query using Google Drive's query syntax to filter shared drives. Format: query_term operator values. Examples: \"name contains 'Marketing'\" to find drives with 'Marketing' in the name, or \"hidden = false\" to show only visible drives. Leave blank to see all drives you have access to."
        },
        "fields": {
          "type": "string",
          "title": "Fields",
          "examples": [
            "nextPageToken,drives(id,name,hidden,createdTime)"
          ],
          "description": "FieldMask selecting the shared-drive list fields to return. Use comma-separated fields and parentheses for nested drive fields, for example 'nextPageToken,drives(id,name,hidden,createdTime)'. Leave blank for Google's default fields; use '*' only when every field is necessary because it increases response size.",
          "human_parameter_name": "Fields",
          "human_parameter_description": "Choose exactly which shared-drive fields Google returns. For example, use 'drives(id,name)' for a compact listing."
        },
        "pageSize": {
          "type": "integer",
          "title": "Page Size",
          "maximum": 100,
          "minimum": 1,
          "description": "Maximum number of shared drives to return per page. Maximum allowed value is 1000. Paginate by passing the returned nextPageToken back as pageToken until no nextPageToken is returned to avoid silently missing drives.",
          "human_parameter_name": "Page size",
          "human_parameter_description": "How many shared drives to show in one page of results. Choose a smaller number for quicker previews or the maximum (up to 100) to see more at once."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "Page token for shared drives.",
          "human_parameter_name": "Page token",
          "human_parameter_description": "Use this token to continue from where the last page left off. You usually get it from a previous list call when there are more results."
        }
      }
    },
    "narrowed": [
      "useDomainAdminAccess"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "google.drive.create_folder",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_CREATE_FOLDER",
    "kind": "change",
    "summary": "Create a folder in your Google Drive.",
    "key_fields": [
      "name"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateFolderRequest",
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string",
          "title": "Name",
          "examples": [
            "Project Files",
            "Documents",
            "Reports"
          ],
          "description": "Name for the new folder. This is a required field.",
          "human_parameter_description": "The name you want to give the new folder. Choose a clear, descriptive name so you can find it easily later."
        },
        "parent_id": {
          "type": "string",
          "title": "Parent Id",
          "examples": [
            "1A2b3C4d5E6fG7h8I9j0KlMNOPqRstUVW",
            "Existing Parent Folder Name"
          ],
          "description": "ID or exact name of an EXISTING parent folder. IMPORTANT: The parent folder MUST already exist - this action will NOT create parent folders automatically. If you need to create nested folders, first use GOOGLEDRIVE_FIND_FOLDER to verify the parent exists, or create it with a separate call. If a name is provided, the action searches for a folder with that exact name. If omitted, the folder is created in the Drive root. Must be non-trashed, accessible, and an actual folder (not a file) \u2014 shared drive root IDs are not valid. Use GOOGLEDRIVE_FIND_FOLDER to verify before calling.",
          "human_parameter_name": "Parent folder ID or name",
          "human_parameter_description": "The folder to place the new folder inside. The parent folder must already exist. Provide a Google Drive folder ID (not a shared drive ID) or the exact folder name; leave blank to create it in My Drive. If unsure whether the folder exists, use GOOGLEDRIVE_FIND_FOLDER first."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint",
      "openWorldHint"
    ]
  },
  {
    "id": "google.drive.create_file_from_text",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
    "kind": "change",
    "summary": "Create a Drive file from text you give.",
    "key_fields": [
      "file_name",
      "text_content"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateFileFromTextRequest",
      "required": [
        "file_name",
        "text_content"
      ],
      "properties": {
        "file_name": {
          "type": "string",
          "title": "File Name",
          "examples": [
            "meeting_notes.txt",
            "My New Document"
          ],
          "description": "Required. Desired name for the new file on Google Drive. Also accepts 'title' or 'name' as aliases.",
          "human_parameter_name": "File name",
          "human_parameter_description": "What you want the file to be called in Google Drive. Choose a clear name so you can easily find it later."
        },
        "mime_type": {
          "type": "string",
          "title": "Mime Type",
          "default": "text/plain",
          "examples": [
            "text/plain",
            "application/vnd.google-apps.document",
            "application/vnd.google-apps.spreadsheet",
            "application/vnd.google-apps.presentation"
          ],
          "description": "MIME type for the new file, determining how Google Drive interprets its content. Must exactly match the content type \u2014 a mismatched value (e.g., `text/plain` for HTML) breaks Drive previews and downstream conversion.",
          "human_parameter_name": "MIME type",
          "human_parameter_description": "The kind of file you want to create (for example, plain text, Google Doc, Sheet, or Slides). If you're unsure, keep text/plain for a simple text file."
        },
        "parent_id": {
          "type": "string",
          "title": "Parent Id",
          "examples": [
            "1KMXpS5g9N04W44_1T7_IDN18V8x00AKE",
            "0AGr3s6kL3rIuUk9PVA"
          ],
          "description": "IMPORTANT: Must be a valid Google Drive folder ID that exists and you have access to. Do NOT pass folder names - only folder IDs work. If omitted, the file is created in the root of 'My Drive'. To get a folder ID from a folder name, use GOOGLEDRIVE_FIND_FOLDER first. Also accepts 'folder_id' or 'parent_folder_id' as aliases.",
          "human_parameter_name": "Parent folder ID",
          "human_parameter_description": "The folder where you want the file to be created. Leave this blank to save it to My Drive. IMPORTANT: You must provide a valid folder ID (not folder name). Use GOOGLEDRIVE_FIND_FOLDER to get the folder ID if you only know the folder name."
        },
        "text_content": {
          "type": "string",
          "title": "Text Content",
          "description": "Required. Plain text content to be written into the new file. Also accepts 'content', 'body', or 'text' as aliases. Only the documented aliases (`content`, `body`, `text`) are accepted; undocumented keys like `file_content` cause an 'Invalid request data' error. Must be UTF-8 encoded.",
          "human_parameter_name": "Text content",
          "human_parameter_description": "The actual text you want saved in the new file. Paste or type the content you'd like to store."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint",
      "openWorldHint"
    ]
  },
  {
    "id": "google.drive.create_comment",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_CREATE_COMMENT",
    "kind": "change",
    "summary": "Add a comment to a Drive file.",
    "key_fields": [
      "file_id",
      "content"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateCommentRequest",
      "required": [
        "file_id",
        "content"
      ],
      "properties": {
        "anchor": {
          "type": "string",
          "title": "Anchor",
          "examples": [
            "{\"region\": {\"kind\": \"drive#commentRegion\", \"line\": 12, \"rev\": \"head\"}}",
            "{\"region\": {\"kind\": \"drive#commentRegion\", \"page\": {\"p\": 0}, \"rev\": \"head\"}}",
            "{\"region\": {\"kind\": \"drive#commentRegion\", \"txt\": {\"o\": 100, \"l\": 50}, \"rev\": \"head\"}}"
          ],
          "description": "A JSON string defining the region of the document to which the comment is anchored. Format: {\"region\": {\"kind\": \"drive#commentRegion\", \"<classifier>\": <value>, \"rev\": \"head\"}}. Supported classifiers: (1) \"line\" for text lines (e.g., \"line\": 12), (2) \"page\" for page numbers (e.g., \"page\": {\"p\": 0}), (3) \"txt\" for text ranges (e.g., \"txt\": {\"o\": 100, \"l\": 50}), (4) \"rect\" for rectangles in images (e.g., \"rect\": {\"x\": 10, \"y\": 20, \"w\": 100, \"h\": 50}), (5) \"time\" for video timestamps (e.g., \"time\": {\"t\": \"00:01:30\"}), (6) \"matrix\" for spreadsheet cells (e.g., \"matrix\": {\"c\": 2, \"r\": 5}). Note: On blob files, only unanchored comments are supported. Google Workspace editors may treat API-set anchors as unanchored.",
          "human_parameter_name": "Anchor location",
          "human_parameter_description": "Optional: A JSON string specifying the region in the document to anchor the comment to. Use different classifiers for different file types: 'line' for text documents, 'page' for PDFs, 'matrix' for spreadsheets, 'rect' for images, 'time' for videos, or 'txt' for text ranges. Note: Anchors may not display correctly in Google Workspace editors."
        },
        "content": {
          "type": "string",
          "title": "Content",
          "examples": [
            "This is a great document!"
          ],
          "description": "The plain text content of the comment.",
          "human_parameter_name": "Comment content",
          "human_parameter_description": "Write the message you want to post as a comment on the file."
        },
        "file_id": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "1a2b3c4d5e6f7g8h9i0j"
          ],
          "description": "The ID of the file. The `id` field from GOOGLEDOCS_SEARCH_DOCUMENTS results can be used directly without conversion.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The identifier of the Google Drive file you want to comment on. You can copy it from the file's URL."
        },
        "quoted_file_content_value": {
          "type": "string",
          "title": "Quoted File Content Value",
          "examples": [
            "This is the text to quote."
          ],
          "description": "The quoted content itself.",
          "human_parameter_name": "Quoted content value",
          "human_parameter_description": "Optional: the exact text you want to quote in your comment."
        },
        "quoted_file_content_mime_type": {
          "type": "string",
          "title": "Quoted File Content Mime Type",
          "examples": [
            "text/plain"
          ],
          "description": "The MIME type of the quoted content.",
          "human_parameter_name": "Quoted content MIME type",
          "human_parameter_description": "If you're quoting part of the file, specify the format of that snippet (for example, text/plain)."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint"
    ]
  },
  {
    "id": "google.drive.create_reply",
    "toolkit": "GOOGLEDRIVE",
    "tool": "GOOGLEDRIVE_CREATE_REPLY",
    "kind": "change",
    "summary": "Reply to a comment on a Drive file.",
    "key_fields": [
      "file_id",
      "comment_id",
      "content"
    ],
    "input_schema": {
      "type": "object",
      "title": "CreateReplyRequest",
      "required": [
        "file_id",
        "comment_id",
        "content"
      ],
      "properties": {
        "action": {
          "enum": [
            "resolve",
            "reopen"
          ],
          "type": "string",
          "title": "Action",
          "examples": [
            "resolve"
          ],
          "description": "The action the reply performed to the parent comment.",
          "human_parameter_name": "Reply Action",
          "human_parameter_description": "Choose if this reply should also change the comment\u2019s status, like marking it resolved or reopening it. Leave blank if you\u2019re just replying without changing the status."
        },
        "fields": {
          "type": "string",
          "title": "Fields",
          "examples": [
            "id,content"
          ],
          "description": "Selector specifying which fields to include in a partial response.",
          "human_parameter_name": "Partial Fields",
          "human_parameter_description": "Optional: choose which details you want returned (e.g., 'id,content') to keep the response concise. Leave empty to include the common reply details."
        },
        "content": {
          "type": "string",
          "title": "Content",
          "examples": [
            "Thanks for the feedback!"
          ],
          "description": "The plain text content of the reply. HTML content is not supported.",
          "human_parameter_name": "Reply Content",
          "human_parameter_description": "What you want to say in your reply, written as plain text. This will appear under the selected comment in Google Drive."
        },
        "file_id": {
          "type": "string",
          "title": "File Id",
          "examples": [
            "1234567890abcdefghijklmnopqrstuvwxyz"
          ],
          "description": "The ID of the file.",
          "human_parameter_name": "File ID",
          "human_parameter_description": "The unique ID of the file that contains the comment you want to reply to. You can copy this from the file\u2019s URL in Google Drive."
        },
        "comment_id": {
          "type": "string",
          "title": "Comment Id",
          "examples": [
            "0987654321zyxwutsrqponmlkjihgfedcba"
          ],
          "description": "The ID of the comment.",
          "human_parameter_name": "Comment ID",
          "human_parameter_description": "The identifier of the specific comment you\u2019re replying to on the file. You can get this from a previous comment list or from the comment\u2019s link."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "createHint"
    ]
  },
  {
    "id": "microsoft.outlook.list_mail_folders",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_LIST_MAIL_FOLDERS",
    "kind": "read",
    "summary": "List your Outlook mail folders.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListMailFoldersRequest",
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "minimum": 1,
          "examples": [
            10,
            50,
            100
          ],
          "description": "Maximum number of items to return per page.",
          "human_parameter_name": "Page Size",
          "human_parameter_description": "Set the maximum number of mail folders to return in a single request. Useful for controlling response size and implementing pagination."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "minimum": 0,
          "examples": [
            0,
            10,
            20
          ],
          "description": "Number of items to skip before returning results.",
          "human_parameter_name": "Skip Count",
          "human_parameter_description": "Skip the first N mail folders in the result set. Use with 'top' parameter to implement manual pagination."
        },
        "count": {
          "type": "boolean",
          "title": "Count",
          "examples": [
            true,
            false
          ],
          "description": "Include total count of matching items in the response.",
          "human_parameter_name": "Include Count",
          "human_parameter_description": "When enabled, the response includes the total count of mail folders in the '@odata.count' property."
        },
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "displayName eq 'Inbox'",
            "isHidden eq false",
            "totalItemCount gt 0"
          ],
          "description": "OData filter expression to filter mail folders. String values must be enclosed in single quotes (e.g., displayName eq 'Inbox'). WARNING: Microsoft Graph API does not officially document which mailFolder properties support filtering. Known unsupported properties: parentFolderId (causes ErrorInvalidProperty error). To filter by parent folder, use the child folders endpoint instead: GET /me/mailFolders/{parentFolderId}/childFolders. Properties like isHidden may work but are not guaranteed.",
          "human_parameter_name": "Filter Expression",
          "human_parameter_description": "Filter mail folders using OData syntax. CRITICAL: String values must be enclosed in single quotes, like displayName eq 'Inbox' (not double quotes). IMPORTANT: The API does NOT support filtering by 'parentFolderId' - this will cause an error. To get folders under a specific parent, use the 'List Child Mail Folders' action instead with the parent folder ID. Most mailFolder properties are not documented as filterable, so filtering may fail unexpectedly."
        },
        "orderby": {
          "type": "string",
          "title": "Orderby",
          "examples": [
            "displayName",
            "displayName desc",
            "totalItemCount desc"
          ],
          "description": "Property to sort by, optionally followed by 'asc' or 'desc'.",
          "human_parameter_name": "Order By",
          "human_parameter_description": "Sort the results by a property (e.g., 'displayName' or 'totalItemCount desc')."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        },
        "include_hidden_folders": {
          "type": "boolean",
          "title": "Include Hidden Folders",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "Include hidden mail folders (isHidden=true) when set to true.",
          "human_parameter_name": "Include Hidden Folders",
          "human_parameter_description": "Choose whether to include folders that are normally hidden. Turn this on if you want to see system or special folders that don't usually appear."
        }
      },
      "description": "Request parameters for listing mail folders in a user's mailbox."
    },
    "narrowed": [
      "select",
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.list_mail_folder_messages",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_LIST_MAIL_FOLDER_MESSAGES",
    "kind": "read",
    "summary": "List the messages in one Outlook folder.",
    "key_fields": [
      "mail_folder_id"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListMailFolderMessagesRequest",
      "required": [
        "mail_folder_id"
      ],
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "default": 10,
          "examples": [
            10,
            50,
            100
          ],
          "description": "Maximum number of messages to return per request (1-1000). To page through more, use the `next_page_token` from the response (pass it back as `page_token`)."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "default": 0,
          "examples": [
            0,
            10,
            20
          ],
          "description": "Number of messages to skip from the beginning of the result set, for pagination."
        },
        "expand": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Expand",
          "examples": [
            [
              "attachments"
            ],
            [
              "attachments($select=id,name,size)"
            ]
          ],
          "description": "List of message navigation properties to include inline using OData $expand. Use Graph expansion expressions such as 'attachments' or 'attachments($select=id,name,size,contentType,isInline)'. Regular message properties belong in select, not expand."
        },
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "isRead eq false",
            "from/emailAddress/address eq 'sender@example.com'",
            "receivedDateTime ge 2023-01-01T00:00:00Z"
          ],
          "description": "OData $filter query to filter messages. CRITICAL: String literals MUST use single quotes ('), not double quotes (\"). Examples: 'isRead eq false', 'from/emailAddress/address eq 'sender@example.com'', 'receivedDateTime ge 2023-01-01T00:00:00Z', 'hasAttachments eq true'. IMPORTANT: Complex filters (multiple 'contains()' operations, OR clauses, or nested properties like 'from/emailAddress/address') CANNOT be combined with 'orderby' - Microsoft Graph will reject such requests with InefficientFilter error. When using complex filters, you MUST either: (1) omit 'orderby' and sort results client-side, or (2) simplify the filter to basic equality/comparison operations."
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Select",
          "examples": [
            [
              "id",
              "subject",
              "from",
              "receivedDateTime"
            ]
          ],
          "description": "List of message properties to include in the response. OData $select parameter. Valid properties include: id, subject, from, toRecipients, receivedDateTime, sentDateTime, hasAttachments, importance, isRead, body, bodyPreview, categories, conversationId."
        },
        "orderby": {
          "type": "string",
          "title": "Orderby",
          "examples": [
            "receivedDateTime desc",
            "subject asc"
          ],
          "description": "Property to sort results by with direction. OData $orderby parameter. Example: 'receivedDateTime desc' or 'subject asc'. IMPORTANT: Cannot be used with complex 'filter' queries (multiple 'contains()' operations, OR clauses, or nested properties like 'from/emailAddress/address') - Microsoft Graph will reject such combinations with InefficientFilter error. For complex filters, omit this parameter and sort results client-side."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        },
        "mail_folder_id": {
          "type": "string",
          "title": "Mail Folder Id",
          "examples": [
            "inbox",
            "AAMkAGI0ZjExAAA=",
            "sentitems"
          ],
          "description": "The ID or well-known name of the mail folder from which to retrieve messages. ONLY these specific well-known names are valid as string names: 'inbox', 'drafts', 'sentitems', 'deleteditems', 'junkemail', 'archive', 'outbox', 'clutter', 'conflicts', 'conversationhistory', 'localfailures', 'msgfolderroot', 'recoverableitemsdeletions', 'scheduled', 'searchfolders', 'serverfailures', 'syncissues'. Arbitrary folder names (e.g., 'workjournal') are NOT valid. If the folder is not one of these well-known names, you MUST use the actual folder ID - a base64-encoded string (e.g., 'AAMkAGI0ZjExAAA=') obtained from OUTLOOK_LIST_MAIL_FOLDERS or OUTLOOK_LIST_CHILD_MAIL_FOLDERS."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, retrieves and normalizes Microsoft Purview sensitivity labels in the same Graph request. Requires Mail.Read. Treat status unknown as fail-closed. Preserved in next_page_token."
        }
      },
      "description": "Request parameters for listing messages in a specific mail folder (including subfolders)."
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.search_messages",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_SEARCH_MESSAGES",
    "kind": "read",
    "summary": "Search your Outlook mail.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "SearchMessagesRequest",
      "properties": {
        "size": {
          "type": "integer",
          "title": "Size",
          "default": 25,
          "maximum": 25,
          "minimum": 1,
          "description": "Number of search results to return per page (1-25). Note: For message entity, max size is 25. Also, from_index + size cannot exceed 1000 (API pagination window limit).",
          "human_parameter_name": "Page Size",
          "human_parameter_description": "How many results to return per page. Use a larger number to see more results at once."
        },
        "query": {
          "type": "string",
          "title": "Query",
          "default": "",
          "examples": [
            "project report",
            "from:manager@example.com AND subject:budget",
            "to:info@jcdn.nl AND (subject:toegangscontrole OR subject:beveiligingspoorten)",
            "received>=2025-10-01 AND received<=2025-10-31",
            "received>today-30 AND hasattachment:yes",
            "from:example.com AND subject:invoice AND received:2025-10",
            "to:team@example.com AND received>=2025-10-01",
            "cc:manager@example.com OR to:manager@example.com"
          ],
          "description": "KQL (Keyword Query Language) search query string. Supports advanced syntax for precise searches.\n\n**Basic Syntax:**\n- Simple keywords: 'budget report'\n- Exact phrases: '\"quarterly review\"'\n- Boolean operators: 'urgent AND deadline' or 'invoice OR receipt'\n\n**Property Filters (prefix:value):**\n- from: Sender email - 'from:user@example.com' or 'from:example.com'\n- to: Recipient email - 'to:info@jcdn.nl'\n- cc: CC recipient - 'cc:manager@example.com'\n- subject: Subject line - 'subject:invoice'\n- received: Date received - 'received:2025-10-01' or 'received>=2025-10-01'\n- sent: Date sent - 'sent:2025-10-01' or 'sent>=2025-10-01'\n- hasattachment: Has files - 'hasattachment:yes' or 'hasattachment:no'\n\n**REQUIRED**: For a first page, provide this query parameter OR one of the legacy filters (fromEmail, subject, hasAttachments). For a continuation page, provide page_token.",
          "human_parameter_name": "Search Query",
          "human_parameter_description": "What you want to search for in your mailbox. You can type simple words or use filters like from:, to:, subject:, received:, and hasattachment: to narrow the results."
        },
        "region": {
          "type": "string",
          "title": "Region",
          "examples": [
            "US",
            "EU",
            "GB"
          ],
          "description": "Geographic region for the search query. ONLY required when using application permissions (S2S authentication). DO NOT use with delegated permissions (user authentication) - the API will reject the request. Common values: 'US', 'EU', 'GB', 'JP', 'CN', 'IN', 'CA', 'AU', 'BR', 'RU'. Leave unset (None) for delegated permissions.",
          "human_parameter_name": "Region",
          "human_parameter_description": "Geographic region for search (only for application permissions). Leave empty for user authentication."
        },
        "subject": {
          "type": "string",
          "title": "Subject",
          "examples": [
            "Project Update",
            "Budget Proposal Q4",
            "Action Required: Review Document"
          ],
          "description": "Text to search for within the message subject line. Legacy parameter - prefer using 'subject:text' in the query parameter for more control. When combined with query, this filter is joined using AND. If query contains OR operators, the query is wrapped in parentheses to preserve precedence. Example: Instead of subject='invoice', use query='subject:invoice AND received>=2025-10-01'",
          "human_parameter_name": "Subject Text",
          "human_parameter_description": "Words to look for in the email subject line. Helpful when you remember part of the subject you're trying to find."
        },
        "fromEmail": {
          "type": "string",
          "title": "From Email",
          "examples": [
            "manager@example.com",
            "example.com",
            "contact@partner.com"
          ],
          "description": "Filter messages by sender email address or domain. Supports exact email ('user@example.com') or domain matching ('example.com'). Legacy parameter - prefer using 'from:email@example.com' in the query parameter for more flexibility. When combined with query, this filter is joined using AND. If query contains OR operators, the query is wrapped in parentheses to preserve precedence.",
          "human_parameter_name": "Sender Email",
          "human_parameter_description": "The sender's email address or domain to filter by. Use this to only see messages from a specific person or company."
        },
        "from_index": {
          "type": "integer",
          "title": "From Index",
          "default": 0,
          "maximum": 999,
          "minimum": 0,
          "description": "The 0-based starting index for Microsoft Search API pagination (max 999). Note: from_index + size cannot exceed 1000 (API pagination window limit). To paginate: check response['value'][0]['hitsContainers'][0]['moreResultsAvailable']. For Microsoft Search API results, if true, call again with from_index += size (e.g., 0 \u2192 25 \u2192 50). For Messages API fallback results, pass the response's next_page_token as page_token instead.",
          "human_parameter_name": "From Index",
          "human_parameter_description": "Where to start for Microsoft Search API results. For Messages API fallback results, use the returned page token instead."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next Messages API fallback page. Omit for the first page; then pass back the next_page_token from the previous response, unmodified. Do not construct or edit it. When set, it preserves the original mailbox, query, and page size. Also resend the original user_id for a shared mailbox so connection requirements can be evaluated correctly."
        },
        "hasAttachments": {
          "type": "boolean",
          "title": "Has Attachments",
          "description": "Filters messages based on the presence of attachments. Legacy parameter - prefer using 'hasattachment:yes' or 'hasattachment:no' in the query parameter. When combined with query, this filter is joined using AND. If query contains OR operators, the query is wrapped in parentheses to preserve precedence.",
          "human_parameter_name": "Has Attachments",
          "human_parameter_description": "Choose whether to only show emails that include file attachments. Turn on to find messages with attachments, or off to exclude them."
        },
        "enable_top_results": {
          "type": "boolean",
          "title": "Enable Top Results",
          "default": false,
          "description": "If `true`, sorts results by relevance; otherwise, sorts by date in descending order (newest first).",
          "human_parameter_name": "Enable Top Results",
          "human_parameter_description": "Show the most relevant results first instead of the newest. Turn this on when relevance matters more than date."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, hydrates each search hit's Microsoft Purview sensitivity label through Graph JSON batches capped at 20 requests per batch. Requires Mail.Read or Mail.ReadWrite. Treat status unknown as fail-closed before using the search result's message content."
        }
      },
      "description": "Searches Outlook messages with Microsoft Search or the Messages API fallback."
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.count_messages",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_COUNT_MESSAGES",
    "kind": "read",
    "summary": "Count messages in Outlook, optionally matching a filter.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "CountMessagesRequest",
      "properties": {
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "isRead eq false"
          ],
          "description": "Raw Microsoft Graph OData $filter expression applied before counting. Omit the '$filter=' prefix."
        },
        "search": {
          "type": "string",
          "title": "Search",
          "examples": [
            "\"project update\"",
            "\"subject:quarterly report\""
          ],
          "description": "Microsoft Graph message $search expression using Keyword Query Language (KQL). Omit the '$search=' prefix. Cannot be combined with filter."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.list_sent_items_messages",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_LIST_SENT_ITEMS_MESSAGES",
    "kind": "read",
    "summary": "List the messages you have sent from Outlook.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListSentItemsMessagesRequest",
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "default": 10,
          "examples": [
            10,
            50,
            100
          ],
          "description": "Maximum number of messages to return per request (1-1000). To page through more, use the `next_page_token` from the response (pass it back as `page_token`)."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "default": 0,
          "examples": [
            0,
            10,
            20
          ],
          "description": "Number of messages to skip from the beginning of the result set, for pagination."
        },
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "isRead eq false",
            "sentDateTime ge 2023-01-01T00:00:00Z",
            "hasAttachments eq true"
          ],
          "description": "OData $filter query to filter messages. Examples: 'isRead eq false', 'toRecipients/any(a:a/emailAddress/address eq \"recipient@example.com\")', 'sentDateTime ge 2023-01-01T00:00:00Z', 'hasAttachments eq true'. Note: Combining complex filters with the 'orderby' parameter may fail with an InefficientFilter error. In such cases, remove 'orderby' or apply sorting client-side."
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Select",
          "examples": [
            [
              "id",
              "subject",
              "toRecipients",
              "sentDateTime"
            ]
          ],
          "description": "List of message properties to include in the response. OData $select parameter. Valid properties include: id, subject, from, toRecipients, receivedDateTime, sentDateTime, hasAttachments, importance, isRead, body, bodyPreview, categories, conversationId."
        },
        "orderby": {
          "type": "string",
          "title": "Orderby",
          "examples": [
            "sentDateTime desc",
            "subject asc"
          ],
          "description": "Property to sort results by with direction. OData $orderby parameter. Example: 'sentDateTime desc' or 'subject asc'. Note: Using 'orderby' together with complex 'filter' queries may fail with an InefficientFilter error. If this occurs, either remove 'orderby' or apply sorting client-side."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, retrieves and normalizes Microsoft Purview sensitivity labels in the same Graph request. Requires Mail.Read. Treat status unknown as fail-closed. Preserved in next_page_token."
        }
      },
      "description": "Request parameters for listing messages in the SentItems mail folder."
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.search_people",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_SEARCH_PEOPLE",
    "kind": "read",
    "summary": "Search the people you work with in Outlook.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "SearchPeopleRequest",
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "minimum": 1,
          "examples": [
            25
          ],
          "description": "Maximum number of people to return in this page (OData $top)."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "minimum": 0,
          "examples": [
            25
          ],
          "description": "Number of results to skip. Cannot be used with search."
        },
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "personType/class eq 'Person'"
          ],
          "description": "OData filter expression used to limit returned people."
        },
        "search": {
          "type": "string",
          "title": "Search",
          "examples": [
            "Adele"
          ],
          "description": "Fuzzy name or alias to search for among people relevant to the signed-in user."
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Select",
          "examples": [
            [
              "id",
              "displayName",
              "userPrincipalName"
            ]
          ],
          "description": "Person properties to return (OData $select)."
        },
        "orderby": {
          "type": "string",
          "title": "Orderby",
          "examples": [
            "displayName asc"
          ],
          "description": "OData expression used to order returned people."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified. The token preserves the original search options."
        }
      }
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.outlook.get_profile",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_GET_PROFILE",
    "kind": "read",
    "summary": "Read your Outlook account profile.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "GetProfileRequest",
      "properties": {
        "include_proxy_addresses": {
          "type": "boolean",
          "title": "Include Proxy Addresses",
          "default": false,
          "description": "Whether to include proxy addresses in the response. Proxy addresses are SMTP addresses prefixed with 'SMTP:' (primary) or 'smtp:' (secondary).",
          "human_parameter_name": "Include Proxy Addresses",
          "human_parameter_description": "Set to true to retrieve the user's proxy email addresses (SMTP addresses for the mailbox)."
        }
      }
    },
    "narrowed": [
      "select",
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.calendar.list_calendars",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_LIST_CALENDARS",
    "kind": "read",
    "summary": "List your Outlook calendars.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "ListCalendarsRequest",
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "minimum": 1,
          "examples": [
            5,
            10
          ],
          "description": "Maximum number of calendars to return (OData $top).",
          "human_parameter_name": "Max Calendars",
          "human_parameter_description": "The maximum number of calendars to return. Use this to limit the list if you only need a few results."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "minimum": 0,
          "examples": [
            0,
            5
          ],
          "description": "Number of calendars to skip (OData $skip).",
          "human_parameter_name": "Skip Count",
          "human_parameter_description": "How many calendars to skip from the start of the list. Use this to move to the next page of results."
        },
        "filter": {
          "type": "string",
          "title": "Filter",
          "examples": [
            "startswith(name,'Team')"
          ],
          "description": "OData filter expression (OData $filter).",
          "human_parameter_name": "Filter",
          "human_parameter_description": "A simple condition to narrow which calendars are returned, such as filtering by name. For example, only calendars whose name starts with 'Team'."
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Select",
          "examples": [
            [
              "id",
              "name",
              "owner"
            ]
          ],
          "description": "Properties to include (OData $select).",
          "human_parameter_name": "Select Properties",
          "human_parameter_description": "Which calendar fields you want in the response to keep it concise. List property names like 'id', 'name', or 'owner'."
        },
        "orderby": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Orderby",
          "examples": [
            [
              "name asc"
            ]
          ],
          "description": "Order by expressions (OData $orderby).",
          "human_parameter_name": "Order By",
          "human_parameter_description": "How you want the calendars sorted in the results. Provide fields and direction like 'name asc' or 'name desc'."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.calendar.get_calendar_view",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_GET_CALENDAR_VIEW",
    "kind": "read",
    "summary": "List Outlook events in a time range, repeats included.",
    "key_fields": [
      "start_datetime",
      "end_datetime"
    ],
    "input_schema": {
      "type": "object",
      "title": "GetCalendarViewRequest",
      "required": [
        "start_datetime",
        "end_datetime"
      ],
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "default": 20,
          "maximum": 1000,
          "minimum": 1,
          "examples": [
            10,
            20,
            50
          ],
          "description": "Maximum number of events to retrieve.",
          "human_parameter_name": "Top",
          "human_parameter_description": "The maximum number of events to return. The default is 20, which is suitable for most calendar queries."
        },
        "skip": {
          "type": "integer",
          "title": "Skip",
          "minimum": 0,
          "examples": [
            0,
            20,
            100
          ],
          "description": "Number of events to skip before returning the page (OData $skip)."
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Select",
          "default": [
            "id",
            "subject",
            "start",
            "end",
            "location",
            "attendees",
            "organizer",
            "isAllDay",
            "isCancelled",
            "showAs",
            "onlineMeeting",
            "onlineMeetingProvider",
            "importance",
            "responseStatus",
            "isOnlineMeeting",
            "webLink",
            "bodyPreview",
            "recurrence",
            "categories",
            "sensitivity"
          ],
          "examples": [
            [
              "subject",
              "start",
              "end",
              "location"
            ],
            [
              "id",
              "subject",
              "organizer",
              "isAllDay"
            ],
            [
              "subject",
              "start",
              "end",
              "body"
            ]
          ],
          "description": "List of event properties to return. Defaults to commonly-needed fields excluding the full HTML body. To include the full body content, explicitly add 'body' to this list.",
          "human_parameter_name": "Select Properties",
          "human_parameter_description": "Specify which event properties to return. By default, commonly-needed fields are returned (excludes the full HTML body to reduce response size). To get the full body content, add 'body' to this list."
        },
        "orderby": {
          "type": "string",
          "title": "Orderby",
          "examples": [
            "start/dateTime asc",
            "subject asc"
          ],
          "description": "OData ordering expression for events, for example 'start/dateTime asc'."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "default": "UTC",
          "examples": [
            "America/New_York",
            "UTC",
            "Europe/London",
            "Asia/Kolkata",
            "Pacific Standard Time"
          ],
          "description": "Timezone for event times in the response only; the input window is always interpreted from the offset in start_datetime/end_datetime. Must be an IANA timezone name (e.g., 'America/New_York', 'Europe/London', 'Asia/Kolkata') or Windows timezone identifier (e.g., 'Pacific Standard Time', 'India Standard Time'). UTC offsets like '+05:30' or 'GMT+5' are NOT supported. Defaults to UTC.",
          "human_parameter_name": "Timezone",
          "human_parameter_description": "The time zone to use when showing event times in the results. Use IANA names (like 'America/New_York', 'Asia/Kolkata') or Windows names (like 'Pacific Standard Time'). UTC offsets like '+05:30' are not supported."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "examples": [
            "AAMkAGI2TG93AAA=",
            "AAMkADAwATY3ZmYAZS1h"
          ],
          "description": "Optional ID of a specific calendar to query. Must be a calendar identifier (format like 'AAMkAGI2TG93AAA='), NOT an email address. If not provided, uses the primary calendar. Get calendar IDs using LIST_CALENDARS action.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "Choose a specific calendar to search by its ID if you don't want the primary calendar. This must be a calendar ID (not an email address). You can get calendar IDs using the List Calendars action."
        },
        "end_datetime": {
          "type": "string",
          "title": "End Datetime",
          "examples": [
            "2024-12-31T23:59:59Z",
            "2019-11-08T20:00:00-08:00"
          ],
          "description": "The end date and time of the time range, represented in ISO 8601 format. For example, '2019-11-08T20:00:00-08:00' or '2024-12-31T23:59:59Z'.",
          "human_parameter_name": "End DateTime",
          "human_parameter_description": "The end of the time window you want to check, in ISO 8601 date/time format. Events active up to this time will be included."
        },
        "start_datetime": {
          "type": "string",
          "title": "Start Datetime",
          "examples": [
            "2024-01-01T00:00:00Z",
            "2019-11-08T19:00:00-08:00"
          ],
          "description": "The start date and time of the time range, represented in ISO 8601 format. For example, '2019-11-08T19:00:00-08:00' or '2024-01-01T00:00:00Z'.",
          "human_parameter_name": "Start DateTime",
          "human_parameter_description": "The start of the time window you want to check, in ISO 8601 date/time format. Events active during this window will be included."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, retrieves and normalizes the Microsoft Purview sensitivity label applied to each calendar event. This is distinct from the event's built-in sensitivity field and any Teams meeting label. Preserved in next_page_token."
        }
      }
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "idempotentHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.calendar.search_events",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_SEARCH_EVENTS",
    "kind": "read",
    "summary": "Search your Outlook events.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "SearchEventsRequest",
      "properties": {
        "size": {
          "type": "integer",
          "title": "Size",
          "default": 25,
          "maximum": 1000,
          "minimum": 1,
          "examples": [
            25,
            50,
            100
          ],
          "description": "Maximum results per work or school Microsoft Search page. For the personal Microsoft account fallback, this limits calendar candidates examined in one provider page, so it can return fewer keyword matches; use next_page_token to continue scanning. The default is 25."
        },
        "query": {
          "type": "string",
          "title": "Query",
          "default": "",
          "examples": [
            "contoso",
            "team meeting",
            "project review",
            "quarterly planning"
          ],
          "description": "The search query string to find calendar events. Required on the first page and omitted when continuing with page_token. For personal Microsoft accounts, the fallback treats this as plain, case-insensitive terms across subject, body preview, location, and attendees. Every whitespace-separated term must match; Microsoft Search query syntax is not available."
        },
        "from_index": {
          "type": "integer",
          "title": "From Index",
          "default": 0,
          "minimum": 0,
          "examples": [
            0,
            25,
            50
          ],
          "description": "The zero-based starting index for pagination. Use this to skip results and fetch the next page."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for a personal-account fallback result. Omit for the first page; then pass back next_page_token unmodified. When set, it carries the date window and keyword from the first request and advances one calendar candidate page."
        },
        "end_datetime": {
          "type": "string",
          "title": "End Datetime",
          "examples": [
            "2025-01-31T23:59:59Z"
          ],
          "description": "End of the ISO 8601 calendar window for the personal Microsoft account fallback. Must be supplied with start_datetime when Microsoft Search is unavailable for that account; ignored for normal Microsoft Search requests."
        },
        "start_datetime": {
          "type": "string",
          "title": "Start Datetime",
          "examples": [
            "2025-01-01T00:00:00Z"
          ],
          "description": "Start of the ISO 8601 calendar window for the personal Microsoft account fallback. Must be supplied with end_datetime when Microsoft Search is unavailable for that account; ignored for normal Microsoft Search requests."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, hydrates each search hit's Microsoft Purview sensitivity label through Graph JSON batches capped at 20 requests per batch. This is distinct from the event's built-in sensitivity field and from a Teams online meeting sensitivity-label assignment. Requires Calendars.Read. Treat status unknown as fail-closed before using event content."
        }
      },
      "description": "Request model for searching calendar events via Microsoft Graph Search API."
    },
    "narrowed": [],
    "hint": [
      "idempotentHint",
      "openWorldHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.calendar.find_meeting_times",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_FIND_MEETING_TIMES",
    "kind": "read",
    "summary": "Suggest meeting times when everyone is free.",
    "key_fields": [],
    "input_schema": {
      "type": "object",
      "title": "FindMeetingTimesRequest",
      "properties": {
        "max_candidates": {
          "type": "integer",
          "title": "Max Candidates",
          "description": "Maximum number of meeting time suggestions to return."
        },
        "prefer_timezone": {
          "type": "string",
          "title": "Prefer Timezone",
          "examples": [
            "America/New_York",
            "Pacific Standard Time",
            "UTC"
          ],
          "description": "Preferred timezone for the response (sets Prefer header with outlook.timezone). If not specified, defaults to UTC."
        },
        "meeting_duration": {
          "type": "string",
          "title": "Meeting Duration",
          "examples": [
            "PT30M",
            "PT1H",
            "PT2H"
          ],
          "description": "Meeting length in ISO 8601 duration format (e.g., 'PT1H' for 1 hour, 'PT30M' for 30 minutes). Default: 30 minutes."
        },
        "is_organizer_optional": {
          "type": "boolean",
          "title": "Is Organizer Optional",
          "description": "If true, organizer doesn't need to attend. Default: false."
        },
        "return_suggestion_reasons": {
          "type": "boolean",
          "title": "Return Suggestion Reasons",
          "description": "If true, include reasons for each suggestion. Default: false."
        },
        "minimum_attendee_percentage": {
          "type": "number",
          "title": "Minimum Attendee Percentage",
          "description": "Minimum confidence percentage (0-100) for suggestions. Default: 50."
        }
      },
      "description": "Request schema for finding meeting times."
    },
    "narrowed": [
      "user_id",
      "attendees",
      "time_constraint",
      "location_constraint"
    ],
    "hint": [
      "idempotentHint",
      "readOnlyHint"
    ]
  },
  {
    "id": "microsoft.calendar.list_event_instances",
    "toolkit": "OUTLOOK",
    "tool": "OUTLOOK_LIST_EVENT_INSTANCES",
    "kind": "read",
    "summary": "List the dates of one repeating Outlook event.",
    "key_fields": [
      "event_id",
      "startDateTime",
      "endDateTime"
    ],
    "input_schema": {
      "type": "object",
      "title": "ListEventInstancesRequest",
      "required": [
        "event_id",
        "startDateTime",
        "endDateTime"
      ],
      "properties": {
        "top": {
          "type": "integer",
          "title": "Top",
          "minimum": 1,
          "examples": [
            50
          ],
          "description": "Maximum number of event instances to return per page (OData $top). Controls page size for pagination."
        },
        "skip": {
          "type": "integer",
          "title": "$Skip",
          "minimum": 0,
          "description": "Skip the first n items"
        },
        "count": {
          "type": "boolean",
          "title": "$Count",
          "description": "Include count of items"
        },
        "expand": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "$Expand",
          "description": "Expand related entities"
        },
        "filter": {
          "type": "string",
          "title": "$Filter",
          "description": "Filter items by property values"
        },
        "search": {
          "type": "string",
          "title": "$Search",
          "description": "Search items by search phrases"
        },
        "select": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "$Select",
          "description": "Select properties to be returned"
        },
        "orderby": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "$Orderby",
          "description": "Order items by property values"
        },
        "event_id": {
          "type": "string",
          "title": "Event Id",
          "examples": [
            "AQMkADAwATMwMAExLTlmNjktOWVmYS0wMAItMDAKAEYAAAPLkCuWz0mbS4RvWyTvc1LKBwDGTYrvat2PSKIu8IS9hMqyAAACAQ0AAADGTYrvat2PSKIu8IS9hMqyAAAAU0mNLwAAAA%3D%3D"
          ],
          "description": "The unique identifier of the recurring event (seriesMaster) for which to retrieve instances."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque continuation token for the next page. Omit for the first page; then pass back the `next_page_token` from the previous response, unmodified, until it is absent. Do not construct or edit it. When set, it drives pagination; resend any required identifier fields from the first call (the token supersedes their values). Optional filter, sort and timezone params need not be repeated; the token carries them."
        },
        "endDateTime": {
          "type": "string",
          "title": "End Date Time",
          "examples": [
            "2026-04-30T23:59:59.0000000",
            "2025-12-31T23:59:59Z"
          ],
          "description": "The end date and time of the time range in ISO 8601 format (e.g., 2026-04-30T23:59:59.0000000). Only instances that start within or overlap this range will be returned."
        },
        "startDateTime": {
          "type": "string",
          "title": "Start Date Time",
          "examples": [
            "2026-03-01T00:00:00.0000000",
            "2025-01-01T00:00:00Z"
          ],
          "description": "The start date and time of the time range in ISO 8601 format (e.g., 2026-03-01T00:00:00.0000000). Only instances that start within or overlap this range will be returned."
        },
        "include_sensitivity_label": {
          "type": "boolean",
          "title": "Include Sensitivity Label",
          "default": false,
          "description": "When true, retrieves and normalizes Microsoft Purview sensitivity labels in the same Graph request. Requires Calendars.Read. Treat status unknown as fail-closed. Preserved in next_page_token."
        }
      },
      "description": "Request parameters for listing instances of a recurring event."
    },
    "narrowed": [
      "user_id"
    ],
    "hint": [
      "openWorldHint",
      "readOnlyHint"
    ]
  }
]);
