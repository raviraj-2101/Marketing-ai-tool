const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_MAP = [
    { label: "Ad Id", id: "7b111c17-3b76-41b4-9708-2c99c9fdec2d", type: "short_text" },
    { label: "TSL Script", id: "0597568a-6060-40ed-8648-9b82f52f6ae4", type: "short_text" },
    { label: "Brand", id: "a5c44020-f416-411a-85fe-c05a71c86737", type: "drop_down" },
    { label: "Product", id: "9d2b68c9-1e27-4d21-ada6-29cdacae2315", type: "drop_down" },
    { label: "Cs", id: "715b59ce-68f9-45c6-9c0e-32fdf971180f", type: "users" },
    { label: "Batch", id: "8ce5aae5-4dbc-406f-9ff1-3a55cbe365dd", type: "short_text" },
    { label: "Created Date", id: "ff3821d6-7447-49f9-8a67-1d456ec2ca2c", type: "date" },
    { label: "Concept Name", id: "f0b9e5c4-1b0c-4139-bc54-5077f90275c7", type: "short_text" },
    { label: "# of Ads", id: "710a8543-a9b1-476d-b9c1-e6842cf045dd", type: "short_text" },
    { label: "Creation Method", id: "4c0d9833-0c69-4c0e-95eb-1bb977f1cfa1", type: "drop_down" },
    { label: "Funnel Type", id: "40db4572-af51-41a3-8c25-937bd3b4ded2", type: "drop_down" },
    { label: "Language", id: "89f0fa1a-d749-40d3-b448-dfe4bcb17a35", type: "short_text" },
    { label: "Drive Folder", id: "b2ba579c-b23d-470e-8838-11e408513b3a", type: "short_text" },
    { label: "Log", id: "27207d21-619e-478d-95b8-51423836f405", type: "short_text" },
    { label: "TSL Script Link", id: "34250452-0ec3-462e-a22f-8773ca4586fc", type: "short_text" },
    { label: "Priority", id: "5927d263-c1f4-4a1a-b131-70cfa91aed8b", type: "drop_down" },
    { label: "Intended Platform", id: "d079985c-4032-4873-b376-4480c8939f9b", type: "drop_down" },
    { label: "Images", id: "00683847-5eae-4f63-849b-6b70dac8591b", type: "short_text" },
    { label: "Brief (Docs)", id: "ecb82263-5d73-459d-8753-bc108cfa4826", type: "short_text" },
    { label: "Stage", id: "eab52ea4-aef0-4ff3-aac6-6ea284e1b5e3", type: "drop_down" },
];

const AD_SET_NAME_FIELD_ID = "7b311585-e935-45d2-9b95-47c5b3a978f2";
const AD_TYPE_FIELD_ID = "f323f950-5191-4b61-bdb0-1d6a8709209c";
const AD_TYPE_OPTION_IDS: Record<string, string> = {
    vid: "2aa3802e-eb77-4709-8368-31a68e47e9aa",
    tsl: "faaf14f6-2d9b-4330-b978-86c605069ce6",
    img: "29b19ebf-2f7d-4062-9553-ad477167546c",
};

const CONFIG_FIELD_COLUMNS: Record<string, { labelCol: number; valueCol: number }> = {
    "Brand": { labelCol: 4, valueCol: 6 },
    "Product": { labelCol: 11, valueCol: 13 },
    "Funnel Type": { labelCol: 14, valueCol: 15 },
    "Creation Method": { labelCol: 38, valueCol: 39 },
    "Priority": { labelCol: 16, valueCol: 17 },
    "Intended Platform": { labelCol: 36, valueCol: 37 },
    "Stage": { labelCol: 9, valueCol: 10 },
};

interface ConfigMappings {
    labelToId: Record<string, Record<string, string>>;
    labels: Record<string, string[]>;
    originalLabels: Record<string, Record<string, string>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    return tokenData.access_token;
}

function sanitize(str: string): string {
    return (str || "")
        .replace(/[\/\\:*?"<>|]/g, "")
        .replace(/\s+/g, "_")
        .trim();
}

function getWeekString(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - ys.getTime()) / 86400000 + 1) / 7);
    return `Y${yy}W${String(weekNum).padStart(2, "0")}`;
}

function formatDateMMDDYY(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
}

function getDateString(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
}

function formatAdId(n: number): string {
    return String(n).padStart(6, "0");
}

