import { z } from 'zod';
import { assertConfirmed, confirmSchema } from '../../lib/confirm.js';
import { dedupedCall } from '../../lib/dedupe.js';
import { ORDER_STATUSES, PostageType, ProductionSpeed } from '../../openapi/vocabulary.js';
import type { CuratedTool } from '../types.js';

// LettrLabs.App's recipient model is nested. Top-level objects: address, personal, metadata.
// See ExternalOrdersRecipientVm.cs in the App repo for the canonical shape.
const RecipientSchema = z
  .object({
    address: z
      .object({
        address1: z.string().describe('Street address line 1.'),
        address2: z.string().optional(),
        city: z.string(),
        state: z.string().describe('Two-letter US state code.'),
        zipCode: z.string().describe('5- or 9-digit US ZIP code.'),
        zip4: z.string().optional(),
        country: z.string().optional(),
      })
      .passthrough(),
    personal: z
      .object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        toOrganization: z.string().optional(),
        salutation: z.string().optional(),
      })
      .passthrough()
      .optional(),
    metadata: z
      .object({
        custom1: z.string().optional(),
        custom2: z.string().optional(),
        custom3: z.string().optional(),
        custom4: z.string().optional(),
        custom5: z.string().optional(),
        custom6: z.string().optional(),
        text: z.string().optional().describe('Body copy mail-merge field.'),
        text2: z.string().optional(),
      })
      .passthrough()
      .optional()
      .describe('Mail-merge fields and return-address overrides. passthrough allows the full metadata surface.'),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// READ TOOLS
// ---------------------------------------------------------------------------

const ListOrdersInput = z.object({
  id: z
    .string()
    .optional()
    .describe('Comma-separated list of order IDs to fetch (e.g. "1234,5678").'),
  status: z
    .string()
    .optional()
    .describe(`Filter by order status. Published statuses: ${ORDER_STATUSES.join(', ')}.`),
  paid: z
    .boolean()
    .optional()
    .describe(
      'Filter by payment state (tri-state): pass true for paid orders only, pass false for unpaid orders only, or omit the field entirely to apply no payment filter.',
    ),
  product: z.string().optional().describe('Filter by product type (e.g. Postcard, Letter).'),
  postage: PostageType.optional().describe('Filter by postage type.'),
  showRecipients: z.boolean().optional().describe('Include recipient details in the response.'),
  pageNumber: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Pagination: 0-indexed page number. Default 0.'),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Pagination: results per page. Default 100.'),
});

export const listOrders: CuratedTool<z.infer<typeof ListOrdersInput>> = {
  name: 'list_orders',
  description:
    'List LettrLabs direct mail orders for the authenticated profile. Supports filtering by status, payment state (the `paid` filter is tri-state — see the field), product type, and postage. A deleted order reads as nonexistent here (the same response as an id that never existed), so a previously-visible order that is missing after a delete is expected, not an error. Use this to answer questions like "what did I send last week", "show me my open drafts", or "list all unpaid orders".',
  inputSchema: ListOrdersInput,
  handler: async (input, { client }) => client.get('/v1/order', input),
};

const GetOrderRecipientsInput = z.object({
  orderId: z.number().int().positive().describe('Order ID to fetch recipients for.'),
  query: z
    .string()
    .optional()
    .describe('Search filter (matches recipient name, address, or organization).'),
  pageNumber: z.number().int().nonnegative().optional().describe('Pagination page number.'),
  pageSize: z.number().int().positive().max(500).optional().describe('Pagination page size.'),
});

export const getOrderRecipients: CuratedTool<z.infer<typeof GetOrderRecipientsInput>> = {
  name: 'get_order_recipients',
  description:
    'Fetch the list of recipients on a specific order, optionally filtered by name/address/org. Use this to answer "who am I mailing on order 12345" or "find the Smiths on my latest campaign".',
  inputSchema: GetOrderRecipientsInput,
  handler: async ({ orderId, ...query }, { client }) =>
    client.get(`/v1/order/${orderId}/recipients`, query),
};

