import React, { useState, useEffect, useRef, useContext } from "react";
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
    ProgressIndicator,
    DetailsList,
    DetailsListLayoutMode,
    SelectionMode,
    IColumn
} from "@fluentui/react";
import readNDJSONStream from "ndjson-readablestream";

import appLogo from "../../assets/applogo.svg";
import styles from "./Chat.module.css";
import permitStyles from "../permit/PermitApplication.module.css";

import {
    chatApi,
    configApi,
    RetrievalMode,
    ChatAppResponse,
    ChatAppResponseOrError,
    ChatAppRequest,
    ResponseMessage,
    VectorFields,
    GPT4VInput,
    SpeechConfig
} from "../../api";
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
import { createPermitApplicationApi, getAutoFillDataApi, validateAddressApi, getTradesmanDataApi, downloadPermitApplicationApi } from "../../api/permitApi";
import { Answer, AnswerError, AnswerLoading } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { ExampleList } from "../../components/Example";
import { UserChatMessage } from "../../components/UserChatMessage";
import { AnalysisPanel, AnalysisPanelTabs } from "../../components/AnalysisPanel";
import { HistoryPanel } from "../../components/HistoryPanel";
import { HistoryProviderOptions, useHistoryManager } from "../../components/HistoryProviders";
import { HistoryButton } from "../../components/HistoryButton";
import { SettingsButton } from "../../components/SettingsButton";
import { ClearChatButton } from "../../components/ClearChatButton";
import { UploadFile } from "../../components/UploadFile";
import { useLogin, getToken, requireAccessControl } from "../../authConfig";
import { useMsal } from "@azure/msal-react";
import { TokenClaimsDisplay } from "../../components/TokenClaimsDisplay";
import { LoginContext } from "../../loginContext";
import { LanguagePicker } from "../../i18n/LanguagePicker";
import { Settings } from "../../components/Settings/Settings";

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