function extractFolderId(driveLink: string): string | null {
    const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

async function findOrCreateFolder(
    name: string,
    parentId: string,
    accessToken: string,
): Promise<string> {
    const q = encodeURIComponent(
        `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listRes.json();
    if (listData.files && listData.files.length > 0) {
        console.log(`[submit-brief] Reusing existing folder: ${name} (${listData.files[0].id})`);
        return listData.files[0].id;
    }
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    const created = await createRes.json();
    if (!created.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(created)}`);
    console.log(`[submit-brief] Created folder: ${name} (${created.id})`);
    return created.id;
}

async function findOrCreateDoc(
    name: string,
    parentId: string,
    accessToken: string,
): Promise<string> {
    const q = encodeURIComponent(
        `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
    );
    const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listRes.json();
    if (listData.files && listData.files.length > 0) {
        console.log(`[submit-brief] Reusing existing doc: ${name} (${listData.files[0].id})`);
        return listData.files[0].id;
    }
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.document", parents: [parentId] }),
    });
    const created = await createRes.json();
    if (!created.id) throw new Error(`Failed to create doc "${name}": ${JSON.stringify(created)}`);
    console.log(`[submit-brief] Created doc: ${name} (${created.id})`);
    return created.id;
}

function colIndexToLetter(idx: number): string {
    let result = "";
    let n = idx + 1;
    while (n > 0) {
        const rem = (n - 1) % 26;
        result = String.fromCharCode(65 + rem) + result;
        n = Math.floor((n - 1) / 26);
    }
    return result;
}

function matchProduct(productName: string, configProduct: string): boolean {
    if (!productName || !configProduct) return false;
    const pLower = productName.toLowerCase();
    const cLower = configProduct.toLowerCase();
    return pLower.includes(cLower) || cLower.includes(pLower);
}

// ── Config Sheet Helpers ───────────────────────────────────────────────────────

async function readConfigSheet(accessToken: string, spreadsheetId: string): Promise<ConfigMappings> {
    const range = `'IMG/TSL/VID Config'!A:AN`;
    const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    const rows: string[][] = data.values || [];

    const labelToId: Record<string, Record<string, string>> = {};
    const labels: Record<string, string[]> = {};
    const originalLabels: Record<string, Record<string, string>> = {};

    if (rows.length < 3) {
        console.warn("[submit-brief] AI Static Config tab has fewer than 3 rows");
        return { labelToId, labels, originalLabels };
    }

    for (const [fieldName, cols] of Object.entries(CONFIG_FIELD_COLUMNS)) {
        labelToId[fieldName] = {};
        labels[fieldName] = [];
        originalLabels[fieldName] = {};

        for (let i = 2; i < rows.length; i++) {
            const label = rows[i]?.[cols.labelCol] || "";
            const value = rows[i]?.[cols.valueCol] || "";
            if (label) {
                labelToId[fieldName][label.toLowerCase()] = value;
                labels[fieldName].push(label);
                originalLabels[fieldName][label.toLowerCase()] = label;
            }
        }
    }

    return { labelToId, labels, originalLabels };
}

function getOriginalLabel(config: ConfigMappings, fieldName: string, value: string): string {
    if (!value) return "";
    return config.originalLabels[fieldName]?.[value.toLowerCase()] || value;
}

async function readRevenueSources(
    accessToken: string,
    configSheetId: string,
): Promise<Array<{ product: string; adDbSheetId: string }>> {
    const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent("'Revenue Sources Sync'!A:Z")}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    const rows: string[][] = data.values || [];

    if (rows.length < 2) return [];

    const header = rows[0].map((h) => (h || "").toLowerCase().trim());
    const productCol = header.findIndex((h) => h === "product");
    const adDbCol = header.findIndex((h) => h.includes("ad db") && h.includes("sheet"));

    if (productCol === -1 || adDbCol === -1) {
        console.warn(`[submit-brief] Revenue Sources Sync: columns not found. productCol=${productCol}, adDbCol=${adDbCol}`);
        return [];
    }

    const result: Array<{ product: string; adDbSheetId: string }> = [];
    for (let i = 1; i < rows.length; i++) {
        const product = rows[i]?.[productCol] || "";
        const adDbSheetId = rows[i]?.[adDbCol] || "";
        if (product && adDbSheetId) result.push({ product, adDbSheetId });
    }
    return result;
}

async function readDropdowns(
    accessToken: string,
    configSheetId: string,
): Promise<Array<{ product: string; listType: string; clickupListId: string }>> {
    const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent("'IMG/TSL/VID Config'!AF:AH")}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    const rows: string[][] = data.values || [];

    const result: Array<{ product: string; listType: string; clickupListId: string }> = [];
    for (let i = 1; i < rows.length; i++) {
        const product = rows[i]?.[0] || "";
        const listType = rows[i]?.[1] || "";
        const clickupListId = rows[i]?.[2] || "";
        if (product && listType && clickupListId) result.push({ product, listType, clickupListId });
    }
    return result;
}

// ── Sheet append ──────────────────────────────────────────────────────────────

async function appendAdDbRow(
    accessToken: string,
    spreadsheetId: string,
    tabName: string,
    namedValues: Record<string, string>,
    funnelType: "TSL" | "IMG" = "IMG",
    priorityLabels: string[] = [],
    intendedChanelLabels: string[] = [],
    stageLabels: string[] = [],
): Promise<void> {
    const KNOWN_COLS = ["ad id", "brand", "product", "cs", "funnel", "status", "language", "# of images", "# of ads"];
    const hRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!1:2`)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const hData = await hRes.json();
    const twoRows: string[][] = hData.values || [];

    let headers: string[] = [];
    let bestScore = -1;
    for (let ri = 0; ri < twoRows.length; ri++) {
        const row = (twoRows[ri] || []).map((h: string) => (h || "").toLowerCase().trim());
        const score = KNOWN_COLS.filter((k) => row.includes(k)).length;
        if (score > bestScore) { bestScore = score; headers = row; }
    }
    console.log(`[submit-brief] Header row score ${bestScore}: ${headers.filter(Boolean).join("|")}`);

    const colMap: Record<string, number> = {};
    headers.forEach((h, i) => { if (h) colMap[h] = i; });

    const ALIASES: Record<string, string[]> = {
        "ad id": ["ad_id", "adid"],
        "batch week": ["week"],
        "created date": ["date created", "date"],
        "# of images": ["# of ads", "num images", "number of images"],
        "g-drive": ["g drive", "gdrive", "drive link", "drive"],
        "images": ["images folder", "images link", "image folder"],
        "images brief": ["image brief", "image brief doc", "brief", "brief doc", "brief link", "image_brief"],
        "log": ["log link"],
        "clickup": ["click up", "clickup link", "clickup url"],
        "click up task id": ["clickup task id", "clickup_task_id"],
    };

    const findCol = (...names: string[]): number => {
        for (const name of names) {
            const idx = colMap[name.toLowerCase().trim()];
            if (idx !== undefined) return idx;
        }
        return -1;
    };

    const rowLen = Math.max(headers.length, 22);
    const row: string[] = new Array(rowLen).fill("");

    for (const [key, value] of Object.entries(namedValues)) {
        const k = key.toLowerCase().trim();
        let idx = colMap[k];
        if (idx === undefined) {
            for (const alt of (ALIASES[k] || [])) {
                const altIdx = colMap[alt.toLowerCase().trim()];
                if (altIdx !== undefined) { idx = altIdx; break; }
            }
        }
        if (idx !== undefined) {
            row[idx] = value;
        } else {
            console.warn(`[submit-brief] Column "${key}" not found in "${tabName}" header`);
        }
    }

    const lastCol = colIndexToLetter(rowLen - 1);
    const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!A:${lastCol}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [row] }),
        },
    );
    const appendData = await appendRes.json();
    if (appendData.error) {
        throw new Error(`Sheet append to "${tabName}" failed: ${JSON.stringify(appendData.error)}`);
    }
    console.log(`[submit-brief] Row appended to "${tabName}" in sheet ${spreadsheetId}`);

    const updatedRange: string = appendData.updates?.updatedRange || "";
    const rowMatch = updatedRange.match(/:.*?(\d+)$/);
    if (!rowMatch) return;

    const rowIndex = parseInt(rowMatch[1]) - 1;
    const r = parseInt(rowMatch[1]);

    const sheetIdRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const sheetIdData = await sheetIdRes.json();
    const targetSheet = sheetIdData.sheets?.find((s: any) => s.properties.title === tabName);
    const sheetId: number = targetSheet?.properties?.sheetId ?? 0;

    const createdDateCol = findCol("created date", "date created", "date");
    const gDriveCol = findCol("g-drive", "g drive", "gdrive", "drive link", "drive");
    const imagesCol = findCol("images", "images folder", "images link", "image folder");
    const imagesBriefCol = findCol("images brief", "image brief", "brief", "brief doc");
    const logCol = findCol("log", "log link");
    const clickupUrlCol = findCol("clickup", "click up", "clickup link", "clickup url");

    const reqs: any[] = [
        {
            repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: rowLen },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1, green: 1, blue: 1 },
                        textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 }, fontSize: 10 },
                    },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "TEXT", pattern: "@" } } },
                fields: "userEnteredFormat.numberFormat",
            },
        },
    ];

    if (createdDateCol !== -1) {
        reqs.push({
            repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: createdDateCol, endColumnIndex: createdDateCol + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "MM-dd-yy" } } },
                fields: "userEnteredFormat.numberFormat",
            },
        });
    }

    for (const linkCol of [gDriveCol, imagesCol, imagesBriefCol, logCol, clickupUrlCol]) {
        if (linkCol === -1) continue;
        reqs.push({
            repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: linkCol, endColumnIndex: linkCol + 1 },
                cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, underline: true } } },
                fields: "userEnteredFormat.textFormat(foregroundColor,underline)",
            },
        });
        reqs.push({
            repeatCell: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: linkCol, endColumnIndex: linkCol + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "NUMBER_FORMAT_TYPE_UNSPECIFIED", pattern: "" } } },
                fields: "userEnteredFormat.numberFormat",
            },
        });
    }

    const intendedChanelCol = findCol("intended chanel");
    if (intendedChanelCol !== -1 && intendedChanelLabels.length > 0) {
        reqs.push({
            setDataValidation: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: intendedChanelCol, endColumnIndex: intendedChanelCol + 1 },
                rule: {
                    condition: { type: "ONE_OF_LIST", values: intendedChanelLabels.map((l) => ({ userEnteredValue: l })) },
                    showCustomUi: true,
                    strict: false,
                },
            },
        });
    }

    const stageCol = findCol("stage");
    if (stageCol !== -1 && stageLabels.length > 0) {
        reqs.push({
            setDataValidation: {
                range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: stageCol, endColumnIndex: stageCol + 1 },
                rule: {
                    condition: { type: "ONE_OF_LIST", values: stageLabels.map((l) => ({ userEnteredValue: l })) },
                    showCustomUi: true,
                    strict: false,
                },
            },
        });
    }

    if (funnelType === "TSL") {
        const tslIdCol = findCol("tsl id");
        const priorityCol = findCol("priority");
        const scriptIdCol = findCol("script id");
        const scriptVariationCol = findCol("script variation");

        if (tslIdCol !== -1) {
            reqs.push({
                setDataValidation: {
                    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: tslIdCol, endColumnIndex: tslIdCol + 1 },
                    rule: {
                        condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='TSL Scripts'!$A$3:$A` }] },
                        showCustomUi: true,
                        strict: false,
                    },
                },
            });
        }
        if (priorityCol !== -1 && priorityLabels.length > 0) {
            reqs.push({
                setDataValidation: {
                    range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: priorityCol, endColumnIndex: priorityCol + 1 },
                    rule: {
                        condition: { type: "ONE_OF_LIST", values: priorityLabels.map((l) => ({ userEnteredValue: l })) },
                        showCustomUi: true,
                        strict: false,
                    },
                },
            });
        }

        if (tslIdCol !== -1) {
            const tslIdLetter = colIndexToLetter(tslIdCol);
            const tslFormulas: [number, string][] = [];
            if (scriptIdCol !== -1) {
                tslFormulas.push([scriptIdCol, `=IF(${tslIdLetter}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${tslIdLetter}${r},'TSL Scripts'!A:A,0),MATCH("Core ID",'TSL Scripts'!2:2,0)),"")`]);
            }
            if (scriptVariationCol !== -1) {
                tslFormulas.push([scriptVariationCol, `=IF(${tslIdLetter}${r}<>"",INDEX('TSL Scripts'!A:Z,MATCH(${tslIdLetter}${r},'TSL Scripts'!A:A,0),MATCH("Variation",'TSL Scripts'!2:2,0)),"")`]);
            }
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ requests: reqs }),
                },
            );
            for (const [col, formula] of tslFormulas) {
                await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!${colIndexToLetter(col)}${r}`)}?valueInputOption=USER_ENTERED`,
                    {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ values: [[formula]] }),
                    },
                );
            }

            // Write adSetName / adNameTemplate for TSL rows too
            const adSetNameColTSL = findCol("ad set name");
            const adNameTemplateColTSL = findCol("ad name template");
            if (adSetNameColTSL !== -1 || adNameTemplateColTSL !== -1) {
                const numImagesCol = findCol("# of images", "# of ads", "num images");
                const brandCol = findCol("brand");
                const productCol = findCol("product");
                const weekCol = findCol("batch week", "week");
                const conceptCol = findCol("concept name");
                const funnelColIdx = findCol("funnel");
                const csColIdx = findCol("cs");
                const languageCol = findCol("language");
                const cl = (col: number, fb: string) => col !== -1 ? colIndexToLetter(col) : fb;
                const H = cl(numImagesCol, "H"), B = cl(brandCol, "B"), C = cl(productCol, "C");
                const E = cl(weekCol, "E"), G = cl(conceptCol, "G"), I = cl(funnelColIdx, "I");
                const D = cl(csColIdx, "D"), K = cl(languageCol, "K");
                const tslAdSetFormula = `=A${r}&"_NONE_V"&${H}${r}&"_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_TSL_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;
                const tslAdNameFormula = `=A${r}&"_NONE_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_TSL_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;
                for (const [col, formula] of [[adSetNameColTSL, tslAdSetFormula], [adNameTemplateColTSL, tslAdNameFormula]] as [number, string][]) {
                    if (col === -1) continue;
                    await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!${colIndexToLetter(col)}${r}`)}?valueInputOption=USER_ENTERED`,
                        {
                            method: "PUT",
                            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ values: [[formula]] }),
                        },
                    );
                }
            }
            return;
        }
    }

    // Ad Set Name / Ad Name Template formulas
    const adSetNameCol = findCol("ad set name");
    const adNameTemplateCol = findCol("ad name template");

    const formatRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: reqs }),
        },
    );
    if (!formatRes.ok) {
        console.warn("[submit-brief] Sheet batchUpdate failed:", await formatRes.text());
    }

    if (adSetNameCol !== -1 || adNameTemplateCol !== -1) {
        const numImagesCol = findCol("# of images", "# of ads", "num images");
        const brandCol = findCol("brand");
        const productCol = findCol("product");
        const weekCol = findCol("batch week", "week");
        const conceptCol = findCol("concept name");
        const funnelColIdx = findCol("funnel");
        const csColIdx = findCol("cs");
        const languageCol = findCol("language");

        const cl = (col: number, fb: string) => col !== -1 ? colIndexToLetter(col) : fb;
        const H = cl(numImagesCol, "H");
        const B = cl(brandCol, "B");
        const C = cl(productCol, "C");
        const E = cl(weekCol, "E");
        const G = cl(conceptCol, "G");
        const I = cl(funnelColIdx, "I");
        const D = cl(csColIdx, "D");
        const K = cl(languageCol, "K");

        const adSetNameFormula = `=A${r}&"_NONE_V"&${H}${r}&"_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_IMG_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;
        const adNameTemplateFormula = `=A${r}&"_NONE_"&${B}${r}&"_"&${C}${r}&"_"&${E}${r}&"_"&${G}${r}&"_IMG_Auto_"&${I}${r}&"_CS."&${D}${r}&"_"&${K}${r}`;

        for (const [col, formula] of [
            [adSetNameCol, adSetNameFormula],
            [adNameTemplateCol, adNameTemplateFormula],
        ] as [number, string][]) {
            if (col === -1) continue;
            const fmRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!${colIndexToLetter(col)}${r}`)}?valueInputOption=USER_ENTERED`,
                {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ values: [[formula]] }),
                },
            );
            if (!fmRes.ok) {
                console.warn("[submit-brief] Formula write failed:", await fmRes.text());
            }
        }
    }
}

