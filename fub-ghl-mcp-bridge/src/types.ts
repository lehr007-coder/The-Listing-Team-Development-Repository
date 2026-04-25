// Request/Response types
export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

export interface MCPResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Follow Up Boss types
export interface FUBPerson {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  stage?: string;
  source?: string;
  tags?: string[];
  notes?: string;
  assignedTo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface FUBDeal {
  id: string;
  personId: string;
  name?: string;
  status?: string;
  value?: number;
  stage?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface FUBSearchParams {
  email?: string;
  phone?: string;
  name?: string;
}

// GoHighLevel types
export interface GHLContact {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  locationId?: string;
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  notes?: string;
  [key: string]: unknown;
}

export interface GHLOpportunity {
  id?: string;
  contactId: string;
  locationId?: string;
  pipelineId?: string;
  name?: string;
  value?: number;
  status?: string;
  stage?: string;
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GHLSearchResult {
  contacts?: GHLContact[];
  contact?: GHLContact;
}

// API Client types
export interface APIClientConfig {
  fubApiKey: string;
  fubXSystem: string;
  fubXSystemKey: string;
  ghlPrivateToken: string;
  ghlLocationId: string;
  requestTimeout?: number;
}

// Logging
export interface LogContext {
  requestId?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

// Tool Input/Output types
export interface SearchFUBPersonInput {
  email?: string;
  phone?: string;
  name?: string;
}

export interface SearchFUBPersonOutput {
  persons: FUBPerson[];
  count: number;
}

export interface GetFUBPersonInput {
  personId: string;
}

export interface CreateOrUpdateGHLContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface CreateOrUpdateGHLContactOutput {
  contactId: string;
  created: boolean;
  updated: boolean;
}

export interface SyncFUBPersonToGHLInput {
  personId: string;
}

export interface SyncFUBPersonToGHLOutput {
  personId: string;
  contactId: string;
  synced: boolean;
  created: boolean;
  updated: boolean;
  tagsApplied: string[];
}

export interface CreateGHLOpportunityFromFUBDealInput {
  personId: string;
  dealId?: string;
}

export interface CreateGHLOpportunityFromFUBDealOutput {
  opportunityId: string;
  created: boolean;
  updated: boolean;
}

export interface HealthCheckOutput {
  status: "ok" | "error";
  service: string;
  timestamp: string;
  version?: string;
}