const ChatWithPermitForm = () => {
    const { t } = useTranslation();
    const { instance, accounts } = useMsal();

    // Chat state
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
    const [promptTemplate, setPromptTemplate] = useState<string>("");
    const [temperature, setTemperature] = useState<number>(0.3);
    const [seed, setSeed] = useState<number | null>(null);
    const [minimumRerankerScore, setMinimumRerankerScore] = useState<number>(0);
    const [minimumSearchScore, setMinimumSearchScore] = useState<number>(0);
    const [retrieveCount, setRetrieveCount] = useState<number>(3);
    const [maxSubqueryCount, setMaxSubqueryCount] = useState<number>(10);
    const [reasoningEffort, setReasoningEffort] = useState<string>("");
    const [answers, setAnswers] = useState<[user: string, response: ChatAppResponse][]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [activeCitation, setActiveCitation] = useState<string>();
    const [showGPT4VOptions, setShowGPT4VOptions] = useState<boolean>(false);
    const [showSemanticRankerOption, setShowSemanticRankerOption] = useState<boolean>(false);
    const [showQueryRewritingOption, setShowQueryRewritingOption] = useState<boolean>(false);
    const [showVectorOption, setShowVectorOption] = useState<boolean>(false);
    const [showUserUpload, setShowUserUpload] = useState<boolean>(false);
    const [showLanguagePicker, setShowLanguagePicker] = useState<boolean>(false);
    const [showSpeechInput, setShowSpeechInput] = useState<boolean>(false);
    const [showSpeechOutputBrowser, setShowSpeechOutputBrowser] = useState<boolean>(false);
    const [showSpeechOutputAzure, setShowSpeechOutputAzure] = useState<boolean>(false);
    const [showChatHistoryBrowser, setShowChatHistoryBrowser] = useState<boolean>(false);
    const [showChatHistoryCosmos, setShowChatHistoryCosmos] = useState<boolean>(false);
    const [streamingEnabled, setStreamingEnabled] = useState<boolean>(true);

    const lastQuestionRef = useRef<string>("");
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);

    // Permit form state
    const [isPermitLoading, setIsPermitLoading] = useState(false);
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [permitMessage, setPermitMessage] = useState<{ text: string; type: MessageBarType } | null>(null);

    // Form state for permit
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
        permitFees: [
            { id: "fee-1", date: "2025-05-08", description: "Base Fee", amount: 112, taxAmount: 0, isPaid: false, isEditable: true },
            { id: "fee-2", date: "2025-05-08", description: "Permit Fee", amount: 19.58, taxAmount: 0, isPaid: false, isEditable: true },
            { id: "fee-3", date: "2025-05-08", description: "SCC Surcharge", amount: 5.26, taxAmount: 0, isPaid: false, isEditable: true }
        ],
        documents: []
    });

    // Login and authentication
    const { loggedIn } = useContext(LoginContext);
    // Note: useLogin is a boolean, not a function

    // Dropdown options for permit form
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

    // Inspection activities columns
    const inspectionColumns: IColumn[] = [
        { key: "type", name: "Type", fieldName: "type", minWidth: 100, maxWidth: 150 },
        { key: "dateScheduled", name: "Date Scheduled", fieldName: "dateScheduled", minWidth: 120, maxWidth: 150 },
        { key: "dateCompleted", name: "Date Completed", fieldName: "dateCompleted", minWidth: 120, maxWidth: 150 },
        { key: "outcome", name: "Outcome", fieldName: "outcome", minWidth: 100, maxWidth: 150 },
        { key: "inspectionTime", name: "Inspection Time", fieldName: "inspectionTime", minWidth: 120, maxWidth: 150 },
        { key: "actions", name: "Actions", fieldName: "actions", minWidth: 100, maxWidth: 150 }
    ];

    // Permit activities columns
    const permitActivityColumns: IColumn[] = [
        { key: "type", name: "Type", fieldName: "type", minWidth: 100, maxWidth: 150 },
        { key: "createdDate", name: "Created Date", fieldName: "createdDate", minWidth: 120, maxWidth: 150 },
        { key: "dateCompleted", name: "Date Completed", fieldName: "dateCompleted", minWidth: 120, maxWidth: 150 },
        { key: "outcome", name: "Outcome", fieldName: "outcome", minWidth: 100, maxWidth: 150 },
        { key: "description", name: "Description", fieldName: "description", minWidth: 200, maxWidth: 300 }
    ];

    // Permit fees columns
    const permitFeeColumns: IColumn[] = [
        { key: "date", name: "Date", fieldName: "date", minWidth: 100, maxWidth: 120 },
        { key: "description", name: "Description", fieldName: "description", minWidth: 150, maxWidth: 200 },
        { key: "amount", name: "Amount", fieldName: "amount", minWidth: 80, maxWidth: 100 },
        { key: "taxAmount", name: "Tax Amount", fieldName: "taxAmount", minWidth: 80, maxWidth: 100 }
    ];

    // Auto-fill functions for permit form
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
            setPermitMessage({ text: "Failed to auto-fill user data", type: MessageBarType.error });
        } finally {
            setIsAutoFilling(false);
        }
    };

    const handleValidateAddress = async (address: string) => {
        if (!address.trim()) return;

        try {
            const token = await getToken(instance);
            const isValid = await validateAddressApi(address, token);

            if (!isValid) {
                setPermitMessage({ text: "Address validation failed. Please verify the address.", type: MessageBarType.warning });
            } else {
                setPermitMessage({ text: "Address validated successfully", type: MessageBarType.success });
            }
        } catch (error) {
            console.error("Address validation failed:", error);
            setPermitMessage({ text: "Address validation failed", type: MessageBarType.error });
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
                setPermitMessage({ text: "Tradesman data auto-filled successfully", type: MessageBarType.success });
            } else {
                setPermitMessage({ text: "Tradesman not found or not validated", type: MessageBarType.warning });
            }
        } catch (error) {
            console.error("Tradesman lookup failed:", error);
            setPermitMessage({ text: "Tradesman lookup failed", type: MessageBarType.error });
        }
    };

    const handleDownloadPermitApplication = async () => {
        try {
            setIsDownloading(true);
            const token = await getToken(instance);
            const blob = await downloadPermitApplicationApi(formData, token);

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `permit_application_${formData.permitNumber || "new"}.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            setPermitMessage({ text: "Permit application downloaded successfully", type: MessageBarType.success });
        } catch (error) {
            console.error("Failed to download permit application:", error);
            setPermitMessage({ text: "Failed to download permit application", type: MessageBarType.error });
        } finally {
            setIsDownloading(false);
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

    const handleInputChange = (field: keyof PermitApplicationModel, value: any) => {
        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            [field]: value
        }));
    };

    // Calculate permit fees total
    const calculateTotal = () => {
        return formData.permitFees.reduce((total, fee) => total + fee.amount + fee.taxAmount, 0).toFixed(2);
    };

    // Fee handling functions
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

    // Chat functions (simplified from original Chat component)
    const makeApiRequest = async (question: string) => {
        lastQuestionRef.current = question;
        setIsLoading(true);

        try {
            const history: ChatAppRequest = {
                messages: [...answers.map(a => ({ content: a[0], role: "user" })), { content: question, role: "user" }],
                context: {
                    overrides: {
                        top: retrieveCount,
                        temperature: temperature,
                        minimum_reranker_score: minimumRerankerScore,
                        minimum_search_score: minimumSearchScore,
                        prompt_template: promptTemplate,
                        prompt_template_prefix: "",
                        prompt_template_suffix: "",
                        exclude_category: "",
                        use_oid_security_filter: requireAccessControl,
                        use_groups_security_filter: false,
                        vector_fields: VectorFields.Embedding,
                        use_gpt4v: false,
                        gpt4v_input: GPT4VInput.TextAndImages,
                        language: t("language"),
                        reasoning_effort: reasoningEffort,
                        use_agentic_retrieval: false
                    }
                },
                session_state: null
            };

            const response = await chatApi(history, false, await getToken(instance));
            const responseJson = (await response.json()) as ChatAppResponse;
            setAnswers([...answers, [question, responseJson]]);
        } catch (error) {
            console.error("Chat API error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        lastQuestionRef.current = "";
        setAnswers([]);
        setActiveCitation(undefined);
    };

    // Initialize permit form
    useEffect(() => {
        setFormData((prev: PermitApplicationModel) => ({
            ...prev,
            permitNumber: generatePermitNumber(),
            jobNumber: generateJobNumber()
        }));

        // Auto-fill user data on component mount
        if (loggedIn && accounts.length > 0) {
            handleAutoFillUserData();
        }
    }, [loggedIn, accounts]);

    // Load configuration
    useEffect(() => {
        const getConfig = async () => {
            try {
                const config = await configApi();
                setShowGPT4VOptions(config.showGPT4VOptions);
                setShowSemanticRankerOption(config.showSemanticRankerOption);
                setShowQueryRewritingOption(config.showQueryRewritingOption);
                setShowVectorOption(config.showVectorOption);
                setShowUserUpload(config.showUserUpload);
                setShowLanguagePicker(config.showLanguagePicker);
                setShowSpeechInput(config.showSpeechInput);
                setShowSpeechOutputBrowser(config.showSpeechOutputBrowser);
                setShowSpeechOutputAzure(config.showSpeechOutputAzure);
                setShowChatHistoryBrowser(config.showChatHistoryBrowser);
                setShowChatHistoryCosmos(config.showChatHistoryCosmos);
                setStreamingEnabled(config.streamingEnabled);
            } catch (error) {
                console.error("Failed to load config:", error);
            }
        };
        getConfig();
    }, []);

    return (
        <div className={styles.container}>
            <Helmet>
                <title>Permit Chat Assistant - Calgary</title>
            </Helmet>

            <div className={styles.commandsSplitContainer}>
                <div className={styles.commandsContainer}>
                    {showChatHistoryBrowser && <HistoryButton className={styles.commandButton} onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)} />}
                </div>{" "}
                <div className={styles.commandsContainer}>
                    <ClearChatButton className={styles.commandButton} onClick={clearChat} disabled={!lastQuestionRef.current || isLoading} />
                    {showUserUpload && <UploadFile className={styles.commandButton} disabled={!loggedIn} />}
                    <SettingsButton className={styles.commandButton} onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)} />
                    {showLanguagePicker && <LanguagePicker onLanguageChange={(language: string) => {}} />}
                </div>
            </div>

            {/* Split Screen Layout */}
            <div style={{ display: "flex", height: "calc(100vh - 100px)", marginLeft: isHistoryPanelOpen ? "300px" : "0" }}>
                {/* Chat Panel */}
                <div style={{ flex: 1, marginRight: "10px" }}>
                    <div className={styles.chatRoot}>
                        <div className={styles.chatContainer}>
                            {!lastQuestionRef.current ? (
                                <div className={styles.chatEmptyState}>
                                    <img src={appLogo} className={styles.chatIcon} aria-hidden="true" />
                                    <h1 className={styles.chatEmptyStateTitle}>Building Permit Assistant</h1>
                                    <h2 className={styles.chatEmptyStateSubtitle}>Ask questions about building permits or use the form on the right</h2>
                                    <ExampleList onExampleClicked={makeApiRequest} useGPT4V={false} />
                                </div>
                            ) : (
                                <div className={styles.chatMessageStream}>
                                    {answers.map((answer, index) => (
                                        <div key={index}>
                                            <UserChatMessage message={answer[0]} />
                                            <div className={styles.chatMessageGpt}>
                                                <Answer
                                                    isSelected={false}
                                                    answer={answer[1]}
                                                    index={index}
                                                    speechConfig={{
                                                        speechUrls: [],
                                                        setSpeechUrls: () => {},
                                                        audio: new Audio(),
                                                        isPlaying: false,
                                                        setIsPlaying: () => {}
                                                    }}
                                                    isStreaming={false}
                                                    onCitationClicked={setActiveCitation}
                                                    onThoughtProcessClicked={() => {}}
                                                    onSupportingContentClicked={() => {}}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className={styles.chatMessageGptMinWidth}>
                                            <AnswerLoading />
                                        </div>
                                    )}
                                    <div ref={chatMessageStreamEnd} />
                                </div>
                            )}

                            <div className={styles.chatInput}>
                                <QuestionInput
                                    clearOnSend
                                    placeholder="Ask about building permits..."
                                    disabled={isLoading}
                                    onSend={makeApiRequest}
                                    showSpeechInput={showSpeechInput}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Permit Form Panel */}
                <div style={{ flex: 1, marginLeft: "10px", overflowY: "auto", border: "1px solid #ccc", borderRadius: "8px", padding: "20px" }}>
                    <div className={permitStyles.permitApplication}>
                        <div className={permitStyles.header}>
                            <Text variant="xxLarge" className={permitStyles.title}>
                                Permit Application
                            </Text>
                        </div>

                        {permitMessage && (
                            <MessageBar messageBarType={permitMessage.type} onDismiss={() => setPermitMessage(null)} className={permitStyles.messageBar}>
                                {permitMessage.text}
                            </MessageBar>
                        )}

                        {isAutoFilling && <ProgressIndicator label="Auto-filling data..." className={permitStyles.progressIndicator} />}

                        <div className={permitStyles.formContainer}>
                            {/* Permit Details Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Permit Details
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField label="Permit Number *" value={formData.permitNumber} disabled style={{ flex: 1 }} />
                                        <DefaultButton text="Auto-fill" onClick={() => setFormData({ ...formData, permitNumber: generatePermitNumber() })} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Permit Status *"
                                            selectedKey={formData.permitStatus}
                                            options={permitStatusOptions}
                                            onChange={(_, option) => handleInputChange("permitStatus", option?.key)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Permit Type *"
                                            selectedKey={formData.permitType}
                                            options={permitTypeOptions}
                                            onChange={(_, option) => handleInputChange("permitType", option?.key)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>
                                </Stack>
                            </div>

                            {/* Applicant Information Section */}
                            <div className={permitStyles.section}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <Text variant="large" className={permitStyles.sectionTitle}>
                                        Applicant Information
                                    </Text>
                                    <DefaultButton text="Auto-fill from User Profile" onClick={handleAutoFillUserData} disabled={isAutoFilling} />
                                </div>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Applicant Name *"
                                            value={formData.applicantName}
                                            onChange={(_, value) => handleInputChange("applicantName", value)}
                                            required
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={handleAutoFillUserData} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Applicant Email"
                                            value={formData.applicantEmail}
                                            onChange={(_, value) => handleInputChange("applicantEmail", value)}
                                            type="email"
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={handleAutoFillUserData} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Applicant Phone"
                                            value={formData.applicantPhone}
                                            onChange={(_, value) => handleInputChange("applicantPhone", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={handleAutoFillUserData} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Request Date *"
                                            value={formData.requestDate}
                                            onChange={(_, value) => handleInputChange("requestDate", value)}
                                            type="date"
                                            required
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton
                                            text="Auto-fill"
                                            onClick={() => setFormData({ ...formData, requestDate: new Date().toISOString().split("T")[0] })}
                                        />
                                    </div>
                                </Stack>
                            </div>

                            {/* Job Information Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Job Information
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Job Address *"
                                            value={formData.jobAddress}
                                            onChange={(_, value) => handleInputChange("jobAddress", value)}
                                            required
                                            style={{ flex: 1 }}
                                            onBlur={e => handleValidateAddress(e.target.value)}
                                        />
                                        <DefaultButton text="Validate" onClick={() => handleValidateAddress(formData.jobAddress)} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Job Name *"
                                            value={formData.jobName}
                                            onChange={(_, value) => handleInputChange("jobName", value)}
                                            placeholder="e.g. Temp Electrical setup"
                                            required
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField label="Job Number" value={formData.jobNumber} disabled style={{ flex: 1 }} />
                                        <DefaultButton text="Auto-fill" onClick={() => setFormData({ ...formData, jobNumber: generateJobNumber() })} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Job Description"
                                            value={formData.jobDescription}
                                            onChange={(_, value) => handleInputChange("jobDescription", value)}
                                            placeholder="kitchen electrical setup for shelter"
                                            multiline
                                            rows={3}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Specific Location/Additional Info"
                                            value={formData.specificLocation}
                                            onChange={(_, value) => handleInputChange("specificLocation", value)}
                                            placeholder="could be parcel or land without building or backyard etc"
                                            multiline
                                            rows={2}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>
                                </Stack>
                            </div>

                            {/* Work Category Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Work Category
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Category of Work *"
                                            selectedKey={formData.categoryOfWork}
                                            options={categoryOfWorkOptions}
                                            onChange={(_, option) => handleInputChange("categoryOfWork", option?.key)}
                                            required
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Type of Work"
                                            selectedKey={formData.typeOfWork}
                                            options={typeOfWorkOptions}
                                            onChange={(_, option) => handleInputChange("typeOfWork", option?.key)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>
                                </Stack>
                            </div>

                            {/* Electrical Details Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Electrical Details
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Electrical Service"
                                            value={formData.electricalService}
                                            onChange={(_, value) => handleInputChange("electricalService", value)}
                                            placeholder="usage"
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <Checkbox
                                        label="Underground Conductor 1/0 or larger"
                                        checked={formData.undergroundConductor}
                                        onChange={(_, checked) => handleInputChange("undergroundConductor", checked)}
                                    />

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Service Type"
                                            selectedKey={formData.serviceType}
                                            options={serviceTypeOptions}
                                            onChange={(_, option) => handleInputChange("serviceType", option?.key)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <Dropdown
                                            label="Phase"
                                            selectedKey={formData.phase}
                                            options={phaseOptions}
                                            onChange={(_, option) => handleInputChange("phase", option?.key)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", gap: "10px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                            <TextField
                                                label="Wire"
                                                value={formData.wire}
                                                onChange={(_, value) => handleInputChange("wire", value)}
                                                style={{ flex: 1 }}
                                            />
                                            <DefaultButton text="Auto-fill" onClick={() => {}} />
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                            <TextField
                                                label="Volts"
                                                value={formData.volts}
                                                onChange={(_, value) => handleInputChange("volts", value)}
                                                style={{ flex: 1 }}
                                            />
                                            <DefaultButton text="Auto-fill" onClick={() => {}} />
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                            <TextField
                                                label="Amps"
                                                value={formData.amps}
                                                onChange={(_, value) => handleInputChange("amps", value)}
                                                style={{ flex: 1 }}
                                            />
                                            <DefaultButton text="Auto-fill" onClick={() => {}} />
                                        </div>
                                    </div>
                                </Stack>
                            </div>

                            {/* Additional Information Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Additional Information
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Application Categories"
                                            value={formData.applicationCategories}
                                            onChange={(_, value) => handleInputChange("applicationCategories", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Relocatable Structure Number"
                                            value={formData.relocatableStructureNumber}
                                            onChange={(_, value) => handleInputChange("relocatableStructureNumber", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Related Building Permit Number"
                                            value={formData.relatedBuildingPermitNumber}
                                            onChange={(_, value) => handleInputChange("relatedBuildingPermitNumber", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Total Job Cost"
                                            value={formData.totalJobCost.toString()}
                                            onChange={(_, value) => handleInputChange("totalJobCost", parseFloat(value || "0"))}
                                            type="number"
                                            prefix="$"
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>
                                </Stack>
                            </div>

                            {/* Contact Information Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Contact Information
                                </Text>
                                <Separator />

                                <Stack tokens={{ childrenGap: 10 }} className={permitStyles.formGroup}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Qualified Tradesman ID"
                                            value={formData.qualifiedTradesmanId}
                                            onChange={(_, value) => handleInputChange("qualifiedTradesmanId", value)}
                                            style={{ flex: 1 }}
                                            onBlur={e => handleTradesmanLookup(e.target.value)}
                                        />
                                        <DefaultButton text="Lookup" onClick={() => handleTradesmanLookup(formData.qualifiedTradesmanId || "")} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Qualified Tradesman Name"
                                            value={formData.qualifiedTradesmanName}
                                            onChange={(_, value) => handleInputChange("qualifiedTradesmanName", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => handleTradesmanLookup(formData.qualifiedTradesmanId || "")} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="CQT Contact Number"
                                            value={formData.cqtContactNumber}
                                            onChange={(_, value) => handleInputChange("cqtContactNumber", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => handleTradesmanLookup(formData.qualifiedTradesmanId || "")} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="CQT Email Address"
                                            value={formData.cqtEmailAddress}
                                            onChange={(_, value) => handleInputChange("cqtEmailAddress", value)}
                                            type="email"
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => handleTradesmanLookup(formData.qualifiedTradesmanId || "")} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="On-site Contact Name"
                                            value={formData.onsiteContactName}
                                            onChange={(_, value) => handleInputChange("onsiteContactName", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Contact Phone Number"
                                            value={formData.contactPhoneNumber}
                                            onChange={(_, value) => handleInputChange("contactPhoneNumber", value)}
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <TextField
                                            label="Contact Email"
                                            value={formData.contactEmail}
                                            onChange={(_, value) => handleInputChange("contactEmail", value)}
                                            type="email"
                                            style={{ flex: 1 }}
                                        />
                                        <DefaultButton text="Auto-fill" onClick={() => {}} />
                                    </div>
                                </Stack>
                            </div>

                            {/* Inspections/Permit Activity Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Inspections/Permit Activity
                                </Text>
                                <Separator />

                                <Text variant="medium" style={{ marginBottom: "10px" }}>
                                    Inspection Activities
                                </Text>
                                <DetailsList
                                    items={formData.inspectionActivities}
                                    columns={inspectionColumns}
                                    layoutMode={DetailsListLayoutMode.justified}
                                    selectionMode={SelectionMode.none}
                                />
                                <DefaultButton text="Book an Inspection" style={{ marginTop: "10px" }} onClick={() => {}} />

                                <Text variant="medium" style={{ marginBottom: "10px", marginTop: "20px" }}>
                                    Permit Activities
                                </Text>
                                <DetailsList
                                    items={formData.permitActivities}
                                    columns={permitActivityColumns}
                                    layoutMode={DetailsListLayoutMode.justified}
                                    selectionMode={SelectionMode.none}
                                />
                            </div>

                            {/* Permit Fees Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Permit Fees
                                </Text>
                                <Separator />

                                {/* Editable Fees Table */}
                                <div className={permitStyles.feesTable}>
                                    <div className={permitStyles.tableHeader}>
                                        <div className={permitStyles.columnHeader}>Date</div>
                                        <div className={permitStyles.columnHeader}>Description</div>
                                        <div className={permitStyles.columnHeader}>Amount ($)</div>
                                        <div className={permitStyles.columnHeader}>Tax ($)</div>
                                        <div className={permitStyles.columnHeader}>Actions</div>
                                    </div>
                                    {formData.permitFees.map((fee, index) => (
                                        <div key={fee.id || index} className={permitStyles.tableRow}>
                                            <div className={permitStyles.tableCell}>
                                                <TextField
                                                    value={fee.date}
                                                    onChange={(_, value) => handleFeeChange(index, "date", value || "")}
                                                    type="date"
                                                    className={permitStyles.feeField}
                                                />
                                            </div>
                                            <div className={permitStyles.tableCell}>
                                                <TextField
                                                    value={fee.description}
                                                    onChange={(_, value) => handleFeeChange(index, "description", value || "")}
                                                    className={permitStyles.feeField}
                                                />
                                            </div>
                                            <div className={permitStyles.tableCell}>
                                                <TextField
                                                    value={fee.amount.toString()}
                                                    onChange={(_, value) => handleFeeChange(index, "amount", parseFloat(value || "0"))}
                                                    type="number"
                                                    step="0.01"
                                                    className={permitStyles.feeField}
                                                />
                                            </div>
                                            <div className={permitStyles.tableCell}>
                                                <TextField
                                                    value={fee.taxAmount.toString()}
                                                    onChange={(_, value) => handleFeeChange(index, "taxAmount", parseFloat(value || "0"))}
                                                    type="number"
                                                    step="0.01"
                                                    className={permitStyles.feeField}
                                                />
                                            </div>
                                            <div className={permitStyles.tableCell}>
                                                <DefaultButton text="Remove" onClick={() => handleRemoveFee(index)} className={permitStyles.removeButton} />
                                            </div>
                                        </div>
                                    ))}
                                    <div className={permitStyles.tableFooter}>
                                        <DefaultButton text="Add Fee" onClick={handleAddFee} className={permitStyles.addFeeButton} />
                                        <Text variant="medium" className={permitStyles.totalAmount}>
                                            Grand Total: ${calculateTotal()}
                                        </Text>
                                    </div>
                                </div>
                            </div>

                            {/* Documents Section */}
                            <div className={permitStyles.section}>
                                <Text variant="large" className={permitStyles.sectionTitle}>
                                    Documents
                                </Text>
                                <Separator />

                                <DetailsList
                                    items={formData.documents}
                                    columns={[
                                        { key: "fileName", name: "File Name", fieldName: "fileName", minWidth: 200 },
                                        { key: "uploadedDate", name: "Uploaded Date", fieldName: "uploadedDate", minWidth: 150 }
                                    ]}
                                    layoutMode={DetailsListLayoutMode.justified}
                                    selectionMode={SelectionMode.none}
                                />

                                <DefaultButton text="Upload Document" style={{ marginTop: "10px" }} onClick={() => {}} />
                            </div>

                            {/* Submit Section */}
                            <div className={permitStyles.submitSection} style={{ textAlign: "center", marginTop: "30px" }}>
                                <Stack horizontal horizontalAlign="center" tokens={{ childrenGap: 16 }}>
                                    <PrimaryButton
                                        text="Submit Permit Application"
                                        onClick={() => {}}
                                        disabled={isPermitLoading}
                                        style={{ minWidth: "200px" }}
                                    />
                                    <DefaultButton
                                        text="Download Permit Application"
                                        onClick={handleDownloadPermitApplication}
                                        disabled={isDownloading}
                                        style={{ minWidth: "200px" }}
                                    />
                                </Stack>
                                {isPermitLoading && <ProgressIndicator label="Submitting application..." className={permitStyles.progressIndicator} />}
                                {isDownloading && <ProgressIndicator label="Downloading application..." className={permitStyles.progressIndicator} />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Panels */}
            {/* {isHistoryPanelOpen && showChatHistoryBrowser && <HistoryPanel isOpen={isHistoryPanelOpen} onClose={() => setIsHistoryPanelOpen(false)} />} */}

            <Panel
                headerText="Configure answer generation"
                isOpen={isConfigPanelOpen}
                isBlocking={false}
                onDismiss={() => setIsConfigPanelOpen(false)}
                closeButtonAriaLabel="Close"
                onRenderFooterContent={() => <DefaultButton onClick={() => setIsConfigPanelOpen(false)}>Close</DefaultButton>}
                isFooterAtBottom={true}
            >
                <Settings
                    promptTemplate={promptTemplate}
                    temperature={temperature}
                    retrieveCount={retrieveCount}
                    maxSubqueryCount={maxSubqueryCount}
                    resultsMergeStrategy=""
                    seed={seed}
                    minimumSearchScore={minimumSearchScore}
                    minimumRerankerScore={minimumRerankerScore}
                    useSemanticRanker={false}
                    useSemanticCaptions={false}
                    useQueryRewriting={false}
                    reasoningEffort={reasoningEffort}
                    excludeCategory=""
                    includeCategory=""
                    retrievalMode={RetrievalMode.Hybrid}
                    useGPT4V={false}
                    gpt4vInput={GPT4VInput.TextAndImages}
                    vectorFields={VectorFields.Embedding}
                    showSemanticRankerOption={showSemanticRankerOption}
                    showQueryRewritingOption={showQueryRewritingOption}
                    showReasoningEffortOption={false}
                    showGPT4VOptions={showGPT4VOptions}
                    showVectorOption={showVectorOption}
                    useOidSecurityFilter={false}
                    useGroupsSecurityFilter={false}
                    useLogin={false}
                    loggedIn={loggedIn}
                    requireAccessControl={false}
                    onChange={(field: string, value: any) => {}}
                    streamingEnabled={streamingEnabled}
                    shouldStream={false}
                    useSuggestFollowupQuestions={false}
                    promptTemplatePrefix=""
                    promptTemplateSuffix=""
                    showSuggestFollowupQuestions={false}
                    showAgenticRetrievalOption={false}
                    useAgenticRetrieval={false}
                />
            </Panel>

            {loggedIn && <TokenClaimsDisplay />}
        </div>
    );
};

export { ChatWithPermitForm as Component };