// ── ClickUp task ──────────────────────────────────────────────────────────────

async function createClickUpTask(params: {
    listId: string;
    clickupApiKey: string;
    paddedAdId: string;
    brandName: string;
    brandCode: string;
    productName: string;
    productCode: string;
    cs: string;
    csClickupUserId: number | null;
    conceptName: string;
    numberOfAds: string;
    funnel: string;
    originalFunnel: string;
    language: string;
    weekString: string;
    config: ConfigMappings;
    now: Date;
    gDriveLink: string;
    imagesFolderLink: string;
    imageBriefLink: string;
    appBaseUrl: string;
    intendedChanel: string;
}): Promise<{ taskId: string; taskUrl: string }> {
    const {
        listId, clickupApiKey, paddedAdId, brandName, brandCode, productName, productCode,
        cs, csClickupUserId, conceptName, numberOfAds, funnel, originalFunnel, language,
        weekString, config, now, gDriveLink, imagesFolderLink, imageBriefLink, appBaseUrl, intendedChanel,
    } = params;

    const funnelLower = (funnel || "").toLowerCase();
    const adTypeLabel = funnelLower === "tsl" ? "TSL" : "IMG";
    const stageValue = (funnelLower === "onbrand" || funnelLower === "comparison") ? "img" : "tsl";
    const taskName = [
        paddedAdId,
        "NONE",
        numberOfAds ? `V${numberOfAds}` : "",
        brandCode || "",
        productCode || "",
        weekString,
        conceptName || "",
        adTypeLabel,
        "Auto",
        originalFunnel || "",
        cs ? `CS.${cs.split("@")[0]}` : "",
        language || "EN",
    ].filter(Boolean).join("_");

    const fieldValues: Record<string, string> = {
        "Ad Id": paddedAdId,
        "Brand": brandName || "",
        "Product": productName || "",
        "Concept Name": conceptName || "",
        "# of Ads": numberOfAds || "",
        "Funnel Type": funnel || "",
        "Language": language || "EN",
        "Creation Method": "Auto",
        "Batch": weekString,
        "Drive Folder": gDriveLink || "",
        "Images": imagesFolderLink || "",
        "Brief (Docs)": imageBriefLink || "",
        "Log": `${appBaseUrl}/statics-generator?ad_id=${paddedAdId}`,
        "Intended Platform": intendedChanel || "Meta",
        "Stage": stageValue,
    };

    const customFields: any[] = [];
    console.log("[submit-brief] fieldValues:", JSON.stringify(fieldValues, null, 2));
    console.log("[submit-brief] FIELD_MAP length:", FIELD_MAP.length);

    for (const field of FIELD_MAP) {
        if (field.type === "users") {
            if (csClickupUserId) {
                customFields.push({ id: field.id, value: { add: [csClickupUserId] } });
                console.log(`[submit-brief] Added users field: ${field.label}`);
            } else {
                console.warn(`[submit-brief] Skipped users field (no csClickupUserId): ${field.label}`);
            }
            continue;
        }
        const value = fieldValues[field.label];
        if (value === undefined) {
            console.warn(`[submit-brief] Field value is undefined: ${field.label}`);
            continue;
        }

        if (field.type === "short_text") {
            if (value) {
                customFields.push({ id: field.id, value });
                console.log(`[submit-brief] Added short_text field: ${field.label} = "${value}"`);
            } else {
                console.warn(`[submit-brief] Skipped empty short_text field: ${field.label}`);
            }
        } else if (field.type === "drop_down" && value) {
            const HARDCODED_OPTION_IDS: Record<string, Record<string, string>> = {
                "Creation Method": { "auto": "b9c259d5-666e-4914-8528-8bbfadf8d35f" },
                "Stage": { "img": "f40ec6ba-0834-43d3-bbbb-72b98c740838", "tsl": "ec5101c5-f1cd-4f06-8e0d-8d7e029741cd" },
            };
            const optionId =
                HARDCODED_OPTION_IDS[field.label]?.[value.toLowerCase()] ??
                config.labelToId[field.label]?.[value.toLowerCase()];
            if (optionId) {
                customFields.push({ id: field.id, value: optionId });
                console.log(`[submit-brief] Added drop_down field: ${field.label} = "${value}" → ${optionId}`);
            } else {
                console.warn(`[submit-brief] No ClickUp option ID for ${field.label}="${value}"`);
            }
        } else if (field.type === "date") {
            console.log(`[submit-brief] Skipping date field during loop: ${field.label}`);
        }
    }

    console.log("[submit-brief] Total custom fields added:", customFields.length);
    console.log("[submit-brief] Custom fields:", JSON.stringify(customFields, null, 2));

    const createdDateField = FIELD_MAP.find((f) => f.label === "Created Date");
    if (createdDateField) customFields.push({ id: createdDateField.id, value: now.getTime() });

    // Ad Set Name mirrors the ClickUp task name
    customFields.push({ id: AD_SET_NAME_FIELD_ID, value: taskName });

    // Ad Type resolved from funnel
    const funnelLowerForType = (funnel || "").toLowerCase();
    const adTypeOptionId = funnelLowerForType === "tsl" ? AD_TYPE_OPTION_IDS.tsl
        : funnelLowerForType === "vid" ? AD_TYPE_OPTION_IDS.vid
        : AD_TYPE_OPTION_IDS.img;
    customFields.push({ id: AD_TYPE_FIELD_ID, value: adTypeOptionId });

    const payload = { name: taskName, status: "to do", custom_fields: customFields };
    console.log("[submit-brief] ClickUp payload:", JSON.stringify(payload, null, 2));

    const clickupRes = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task`,
        {
            method: "POST",
            headers: { Authorization: clickupApiKey, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );
    const clickupData = await clickupRes.json();
    if (!clickupRes.ok) {
        console.error("[submit-brief] ClickUp error response:", JSON.stringify(clickupData, null, 2));
        throw new Error(`ClickUp task creation failed: ${clickupData.err || JSON.stringify(clickupData)}`);
    }
    const taskUrl = clickupData.url || `https://app.clickup.com/t/${clickupData.id}`;
    console.log(`[submit-brief] ClickUp task created: ${clickupData.id} url=${taskUrl}`);
    return { taskId: clickupData.id, taskUrl };
}

