import { FUBClient } from "./fub-client";
import { GHLClient } from "./ghl-client";
import { Logger, generateRequestId } from "./logger";
import {
  SearchFUBPersonInput,
  SearchFUBPersonOutput,
  GetFUBPersonInput,
  FUBPerson,
  CreateOrUpdateGHLContactInput,
  CreateOrUpdateGHLContactOutput,
  SyncFUBPersonToGHLInput,
  SyncFUBPersonToGHLOutput,
  CreateGHLOpportunityFromFUBDealInput,
  CreateGHLOpportunityFromFUBDealOutput,
  HealthCheckOutput,
} from "./types";

export class ToolHandler {
  private fubClient: FUBClient;
  private ghlClient: GHLClient;
  private logger: Logger;

  constructor(
    fubClient: FUBClient,
    ghlClient: GHLClient,
    logLevel: string = "info"
  ) {
    this.fubClient = fubClient;
    this.ghlClient = ghlClient;
    this.logger = new Logger(logLevel as any);
  }

  async searchFUBPerson(
    params: SearchFUBPersonInput
  ): Promise<SearchFUBPersonOutput> {
    const requestId = generateRequestId();
    this.logger.info("Searching FUB persons", { requestId, params });

    // Validate input
    if (!params.email && !params.phone && !params.name) {
      throw new Error(
        "At least one search parameter (email, phone, or name) is required"
      );
    }

    try {
      const persons = await this.fubClient.searchPeople(params);
      const normalizedPersons = persons.map((p) =>
        this.normalizeFUBPerson(p)
      );

      this.logger.info("FUB persons found", {
        requestId,
        count: normalizedPersons.length,
      });

      return {
        persons: normalizedPersons,
        count: normalizedPersons.length,
      };
    } catch (error) {
      this.logger.error("searchFUBPerson failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to search Follow Up Boss: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async getFUBPerson(params: GetFUBPersonInput): Promise<FUBPerson> {
    const requestId = generateRequestId();
    this.logger.info("Getting FUB person", { requestId, personId: params.personId });

    if (!params.personId) {
      throw new Error("personId is required");
    }

    try {
      const person = await this.fubClient.getPerson(params.personId);

      if (!person) {
        throw new Error(`Person not found: ${params.personId}`);
      }

      const normalized = this.normalizeFUBPerson(person);
      this.logger.info("FUB person retrieved", { requestId, personId: params.personId });

      return normalized;
    } catch (error) {
      this.logger.error("getFUBPerson failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to get Follow Up Boss person: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async createOrUpdateGHLContact(
    params: CreateOrUpdateGHLContactInput
  ): Promise<CreateOrUpdateGHLContactOutput> {
    const requestId = generateRequestId();
    this.logger.info("Creating or updating GHL contact", {
      requestId,
      email: params.email,
    });

    if (!params.firstName || !params.lastName) {
      throw new Error("firstName and lastName are required");
    }

    try {
      let existingContact = null;

      // Search for existing contact by email or phone
      if (params.email) {
        const contacts = await this.ghlClient.searchContacts(params.email);
        if (contacts.length > 0) {
          existingContact = contacts[0];
        }
      }

      if (!existingContact && params.phone) {
        const contacts = await this.ghlClient.searchContacts(undefined, params.phone);
        if (contacts.length > 0) {
          existingContact = contacts[0];
        }
      }

      let contactId: string;
      let created = false;
      let updated = false;

      if (existingContact && existingContact.id) {
        // Update existing contact
        const updatePayload = {
          firstName: params.firstName,
          lastName: params.lastName,
          email: params.email,
          phone: params.phone,
          source: params.source || existingContact.source,
          customFields: {
            ...existingContact.customFields,
            ...params.customFields,
          },
        };

        await this.ghlClient.updateContact(existingContact.id, updatePayload);
        contactId = existingContact.id;
        updated = true;

        this.logger.info("GHL contact updated", { requestId, contactId });
      } else {
        // Create new contact
        const newContact = await this.ghlClient.createContact({
          firstName: params.firstName,
          lastName: params.lastName,
          email: params.email,
          phone: params.phone,
          source: params.source || "Follow Up Boss",
          tags: params.tags || ["fub-sync"],
          customFields: params.customFields,
        });

        contactId = newContact.id || "";
        created = true;

        this.logger.info("GHL contact created", { requestId, contactId });
      }

      return {
        contactId,
        created,
        updated,
      };
    } catch (error) {
      this.logger.error("createOrUpdateGHLContact failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to create or update GoHighLevel contact: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async syncFUBPersonToGHL(
    params: SyncFUBPersonToGHLInput
  ): Promise<SyncFUBPersonToGHLOutput> {
    const requestId = generateRequestId();
    this.logger.info("Syncing FUB person to GHL", {
      requestId,
      personId: params.personId,
    });

    if (!params.personId) {
      throw new Error("personId is required");
    }

    try {
      // Fetch FUB person
      const fubPerson = await this.fubClient.getPerson(params.personId);

      if (!fubPerson) {
        throw new Error(`FUB person not found: ${params.personId}`);
      }

      // Create or update GHL contact
      const createOrUpdateResult =
        await this.createOrUpdateGHLContact({
          firstName: fubPerson.firstName || fubPerson.name?.split(" ")[0] || "Unknown",
          lastName:
            fubPerson.lastName ||
            (fubPerson.name?.split(" ").slice(1).join(" ") || ""),
          email: fubPerson.email,
          phone: fubPerson.phone,
          source: "Follow Up Boss",
          customFields: {
            fubPersonId: params.personId,
            fubSource: fubPerson.source || "",
            fubStage: fubPerson.stage || "",
          },
        });

      // Apply tags
      const tagsToApply = [
        "fub-sync",
        "fub-imported",
        ...(fubPerson.stage ? [`fub-${fubPerson.stage}`] : []),
        ...(fubPerson.source ? [`fub-${fubPerson.source}`] : []),
        ...(fubPerson.tags || []).map((t) => `fub-${t}`),
      ];

      // Add note
      await this.ghlClient.addNote(
        createOrUpdateResult.contactId,
        "Synced from Follow Up Boss via MCP bridge."
      );

      this.logger.info("FUB person synced to GHL", {
        requestId,
        personId: params.personId,
        contactId: createOrUpdateResult.contactId,
      });

      return {
        personId: params.personId,
        contactId: createOrUpdateResult.contactId,
        synced: true,
        created: createOrUpdateResult.created,
        updated: createOrUpdateResult.updated,
        tagsApplied: tagsToApply,
      };
    } catch (error) {
      this.logger.error("syncFUBPersonToGHL failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to sync FUB person to GHL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async createGHLOpportunityFromFUBDeal(
    params: CreateGHLOpportunityFromFUBDealInput
  ): Promise<CreateGHLOpportunityFromFUBDealOutput> {
    const requestId = generateRequestId();
    this.logger.info("Creating GHL opportunity from FUB deal", {
      requestId,
      personId: params.personId,
      dealId: params.dealId,
    });

    if (!params.personId) {
      throw new Error("personId is required");
    }

    try {
      // First, sync the person to get the GHL contact
      const syncResult = await this.syncFUBPersonToGHL({
        personId: params.personId,
      });

      const ghlContactId = syncResult.contactId;

      // Get existing opportunities for this contact
      const existingOpportunities =
        await this.ghlClient.getContactOpportunities(ghlContactId);

      // If dealId is provided, check if opportunity already exists
      if (params.dealId) {
        const existingOpp = existingOpportunities.find(
          (opp) =>
            opp.customFields?.fubDealId === params.dealId &&
            opp.status !== "closed"
        );

        if (existingOpp) {
          this.logger.info("GHL opportunity already exists", {
            requestId,
            opportunityId: existingOpp.id,
          });

          return {
            opportunityId: existingOpp.id || "",
            created: false,
            updated: false,
          };
        }
      }

      // Get FUB deal data if dealId is provided
      let dealName = "Deal";
      let dealValue = 0;

      if (params.dealId) {
        const fubDeal = await this.fubClient.getDeal(params.dealId);
        if (fubDeal) {
          dealName = fubDeal.name || `Deal ${params.dealId}`;
          dealValue = fubDeal.value || 0;
        }
      }

      // Create GHL opportunity
      const newOpportunity = await this.ghlClient.createOpportunity({
        contactId: ghlContactId,
        name: dealName,
        value: dealValue,
        customFields: {
          fubDealId: params.dealId || "",
          syncedFromFUB: true,
        },
      });

      const opportunityId = newOpportunity.id || "";

      this.logger.info("GHL opportunity created", {
        requestId,
        opportunityId,
      });

      return {
        opportunityId,
        created: true,
        updated: false,
      };
    } catch (error) {
      this.logger.error("createGHLOpportunityFromFUBDeal failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to create GHL opportunity from FUB deal: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  healthCheck(): HealthCheckOutput {
    return {
      status: "ok",
      service: "fub-ghl-mcp-bridge",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  }

  private normalizeFUBPerson(person: FUBPerson): FUBPerson {
    return {
      id: person.id,
      email: person.email,
      phone: person.phone,
      firstName: person.firstName,
      lastName: person.lastName,
      name: person.name,
      stage: person.stage,
      source: person.source,
      tags: person.tags,
      notes: person.notes,
      assignedTo: person.assignedTo,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
  }
}
