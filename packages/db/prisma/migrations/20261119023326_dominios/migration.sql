-- CreateEnum
CREATE TYPE "ScanDirection" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('ACCEPTED', 'DUPLICATE', 'DENIED');

-- CreateEnum
CREATE TYPE "PrintMode" AS ENUM ('LABEL', 'BADGE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FormProvider" AS ENUM ('MAUTIC', 'RD_STATION', 'GENERIC_WEBHOOK');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('TRANSPORT', 'LODGING', 'DOCUMENTATION', 'EXPERIENCE', 'EVENT_PRODUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('AIR', 'AIR_CHARTER', 'BUS_CHARTER', 'TRAIN', 'CRUISE', 'TRANSFER', 'CAR_RENTAL', 'CHAUFFEUR', 'EXECUTIVE_TRANSPORT', 'HOTEL', 'RESORT', 'VACATION_RENTAL', 'ROOM_BLOCK', 'TRAVEL_INSURANCE', 'VISA', 'PASSPORT', 'CURRENCY_EXCHANGE', 'CONNECTIVITY', 'EVENT_TICKET', 'SPORTS_HOSPITALITY', 'TOUR', 'GUIDE', 'DINING', 'CONCIERGE', 'VENUE', 'FOOD_BEVERAGE', 'AUDIOVISUAL', 'SCENOGRAPHY', 'STAND_BUILD', 'MERCHANDISE', 'ACCREDITATION_SERVICE', 'EVENT_STAFF', 'INTERPRETATION', 'BRAND_ACTIVATION', 'EQUIPMENT_RENTAL', 'SERVICE_FEE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingProvider" AS ENUM ('MANUAL', 'TRAVELLINK');

-- CreateEnum
CREATE TYPE "ServiceItemStatus" AS ENUM ('DRAFT', 'QUOTED', 'ON_HOLD', 'BOOKED', 'ISSUED', 'CHANGED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceAttachmentKind" AS ENUM ('VOUCHER', 'ETICKET', 'INVOICE', 'CONFIRMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessInvitePurpose" AS ENUM ('FIRST_ACCESS', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "TravelScope" AS ENUM ('ANY', 'DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('USER', 'PERSON', 'COST_CENTER_MANAGER', 'TENANT_ROLE');

-- CreateEnum
CREATE TYPE "TravelRequestKind" AS ENUM ('AIR', 'HOTEL', 'PACKAGE', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');

-- CreateEnum
CREATE TYPE "TravelRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'QUOTED', 'AWAITING_APPROVAL', 'APPROVED', 'BOOKED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TimePreference" AS ENUM ('ANY', 'MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "TravelPassengerType" AS ENUM ('HOLDER', 'COMPANION', 'EMPLOYEE', 'GUEST');

-- CreateEnum
CREATE TYPE "TravelDocType" AS ENUM ('PASSPORT', 'RG', 'CPF', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExpenseReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MEALS', 'LODGING', 'TRANSPORT', 'FUEL', 'PARKING', 'TOLL', 'TAXI_RIDE', 'AIRFARE', 'COMMUNICATION', 'ENTERTAINMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LoyaltyKind" AS ENUM ('AIRLINE', 'HOTEL', 'CAR_RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('RESPONSIBLE', 'COMPANY_GUEST', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'RECTANGULAR');

-- CreateEnum
CREATE TYPE "StandStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'VOID');

-- CreateEnum
CREATE TYPE "SignatureParty" AS ENUM ('SPONSOR', 'ORGANIZER', 'WITNESS');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('IN_PERSON', 'REMOTE');

-- CreateEnum
CREATE TYPE "FlightScope" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD', 'SUITE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'LATE', 'CANCELED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('ALL', 'STAFF', 'GROUP', 'CATEGORY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ProjectDocumentCategory" AS ENUM ('GENERAL', 'VOUCHER', 'INSURANCE', 'TICKET', 'ITINERARY', 'OTHER');

-- CreateEnum
CREATE TYPE "PersonDocumentKind" AS ENUM ('PASSPORT', 'RG', 'CNH', 'VISA', 'INSURANCE', 'VACCINE', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "KioskStatus" AS ENUM ('PENDING_PAIRING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "KioskPrinterDriver" AS ENUM ('BROWSER_KIOSK', 'LOCAL_AGENT');

-- CreateEnum
CREATE TYPE "IdentificationMethod" AS ENUM ('FACE', 'QR', 'LOGIN');

-- CreateEnum
CREATE TYPE "IdentificationOutcome" AS ENUM ('MATCHED', 'CONFIRMED', 'REJECTED_BY_USER', 'NO_MATCH', 'LOW_CONFIDENCE', 'LIVENESS_FAILED', 'ALREADY_CHECKED_IN', 'NOT_ALLOWED', 'ERROR');

-- CreateTable
CREATE TABLE "AccessArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAreaCategory" (
    "areaId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "AccessAreaCategory_pkey" PRIMARY KEY ("areaId","categoryId")
);

-- CreateTable
CREATE TABLE "AccessScan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "direction" "ScanDirection" NOT NULL,
    "result" "ScanResult" NOT NULL DEFAULT 'ACCEPTED',
    "denyReason" TEXT NOT NULL DEFAULT '',
    "scannedByUserId" TEXT,
    "scannedByLabel" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "clientUuid" TEXT,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkingContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerRegistrationId" TEXT NOT NULL,
    "contactRegistrationId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgePrint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "mode" "PrintMode" NOT NULL,
    "templateId" TEXT,
    "printedBy" TEXT NOT NULL DEFAULT '',
    "kioskId" TEXT,
    "reprint" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL DEFAULT '',
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgePrint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileId" TEXT,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "FormProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "secretEnc" TEXT NOT NULL DEFAULT '',
    "webhookSecret" TEXT NOT NULL,
    "pollEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pollSeconds" INTEGER NOT NULL DEFAULT 60,
    "fieldMapping" JSONB NOT NULL DEFAULT '{}',
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormIntegrationSource" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalFormId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "role" "RegistrationRole" NOT NULL DEFAULT 'ATTENDEE',
    "lastSubmissionId" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" TIMESTAMP(3),
    "importedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FormIntegrationSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "document" TEXT NOT NULL DEFAULT '',
    "categories" "ServiceCategory"[],
    "serviceTypes" "ServiceType"[],
    "code" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'BR',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "rating" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAgreement" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "serviceTypes" "ServiceType"[],
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "rates" JSONB NOT NULL DEFAULT '[]',
    "terms" TEXT NOT NULL DEFAULT '',
    "fileId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingProviderAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "BookingProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL DEFAULT '',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "travelRequestId" TEXT,
    "quoteId" TEXT,
    "type" "ServiceType" NOT NULL,
    "status" "ServiceItemStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT,
    "provider" "BookingProvider" NOT NULL DEFAULT 'MANUAL',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "locator" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "origin" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "details" JSONB NOT NULL DEFAULT '{}',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "saleCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "taxesCents" INTEGER NOT NULL DEFAULT 0,
    "exchangeRate" DECIMAL(14,6),
    "holdUntil" TIMESTAMP(3),
    "inPolicy" BOOLEAN,
    "policyNotes" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItemTraveler" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "personId" TEXT,
    "registrationId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "seat" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ServiceItemTraveler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItemAttachment" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "ServiceAttachmentKind" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceItemAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonAccessInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "purpose" "AccessInvitePurpose" NOT NULL DEFAULT 'FIRST_ACCESS',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonAccessInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "managerPersonId" TEXT,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "appliesTo" JSONB NOT NULL DEFAULT '{}',
    "minAdvanceDays" INTEGER,
    "requireInsuranceInternational" BOOLEAN NOT NULL DEFAULT true,
    "preferredSuppliersOnly" BOOLEAN NOT NULL DEFAULT false,
    "requireJustification" BOOLEAN NOT NULL DEFAULT true,
    "preferDirectFlightsBps" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelPolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "scope" "TravelScope" NOT NULL DEFAULT 'ANY',
    "destination" TEXT NOT NULL DEFAULT '',
    "maxAmountCents" INTEGER,
    "unit" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "maxCabin" "CabinClass",
    "cabinUpgradeAfterHours" INTEGER,
    "maxHotelStars" INTEGER,
    "perDiemCents" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TravelPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelPolicyPreferredSupplier" (
    "policyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "TravelPolicyPreferredSupplier_pkey" PRIMARY KEY ("policyId","supplierId")
);

-- CreateTable
CREATE TABLE "ApprovalFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "approverType" "ApproverType" NOT NULL,
    "approverUserId" TEXT,
    "approverPersonId" TEXT,
    "thresholdCents" INTEGER,
    "onlyOutOfPolicy" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "protocol" TEXT NOT NULL,
    "requesterPersonId" TEXT,
    "requesterName" TEXT NOT NULL DEFAULT '',
    "requesterEmail" TEXT NOT NULL DEFAULT '',
    "requesterPhone" TEXT NOT NULL DEFAULT '',
    "organizationId" TEXT,
    "companyName" TEXT NOT NULL DEFAULT '',
    "costCenterId" TEXT,
    "policyId" TEXT,
    "kind" "TravelRequestKind" NOT NULL DEFAULT 'AIR',
    "tripType" "TripType" NOT NULL DEFAULT 'ROUND_TRIP',
    "origin" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "departDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "scope" "TravelScope" NOT NULL DEFAULT 'DOMESTIC',
    "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
    "pax" INTEGER NOT NULL DEFAULT 1,
    "budgetCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "purpose" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "requestedServices" "ServiceType"[],
    "serviceDetails" JSONB NOT NULL DEFAULT '{}',
    "outOfPolicy" BOOLEAN NOT NULL DEFAULT false,
    "policyViolations" JSONB NOT NULL DEFAULT '[]',
    "justification" TEXT NOT NULL DEFAULT '',
    "status" "TravelRequestStatus" NOT NULL DEFAULT 'NEW',
    "assignedUserId" TEXT,
    "handledBy" TEXT NOT NULL DEFAULT '',
    "chosenQuoteId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "sendCopy" BOOLEAN NOT NULL DEFAULT true,
    "copyLog" TEXT NOT NULL DEFAULT '',
    "dispatchLog" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequestSegment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3),
    "timePreference" "TimePreference" NOT NULL DEFAULT 'ANY',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TravelRequestSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequestPassenger" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "personId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "type" "TravelPassengerType" NOT NULL DEFAULT 'HOLDER',
    "birthDate" TIMESTAMP(3),
    "docType" "TravelDocType" NOT NULL DEFAULT 'PASSPORT',
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docExpiry" TIMESTAMP(3),
    "nationality" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "loyalty" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TravelRequestPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "perPaxCents" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "inPolicy" BOOLEAN,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "TravelRequestStatus" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL DEFAULT '',
    "approverUserId" TEXT,
    "approverPersonId" TEXT,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TravelApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "travelRequestId" TEXT,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ExpenseReportStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "advanceCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "reimbursedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "merchant" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "exchangeRate" DECIMAL(14,6),
    "amountBrlCents" INTEGER,
    "receiptFileId" TEXT,
    "outOfPolicy" BOOLEAN NOT NULL DEFAULT false,
    "policyNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "LoyaltyKind" NOT NULL,
    "program" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRiskAlert" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "level" "RiskLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelRiskAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInviteSettings" (
    "projectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventTime" TEXT NOT NULL DEFAULT '',
    "dressCode" TEXT NOT NULL DEFAULT '',
    "inviteDeadline" TIMESTAMP(3),
    "individualPool" INTEGER NOT NULL DEFAULT 0,
    "quotasExpiredAt" TIMESTAMP(3),
    "nearbyHotels" JSONB NOT NULL DEFAULT '[]',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "defaultQuota" INTEGER NOT NULL DEFAULT 4,
    "autoSendOnCompanyRegistration" BOOLEAN NOT NULL DEFAULT true,
    "allowCompanion" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInviteSettings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "CompanyQuota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactRole" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "quota" INTEGER NOT NULL DEFAULT 4,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "provisionalPasswordEnc" TEXT NOT NULL DEFAULT '',
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "returnedToPool" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInvite" (
    "registrationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyQuotaId" TEXT,
    "kind" "InviteKind" NOT NULL DEFAULT 'COMPANY_GUEST',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventInvite_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "EventTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "shape" "TableShape" NOT NULL DEFAULT 'ROUND',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedFor" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EventTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatAssignment" (
    "registrationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "seat" INTEGER,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatAssignment_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "ExhibitionFloorPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageFileId" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1600,
    "height" INTEGER NOT NULL DEFAULT 900,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExhibitionFloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "sizeLabel" TEXT NOT NULL DEFAULT '',
    "areaM2" DECIMAL(8,2),
    "description" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT[],
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "contractTemplateId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "floorPlanId" TEXT,
    "tierId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER,
    "sizeLabel" TEXT,
    "areaM2" DECIMAL(8,2),
    "imageFileId" TEXT,
    "status" "StandStatus" NOT NULL DEFAULT 'AVAILABLE',
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "standId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "representativeName" TEXT NOT NULL DEFAULT '',
    "representativeCpf" TEXT NOT NULL DEFAULT '',
    "representativeRole" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "negotiatedCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT NOT NULL DEFAULT '',
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationAttachment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "fileId" TEXT,
    "sha256" TEXT NOT NULL DEFAULT '',
    "generatedAt" TIMESTAMP(3),
    "signedFileId" TEXT,
    "signedSha256" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "SignatureParty" NOT NULL DEFAULT 'SPONSOR',
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "strokeFileId" TEXT NOT NULL,
    "mode" "SignatureMode" NOT NULL DEFAULT 'IN_PERSON',
    "documentSha256" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "geolocation" TEXT NOT NULL DEFAULT '',
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "otpChannel" TEXT NOT NULL DEFAULT '',
    "witnessUserId" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "SignatureParty" NOT NULL DEFAULT 'SPONSOR',
    "tokenHash" TEXT NOT NULL,
    "otpHash" TEXT,
    "otpSentTo" TEXT NOT NULL DEFAULT '',
    "otpSentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airline" (
    "code" TEXT NOT NULL,
    "icao" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "logoFileId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Airport" (
    "iata" TEXT NOT NULL,
    "icao" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("iata")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "scope" "FlightScope" NOT NULL DEFAULT 'INTERNATIONAL',
    "airlineCode" TEXT NOT NULL DEFAULT '',
    "airlineName" TEXT NOT NULL DEFAULT '',
    "flightNumber" TEXT NOT NULL,
    "operatedBy" TEXT NOT NULL DEFAULT '',
    "originIata" TEXT NOT NULL,
    "originName" TEXT NOT NULL DEFAULT '',
    "destIata" TEXT NOT NULL,
    "destName" TEXT NOT NULL DEFAULT '',
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "defaultLocator" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "liveStatus" TEXT NOT NULL DEFAULT '',
    "liveData" JSONB,
    "liveCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightLocator" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FlightLocator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightPassenger" (
    "flightId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "locatorId" TEXT,
    "seat" TEXT NOT NULL DEFAULT '',
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "eticket" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FlightPassenger_pkey" PRIMARY KEY ("flightId","registrationId")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "type" "RoomType" NOT NULL DEFAULT 'DOUBLE',
    "typeLabel" TEXT NOT NULL DEFAULT '',
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "confirmation" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomOccupant" (
    "roomId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,

    CONSTRAINT "RoomOccupant_pkey" PRIMARY KEY ("roomId","registrationId")
);

-- CreateTable
CREATE TABLE "ItineraryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "responsible" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "audience" "Audience" NOT NULL DEFAULT 'ALL',
    "audienceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "responsible" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "history" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuralPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" "Audience" NOT NULL DEFAULT 'ALL',
    "audienceId" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "author" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MuralPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "ActorType" NOT NULL DEFAULT 'PERSON',
    "authorName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "registrationId" TEXT,
    "title" TEXT NOT NULL,
    "category" "ProjectDocumentCategory" NOT NULL DEFAULT 'GENERAL',
    "fileId" TEXT NOT NULL,
    "visibleToPerson" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "PersonDocumentKind" NOT NULL DEFAULT 'OTHER',
    "number" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "fileId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "status" "KioskStatus" NOT NULL DEFAULT 'PENDING_PAIRING',
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "deviceSecretHash" TEXT,
    "pairedAt" TIMESTAMP(3),
    "printMode" "PrintMode" NOT NULL DEFAULT 'LABEL',
    "printerDriver" "KioskPrinterDriver" NOT NULL DEFAULT 'BROWSER_KIOSK',
    "printerName" TEXT NOT NULL DEFAULT '',
    "labelTemplateId" TEXT,
    "badgeTemplateId" TEXT,
    "methods" "IdentificationMethod"[],
    "faceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.62,
    "livenessRequired" BOOLEAN NOT NULL DEFAULT true,
    "confirmBeforePrint" BOOLEAN NOT NULL DEFAULT true,
    "allowReprint" BOOLEAN NOT NULL DEFAULT false,
    "idleSeconds" INTEGER NOT NULL DEFAULT 20,
    "lastSeenAt" TIMESTAMP(3),
    "appVersion" TEXT NOT NULL DEFAULT '',
    "agentVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskIdentificationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "method" "IdentificationMethod" NOT NULL,
    "outcome" "IdentificationOutcome" NOT NULL,
    "registrationId" TEXT,
    "score" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskIdentificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessArea_tenantId_projectId_idx" ON "AccessArea"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessArea_projectId_name_key" ON "AccessArea"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccessScan_clientUuid_key" ON "AccessScan"("clientUuid");

-- CreateIndex
CREATE INDEX "AccessScan_tenantId_projectId_areaId_scannedAt_idx" ON "AccessScan"("tenantId", "projectId", "areaId", "scannedAt");

-- CreateIndex
CREATE INDEX "AccessScan_registrationId_areaId_scannedAt_idx" ON "AccessScan"("registrationId", "areaId", "scannedAt");

-- CreateIndex
CREATE INDEX "NetworkingContact_tenantId_projectId_idx" ON "NetworkingContact"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkingContact_ownerRegistrationId_contactRegistrationId_key" ON "NetworkingContact"("ownerRegistrationId", "contactRegistrationId");

-- CreateIndex
CREATE INDEX "BadgePrint_tenantId_projectId_printedAt_idx" ON "BadgePrint"("tenantId", "projectId", "printedAt");

-- CreateIndex
CREATE INDEX "BadgePrint_registrationId_idx" ON "BadgePrint"("registrationId");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_projectId_createdAt_idx" ON "ImportBatch"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormIntegration_webhookSecret_key" ON "FormIntegration"("webhookSecret");

-- CreateIndex
CREATE INDEX "FormIntegration_tenantId_projectId_idx" ON "FormIntegration"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FormIntegrationSource_integrationId_externalFormId_key" ON "FormIntegrationSource"("integrationId", "externalFormId");

-- CreateIndex
CREATE INDEX "Supplier_workspaceId_name_idx" ON "Supplier"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Supplier_workspaceId_tenantId_idx" ON "Supplier"("workspaceId", "tenantId");

-- CreateIndex
CREATE INDEX "SupplierAgreement_supplierId_idx" ON "SupplierAgreement"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierAgreement_tenantId_idx" ON "SupplierAgreement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingProviderAccount_workspaceId_provider_name_key" ON "BookingProviderAccount"("workspaceId", "provider", "name");

-- CreateIndex
CREATE INDEX "ServiceItem_tenantId_projectId_type_idx" ON "ServiceItem"("tenantId", "projectId", "type");

-- CreateIndex
CREATE INDEX "ServiceItem_tenantId_status_idx" ON "ServiceItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ServiceItem_travelRequestId_idx" ON "ServiceItem"("travelRequestId");

-- CreateIndex
CREATE INDEX "ServiceItem_quoteId_idx" ON "ServiceItem"("quoteId");

-- CreateIndex
CREATE INDEX "ServiceItem_locator_idx" ON "ServiceItem"("locator");

-- CreateIndex
CREATE INDEX "ServiceItemTraveler_serviceItemId_idx" ON "ServiceItemTraveler"("serviceItemId");

-- CreateIndex
CREATE INDEX "ServiceItemTraveler_personId_idx" ON "ServiceItemTraveler"("personId");

-- CreateIndex
CREATE INDEX "ServiceItemTraveler_registrationId_idx" ON "ServiceItemTraveler"("registrationId");

-- CreateIndex
CREATE INDEX "ServiceItemAttachment_serviceItemId_idx" ON "ServiceItemAttachment"("serviceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonAccessInvite_tokenHash_key" ON "PersonAccessInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonAccessInvite_tenantId_personId_idx" ON "PersonAccessInvite"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_tenantId_code_key" ON "CostCenter"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TravelPolicy_tenantId_active_idx" ON "TravelPolicy"("tenantId", "active");

-- CreateIndex
CREATE INDEX "TravelPolicyRule_policyId_serviceType_idx" ON "TravelPolicyRule"("policyId", "serviceType");

-- CreateIndex
CREATE INDEX "ApprovalFlow_tenantId_active_idx" ON "ApprovalFlow"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_flowId_sortOrder_key" ON "ApprovalStep"("flowId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRequest_chosenQuoteId_key" ON "TravelRequest"("chosenQuoteId");

-- CreateIndex
CREATE INDEX "TravelRequest_tenantId_status_createdAt_idx" ON "TravelRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_tenantId_requesterPersonId_idx" ON "TravelRequest"("tenantId", "requesterPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRequest_tenantId_protocol_key" ON "TravelRequest"("tenantId", "protocol");

-- CreateIndex
CREATE INDEX "TravelRequestSegment_requestId_sortOrder_idx" ON "TravelRequestSegment"("requestId", "sortOrder");

-- CreateIndex
CREATE INDEX "TravelRequestPassenger_requestId_sortOrder_idx" ON "TravelRequestPassenger"("requestId", "sortOrder");

-- CreateIndex
CREATE INDEX "TravelQuote_requestId_sortOrder_idx" ON "TravelQuote"("requestId", "sortOrder");

-- CreateIndex
CREATE INDEX "TravelRequestEvent_requestId_createdAt_idx" ON "TravelRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelApproval_tokenHash_key" ON "TravelApproval"("tokenHash");

-- CreateIndex
CREATE INDEX "TravelApproval_requestId_sortOrder_idx" ON "TravelApproval"("requestId", "sortOrder");

-- CreateIndex
CREATE INDEX "TravelApproval_approverUserId_decision_idx" ON "TravelApproval"("approverUserId", "decision");

-- CreateIndex
CREATE INDEX "TravelApproval_approverPersonId_decision_idx" ON "TravelApproval"("approverPersonId", "decision");

-- CreateIndex
CREATE INDEX "ExpenseReport_tenantId_status_idx" ON "ExpenseReport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExpenseReport_tenantId_personId_idx" ON "ExpenseReport"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "ExpenseItem_reportId_idx" ON "ExpenseItem"("reportId");

-- CreateIndex
CREATE INDEX "LoyaltyMembership_tenantId_idx" ON "LoyaltyMembership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyMembership_personId_program_key" ON "LoyaltyMembership"("personId", "program");

-- CreateIndex
CREATE INDEX "TravelRiskAlert_country_validUntil_idx" ON "TravelRiskAlert"("country", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyQuota_login_key" ON "CompanyQuota"("login");

-- CreateIndex
CREATE INDEX "CompanyQuota_tenantId_projectId_idx" ON "CompanyQuota"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "EventInvite_tenantId_projectId_idx" ON "EventInvite"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "EventInvite_companyQuotaId_idx" ON "EventInvite"("companyQuotaId");

-- CreateIndex
CREATE INDEX "EventTable_tenantId_projectId_idx" ON "EventTable"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTable_projectId_number_key" ON "EventTable"("projectId", "number");

-- CreateIndex
CREATE INDEX "SeatAssignment_tableId_idx" ON "SeatAssignment"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_tableId_seat_key" ON "SeatAssignment"("tableId", "seat");

-- CreateIndex
CREATE INDEX "ExhibitionFloorPlan_tenantId_projectId_idx" ON "ExhibitionFloorPlan"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "SponsorTier_tenantId_projectId_idx" ON "SponsorTier"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorTier_projectId_name_key" ON "SponsorTier"("projectId", "name");

-- CreateIndex
CREATE INDEX "Stand_tenantId_projectId_status_idx" ON "Stand"("tenantId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Stand_projectId_code_key" ON "Stand"("projectId", "code");

-- CreateIndex
CREATE INDEX "StandReservation_tenantId_projectId_status_idx" ON "StandReservation"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "StandReservation_status_expiresAt_idx" ON "StandReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "StandReservation_standId_idx" ON "StandReservation"("standId");

-- CreateIndex
CREATE INDEX "StandReservation_sellerUserId_idx" ON "StandReservation"("sellerUserId");

-- CreateIndex
CREATE INDEX "ReservationAttachment_reservationId_idx" ON "ReservationAttachment"("reservationId");

-- CreateIndex
CREATE INDEX "SponsorshipContract_tenantId_status_idx" ON "SponsorshipContract"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipContract_reservationId_version_key" ON "SponsorshipContract"("reservationId", "version");

-- CreateIndex
CREATE INDEX "ContractSignature_contractId_idx" ON "ContractSignature"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_tokenHash_key" ON "SignatureRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SignatureRequest_contractId_idx" ON "SignatureRequest"("contractId");

-- CreateIndex
CREATE INDEX "SignatureRequest_expiresAt_idx" ON "SignatureRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_serviceItemId_key" ON "Flight"("serviceItemId");

-- CreateIndex
CREATE INDEX "Flight_tenantId_projectId_departureAt_idx" ON "Flight"("tenantId", "projectId", "departureAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlightLocator_flightId_code_key" ON "FlightLocator"("flightId", "code");

-- CreateIndex
CREATE INDEX "FlightPassenger_registrationId_idx" ON "FlightPassenger"("registrationId");

-- CreateIndex
CREATE INDEX "FlightPassenger_locatorId_idx" ON "FlightPassenger"("locatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_serviceItemId_key" ON "Accommodation"("serviceItemId");

-- CreateIndex
CREATE INDEX "Accommodation_tenantId_projectId_idx" ON "Accommodation"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Room_accommodationId_idx" ON "Room"("accommodationId");

-- CreateIndex
CREATE INDEX "RoomOccupant_registrationId_idx" ON "RoomOccupant"("registrationId");

-- CreateIndex
CREATE INDEX "ItineraryItem_tenantId_projectId_date_idx" ON "ItineraryItem"("tenantId", "projectId", "date");

-- CreateIndex
CREATE INDEX "ChecklistItem_tenantId_projectId_status_idx" ON "ChecklistItem"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "MuralPost_tenantId_projectId_active_idx" ON "MuralPost"("tenantId", "projectId", "active");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_projectId_status_idx" ON "SupportTicket"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDocument_tenantId_projectId_idx" ON "ProjectDocument"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectDocument_registrationId_idx" ON "ProjectDocument"("registrationId");

-- CreateIndex
CREATE INDEX "PersonDocument_tenantId_personId_idx" ON "PersonDocument"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "PersonDocument_expiresAt_idx" ON "PersonDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "KioskDevice_tenantId_projectId_idx" ON "KioskDevice"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "KioskIdentificationAttempt_tenantId_projectId_createdAt_idx" ON "KioskIdentificationAttempt"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "KioskIdentificationAttempt_kioskId_createdAt_idx" ON "KioskIdentificationAttempt"("kioskId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessArea" ADD CONSTRAINT "AccessArea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAreaCategory" ADD CONSTRAINT "AccessAreaCategory_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AccessArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAreaCategory" ADD CONSTRAINT "AccessAreaCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RegistrationCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessScan" ADD CONSTRAINT "AccessScan_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AccessArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessScan" ADD CONSTRAINT "AccessScan_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkingContact" ADD CONSTRAINT "NetworkingContact_ownerRegistrationId_fkey" FOREIGN KEY ("ownerRegistrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkingContact" ADD CONSTRAINT "NetworkingContact_contactRegistrationId_fkey" FOREIGN KEY ("contactRegistrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgePrint" ADD CONSTRAINT "BadgePrint_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgePrint" ADD CONSTRAINT "BadgePrint_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "KioskDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormIntegration" ADD CONSTRAINT "FormIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormIntegrationSource" ADD CONSTRAINT "FormIntegrationSource_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FormIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAgreement" ADD CONSTRAINT "SupplierAgreement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProviderAccount" ADD CONSTRAINT "BookingProviderAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "TravelQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemTraveler" ADD CONSTRAINT "ServiceItemTraveler_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemTraveler" ADD CONSTRAINT "ServiceItemTraveler_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemTraveler" ADD CONSTRAINT "ServiceItemTraveler_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemAttachment" ADD CONSTRAINT "ServiceItemAttachment_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAccessInvite" ADD CONSTRAINT "PersonAccessInvite_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_managerPersonId_fkey" FOREIGN KEY ("managerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPolicy" ADD CONSTRAINT "TravelPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPolicyRule" ADD CONSTRAINT "TravelPolicyRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TravelPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPolicyPreferredSupplier" ADD CONSTRAINT "TravelPolicyPreferredSupplier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TravelPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPolicyPreferredSupplier" ADD CONSTRAINT "TravelPolicyPreferredSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalFlow" ADD CONSTRAINT "ApprovalFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ApprovalFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TravelPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_chosenQuoteId_fkey" FOREIGN KEY ("chosenQuoteId") REFERENCES "TravelQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequestSegment" ADD CONSTRAINT "TravelRequestSegment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequestPassenger" ADD CONSTRAINT "TravelRequestPassenger_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequestPassenger" ADD CONSTRAINT "TravelRequestPassenger_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelQuote" ADD CONSTRAINT "TravelQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequestEvent" ADD CONSTRAINT "TravelRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelApproval" ADD CONSTRAINT "TravelApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMembership" ADD CONSTRAINT "LoyaltyMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInviteSettings" ADD CONSTRAINT "EventInviteSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyQuota" ADD CONSTRAINT "CompanyQuota_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyQuota" ADD CONSTRAINT "CompanyQuota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_companyQuotaId_fkey" FOREIGN KEY ("companyQuotaId") REFERENCES "CompanyQuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTable" ADD CONSTRAINT "EventTable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "EventTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitionFloorPlan" ADD CONSTRAINT "ExhibitionFloorPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorTier" ADD CONSTRAINT "SponsorTier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stand" ADD CONSTRAINT "Stand_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stand" ADD CONSTRAINT "Stand_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "ExhibitionFloorPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stand" ADD CONSTRAINT "Stand_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "SponsorTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandReservation" ADD CONSTRAINT "StandReservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandReservation" ADD CONSTRAINT "StandReservation_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Stand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandReservation" ADD CONSTRAINT "StandReservation_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandReservation" ADD CONSTRAINT "StandReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationAttachment" ADD CONSTRAINT "ReservationAttachment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StandReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StandReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SponsorshipContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SponsorshipContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLocator" ADD CONSTRAINT "FlightLocator_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightPassenger" ADD CONSTRAINT "FlightPassenger_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightPassenger" ADD CONSTRAINT "FlightPassenger_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightPassenger" ADD CONSTRAINT "FlightPassenger_locatorId_fkey" FOREIGN KEY ("locatorId") REFERENCES "FlightLocator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomOccupant" ADD CONSTRAINT "RoomOccupant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomOccupant" ADD CONSTRAINT "RoomOccupant_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuralPost" ADD CONSTRAINT "MuralPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskIdentificationAttempt" ADD CONSTRAINT "KioskIdentificationAttempt_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "KioskDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskIdentificationAttempt" ADD CONSTRAINT "KioskIdentificationAttempt_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
