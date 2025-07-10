export enum PermitStatus {
    New = "new",
    Submitted = "submitted",
    Review = "review",
    Approved = "approved"
}

export enum PermitType {
    Electrical = "electrical_permit"
}

export enum CategoryOfWork {
    Residential = "residential",
    Commercial = "commercial",
    MixUse = "mix_use",
    Others = "others"
}

export enum TypeOfWork {
    NewBuilt = "new_built",
    Improvement = "improvement",
    Temp = "temp",
    Other = "other"
}

export enum ServiceType {
    Main = "main",
    Minor = "minor",
    Others = "others"
}

export enum InspectionOutcome {
    Pending = "pending",
    Passed = "passed",
    Failed = "failed",
    Conditional = "conditional"
}

export enum PermitActivityType {
    Created = "created",
    Submitted = "submitted",
    UnderReview = "under_review",
    Approved = "approved",
    Rejected = "rejected",
    Modified = "modified"
}

export interface InspectionActivity {
    id?: string;
    type: string;
    dateScheduled?: string;
    dateCompleted?: string;
    outcome: InspectionOutcome;
    inspectionTime?: string;
    inspector?: string;
    notes?: string;
}

export interface PermitActivity {
    id?: string;
    type: PermitActivityType;
    createdDate: string;
    dateCompleted?: string;
    outcome?: string;
    description: string;
    performedBy?: string;
}

export interface PermitFee {
    id?: string;
    date: string;
    description: string;
    amount: number;
    taxAmount: number;
    isPaid?: boolean;
    isEditable?: boolean;
}

export interface Document {
    id?: string;
    fileName: string;
    uploadedDate: string;
    fileSize?: number;
    fileType?: string;
    uploadedBy?: string;
    documentType?: string;
}

export interface PermitApplication {
    id?: string;
    permitNumber: string;
    permitStatus: PermitStatus;
    permitType: PermitType;

    // Applicant Information
    applicantName: string;
    applicantEmail?: string;
    applicantPhone?: string;
    requestDate: string;

    // Job Information
    jobAddress: string;
    jobName: string;
    jobNumber: string;
    jobDescription?: string;
    specificLocation?: string;

    // Work Category
    categoryOfWork: CategoryOfWork;
    typeOfWork: TypeOfWork;

    // Electrical Details
    electricalService?: string;
    undergroundConductor: boolean;
    serviceType: ServiceType;
    phase: number;
    wire?: string;
    volts?: string;
    amps?: string;

    // Additional Information
    applicationCategories?: string;
    relocatableStructureNumber?: string;
    relatedBuildingPermitNumber?: string;
    totalJobCost: number;

    // Contact Information
    qualifiedTradesmanId?: string;
    qualifiedTradesmanName?: string;
    cqtContactNumber?: string;
    cqtEmailAddress?: string;
    onsiteContactName?: string;
    contactPhoneNumber?: string;
    contactEmail?: string;

    // Activities and Fees
    inspectionActivities: InspectionActivity[];
    permitActivities: PermitActivity[];
    permitFees: PermitFee[];
    documents: Document[];

    // System fields
    createdDate?: string;
    lastModifiedDate?: string;
    createdBy?: string;
    lastModifiedBy?: string;
}

export interface PermitApplicationCreateRequest {
    permitApplication: PermitApplication;
}

export interface PermitApplicationResponse {
    success: boolean;
    message?: string;
    permitApplication?: PermitApplication;
    permitNumber?: string;
}

export interface AutoFillUserData {
    applicantName?: string;
    applicantEmail?: string;
    applicantPhone?: string;
    userId?: string;
}

export interface AddressValidationResponse {
    isValid: boolean;
    formattedAddress?: string;
    suggestions?: string[];
    error?: string;
}

export interface TradesmanData {
    id: string;
    name: string;
    contactNumber: string;
    email: string;
    isValidated: boolean;
    licenseNumber?: string;
    licenseExpiryDate?: string;
    specializations?: string[];
}
