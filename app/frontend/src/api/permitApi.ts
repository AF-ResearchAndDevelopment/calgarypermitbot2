import { PermitApplication, PermitApplicationResponse, AutoFillUserData, TradesmanData } from "./permitModels";
import { getHeaders } from "./api";

const BACKEND_URI = "";

export async function createPermitApplicationApi(permitApplication: PermitApplication, idToken: string | undefined): Promise<PermitApplicationResponse> {
    console.log("=== FRONTEND API CALL ===");
    console.log("Creating permit application:", permitApplication);
    console.log("API endpoint:", `${BACKEND_URI}/api/permit/create`);

    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/create`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ permitApplication })
    });

    console.log("Response status:", response.status);
    console.log("Response ok:", response.ok);

    if (!response.ok) {
        throw new Error(`Creating permit application failed: ${response.statusText}`);
    }

    const dataResponse: PermitApplicationResponse = await response.json();
    console.log("Response data:", dataResponse);
    return dataResponse;
}

export async function getAutoFillDataApi(idToken: string | undefined): Promise<AutoFillUserData> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/autofill/user`, {
        method: "GET",
        headers: { ...headers, "Content-Type": "application/json" }
    });

    if (!response.ok) {
        throw new Error(`Getting auto-fill data failed: ${response.statusText}`);
    }

    const dataResponse: AutoFillUserData = await response.json();
    return dataResponse;
}

export async function getTradesmanDataApi(tradesmanId: string, idToken: string | undefined): Promise<TradesmanData | null> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/tradesman/${encodeURIComponent(tradesmanId)}`, {
        method: "GET",
        headers: { ...headers, "Content-Type": "application/json" }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Getting tradesman data failed: ${response.statusText}`);
    }

    const dataResponse: TradesmanData = await response.json();
    return dataResponse;
}

export async function getPermitApplicationApi(permitNumber: string, idToken: string | undefined): Promise<PermitApplication | null> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/${encodeURIComponent(permitNumber)}`, {
        method: "GET",
        headers: { ...headers, "Content-Type": "application/json" }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Getting permit application failed: ${response.statusText}`);
    }

    const dataResponse: PermitApplication = await response.json();
    return dataResponse;
}

export async function updatePermitApplicationApi(permitApplication: PermitApplication, idToken: string | undefined): Promise<PermitApplicationResponse> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/update`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ permitApplication })
    });

    if (!response.ok) {
        throw new Error(`Updating permit application failed: ${response.statusText}`);
    }

    const dataResponse: PermitApplicationResponse = await response.json();
    return dataResponse;
}

export async function searchPermitApplicationsApi(query: string, idToken: string | undefined): Promise<PermitApplication[]> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { ...headers, "Content-Type": "application/json" }
    });

    if (!response.ok) {
        throw new Error(`Searching permit applications failed: ${response.statusText}`);
    }

    const dataResponse: PermitApplication[] = await response.json();
    return dataResponse;
}

export async function bookInspectionApi(
    permitNumber: string,
    inspectionType: string,
    scheduledDate: string,
    idToken: string | undefined
): Promise<{ success: boolean; message?: string }> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/inspection/book`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
            permitNumber,
            inspectionType,
            scheduledDate
        })
    });

    if (!response.ok) {
        throw new Error(`Booking inspection failed: ${response.statusText}`);
    }

    const dataResponse = await response.json();
    return dataResponse;
}

export async function calculatePermitFeesApi(permitType: string, totalJobCost: number, idToken: string | undefined): Promise<any> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/fees/calculate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
            permitType,
            totalJobCost
        })
    });

    if (!response.ok) {
        throw new Error(`Calculating permit fees failed: ${response.statusText}`);
    }

    const dataResponse = await response.json();
    return dataResponse.fees || [];
}

export async function getAutoFillFieldDataApi(fieldName: string, idToken: string | undefined, sessionId?: string): Promise<string> {
    console.log(`=== API: Calling getAutoFillFieldDataApi for field: ${fieldName} ===`);

    const headers = await getHeaders(idToken);
    const requestBody: any = { fieldName };

    // Include session ID if provided
    if (sessionId) {
        requestBody.sessionId = sessionId;
    }

    console.log(`Request body:`, requestBody);
    console.log(`Backend URI: ${BACKEND_URI}`);

    const response = await fetch(`${BACKEND_URI}/api/permit/autofill/field`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response OK: ${response.ok}`);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: ${response.status} - ${response.statusText} - ${errorText}`);
        throw new Error(`Getting auto-fill field data failed: ${response.statusText}`);
    }

    const dataResponse = await response.json();
    console.log(`API Response:`, dataResponse);

    const value = dataResponse.value || "";
    console.log(`Returning value: "${value}"`);

    return value;
}

export async function downloadPermitApplicationApi(permitApplication: PermitApplication, idToken: string | undefined): Promise<Blob> {
    const headers = await getHeaders(idToken);
    const response = await fetch(`${BACKEND_URI}/api/permit/download/current`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
            permitApplication
        })
    });

    if (!response.ok) {
        throw new Error(`Downloading permit application failed: ${response.statusText}`);
    }

    return response.blob();
}