const GetOrderProofInput = z.object({
  orderId: z.number().int().positive().describe('Order ID to fetch the proof PDF for.'),
  recipientId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional recipient ID to render mail-merge fields for that specific recipient.'),
});

export const getOrderProof: CuratedTool<z.infer<typeof GetOrderProofInput>> = {
  name: 'get_order_proof',
  description:
    'Retrieve the PDF proof for an order (what the printed piece will look like). Optionally pass a recipient ID to render the proof with that recipient\'s mail-merge fields filled in. Returns the PDF as base64-encoded content.',
  inputSchema: GetOrderProofInput,
  handler: async ({ orderId, recipientId }, { client }) => {
    const path =
      recipientId !== undefined
        ? `/v1/order/${orderId}/proof/${recipientId}`
        : `/v1/order/${orderId}/proof`;
    return client.get(path);
  },
};

export const getOrderAnalytics: CuratedTool<Record<string, never>> = {
  name: 'get_order_analytics',
  description:
    'Get aggregate analytics across all orders for the authenticated profile: how many sent, total spend, response rates, etc. Use this to answer "how did my campaigns do this quarter" or "what\'s my total spend year-to-date".',
  inputSchema: z.object({}).strict(),
  handler: async (_input, { client }) => client.get('/v1/order/analytics'),
};

export const getOrderTransactions: CuratedTool<Record<string, never>> = {
  name: 'get_order_transactions',
  description:
    'List the spend transactions tied to orders (charges, refunds, credits). Use this for "what have I been charged for", "find a specific charge from last month", or reconciling billing.',
  inputSchema: z.object({}).strict(),
  handler: async (_input, { client }) => client.get('/v1/order/transaction'),
};

const PreviewOrderPricingInput = z.object({
  orderId: z.number().int().positive().describe('Order ID to price.'),
  postage: PostageType.optional().describe('Postage type. Default Standard.'),
  production: ProductionSpeed.optional().describe('Production speed. Default Normal.'),
  holdUntilDate: z
    .string()
    .optional()
    .describe('ISO 8601 date to hold production until (must be later than the normal completion date).'),
});

export const previewOrderPricing: CuratedTool<z.infer<typeof PreviewOrderPricingInput>> = {
  name: 'preview_order_pricing',
  description:
    'Calculate what an order WOULD cost without charging anything. Returns a breakdown of postage, production, and totals based on the recipient count and selected options. Always use this BEFORE submit_and_charge_order so the user sees the price first.',
  inputSchema: PreviewOrderPricingInput,
  handler: async ({ orderId, ...query }, { client }) =>
    client.get(`/v1/order/${orderId}/checkout`, query),
};

// ---------------------------------------------------------------------------
// SAFE WRITES (no charge)
// ---------------------------------------------------------------------------

const CreateOrderFromTemplateInput = z.object({
  templateId: z
    .number()
    .int()
    .positive()
    .describe(
      'Template ID to base the new order on. Templates are listed in the LettrLabs UI under Templates; their ID is shown there.',
    ),
});

export const createOrderFromTemplate: CuratedTool<z.infer<typeof CreateOrderFromTemplateInput>> = {
  name: 'create_order_from_template',
  description:
    'Create a NEW draft order based on an existing template. Returns the new order ID. The order is created in Draft state with NO recipients and NO charge — use append_order_recipients to add recipients, then preview_order_pricing, then submit_and_charge_order to send.',
  inputSchema: CreateOrderFromTemplateInput,
  handler: async (input, { client, auth }) =>
    dedupedCall('create_order_from_template', auth.apiKey, input, () =>
      client.post('/v1/order', input),
    ),
};

const AppendOrderRecipientsInput = z.object({
  orderId: z.number().int().positive().describe('Order ID to add recipients to.'),
  recipients: z
    .array(RecipientSchema)
    .min(1)
    .describe('Array of recipients to add. Each recipient needs at least address1, city, state, and zipCode.'),
});

