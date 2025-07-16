import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import {
    Panel,
    PrimaryButton,
    DefaultButton,
    TextField,
    Dropdown,
    IDropdownOption,
    DatePicker,
    Checkbox,
    MessageBar,
    MessageBarType,
    Separator,
    Stack,
    Text,
    ProgressIndicator
} from "@fluentui/react";
import styles from "./PermitApplication.module.css";
import { getToken, useLogin } from "../../authConfig";
import { useMsal } from "@azure/msal-react";
import {
    PermitApplication as PermitApplicationModel,
    PermitStatus,
    PermitType,
    CategoryOfWork,
    TypeOfWork,
    ServiceType,
    InspectionActivity,
    PermitActivity,
    PermitFee,
    Document
} from "../../api/permitModels";
import { createPermitApplicationApi, getAutoFillDataApi, getTradesmanDataApi, calculatePermitFeesApi, getAutoFillFieldDataApi } from "../../api/permitApi";
import SpeechInput from "../../components/SpeechInput/SpeechInput";

interface AutoFillData {
    applicantName?: string;
    applicantEmail?: string;
    applicantPhone?: string;
    userId?: string;
}

interface TradesmanData {
    name: string;
    contactNumber: string;
    email: string;
    isValidated: boolean;
}

const PermitApplication: React.FC = () => {
    const { t } = useTranslation();
    const { instance, accounts } = useMsal();
    const [isLoading, setIsLoading] = useState(false);
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: MessageBarType } | null>(null);

    // Form state
    const [formData, setFormData] = useState<PermitApplicationModel>({
        permitNumber: "",
        permitStatus: PermitStatus.New,
        permitType: PermitType.Electrical,
        applicantName: "",
        applicantEmail: "",
        applicantPhone: "",
        requestDate: new Date().toISOString().split("T")[0],
        jobAddress: "",
        jobName: "",
        jobNumber: "",
        jobDescription: "",
        specificLocation: "",
        categoryOfWork: CategoryOfWork.Residential,
        typeOfWork: TypeOfWork.NewBuilt,
        electricalService: "",
        undergroundConductor: false,
        serviceType: ServiceType.Main,
        phase: 1,
        wire: "",
        volts: "",
        amps: "",
        applicationCategories: "",
        relocatableStructureNumber: "",
        relatedBuildingPermitNumber: "",
        totalJobCost: 0,
        qualifiedTradesmanId: "",
        qualifiedTradesmanName: "",
        cqtContactNumber: "",
        cqtEmailAddress: "",
        onsiteContactName: "",
        contactPhoneNumber: "",
        contactEmail: "",
        inspectionActivities: [],
        permitActivities: [],
        permitFees: [],
        documents: []
    });

    // Dropdown options
    const permitStatusOptions: IDropdownOption[] = [
        { key: PermitStatus.New, text: "New" },
        { key: PermitStatus.Submitted, text: "Submitted" },
        { key: PermitStatus.Review, text: "Review" },
        { key: PermitStatus.Approved, text: "Approved" }
    ];

    const permitTypeOptions: IDropdownOption[] = [{ key: PermitType.Electrical, text: "Electrical Permit" }];

    const categoryOfWorkOptions: IDropdownOption[] = [
        { key: CategoryOfWork.Residential, text: "Residential" },
        { key: CategoryOfWork.Commercial, text: "Commercial" },
        { key: CategoryOfWork.MixUse, text: "Mix Use" },
        { key: CategoryOfWork.Others, text: "Others" }
    ];

    const typeOfWorkOptions: IDropdownOption[] = [
        { key: TypeOfWork.NewBuilt, text: "New Built" },
        { key: TypeOfWork.Improvement, text: "Improvement" },
        { key: TypeOfWork.Temp, text: "Temporary" },
        { key: TypeOfWork.Other, text: "Other" }
    ];

    const serviceTypeOptions: IDropdownOption[] = [
        { key: ServiceType.Main, text: "Main" },
        { key: ServiceType.Minor, text: "Minor" },
        { key: ServiceType.Others, text: "Others" }
    ];

    const phaseOptions: IDropdownOption[] = [
        { key: 1, text: "1" },
        { key: 2, text: "2" },
        { key: 3, text: "3" },
        { key: 4, text: "4" }
    ];

    // Auto-fill functions
    const handleAutoFillUserData = async () => {
        try {
            setIsAutoFilling(true);
            const token = await getToken(instance);
            const autoFillData = await getAutoFillDataApi(token);

            if (autoFillData) {
                setFormData((prev: PermitApplicationModel) => ({
                    ...prev,
                    applicantName: autoFillData.applicantName || prev.applicantName,
                    applicantEmail: autoFillData.applicantEmail || prev.applicantEmail,
                    applicantPhone: autoFillData.applicantPhone || prev.applicantPhone
                }));
            }
        } catch (error) {
            console.error("Failed to auto-fill user data:", error);
            setMessage({ text: "Failed to auto-fill user data", type: MessageBarType.error });
        } finally {
            setIsAutoFilling(false);
        }
    };

    const handleTradesmanLookup = async (tradesmanId: string) => {
        if (!tradesmanId.trim()) return;

        try {
            const token = await getToken(instance);
            const tradesmanData = await getTradesmanDataApi(tradesmanId, token);

            if (tradesmanData && tradesmanData.isValidated) {
                setFormData((prev: PermitApplicationModel) => ({
                    ...prev,
                    qualifiedTradesmanName: tradesmanData.name,
                    cqtContactNumber: tradesmanData.contactNumber,
                    cqtEmailAddress: tradesmanData.email
                }));
                setMessage({ text: "Tradesman data auto-filled successfully", type: MessageBarType.success });
            } else {
                setMessage({ text: "Tradesman not found or not validated", type: MessageBarType.warning });
            }
        } catch (error) {
            console.error("Tradesman lookup failed:", error);
            setMessage({ text: "Tradesman lookup failed", type: MessageBarType.error });
        }
    };

    // Generate unique numbers
    const generatePermitNumber = () => {
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 1000);
        return `PE${timestamp}${randomNum}`;
    };

    const generateJobNumber = () => {
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 1000);
        return `JOB${timestamp}${randomNum}`;
    };

    // Initialize form
    useEffect(() => {
        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            permitNumber: generatePermitNumber(),
            jobNumber: generateJobNumber()
        }));

        // Auto-fill user data on component mount
        if (useLogin && accounts.length > 0) {
            handleAutoFillUserData();
        }
    }, []);

    // Handle form submission
    const handleSubmit = async () => {
        console.log("=== SUBMIT BUTTON CLICKED ===");
        console.log("handleSubmit function invoked");
        console.log("Form data:", formData);

        try {
            setIsLoading(true);
            setMessage(null);

            console.log("Getting token...");
            const token = await getToken(instance);
            console.log("Token obtained:", token ? "Yes" : "No");

            console.log("Calling createPermitApplicationApi...");
            const result = await createPermitApplicationApi(formData, token);
            console.log("API call completed, result:", result);

            if (result.success) {
                setMessage({ text: "Permit application submitted successfully!", type: MessageBarType.success });
                // Reset form or redirect as needed
            } else {
                setMessage({ text: result.message || "Failed to submit application", type: MessageBarType.error });
            }
        } catch (error) {
            console.error("Failed to submit permit application:", error);
            setMessage({ text: "Failed to submit permit application", type: MessageBarType.error });
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (field: keyof PermitApplicationModel, value: any) => {
        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            [field]: value
        }));
    };

    const handleCalculateFees = async () => {
        try {
            setIsLoading(true);
            const token = await getToken(instance);
            const fees = await calculatePermitFeesApi(formData.permitType, formData.totalJobCost, token);

            if (fees && fees.length > 0) {
                setFormData((prev: PermitApplicationModel) => ({
                    ...prev,
                    permitFees: fees
                }));
                setMessage({ text: "Fees calculated successfully!", type: MessageBarType.success });
            } else {
                setMessage({ text: "No fees calculated. Please check permit type and job cost.", type: MessageBarType.warning });
            }
        } catch (error) {
            console.error("Failed to calculate fees:", error);
            setMessage({ text: "Failed to calculate fees", type: MessageBarType.error });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFeeChange = (index: number, field: keyof PermitFee, value: string | number) => {
        setFormData((prev: PermitApplicationModel) => {
            const updatedFees = [...prev.permitFees];
            updatedFees[index] = {
                ...updatedFees[index],
                [field]: value
            };
            return {
                ...prev,
                permitFees: updatedFees
            };
        });
    };

    const handleAddFee = () => {
        const newFee: PermitFee = {
            id: `fee-${Date.now()}`,
            date: new Date().toISOString().split("T")[0],
            description: "",
            amount: 0,
            taxAmount: 0,
            isPaid: false,
            isEditable: true
        };

        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            permitFees: [...prev.permitFees, newFee]
        }));
    };

    const handleRemoveFee = (index: number) => {
        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            permitFees: prev.permitFees.filter((_, i) => i !== index)
        }));
    };

    const handleAutoFillField = async (fieldName: keyof PermitApplicationModel) => {
        try {
            const token = await getToken(instance);
            const autoFillValue = await getAutoFillFieldDataApi(fieldName as string, token);

            if (autoFillValue !== "") {
                // Handle different field types appropriately
                let processedValue: any = autoFillValue;

                // Convert string values to appropriate types for specific fields
                if (fieldName === "totalJobCost") {
                    processedValue = parseFloat(autoFillValue) || 0;
                } else if (fieldName === "phase") {
                    processedValue = parseInt(autoFillValue) || 1;
                } else if (fieldName === "undergroundConductor") {
                    processedValue = autoFillValue.toLowerCase() === "true";
                } else if (fieldName === "requestDate") {
                    processedValue = autoFillValue;
                }

                handleInputChange(fieldName, processedValue);
                setMessage({ text: `${fieldName} auto-filled successfully!`, type: MessageBarType.success });
            } else {
                setMessage({ text: `No auto-fill data available for ${fieldName}`, type: MessageBarType.warning });
            }
        } catch (error) {
            console.error(`Failed to auto-fill ${fieldName}:`, error);
            setMessage({ text: `Failed to auto-fill ${fieldName}`, type: MessageBarType.error });
        }
    };

    const handleSpeechResult = async (fieldName: keyof PermitApplicationModel, transcript: string) => {
        try {
            const token = await getToken(instance);

            // Call the backend speech processing API
            const response = await fetch("/api/permit/autofill/speech", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    speechText: transcript,
                    fieldName: fieldName
                })
            });

            if (response.ok) {
                const data = await response.json();
                const processedValue = data.processedValue;

                // Handle different field types appropriately
                let finalValue: any = processedValue;

                if (fieldName === "totalJobCost") {
                    finalValue = parseFloat(processedValue) || 0;
                } else if (fieldName === "phase") {
                    finalValue = parseInt(processedValue) || 1;
                } else if (fieldName === "undergroundConductor") {
                    finalValue = processedValue.toLowerCase() === "true";
                }

                handleInputChange(fieldName, finalValue);
                setMessage({ text: `Speech input processed for ${fieldName}!`, type: MessageBarType.success });
            } else {
                throw new Error("Failed to process speech");
            }
        } catch (error) {
            console.error(`Failed to process speech for ${fieldName}:`, error);
            setMessage({ text: `Failed to process speech for ${fieldName}`, type: MessageBarType.error });
        }
    };

    return (
        <div className={styles.permitApplication}>
            <Helmet>
                <title>Permit Application - Calgary</title>
            </Helmet>

            <div className={styles.header}>
                <Text variant="xxLarge" className={styles.title}>
                    Permit Application
                </Text>
                <Text variant="medium" className={styles.subtitle}>
                    Complete the form below to submit your permit application
                </Text>
            </div>

            {message && (
                <MessageBar messageBarType={message.type} onDismiss={() => setMessage(null)} className={styles.messageBar}>
                    {message.text}
                </MessageBar>
            )}

            {isAutoFilling && <ProgressIndicator label="Auto-filling data..." className={styles.progressIndicator} />}

            <div className={styles.formContainer}>
                {/* Permit Details Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Permit Details
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <TextField label="Permit Number" value={formData.permitNumber} disabled className={styles.field} />

                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Permit Status"
                                selectedKey={formData.permitStatus}
                                options={permitStatusOptions}
                                onChange={(_, option) => handleInputChange("permitStatus", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("permitStatus", transcript)}
                                placeholder="Say permit status"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Permit Type"
                                selectedKey={formData.permitType}
                                options={permitTypeOptions}
                                onChange={(_, option) => handleInputChange("permitType", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("permitType", transcript)} placeholder="Say permit type" />
                        </div>
                    </Stack>
                </div>

                {/* Applicant Information Section */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Text variant="xLarge" className={styles.sectionTitle}>
                            Applicant Information
                        </Text>
                        <div className={styles.speechButtonGroup}>
                            <SpeechInput
                                onTranscript={(transcript: string) => {
                                    // Handle multiple fields from user profile speech
                                    const words = transcript.toLowerCase().split(" ");
                                    if (words.includes("name") || words.includes("profile")) {
                                        handleAutoFillUserData();
                                    }
                                }}
                                placeholder="Say 'fill my profile' or 'my name'"
                            />
                        </div>
                    </div>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Applicant Name"
                                value={formData.applicantName}
                                onChange={(_, value) => handleInputChange("applicantName", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("applicantName", transcript)} placeholder="Say your name" />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Applicant Email"
                                value={formData.applicantEmail}
                                onChange={(_, value) => handleInputChange("applicantEmail", value)}
                                type="email"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("applicantEmail", transcript)} placeholder="Say your email" />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Applicant Phone"
                                value={formData.applicantPhone}
                                onChange={(_, value) => handleInputChange("applicantPhone", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("applicantPhone", transcript)}
                                placeholder="Say your phone number"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Request Date"
                                value={formData.requestDate}
                                onChange={(_, value) => handleInputChange("requestDate", value)}
                                type="date"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("requestDate", transcript)} placeholder="Say the date" />
                        </div>
                    </Stack>
                </div>

                {/* Job Information Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Job Information
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Job Address"
                                value={formData.jobAddress}
                                onChange={(_, value) => handleInputChange("jobAddress", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("jobAddress", transcript)} placeholder="Say the address" />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Job Name"
                                value={formData.jobName}
                                onChange={(_, value) => handleInputChange("jobName", value)}
                                placeholder="e.g. Temp Electrical setup"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("jobName", transcript)} placeholder="Say job name" />
                        </div>

                        <TextField label="Job Number" value={formData.jobNumber} disabled className={styles.field} />

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Job Description"
                                value={formData.jobDescription}
                                onChange={(_, value) => handleInputChange("jobDescription", value)}
                                placeholder="kitchen electrical setup for shelter"
                                multiline
                                rows={3}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("jobDescription", transcript)}
                                placeholder="Describe the job"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Specific Location/Additional Info"
                                value={formData.specificLocation}
                                onChange={(_, value) => handleInputChange("specificLocation", value)}
                                placeholder="could be parcel or land without building or backyard etc"
                                multiline
                                rows={2}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("specificLocation", transcript)}
                                placeholder="Say location details"
                            />
                        </div>
                    </Stack>
                </div>

                {/* Work Category Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Work Category
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Category of Work"
                                selectedKey={formData.categoryOfWork}
                                options={categoryOfWorkOptions}
                                onChange={(_, option) => handleInputChange("categoryOfWork", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("categoryOfWork", transcript)}
                                placeholder="Say work category"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Type of Work"
                                selectedKey={formData.typeOfWork}
                                options={typeOfWorkOptions}
                                onChange={(_, option) => handleInputChange("typeOfWork", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("typeOfWork", transcript)} placeholder="Say work type" />
                        </div>
                    </Stack>
                </div>

                {/* Electrical Details Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Electrical Details
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Electrical Service"
                                value={formData.electricalService}
                                onChange={(_, value) => handleInputChange("electricalService", value)}
                                placeholder="usage"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("electricalService", transcript)}
                                placeholder="Say electrical service"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <Checkbox
                                label="Underground Conductor 1/0 or larger"
                                checked={formData.undergroundConductor}
                                onChange={(_, checked) => handleInputChange("undergroundConductor", checked)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("undergroundConductor", transcript)}
                                placeholder="Say yes or no"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Service Type"
                                selectedKey={formData.serviceType}
                                options={serviceTypeOptions}
                                onChange={(_, option) => handleInputChange("serviceType", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("serviceType", transcript)} placeholder="Say service type" />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <Dropdown
                                label="Phase"
                                selectedKey={formData.phase}
                                options={phaseOptions}
                                onChange={(_, option) => handleInputChange("phase", option?.key)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("phase", transcript)} placeholder="Say phase number" />
                        </div>

                        <div className={styles.inlineFields}>
                            <div className={styles.fieldWithSpeech}>
                                <TextField
                                    label="Wire"
                                    value={formData.wire}
                                    onChange={(_, value) => handleInputChange("wire", value)}
                                    className={styles.inlineField}
                                />
                                <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("wire", transcript)} placeholder="Say wire type" />
                            </div>

                            <div className={styles.fieldWithSpeech}>
                                <TextField
                                    label="Volts"
                                    value={formData.volts}
                                    onChange={(_, value) => handleInputChange("volts", value)}
                                    className={styles.inlineField}
                                />
                                <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("volts", transcript)} placeholder="Say voltage" />
                            </div>

                            <div className={styles.fieldWithSpeech}>
                                <TextField
                                    label="Amps"
                                    value={formData.amps}
                                    onChange={(_, value) => handleInputChange("amps", value)}
                                    className={styles.inlineField}
                                />
                                <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("amps", transcript)} placeholder="Say amperage" />
                            </div>
                        </div>
                    </Stack>
                </div>

                {/* Additional Information Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Additional Information
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Application Categories"
                                value={formData.applicationCategories}
                                onChange={(_, value) => handleInputChange("applicationCategories", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("applicationCategories", transcript)}
                                placeholder="Say application categories"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Relocatable Structure Number"
                                value={formData.relocatableStructureNumber}
                                onChange={(_, value) => handleInputChange("relocatableStructureNumber", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("relocatableStructureNumber", transcript)}
                                placeholder="Say structure number"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Related Permit Number"
                                value={formData.relatedBuildingPermitNumber}
                                onChange={(_, value) => handleInputChange("relatedBuildingPermitNumber", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("relatedBuildingPermitNumber", transcript)}
                                placeholder="Say permit number"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Total Job Cost"
                                value={formData.totalJobCost.toString()}
                                onChange={(_, value) => handleInputChange("totalJobCost", parseFloat(value || "0"))}
                                type="number"
                                prefix="$"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput onTranscript={(transcript: string) => handleSpeechResult("totalJobCost", transcript)} placeholder="Say the cost" />
                        </div>
                    </Stack>
                </div>

                {/* Contact Information Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Contact Information
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Qualified Tradesman ID"
                                value={formData.qualifiedTradesmanId}
                                onChange={(_, value) => handleInputChange("qualifiedTradesmanId", value)}
                                className={styles.fieldGrow}
                                onBlur={e => handleTradesmanLookup(e.target.value)}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("qualifiedTradesmanId", transcript)}
                                placeholder="Say tradesman ID"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Qualified Tradesman Name"
                                value={formData.qualifiedTradesmanName}
                                onChange={(_, value) => handleInputChange("qualifiedTradesmanName", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("qualifiedTradesmanName", transcript)}
                                placeholder="Say tradesman name"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="CQT Contact Number"
                                value={formData.cqtContactNumber}
                                onChange={(_, value) => handleInputChange("cqtContactNumber", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("cqtContactNumber", transcript)}
                                placeholder="Say contact number"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="CQT Email Address"
                                value={formData.cqtEmailAddress}
                                onChange={(_, value) => handleInputChange("cqtEmailAddress", value)}
                                type="email"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("cqtEmailAddress", transcript)}
                                placeholder="Say email address"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="On-site Contact Name"
                                value={formData.onsiteContactName}
                                onChange={(_, value) => handleInputChange("onsiteContactName", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("onsiteContactName", transcript)}
                                placeholder="Say contact name"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Contact Phone Number"
                                value={formData.contactPhoneNumber}
                                onChange={(_, value) => handleInputChange("contactPhoneNumber", value)}
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("contactPhoneNumber", transcript)}
                                placeholder="Say phone number"
                            />
                        </div>

                        <div className={styles.fieldWithSpeech}>
                            <TextField
                                label="Contact Email"
                                value={formData.contactEmail}
                                onChange={(_, value) => handleInputChange("contactEmail", value)}
                                type="email"
                                className={styles.fieldGrow}
                            />
                            <SpeechInput
                                onTranscript={(transcript: string) => handleSpeechResult("contactEmail", transcript)}
                                placeholder="Say email address"
                            />
                        </div>
                    </Stack>
                </div>

                {/* Permit Fees Section */}
                <div className={styles.section}>
                    <Text variant="xLarge" className={styles.sectionTitle}>
                        Permit Fees
                    </Text>
                    <Separator />

                    <Stack tokens={{ childrenGap: 15 }} className={styles.formGroup}>
                        <div className={styles.fieldWithButton}>
                            <DefaultButton text="Calculate Fees" onClick={handleCalculateFees} className={styles.calculateButton} disabled={isLoading} />
                            <Text variant="small" className={styles.feeHelpText}>
                                Click to auto-calculate fees based on permit type and job cost
                            </Text>
                        </div>

                        {formData.permitFees.length > 0 && (
                            <div className={styles.feesTable}>
                                <div className={styles.tableHeader}>
                                    <div className={styles.columnHeader}>Date</div>
                                    <div className={styles.columnHeader}>Description</div>
                                    <div className={styles.columnHeader}>Amount</div>
                                    <div className={styles.columnHeader}>Tax</div>
                                    <div className={styles.columnHeader}>Actions</div>
                                </div>
                                {formData.permitFees.map((fee, index) => (
                                    <div key={fee.id || index} className={styles.tableRow}>
                                        <div className={styles.tableCell}>
                                            <TextField
                                                value={fee.date}
                                                onChange={(_, value) => handleFeeChange(index, "date", value || "")}
                                                type="date"
                                                className={styles.feeField}
                                            />
                                        </div>
                                        <div className={styles.tableCell}>
                                            <TextField
                                                value={fee.description}
                                                onChange={(_, value) => handleFeeChange(index, "description", value || "")}
                                                className={styles.feeField}
                                            />
                                        </div>
                                        <div className={styles.tableCell}>
                                            <TextField
                                                value={fee.amount.toString()}
                                                onChange={(_, value) => handleFeeChange(index, "amount", parseFloat(value || "0"))}
                                                type="number"
                                                step="0.01"
                                                prefix="$"
                                                className={styles.feeField}
                                            />
                                        </div>
                                        <div className={styles.tableCell}>
                                            <TextField
                                                value={fee.taxAmount.toString()}
                                                onChange={(_, value) => handleFeeChange(index, "taxAmount", parseFloat(value || "0"))}
                                                type="number"
                                                step="0.01"
                                                prefix="$"
                                                className={styles.feeField}
                                            />
                                        </div>
                                        <div className={styles.tableCell}>
                                            <DefaultButton text="Remove" onClick={() => handleRemoveFee(index)} className={styles.removeButton} />
                                        </div>
                                    </div>
                                ))}
                                <div className={styles.tableFooter}>
                                    <DefaultButton text="Add Fee" onClick={handleAddFee} className={styles.addFeeButton} />
                                    <Text variant="medium" className={styles.totalAmount}>
                                        Total: ${formData.permitFees.reduce((sum, fee) => sum + fee.amount + fee.taxAmount, 0).toFixed(2)}
                                    </Text>
                                </div>
                            </div>
                        )}
                    </Stack>
                </div>

                {/* Submit Section */}
                <div className={styles.submitSection}>
                    <PrimaryButton text="Submit Permit Application" onClick={handleSubmit} disabled={isLoading} className={styles.submitButton} />
                    {isLoading && <ProgressIndicator label="Submitting application..." className={styles.progressIndicator} />}
                </div>
            </div>
        </div>
    );
};

export { PermitApplication as Component };