// ── Supabase REST ─────────────────────────────────────────────────────────────

async function getLatestAdId(): Promise<number> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(
        `${supabaseUrl}/rest/v1/ads?select=ad_id&order=ad_id.desc&limit=1`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    const data = await res.json();
    return data[0]?.ad_id || 0;
}

function computeAdType(funnel: string): string {
    const f = (funnel || "").toLowerCase();
    return (f === "onbrand" || f === "comparison") ? "IMG" : "TSL";
}

async function insertAdsRow(row: Record<string, unknown>): Promise<string> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/rest/v1/ads`, {
        method: "POST",
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify([row]),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Insert ads failed [${res.status}]: ${JSON.stringify(data)}`);
    return data[0]?.id as string;
}

async function insertStaticsLogRow(row: Record<string, unknown>): Promise<string> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/rest/v1/statics_logs`, {
        method: "POST",
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify([row]),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Insert statics_log failed [${res.status}]: ${JSON.stringify(data)}`);
    return data[0]?.id as string;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const {
            brand_code,
            product_code,
            brand_id,
            brand_name,
            product_id,
            product_name,
            funnel,
            cs,
            concept_name,
            prompt,
            task_description,
            inspo_links,
            title,
            subtitle,
            design_elements,
            is_multiple,
            is_cta_button,
            cta_button_text,
            is_badge,
            badge_text,
            products_to_show,
            prompt_for_images,
            file_naming_convention,
            docs_file_url,
            language = "EN",
            number_of_ads,
            g_drive_link,
            batch_week,
            intended_chanel,
        } = body;

        console.log("[submit-brief] Starting for:", { brand_name, product_name, funnel, concept_name });

        // Validate required fields
        if (!brand_name || !product_name || !funnel) {
            return new Response(
                JSON.stringify({ error: "brand_name, product_name, and funnel are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        const weekStr = (batch_week && /^Y\d{2}W\d{2}$/.test(batch_week)) ? batch_week : getWeekString();
        const now = new Date();
        const csShort = cs ? cs.split("@")[0] : "";

        // ── 1. Assign ad_id (from ads table) ──────────────────────────────────────
        const latestAdId = await getLatestAdId();
        const adId = latestAdId + 1;
        const paddedAdId = formatAdId(adId);
        const generationId = crypto.randomUUID();
        const adType = computeAdType(funnel || "");

        console.log(`[submit-brief] ad_id=${adId}  generation_id=${generationId}  ad_type=${adType}`);

        // ── 2. Insert into ads table first ────────────────────────────────────────
        const adsRow: Record<string, unknown> = {
            ad_id: adId,
            script_id: "NONE",
            brand: brand_name || "",
            product: product_name || "",
            cs: cs || null,
            batch_week: weekStr,
            created_date: formatDateMMDDYY(now),
            funnel: funnel || "Onbrand",
            concept_name: concept_name || null,
            language: language || "EN",
            intended_platform: intended_chanel || "Meta",
            ad_type: adType,
        };
        const adsId = await insertAdsRow(adsRow);
        console.log(`[submit-brief] ads inserted: id=${adsId}  ad_id=${adId}`);

        // ── 3. Insert statics_log row ─────────────────────────────────────────────
        const logRow: Record<string, unknown> = {
            ad_id: adId,
            generation_id: generationId,
            brand_id: brand_id || null,
            brand_name: brand_name || "",
            product_id: product_id || null,
            product_name: product_name || "",
            funnel: funnel || "Onbrand",
            cs: cs || null,
            concept_name: concept_name || null,
            prompt: prompt || null,
            selected_images: [],
            inspo_links: inspo_links || null,
            drive_link: g_drive_link || null,
            image_generation_drive_link: null,
            number_of_ads: number_of_ads ? String(number_of_ads) : null,
            max_variations_per_ad_group: null,
            title: title || null,
            subtitle: subtitle || null,
            design_elements: design_elements || null,
            is_multiple: is_multiple || false,
            logo_name: null,
            is_cta_button: is_cta_button || false,
            cta_button_text: is_cta_button ? (cta_button_text || null) : null,
            is_badge: is_badge || false,
            badge_text: is_badge ? (badge_text || null) : null,
            products_to_show: products_to_show || null,
            file_naming_convention: file_naming_convention || null,
            description: task_description || docs_file_url || null,
            prompt_for_images: prompt_for_images || null,
            status: "to do",
            week: weekStr,
            creation_method: "Auto",
            clickup_task_status: "to do",
            language: language || "EN",
            ad_type: adType,
            priority: null,
        };

        const logId = await insertStaticsLogRow(logRow);
        console.log(`[submit-brief] statics_log inserted: id=${logId}  ad_id=${adId}`);

        // ── 4. Config sheet + ClickUp + Sheet (background) ────────────────────────
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // CS ClickUp user ID lookup
        let csClickupUserId: number | null = null;
        if (cs) {
            try {
                const tryFetch = async (url: string) => {
                    const r = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
                    const d = await r.json();
                    return Array.isArray(d) && d[0]?.clickup_user_id ? Number(d[0].clickup_user_id) : null;
                };
                csClickupUserId =
                    await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&label=eq.${encodeURIComponent(cs)}&limit=1`) ??
                    (csShort ? await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&label=eq.${encodeURIComponent(csShort)}&limit=1`) : null) ??
                    await tryFetch(`${supabaseUrl}/rest/v1/cs_config?select=clickup_user_id&email=eq.${encodeURIComponent(cs)}&limit=1`);
                if (csClickupUserId) {
                    console.log(`[submit-brief] CS "${cs}" → ClickUp user ID: ${csClickupUserId}`);
                } else {
                    console.warn(`[submit-brief] No ClickUp user ID found for CS "${cs}"`);
                }
            } catch (e) {
                console.warn("[submit-brief] CS ClickUp lookup failed:", e);
            }
        }

        const bgWork = async () => {
            try {
                const configSheetId = Deno.env.get("GOOGLE_CONFIG_SHEET_ID");
                if (!configSheetId) {
                    console.error("[submit-brief] GOOGLE_CONFIG_SHEET_ID not set — skipping sheet+ClickUp sync");
                    return;
                }

                const bgAccessToken = await getAccessToken();
                const clickupApiKey = Deno.env.get("CLICKUP_API_KEY") || "";
                const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://image-builder.acentecom.com").replace(/\/$/, "");

                const [revenueSources, dropdowns, config] = await Promise.all([
                    readRevenueSources(bgAccessToken, configSheetId),
                    readDropdowns(bgAccessToken, configSheetId),
                    readConfigSheet(bgAccessToken, configSheetId),
                ]);

                // Resolve Ad DB sheet ID
                const revenueMatch = revenueSources.find((r) => matchProduct(product_name || "", r.product));
                const adDbSheetId = revenueMatch?.adDbSheetId || null;
                if (!adDbSheetId) {
                    console.warn(`[submit-brief] No Ad DB SheetId for product "${product_name}"`);
                } else {
                    console.log(`[submit-brief] Ad DB SheetId: ${adDbSheetId} (matched "${revenueMatch?.product}")`);
                }

                // Resolve ClickUp list ID
                const funnelType = (funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";
                const dropdownMatch = dropdowns.find(
                    (d) => matchProduct(product_name || "", d.product) && d.listType.toUpperCase() === funnelType,
                );
                const clickupListId = dropdownMatch?.clickupListId || null;
                if (!clickupListId) {
                    console.warn(`[submit-brief] No ClickUp list ID for product "${product_name}" / "${funnelType}"`);
                }

                const originalFunnel = getOriginalLabel(config, "Funnel Type", funnel || "");
                const sheetTabName = funnelType as "TSL" | "IMG";

                // Resolve parent Drive folder: body overrides, else look up product_drive_links
                let parentDriveLink = g_drive_link || "";
                if (!parentDriveLink && product_name) {
                    try {
                        // Step 1: match product_name → products.id
                        const prodRes = await fetch(
                            `${supabaseUrl}/rest/v1/products?select=id&name=eq.${encodeURIComponent(product_name)}&limit=1`,
                            { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
                        );
                        const prodData = await prodRes.json();
                        const resolvedProductId = prodData[0]?.id;
                        if (resolvedProductId) {
                            // Step 2: match product_id + funnel_type → drive_link
                            const funnelTypeLower = (funnel || "").toLowerCase();
                            const dlRes = await fetch(
                                `${supabaseUrl}/rest/v1/product_drive_links?product_id=eq.${resolvedProductId}&funnel_type=eq.${encodeURIComponent(funnelTypeLower)}&limit=1`,
                                { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
                            );
                            const dlData = await dlRes.json();
                            parentDriveLink = dlData[0]?.drive_link || "";
                            if (parentDriveLink) console.log(`[submit-brief] Resolved parent drive folder from product_drive_links: ${parentDriveLink}`);
                            else console.warn(`[submit-brief] No drive link found for product "${product_name}" / funnel_type "${funnelTypeLower}"`);
                        }
                    } catch (e) {
                        console.warn("[submit-brief] product_drive_links lookup failed:", e);
                    }
                }

                let imagesFolderLink = "";
                let imageBriefLink = "";
                let groupFolderLink = "";

                const parentFolderId = extractFolderId(parentDriveLink);
                if (parentFolderId) {
                    try {
                        const dateStr = getDateString();
                        const bCode = sanitize(brand_code || "Brand");
                        const pCode = sanitize(product_code || "Product");
                        const cName = sanitize(concept_name || "Concept");
                        const csName = sanitize(csShort || "CS");
                        const funnelName = sanitize(funnel || "Onbrand");
                        const adTypeLabel = (funnel || "").toLowerCase() === "tsl" ? "TSL" : "IMG";

                        // Week folder
                        const weekFolderId = await findOrCreateFolder(weekStr, parentFolderId, bgAccessToken);

                        // Campaign folder
                        const campaignName = `${bCode}_${pCode}_${dateStr}_${weekStr}_${cName}_${adTypeLabel}_Auto_${funnelName}_${csName}_EN`;
                        const campaignFolderId = await findOrCreateFolder(campaignName, weekFolderId, bgAccessToken);

                        // Group folder (always G1)
                        const groupFolderName = `${paddedAdId}_${bCode}_${pCode}_${dateStr}_${weekStr}_${cName}_G1_${adTypeLabel}_Auto_${funnelName}_${csName}_EN`;
                        const newGroupFolderId = await findOrCreateFolder(groupFolderName, campaignFolderId, bgAccessToken);
                        groupFolderLink = `https://drive.google.com/drive/folders/${newGroupFolderId}`;

                        // Images subfolder + Image Brief doc inside Group
                        const imagesFolderId = await findOrCreateFolder("Images", newGroupFolderId, bgAccessToken);
                        const briefDocId = await findOrCreateDoc(`${paddedAdId}_Image Brief`, newGroupFolderId, bgAccessToken);
                        imagesFolderLink = `https://drive.google.com/drive/folders/${imagesFolderId}`;
                        imageBriefLink = briefDocId ? `https://docs.google.com/document/d/${briefDocId}/edit` : "";
                        console.log(`[submit-brief] Drive structure created: group=${groupFolderLink}`);
                    } catch (e) {
                        console.error("[submit-brief] Drive folder creation failed:", e instanceof Error ? e.message : String(e));
                    }
                }

                let clickupTaskId = "";
                let clickupTaskUrl = "";

                // Create ClickUp task
                if (clickupListId && clickupApiKey) {
                    try {
                        const result = await createClickUpTask({
                            listId: clickupListId,
                            clickupApiKey,
                            paddedAdId,
                            brandName: brand_name || "",
                            brandCode: brand_code || "",
                            productName: product_name || "",
                            productCode: product_code || "",
                            cs: cs || "",
                            csClickupUserId,
                            conceptName: concept_name || "",
                            numberOfAds: number_of_ads ? String(number_of_ads) : "",
                            funnel: funnel || "",
                            originalFunnel,
                            language: language || "EN",
                            weekString: weekStr,
                            config,
                            now,
                            gDriveLink: groupFolderLink,
                            imagesFolderLink,
                            imageBriefLink,
                            appBaseUrl,
                            intendedChanel: intended_chanel || "Meta",
                        });
                        clickupTaskId = result.taskId;
                        clickupTaskUrl = result.taskUrl;
                    } catch (e) {
                        console.error("[submit-brief] ClickUp error:", e instanceof Error ? e.message : String(e));
                    }
                }

                // Compute stage label once — used in both sheet row and DB patch
                const funnelLowerBg = (funnel || "").toLowerCase();
                const bgStageLabels = config.labels["Stage"] || [];
                const bgStagePreferImg = funnelLowerBg === "onbrand" || funnelLowerBg === "comparison";
                const stageLabelForSheet = bgStageLabels.find((l) => l.toLowerCase().includes(bgStagePreferImg ? "img" : "tsl")) || bgStageLabels[0] || "";

                // Append sheet row
                if (adDbSheetId) {
                    try {
                        const rowData: Record<string, string> = {
                            "ad id": "'" + paddedAdId,
                            "brand": brand_code || "",
                            "product": product_code || "",
                            "cs": csShort || "",
                            "batch week": weekStr,
                            "created date": formatDateMMDDYY(now),
                            "concept name": concept_name || "",
                            "# of images": number_of_ads ? String(number_of_ads) : "",
                            "funnel": originalFunnel || funnel || "",
                            "language": language || "EN",
                            "creation method": "Auto",
                            "status": "to do",
                            "intended chanel": intended_chanel || "Meta",
                            "g-drive": groupFolderLink ? `=HYPERLINK("${groupFolderLink}","link")` : "",
                            "images": imagesFolderLink ? `=HYPERLINK("${imagesFolderLink}","link")` : "",
                            "images brief": imageBriefLink ? `=HYPERLINK("${imageBriefLink}","link")` : "",
                            "log": `=HYPERLINK("${appBaseUrl}/statics-generator?ad_id=${paddedAdId}","link")`,
                            "clickup": clickupTaskUrl ? `=HYPERLINK("${clickupTaskUrl}","link")` : "",
                            "click up task id": clickupTaskId || "",
                            "stage": stageLabelForSheet,
                        };
                        await appendAdDbRow(bgAccessToken, adDbSheetId, sheetTabName, rowData, sheetTabName, config.labels["Priority"] || [], config.labels["Intended Platform"] || [], bgStageLabels);
                    } catch (e) {
                        console.error("[submit-brief] Sheet error:", e instanceof Error ? e.message : String(e));
                    }
                }

                // Patch statics_log with ClickUp info + folder links
                if (clickupTaskId || groupFolderLink || imagesFolderLink || imageBriefLink || stageLabelForSheet) {
                    try {
                        const patch: Record<string, unknown> = {};
                        if (clickupTaskId) { patch.clickup_task_id = clickupTaskId; patch.clickup_task_url = clickupTaskUrl; }
                        if (groupFolderLink) patch.image_generation_drive_link = groupFolderLink;
                        if (imagesFolderLink) patch.images_folder_link = imagesFolderLink;
                        if (imageBriefLink) patch.image_brief_link = imageBriefLink;
                        if (stageLabelForSheet) patch.stage = stageLabelForSheet;
                        await fetch(
                            `${supabaseUrl}/rest/v1/statics_logs?id=eq.${logId}`,
                            {
                                method: "PATCH",
                                headers: {
                                    apikey: serviceRoleKey,
                                    Authorization: `Bearer ${serviceRoleKey}`,
                                    "Content-Type": "application/json",
                                    Prefer: "return=minimal",
                                },
                                body: JSON.stringify(patch),
                            },
                        );
                        console.log(`[submit-brief] statics_log patched: clickup=${clickupTaskId} images=${imagesFolderLink}`);
                    } catch (e) {
                        console.error("[submit-brief] DB patch error:", e instanceof Error ? e.message : String(e));
                    }
                }

                // Patch ads table with ClickUp info + folder links
                try {
                    const adsPatch: Record<string, unknown> = {};
                    if (clickupTaskId) { adsPatch.clickup_task_id = clickupTaskId; adsPatch.clickup_link = clickupTaskUrl; }
                    if (groupFolderLink) adsPatch.g_drive_link = groupFolderLink;
                    if (imageBriefLink) adsPatch.ad_brief_doc = imageBriefLink;
                    if (stageLabelForSheet) adsPatch.pipeline_status = stageLabelForSheet;
                    if (Object.keys(adsPatch).length > 0) {
                        await fetch(
                            `${supabaseUrl}/rest/v1/ads?ad_id=eq.${adId}`,
                            {
                                method: "PATCH",
                                headers: {
                                    apikey: serviceRoleKey,
                                    Authorization: `Bearer ${serviceRoleKey}`,
                                    "Content-Type": "application/json",
                                    Prefer: "return=minimal",
                                },
                                body: JSON.stringify(adsPatch),
                            },
                        );
                        console.log(`[submit-brief] ads patched: ad_id=${adId} clickup=${clickupTaskId}`);
                    }
                } catch (e) {
                    console.error("[submit-brief] ads patch error:", e instanceof Error ? e.message : String(e));
                }

                console.log("[submit-brief] Background sync complete");
            } catch (e) {
                console.error("[submit-brief] Background work failed:", e instanceof Error ? e.message : String(e));
            }
        };

        try {
            (globalThis as any).EdgeRuntime?.waitUntil(bgWork());
        } catch {
            bgWork().catch(console.error);
        }

        return new Response(
            JSON.stringify({
                success: true,
                ad_id: adId,
                padded_ad_id: paddedAdId,
                log_id: logId,
                generation_id: generationId,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("[submit-brief] Error:", msg);
        return new Response(
            JSON.stringify({ error: msg }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});

export {};
