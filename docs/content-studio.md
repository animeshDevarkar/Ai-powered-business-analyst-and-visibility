# Content Studio

The project sidebar contains Content Studio → Social Media and Blogs. Drafts belong to the signed-in user's project, persist in the existing workspace store, appear in project exports, and record changes in Activity. Existing stores load with an empty content library.

Social Media supports editable captions for Instagram, LinkedIn and Facebook, a saved post library, a preview, copying, text exports and an explicit review dialog before immediate publication. Instagram publishes a single image and caption; LinkedIn and Facebook publish text posts. Video, carousels, scheduling and in-app OAuth account setup are not included. Blogs supports generation, editable Markdown, excerpts, keywords, saved articles and Markdown export; CMS publishing is not included.

## AI generation

Set `OPENAI_API_KEY` and `CONTENT_AI_MODEL` in `apps/api/.env`, then restart the API. Select a model available to your API account that supports the [Responses API](https://developers.openai.com/api/docs/guides/text). Both variables are required; there is no implicit model or fake generation fallback. Manual drafting works without credentials. Generation uses the brief, tone, keywords and the project's latest business memory; generated content remains unsaved until Save draft. Requests may incur provider charges. Cost metering is not yet implemented.

## Social publishing setup

Set `CONTENT_SOCIAL_ACCOUNTS` to a JSON array of records with `projectId`, `platform`, `accessToken`, `accountId` and `label`. Obtain the project ID from its export. Each configured account applies only to that project; the project must also belong to the authenticated user. Tokens stay server-side and are never returned to the browser or written to exports. Restart the API after changing configuration. The UI reports configuration readiness; it cannot guarantee token validity or provider approval before publishing.

Example using placeholders (replace locally; never commit tokens):

```dotenv
CONTENT_SOCIAL_ACCOUNTS=[{"projectId":"PROJECT_UUID","platform":"linkedin","accessToken":"TOKEN","accountId":"urn:li:person:MEMBER_ID","label":"Founder profile"},{"projectId":"PROJECT_UUID","platform":"facebook","accessToken":"PAGE_TOKEN","accountId":"PAGE_ID","label":"Business Facebook Page"},{"projectId":"PROJECT_UUID","platform":"instagram","accessToken":"TOKEN","accountId":"IG_ACCOUNT_ID","label":"Business Instagram"}]
META_GRAPH_API_VERSION=vXX.0
```

- LinkedIn: member access token with `w_member_social`, and the member's person URN. See [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin).
- Facebook: Page access token with publishing permissions and a Page ID. Select a supported Graph API version. See [Pages posts](https://developers.facebook.com/docs/pages-api/posts/).
- Instagram: professional account linked to a Facebook Page, the appropriate publishing token/permissions, Instagram account ID, supported Graph API version, and a publicly accessible HTTPS JPEG image URL. See [Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing).

The operator must obtain the platform permissions and configure accounts. No live post is sent during development or tests. The browser user saves, reviews, checks approval and clicks Publish now to send a post. The API checks the approved draft timestamp and locks the post before contacting its provider. Published posts cannot be edited, deleted or submitted again from the studio. If publication fails or times out after submission, the post is marked as needing account verification and cannot be automatically retried. A process interruption may leave a Publishing state; inspect the external account before reconciliation. The JSON storage adapter supports a single API process, as before.

## API

All endpoints require authentication and project ownership:

- `GET /api/projects/:id/content/config`: generation readiness and account labels, without secrets.
- `POST /api/projects/:id/content/generate`: `{ kind, platform, topic, tone, keywords }`; returns an unsaved draft.
- `POST /api/projects/:id/content`: create a draft.
- `PUT /api/projects/:id/content/:contentId`: edit an existing draft.
- `DELETE /api/projects/:id/content/:contentId`: delete an unpublished draft.
- `POST /api/projects/:id/content/:contentId/publish`: `{ approved: true, updatedAt }`, matching the saved draft.

Draft fields are `kind` (`social` or `blog`), `platform` (`instagram`, `linkedin`, `facebook`; null for blogs), `title`, `body`, `excerpt`, `imageUrl` and `keywords`. Content includes status, timestamps and a provider receipt after confirmed publication.