export const appendOrderRecipients: CuratedTool<z.infer<typeof AppendOrderRecipientsInput>> = {
  name: 'append_order_recipients',
  description:
    'Append recipients to an existing draft order. Recipients are added on top of any already on the order; use this after create_order_from_template to populate the mailing list. Append is only allowed while the order is editable — appending to a non-editable order (Paid, Ready For Production, or Mailed) is rejected with a 400 "invalid status". The response reports submittedRecipients and acceptedRecipients (prefer these; totalRecipients is deprecated and equals acceptedRecipients), and each undeliverable recipient entry carries a `reason` field explaining why it was rejected.',
  inputSchema: AppendOrderRecipientsInput,
  handler: async ({ orderId, recipients }, { client, auth }) =>
    dedupedCall(
      'append_order_recipients',
      auth.apiKey,
      { orderId, recipients },
      // Target the canonical PUT .../recipients route (not the `:append` compat
      // alias) so the tool does not depend on an alias the App frames as legacy.
      // LettrLabs.App uses camelCase deserialization (default ASP.NET Core).
      () => client.put(`/v1/order/${orderId}/recipients`, { recipients }),
    ),
};

// ---------------------------------------------------------------------------
// CHARGE TOOL
// ---------------------------------------------------------------------------

const SubmitAndChargeOrderInput = z
  .object({
    orderId: z.number().int().positive().describe('Order ID to submit and charge.'),
    postage: PostageType.describe('Postage class for this send.'),
    production: ProductionSpeed.describe('Production speed.'),
    holdUntilDate: z
      .string()
      .optional()
      .describe('ISO 8601 date to hold production until (optional).'),
    autoBill: z
      .boolean()
      .optional()
      .describe(
        'If true, charge the saved payment method on file. If false, use the profile\'s prepaid balance.',
      ),
  })
  .merge(confirmSchema);

export const submitAndChargeOrder: CuratedTool<z.infer<typeof SubmitAndChargeOrderInput>> = {
  name: 'submit_and_charge_order',
  description:
    'Submit an order for production and CHARGE the customer\'s payment method or prepaid balance. THIS COSTS REAL MONEY. Requires confirm: true. Always call preview_order_pricing first to show the user the cost, get explicit human approval, then call this with confirm: true. An accepted checkout is settled asynchronously: the order transitions synchronously to "Payment Needed" and the response returns orderStatus plus pollAfterSeconds and settlementExpectedWithinSeconds — poll the order rather than assuming an immediate terminal state. During settlement a second checkout, a delete, or a recipient-delete on the same order is rejected with a 400 (this closes a double-charge window). A payment failure rolls the order back to Draft.',
  inputSchema: SubmitAndChargeOrderInput,
  handler: async (input, { client, auth }) => {
    assertConfirmed(input, 'submit_and_charge_order');
    const { orderId, ...body } = input;
    return dedupedCall('submit_and_charge_order', auth.apiKey, input, () =>
      // LettrLabs.App uses camelCase deserialization (default ASP.NET Core).
      client.post(`/v1/order/${orderId}/checkout`, {
        postageType: body.postage,
        productionSpeed: body.production,
        holdUntilDate: body.holdUntilDate,
        autoBill: body.autoBill ?? true,
      }),
    );
  },
};

// ---------------------------------------------------------------------------
// Export tool list
// ---------------------------------------------------------------------------

export const orderTools: CuratedTool[] = [
  listOrders as CuratedTool,
  getOrderRecipients as CuratedTool,
  getOrderProof as CuratedTool,
  getOrderAnalytics as CuratedTool,
  getOrderTransactions as CuratedTool,
  previewOrderPricing as CuratedTool,
  createOrderFromTemplate as CuratedTool,
  appendOrderRecipients as CuratedTool,
  submitAndChargeOrder as CuratedTool,
];
